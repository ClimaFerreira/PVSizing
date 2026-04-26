import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, systemsTable, panelsTable, customersTable } from "@workspace/db";
import {
  GetSystemPvgisParams,
  GetSystemPvgisResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Get PVGIS production data for a system
router.get("/systems/:id/pvgis", async (req, res): Promise<void> => {
  const params = GetSystemPvgisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  const peakpower = (system.numPaineis * Number(panel.potencia)) / 1000; // kWp
  const angle = Number(system.inclinacao);
  // PVGIS azimuth: 0=south, 90=west, -90=east. UI azimuth: 0=north, 180=south
  const aspect = Number(system.azimute) - 180;

  const pvgisUrl =
    `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
    `lat=${lat}&lon=${lon}&peakpower=${peakpower}&loss=14` +
    `&angle=${angle}&aspect=${aspect}&outputformat=json&mountingplace=building`;

  try {
    req.log.info({ pvgisUrl }, "Calling PVGIS API");
    const response = await fetch(pvgisUrl);

    if (!response.ok) {
      req.log.error({ status: response.status }, "PVGIS API error");
      res.status(502).json({ error: "Erro ao comunicar com a API PVGIS" });
      return;
    }

    const pvgisData = (await response.json()) as {
      outputs?: {
        totals?: { fixed?: { "E_y": number; "H(i)_y": number } };
        monthly?: { fixed?: Array<{ month: number; "E_m": number }> };
      };
    };

    const totals = pvgisData.outputs?.totals?.fixed;
    const monthly = pvgisData.outputs?.monthly?.fixed ?? [];

    if (!totals) {
      res.status(502).json({ error: "Resposta inesperada da API PVGIS" });
      return;
    }

    const producaoAnual = totals["E_y"] ?? 0;
    const producaoEspecifica = peakpower > 0 ? producaoAnual / peakpower : 0;

    const producaoMensal = monthly.map((m) => ({
      mes: m.month,
      nomeMes: MONTH_NAMES[m.month - 1] ?? `Mês ${m.month}`,
      producao: m["E_m"] ?? 0,
    }));

    res.json(
      GetSystemPvgisResponse.parse({
        producaoAnual,
        producaoEspecifica,
        producaoMensal,
      })
    );
  } catch (err) {
    logger.error({ err }, "Failed to fetch PVGIS data");
    res.status(502).json({ error: "Falha ao obter dados da API PVGIS" });
  }
});

export default router;
