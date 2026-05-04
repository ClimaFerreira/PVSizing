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

// Internal Rate of Return using Newton-Raphson
function calcIRR(cashflows: number[], guess = 0.1): number {
  let rate = guess;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const pv = Math.pow(1 + rate, t);
      npv += cashflows[t] / pv;
      if (t > 0) dnpv -= (t * cashflows[t]) / (pv * (1 + rate));
    }
    if (Math.abs(dnpv) < 1e-10) break;
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    rate = newRate;
  }
  return rate;
}

// Calculate weighted average tariff price based on tariff type and consumption percentages
function calcPrecoMedioSolar(body: {
  tipoTarifa: string;
  percHorasSol: number;
  precoSimples?: number;
  precoForaVazio?: number;
  precoVazio?: number;
  precoCheia?: number;
  precoPonta?: number;
  precoSuperVazio?: number;
  percPonta?: number;
  percCheia?: number;
  percVazio?: number;
  percSuperVazio?: number;
}): number {
  const {
    tipoTarifa,
    precoSimples = 0.18,
    precoForaVazio = 0.20,
    precoVazio = 0.10,
    precoCheia = 0.18,
    precoPonta = 0.22,
    precoSuperVazio = 0.08,
    percPonta = 20,
    percCheia = 40,
    percVazio = 40,
    percSuperVazio = 15,
  } = body;

  switch (tipoTarifa) {
    case "simples":
      return precoSimples;
    case "bi-horaria": {
      // During solar hours, most consumption is in fora-de-vazio (daytime)
      // Roughly 90% of solar hours are in fora-de-vazio
      return precoForaVazio * 0.9 + precoVazio * 0.1;
    }
    case "tri-horaria": {
      // Weighted by percentages during solar hours
      // Solar hours overlap mainly with cheia and ponta
      const totalSolarPerc = percCheia + percPonta;
      if (totalSolarPerc === 0) return precoCheia;
      return (precoCheia * percCheia + precoPonta * percPonta) / totalSolarPerc;
    }
    case "tetra-horaria": {
      const totalDayPerc = percCheia + percPonta;
      if (totalDayPerc === 0) return precoCheia;
      return (precoCheia * percCheia + precoPonta * percPonta) / totalDayPerc;
    }
    default:
      return precoSimples;
  }
}

// Calculate weighted average price for night/off-solar consumption
function calcPrecoMedioNoturno(body: {
  tipoTarifa: string;
  precoSimples?: number;
  precoForaVazio?: number;
  precoVazio?: number;
  precoCheia?: number;
  precoPonta?: number;
  precoSuperVazio?: number;
}): number {
  const {
    tipoTarifa,
    precoSimples = 0.18,
    precoForaVazio = 0.20,
    precoVazio = 0.10,
    precoCheia = 0.18,
    precoSuperVazio = 0.08,
  } = body;

  switch (tipoTarifa) {
    case "simples":
      return precoSimples;
    case "bi-horaria":
      return precoVazio;
    case "tri-horaria":
      return (precoVazio * 0.6 + precoCheia * 0.4);
    case "tetra-horaria":
      return (precoSuperVazio * 0.4 + precoVazio * 0.6);
    default:
      return precoSimples;
  }
}

// Calculate Financial analysis for a system
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

  const body = parsed.data;
  const {
    custoSistema,
    consumoDiario,
    percHorasSol,
    tipoTarifa,
    precoVendaExcedente,
    capacidadeBateria = 0,
    vidaUtil = 25,
    escaladaEnergia = 2,
    inclinacao2,
    azimute2,
    numPaineis2,
  } = body;

  const lat = Number(customer.latitude);
  const lon = Number(customer.longitude);
  const numPaineis1 = system.numPaineis - (numPaineis2 ?? 0);
  const peakpower1 = (numPaineis1 * Number(panel.potencia)) / 1000;
  const peakpower2 = numPaineis2 ? (numPaineis2 * Number(panel.potencia)) / 1000 : 0;
  const peakpowerTotal = (system.numPaineis * Number(panel.potencia)) / 1000;

  const angle1 = Number(system.inclinacao);
  const aspect1 = Number(system.azimute) - 180;

  let producaoAnual = 0;
  let producaoMensal: Array<{ mes: number; nomeMes: string; producao: number; producaoOr1: number | null; producaoOr2: number | null }> = [];

  // Fetch PVGIS data (primary orientation)
  try {
    const pvgisUrl =
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
      `lat=${lat}&lon=${lon}&peakpower=${peakpower1}&loss=14` +
      `&angle=${angle1}&aspect=${aspect1}&outputformat=json&mountingplace=building`;

    const response = await fetch(pvgisUrl);
    if (response.ok) {
      const pvgisData = (await response.json()) as {
        outputs?: {
          totals?: { fixed?: { E_y: number } };
          monthly?: { fixed?: Array<{ month: number; E_m: number }> };
        };
      };
      const totals = pvgisData.outputs?.totals?.fixed;
      const monthly = pvgisData.outputs?.monthly?.fixed ?? [];

      if (totals) {
        producaoAnual = totals.E_y ?? 0;
        producaoMensal = monthly.map((m) => ({
          mes: m.month,
          nomeMes: MONTH_NAMES[m.month - 1] ?? `Mês ${m.month}`,
          producao: m.E_m ?? 0,
          producaoOr1: m.E_m ?? 0,
          producaoOr2: null,
        }));
      }
    }
  } catch (err) {
    logger.warn({ err }, "PVGIS fetch failed for orientation 1, using estimate");
  }

  // Fetch PVGIS for second orientation if provided
  if (inclinacao2 != null && azimute2 != null && peakpower2 > 0) {
    const aspect2 = azimute2 - 180;
    try {
      const pvgisUrl2 =
        `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?` +
        `lat=${lat}&lon=${lon}&peakpower=${peakpower2}&loss=14` +
        `&angle=${inclinacao2}&aspect=${aspect2}&outputformat=json&mountingplace=building`;

      const resp2 = await fetch(pvgisUrl2);
      if (resp2.ok) {
        const data2 = (await resp2.json()) as {
          outputs?: {
            totals?: { fixed?: { E_y: number } };
            monthly?: { fixed?: Array<{ month: number; E_m: number }> };
          };
        };
        const totals2 = data2.outputs?.totals?.fixed;
        const monthly2 = data2.outputs?.monthly?.fixed ?? [];

        if (totals2) {
          producaoAnual += totals2.E_y ?? 0;
          // Merge monthly data
          for (const m2 of monthly2) {
            const existing = producaoMensal.find((m) => m.mes === m2.month);
            if (existing) {
              existing.producaoOr2 = m2.E_m ?? 0;
              existing.producao += m2.E_m ?? 0;
            } else {
              producaoMensal.push({
                mes: m2.month,
                nomeMes: MONTH_NAMES[m2.month - 1] ?? `Mês ${m2.month}`,
                producao: m2.E_m ?? 0,
                producaoOr1: null,
                producaoOr2: m2.E_m ?? 0,
              });
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "PVGIS fetch failed for orientation 2");
    }
  }

  // Fallback if PVGIS failed entirely
  if (producaoAnual === 0) {
    producaoAnual = peakpowerTotal * 1200;
    producaoMensal = MONTH_NAMES.map((nome, i) => ({
      mes: i + 1,
      nomeMes: nome,
      producao: (producaoAnual / 12) * (0.7 + 0.3 * Math.sin((i - 2) * Math.PI / 6)),
      producaoOr1: null,
      producaoOr2: null,
    }));
  }

  const consumoAnual = consumoDiario * 365;

  // Tariff-aware savings calculation
  const precoMedioSolar = calcPrecoMedioSolar(body);
  const percSolar = Math.min(percHorasSol / 100, 1);

  // Battery: absorbs some excess production
  const batCapacity = capacidadeBateria ?? 0;

  // Self-consumption: during solar hours + what battery can store
  // Solar production absorbed directly (percSolar % of consumption is during solar hours)
  const consumoDuranteSol = consumoAnual * percSolar;
  const consumoForaSol = consumoAnual * (1 - percSolar);

  // Direct solar self-consumption (consumption that can be met by solar)
  const autoConsumoDireto = Math.min(producaoAnual, consumoDuranteSol);
  const excedenteAposDireto = producaoAnual - autoConsumoDireto;

  // Battery stores excess to cover night consumption
  // Battery can cover up to its daily capacity * 365
  const batCobertura = batCapacity * 365 * 0.9; // 90% DoD efficiency
  const autoConsumoBateria = Math.min(excedenteAposDireto, batCobertura, consumoForaSol);
  const excedente = excedenteAposDireto - autoConsumoBateria;
  const autoconsumo = autoConsumoDireto + autoConsumoBateria;

  const taxaAutoconsumo = producaoAnual > 0 ? (autoconsumo / producaoAnual) * 100 : 0;
  const taxaCobertura = consumoAnual > 0 ? (autoconsumo / consumoAnual) * 100 : 0;

  // Year 1 savings
  const poupancaAnual = autoConsumoDireto * precoMedioSolar + autoConsumoBateria * calcPrecoMedioNoturno(body);
  const receitaExcedente = excedente * precoVendaExcedente;
  const beneficioTotal = poupancaAnual + receitaExcedente;

  // 25-year cash flow analysis with 2% annual energy price escalation
  const anos = vidaUtil || 25;
  const escBenefit = (escaladaEnergia ?? 2) / 100;
  const cashflows: number[] = [-custoSistema];
  const cashFlowAnual: Array<{
    ano: number;
    producao: number;
    poupanca: number;
    receitaExcedente: number;
    beneficio: number;
    cashFlow: number;
    cashFlowAcumulado: number;
  }> = [];

  let acumulado = -custoSistema;
  for (let ano = 1; ano <= anos; ano++) {
    const factor = Math.pow(1 + escBenefit, ano - 1);
    const poupancaAno = poupancaAnual * factor;
    const receitaAno = receitaExcedente * factor;
    const beneficioAno = poupancaAno + receitaAno;
    cashflows.push(beneficioAno);
    acumulado += beneficioAno;
    cashFlowAnual.push({
      ano,
      producao: producaoAnual,
      poupanca: poupancaAno,
      receitaExcedente: receitaAno,
      beneficio: beneficioAno,
      cashFlow: beneficioAno,
      cashFlowAcumulado: acumulado,
    });
  }

  // Find payback year
  let payback = anos;
  let acum = -custoSistema;
  for (let ano = 1; ano <= anos; ano++) {
    const beneficioAno = cashFlowAnual[ano - 1].beneficio;
    if (acum + beneficioAno >= 0 && acum < 0) {
      payback = ano - 1 + (-acum / beneficioAno);
      break;
    }
    acum += beneficioAno;
  }

  // TIR (IRR)
  let tir = 0;
  try {
    tir = calcIRR(cashflows) * 100;
    if (!isFinite(tir) || isNaN(tir)) tir = 0;
  } catch {
    tir = 0;
  }

  const lucroTotal = acumulado;

  // Environmental
  const emissoesCO2Evitadas = producaoAnual * 0.233; // kg CO2 per kWh (PT grid factor)
  const arvoresEquivalentes = emissoesCO2Evitadas / 21; // avg kg CO2 absorbed per tree/year

  res.json(
    CalculateFinancialResponse.parse({
      producaoAnual,
      consumoAnual,
      potenciaPico: peakpowerTotal,
      autoconsumo,
      excedente,
      taxaAutoconsumo,
      taxaCobertura,
      poupancaAnual,
      receitaExcedente,
      beneficioTotal,
      payback,
      tir,
      lucroTotal,
      emissoesCO2Evitadas,
      arvoresEquivalentes,
      cashFlowAnual,
      producaoMensal,
    })
  );
});

export default router;
