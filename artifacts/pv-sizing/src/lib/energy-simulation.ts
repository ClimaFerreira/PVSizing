// ── energy-simulation.ts ─────────────────────────────────────────────────────
// Central energy simulation module for SolarDim.
// All hourly-profile calculations live here; imported by wizard and battery study.

// ── Solar production profile ──────────────────────────────────────────────────
// Normalized bell-curve, 6h–20h, peak at 13h, σ = 3h (Portugal continental)
export const SOLAR_FRACS: readonly number[] = (() => {
  const raw = Array.from({ length: 24 }, (_, h) => {
    if (h < 6 || h >= 20) return 0;
    return Math.exp(-((h - 13) ** 2) / (2 * 3 * 3));
  });
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => v / s);
})();

// ── Hourly consumption fractions ──────────────────────────────────────────────
// Daytime: 7h–22h (15 h), night: 22h–7h (9 h)
export function consumoFracs(perfilDiurnoPct: number): readonly number[] {
  const d = Math.max(0, Math.min(100, perfilDiurnoPct)) / 100;
  const n = 1 - d;
  return Array.from({ length: 24 }, (_, h) =>
    h >= 7 && h < 22 ? d / 15 : n / 9,
  );
}

// ── Monthly simulation ────────────────────────────────────────────────────────

export interface MesSimResult {
  producaoDia:    number;
  consumoDia:     number;
  autoconsumo:    number;   // kWh/dia directly consumed from solar
  excedente:      number;   // kWh/dia solar surplus (exported without battery)
  importacao:     number;   // kWh/dia imported from grid
  autoconsumoMes: number;   // autoconsumo × dias (rounded)
  excessoMes:     number;   // excedente × dias (rounded)
}

export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Simulate one month using hourly profiles.
 * Returns daily and monthly autoconsumo / excedente.
 */
export function simulateMes(
  producaoMes:     number,
  consumoMes:      number,
  perfilDiurnoPct: number,
  m:               number, // month index 0–11
): MesSimResult {
  const dias       = DIAS_MES[m];
  const producaoDia = producaoMes / dias;
  const consumoDia  = consumoMes  / dias;
  const cFracs      = consumoFracs(perfilDiurnoPct);

  const solar   = SOLAR_FRACS.map(f => f * producaoDia);
  const consumo = cFracs.map(f => f * consumoDia);

  let autoconsumo = 0;
  let excedente   = 0;
  let importacao  = 0;

  for (let h = 0; h < 24; h++) {
    autoconsumo += Math.min(solar[h], consumo[h]);
    excedente   += Math.max(0, solar[h] - consumo[h]);
    importacao  += Math.max(0, consumo[h] - solar[h]);
  }

  return {
    producaoDia,
    consumoDia,
    autoconsumo,
    excedente,
    importacao,
    autoconsumoMes: Math.round(autoconsumo * dias),
    excessoMes:     Math.round(excedente   * dias),
  };
}

// ── Annual simulation ─────────────────────────────────────────────────────────

export interface AnualSimResult {
  autoconsumoMensal: number[];
  excessoMensal:     number[];
  autoconsumoAnual:  number;
  excessoAnual:      number;
  autoconsumoPerc:   number; // % of annual production that is self-consumed
}

/**
 * Simulate a full year (12 months) using hourly profiles.
 */
export function simulateAnual(
  producaoMensal:  number[],
  consumoMensal:   number[],
  perfilDiurnoPct: number,
): AnualSimResult {
  const autoconsumoMensal: number[] = [];
  const excessoMensal:     number[] = [];

  for (let m = 0; m < 12; m++) {
    const r = simulateMes(
      producaoMensal[m] ?? 0,
      consumoMensal[m]  ?? 0,
      perfilDiurnoPct,
      m,
    );
    autoconsumoMensal.push(r.autoconsumoMes);
    excessoMensal.push(r.excessoMes);
  }

  const autoconsumoAnual = autoconsumoMensal.reduce((a, b) => a + b, 0);
  const excessoAnual     = excessoMensal.reduce((a, b) => a + b, 0);
  const producaoAnual    = producaoMensal.reduce((a, b) => a + b, 0);
  const autoconsumoPerc  = producaoAnual > 0
    ? Math.round((autoconsumoAnual / producaoAnual) * 100)
    : 0;

  return { autoconsumoMensal, excessoMensal, autoconsumoAnual, excessoAnual, autoconsumoPerc };
}

// ── Confidence score ──────────────────────────────────────────────────────────

export interface ConfidenceScore {
  pontuacao: number;
  nivel: "alto" | "medio" | "baixo";
  fontes: {
    pvgis:            boolean;
    consumoMensal:    boolean;
    mesesDisponiveis: number;
  };
  avisos: string[];
}

export function calcConfidenceScore(opts: {
  pvgis:              boolean;
  mesesConsumoDados:  number; // how many months of real invoice data
}): ConfidenceScore {
  const { pvgis, mesesConsumoDados } = opts;
  const avisos: string[] = [];
  let pontuacao = 10;

  if (pvgis) {
    pontuacao += 40;
  } else {
    avisos.push("Produção estimada por HSP médio local (PVGIS indisponível).");
  }

  if (mesesConsumoDados >= 12) {
    pontuacao += 40;
  } else if (mesesConsumoDados >= 3) {
    pontuacao += 20;
    avisos.push(`Perfil baseado em ${mesesConsumoDados} meses de fatura — sazonalidade parcial.`);
  } else {
    pontuacao += 5;
    avisos.push("Consumo mensal uniforme assumido. Carregue faturas para maior precisão.");
  }

  if (!pvgis && mesesConsumoDados < 3) {
    avisos.push("Estimativa baseada em dados incompletos — resultados indicativos.");
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
      consumoMensal:    mesesConsumoDados >= 3,
      mesesDisponiveis: mesesConsumoDados,
    },
    avisos,
  };
}
