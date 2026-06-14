// Central hourly-profile energy simulation for SolarDim.

export const SOLAR_FRACS: readonly number[] = (() => {
  const raw = Array.from({ length: 24 }, (_, hour) => {
    if (hour < 6 || hour >= 20) return 0;
    return Math.exp(-((hour - 13) ** 2) / (2 * 3 * 3));
  });
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map(value => value / total);
})();

export function consumoFracs(perfilDiurnoPct: number): readonly number[] {
  const daytime = Math.max(0, Math.min(100, perfilDiurnoPct)) / 100;
  const night = 1 - daytime;
  return Array.from({ length: 24 }, (_, hour) =>
    hour >= 7 && hour < 22 ? daytime / 15 : night / 9,
  );
}

export type Periodo = "vazio" | "cheio" | "ponta";

export const TARIFF_HOURS: readonly Periodo[] = (() => {
  const periods: Periodo[] = Array(24).fill("cheio");
  for (const hour of [22, 23, 0, 1, 2, 3, 4, 5, 6, 7]) periods[hour] = "vazio";
  for (const hour of [10, 11, 19, 20, 21]) periods[hour] = "ponta";
  return periods;
})();

export function tariffHourlyProfile(
  percVazio: number,
  percCheio: number,
  percPonta: number,
): readonly number[] {
  const total = Math.max(1, percVazio + percCheio + percPonta);
  const hoursByPeriod: Record<Periodo, number[]> = { vazio: [], cheio: [], ponta: [] };
  TARIFF_HOURS.forEach((period, hour) => hoursByPeriod[period].push(hour));
  const percentages: Record<Periodo, number> = {
    vazio: percVazio / total,
    cheio: percCheio / total,
    ponta: percPonta / total,
  };
  const fractions = new Array<number>(24).fill(0);
  (["vazio", "cheio", "ponta"] as Periodo[]).forEach(period => {
    const hours = hoursByPeriod[period];
    const value = percentages[period] / hours.length;
    for (const hour of hours) fractions[hour] = value;
  });
  return fractions;
}

export function dayNightFromTariff(
  percVazio: number,
  percCheio: number,
  percPonta: number,
): { diurnoPct: number; noturnoPct: number } {
  const fractions = tariffHourlyProfile(percVazio, percCheio, percPonta);
  let daytime = 0;
  for (let hour = 7; hour < 22; hour++) daytime += fractions[hour];
  const diurnoPct = Math.round(daytime * 100);
  return { diurnoPct, noturnoPct: 100 - diurnoPct };
}

export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export interface BatterySimulationConfig {
  capacidadeKwh: number;
  dodPct?: number;
  eficienciaRoundTripPct?: number;
  potenciaCargaMaxKw?: number | null;
  potenciaDescargaMaxKw?: number | null;
}

export interface MesSimResult {
  producaoDia: number;
  consumoDia: number;
  autoconsumo: number;
  excedente: number;
  importacao: number;
  autoconsumoMes: number;
  excessoMes: number;
  importacaoMes: number;
  bateriaEntregueMes: number;
}

function normalizeBatteryConfig(battery: number | BatterySimulationConfig) {
  const config = typeof battery === "number"
    ? { capacidadeKwh: battery }
    : battery;
  return {
    capacidadeKwh: Math.max(0, config.capacidadeKwh),
    dodPct: Math.max(0, Math.min(100, config.dodPct ?? 80)),
    eficienciaRoundTripPct: Math.max(1, Math.min(100, config.eficienciaRoundTripPct ?? 90)),
    potenciaCargaMaxKw: Math.max(0, config.potenciaCargaMaxKw ?? Number.POSITIVE_INFINITY),
    potenciaDescargaMaxKw: Math.max(0, config.potenciaDescargaMaxKw ?? Number.POSITIVE_INFINITY),
  };
}

export function simulateMes(
  producaoMes: number,
  consumoMes: number,
  perfilDiurnoPct: number,
  monthIndex: number,
  battery: number | BatterySimulationConfig = 0,
): MesSimResult {
  const days = DIAS_MES[monthIndex];
  const producaoDia = producaoMes / days;
  const consumoDia = consumoMes / days;
  const consumptionFractions = consumoFracs(perfilDiurnoPct);
  const batteryConfig = normalizeBatteryConfig(battery);
  const usableCapacity = batteryConfig.capacidadeKwh * (batteryConfig.dodPct / 100);
  const roundTripEfficiency = batteryConfig.eficienciaRoundTripPct / 100;
  const chargeEfficiency = Math.sqrt(roundTripEfficiency);
  const dischargeEfficiency = Math.sqrt(roundTripEfficiency);

  const solar = SOLAR_FRACS.map(fraction => fraction * producaoDia);
  const consumption = consumptionFractions.map(fraction => fraction * consumoDia);

  let selfConsumed = 0;
  let exported = 0;
  let imported = 0;
  let storedEnergy = 0;
  let batteryDelivered = 0;

  for (let hour = 0; hour < 24; hour++) {
    const direct = Math.min(solar[hour], consumption[hour]);
    let surplus = Math.max(0, solar[hour] - consumption[hour]);
    let deficit = Math.max(0, consumption[hour] - solar[hour]);
    selfConsumed += direct;

    if (usableCapacity > 0 && surplus > 0) {
      const energyInput = Math.min(
        surplus,
        batteryConfig.potenciaCargaMaxKw,
        (usableCapacity - storedEnergy) / chargeEfficiency,
      );
      if (energyInput > 0) {
        storedEnergy += energyInput * chargeEfficiency;
        surplus -= energyInput;
      }
    }

    if (usableCapacity > 0 && deficit > 0) {
      const delivered = Math.min(
        deficit,
        batteryConfig.potenciaDescargaMaxKw,
        storedEnergy * dischargeEfficiency,
      );
      storedEnergy -= delivered / dischargeEfficiency;
      deficit -= delivered;
      selfConsumed += delivered;
      batteryDelivered += delivered;
    }

    exported += surplus;
    imported += deficit;
  }

  return {
    producaoDia,
    consumoDia,
    autoconsumo: selfConsumed,
    excedente: exported,
    importacao: imported,
    autoconsumoMes: Math.round(selfConsumed * days),
    excessoMes: Math.round(exported * days),
    importacaoMes: Math.round(imported * days),
    bateriaEntregueMes: Math.round(batteryDelivered * days),
  };
}

export interface AnualSimResult {
  autoconsumoMensal: number[];
  excessoMensal: number[];
  importacaoMensal: number[];
  bateriaEntregueMensal: number[];
  autoconsumoAnual: number;
  excessoAnual: number;
  importacaoAnual: number;
  bateriaEntregueAnual: number;
  autoconsumoPerc: number;
}

export function simulateAnual(
  producaoMensal: number[],
  consumoMensal: number[],
  perfilDiurnoPct: number,
  battery: number | BatterySimulationConfig = 0,
): AnualSimResult {
  const autoconsumoMensal: number[] = [];
  const excessoMensal: number[] = [];
  const importacaoMensal: number[] = [];
  const bateriaEntregueMensal: number[] = [];

  for (let month = 0; month < 12; month++) {
    const result = simulateMes(
      producaoMensal[month] ?? 0,
      consumoMensal[month] ?? 0,
      perfilDiurnoPct,
      month,
      battery,
    );
    autoconsumoMensal.push(result.autoconsumoMes);
    excessoMensal.push(result.excessoMes);
    importacaoMensal.push(result.importacaoMes);
    bateriaEntregueMensal.push(result.bateriaEntregueMes);
  }

  const autoconsumoAnual = autoconsumoMensal.reduce((sum, value) => sum + value, 0);
  const excessoAnual = excessoMensal.reduce((sum, value) => sum + value, 0);
  const importacaoAnual = importacaoMensal.reduce((sum, value) => sum + value, 0);
  const bateriaEntregueAnual = bateriaEntregueMensal.reduce((sum, value) => sum + value, 0);
  const producaoAnual = producaoMensal.reduce((sum, value) => sum + value, 0);
  const autoconsumoPerc = producaoAnual > 0
    ? Math.round((autoconsumoAnual / producaoAnual) * 100)
    : 0;

  return {
    autoconsumoMensal,
    excessoMensal,
    importacaoMensal,
    bateriaEntregueMensal,
    autoconsumoAnual,
    excessoAnual,
    importacaoAnual,
    bateriaEntregueAnual,
    autoconsumoPerc,
  };
}

export interface ConfidenceScore {
  pontuacao: number;
  nivel: "alto" | "medio" | "baixo";
  fontes: {
    pvgis: boolean;
    consumoMensal: boolean;
    mesesDisponiveis: number;
  };
  avisos: string[];
}

export function calcConfidenceScore(opts: {
  pvgis: boolean;
  mesesConsumoDados: number;
}): ConfidenceScore {
  const { pvgis, mesesConsumoDados } = opts;
  const avisos: string[] = [];
  let pontuacao = 10;

  if (pvgis) {
    pontuacao += 40;
  } else {
    avisos.push("Producao estimada por HSP medio local (PVGIS indisponivel).");
  }

  if (mesesConsumoDados >= 12) {
    pontuacao += 40;
  } else if (mesesConsumoDados >= 3) {
    pontuacao += 20;
    avisos.push(`Perfil baseado em ${mesesConsumoDados} meses de fatura - sazonalidade parcial.`);
  } else {
    pontuacao += 5;
    avisos.push("Consumo mensal uniforme assumido. Carregue faturas para maior precisao.");
  }

  if (!pvgis && mesesConsumoDados < 3) {
    avisos.push("Estimativa baseada em dados incompletos - resultados indicativos.");
  }

  const nivel: ConfidenceScore["nivel"] =
    pontuacao >= 70 ? "alto" :
    pontuacao >= 40 ? "medio" :
    "baixo";

  return {
    pontuacao,
    nivel,
    fontes: {
      pvgis,
      consumoMensal: mesesConsumoDados >= 3,
      mesesDisponiveis: mesesConsumoDados,
    },
    avisos,
  };
}
