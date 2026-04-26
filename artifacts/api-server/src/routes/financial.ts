import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, systemsTable, panelsTable, customersTable } from "@workspace/db";
import {
  CalculateFinancialParams,
  CalculateFinancialBody,
  CalculateFinancialResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Calculate financial analysis for a system
router.post("/systems/:id/financial", async (req, res): Promise<void> => {
  const params = CalculateFinancialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CalculateFinancialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  const { custodoSistema, percentagemAutoconsumo, precoVendaExcedente } = parsed.data;

  const lat = Number(customer.latitude);
  const lon = Number(customer.longitude);
  const peakpower = (system.numPaineis * Number(panel.potencia)) / 1000;
  const angle = Number(system.inclinacao);
  const aspect = Number(system.azimute) - 180;

  let producaoAnual = 0;

  // Fetch PVGIS data for production calculation
  try {
    const pvgisUrl =
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
      `lat=${lat}&lon=${lon}&peakpower=${peakpower}&loss=14` +
      `&angle=${angle}&aspect=${aspect}&outputformat=json&mountingplace=building`;

    const response = await fetch(pvgisUrl);
    if (response.ok) {
      const pvgisData = (await response.json()) as {
        outputs?: { totals?: { fixed?: { "E_y": number } } };
      };
      producaoAnual = pvgisData.outputs?.totals?.fixed?.["E_y"] ?? 0;
    }
  } catch (err) {
    logger.warn({ err }, "Could not fetch PVGIS for financial calc, using estimate");
    // Fallback: estimate 1200 kWh/kWp/year for Portugal
    producaoAnual = peakpower * 1200;
  }

  // If PVGIS failed, use estimate
  if (producaoAnual === 0) {
    producaoAnual = peakpower * 1200;
  }

  const autoconsumo = producaoAnual * (percentagemAutoconsumo / 100);
  const excedente = producaoAnual - autoconsumo;

  const precoEletricidade = Number(customer.precoEletricidade);
  const poupancaAnual = autoconsumo * precoEletricidade;
  const receitaExcedente = excedente * precoVendaExcedente;

  const totalBenefit = poupancaAnual + receitaExcedente;
  const payback = totalBenefit > 0 ? custodoSistema / totalBenefit : 0;

  res.json(
    CalculateFinancialResponse.parse({
      producaoAnual,
      autoconsumo,
      excedente,
      poupancaAnual,
      receitaExcedente,
      payback,
    })
  );
});

export default router;
