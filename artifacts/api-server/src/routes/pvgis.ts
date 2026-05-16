import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, systemsTable, panelsTable, customersTable } from "@workspace/db";
import {
  GetSystemPvgisParams,
  GetSystemPvgisQueryParams,
  GetSystemPvgisResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { pvgisGet, pvgisSet } from "../lib/pvgis-cache";

const router: IRouter = Router();

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type PvgisApiResponse = {
  inputs?: { mounting_system?: { fixed?: { slope?: { value: number }; azimuth?: { value: number } } } };
  outputs?: {
    totals?: { fixed?: { E_y: number; H_i_y?: number } };
    monthly?: { fixed?: Array<{ month: number; E_m: number }> };
  };
};

async function fetchPvgisWithCache(url: string): Promise<PvgisApiResponse> {
  const cached = pvgisGet(url) as PvgisApiResponse | null;
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw Object.assign(new Error("PVGIS API error"), { status: 502, pvgisStatus: response.status });
  }

  const data = (await response.json()) as PvgisApiResponse;
  pvgisSet(url, data);
  return data;
}

// Get PVGIS production data for a system (supports dual orientation)
router.get("/systems/:id/pvgis", async (req, res): Promise<void> => {
  const params = GetSystemPvgisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetSystemPvgisQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const [system] = await db
    .select()
    .from(systemsTable)
    .where(eq(systemsTable.id, params.data.id));

  if (!system) {
    res.status(404).json({ error: "Sistema não encontrado" });
    return;
  }

  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.id, system.panelId));

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, system.customerId));

  if (!panel || !customer) {
    res.status(404).json({ error: "Dados de cliente ou painel não encontrados" });
    return;
  }

  const lat = Number(customer.latitude);
  const lon = Number(customer.longitude);

  const { inclinacao2, azimute2, numPaineis2 } = query.data;
  const hasSecondOrientation =
    inclinacao2 != null && azimute2 != null && numPaineis2 != null && numPaineis2 > 0;

  const numPaineis1 = hasSecondOrientation
    ? system.numPaineis - (numPaineis2 ?? 0)
    : system.numPaineis;
  const peakpower1 = (numPaineis1 * Number(panel.potencia)) / 1000;
  const peakpower2 =
    hasSecondOrientation && numPaineis2
      ? (numPaineis2 * Number(panel.potencia)) / 1000
      : 0;

  const angle1 = Number(system.inclinacao);
  const aspect1 = Number(system.azimute) - 180;

  type MonthEntry = {
    mes: number;
    nomeMes: string;
    producao: number;
    producaoOr1: number | null;
    producaoOr2: number | null;
  };

  let producaoAnual = 0;
  let producaoEspecifica = 0;
  let inclinacaoOtima: number | null = null;
  let orientacaoOtima: number | null = null;
  const monthlyMap: Map<number, MonthEntry> = new Map();

  const pvgisUrl =
    `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
    `lat=${lat}&lon=${lon}&peakpower=${peakpower1}&loss=14` +
    `&angle=${angle1}&aspect=${aspect1}&outputformat=json&mountingplace=building` +
    `&optimalinclination=1&optimalangles=1`;

  try {
    req.log.info({ pvgisUrl: pvgisUrl.slice(0, 80) }, "Calling PVGIS API (orientation 1)");
    const pvgisData = await fetchPvgisWithCache(pvgisUrl);

    const totals = pvgisData.outputs?.totals?.fixed;
    const monthly = pvgisData.outputs?.monthly?.fixed ?? [];

    if (!totals) {
      res.status(502).json({ error: "Resposta inesperada da API PVGIS" });
      return;
    }

    producaoAnual = totals.E_y ?? 0;
    inclinacaoOtima = pvgisData.inputs?.mounting_system?.fixed?.slope?.value ?? null;
    orientacaoOtima = pvgisData.inputs?.mounting_system?.fixed?.azimuth?.value ?? null;

    for (const m of monthly) {
      monthlyMap.set(m.month, {
        mes: m.month,
        nomeMes: MONTH_NAMES[m.month - 1] ?? `Mês ${m.month}`,
        producao: m.E_m ?? 0,
        producaoOr1: m.E_m ?? 0,
        producaoOr2: null,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch PVGIS data (orientation 1)");
    res.status(502).json({ error: "Falha ao obter dados da API PVGIS" });
    return;
  }

  // Second orientation (dual MPPT)
  if (hasSecondOrientation && inclinacao2 != null && azimute2 != null) {
    const aspect2 = azimute2 - 180;
    const pvgisUrl2 =
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
      `lat=${lat}&lon=${lon}&peakpower=${peakpower2}&loss=14` +
      `&angle=${inclinacao2}&aspect=${aspect2}&outputformat=json&mountingplace=building`;

    try {
      req.log.info({ pvgisUrl2: pvgisUrl2.slice(0, 80) }, "Calling PVGIS API (orientation 2)");
      const data2 = await fetchPvgisWithCache(pvgisUrl2);

      const totals2 = data2.outputs?.totals?.fixed;
      const monthly2 = data2.outputs?.monthly?.fixed ?? [];

      if (totals2) {
        producaoAnual += totals2.E_y ?? 0;
        for (const m2 of monthly2) {
          const existing = monthlyMap.get(m2.month);
          if (existing) {
            existing.producaoOr2 = m2.E_m ?? 0;
            existing.producao += m2.E_m ?? 0;
          } else {
            monthlyMap.set(m2.month, {
              mes: m2.month,
              nomeMes: MONTH_NAMES[m2.month - 1] ?? `Mês ${m2.month}`,
              producao: m2.E_m ?? 0,
              producaoOr1: null,
              producaoOr2: m2.E_m ?? 0,
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "Failed to fetch PVGIS orientation 2, ignoring");
    }
  }

  const totalPeakpower = peakpower1 + peakpower2;
  producaoEspecifica = totalPeakpower > 0 ? producaoAnual / totalPeakpower : 0;

  const producaoMensal = Array.from(monthlyMap.values()).sort((a, b) => a.mes - b.mes);

  res.json(
    GetSystemPvgisResponse.parse({
      producaoAnual,
      producaoEspecifica,
      producaoMensal,
      inclinacaoOtima,
      orientacaoOtima,
      temDuasOrientacoes: hasSecondOrientation,
    }),
  );
});

export default router;
