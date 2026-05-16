/**
 * String sizing and electrical validation for PV systems.
 * Temperatures in °C, voltages in V, currents in A.
 *
 * MpptConfig: per-MPPT, per-string panel counts.
 *   mpptConfig[mpptIdx][stringIdx] = numPaineis
 *
 * KEY INVARIANT: calcStringSizing NEVER changes numPaineis.
 * It finds the best electrical configuration for EXACTLY the given panel count.
 */

export type MpptConfig = number[][];

export interface PanelElec {
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
  potencia: number;
  coeficienteTemperaturaVoc: number | null;
  noct: number | null;
}

export interface InverterElec {
  mpptMin: number;
  mpptMax: number;
  corrMaxMppt: number;
  numMppt: number;
  stringsPorMppt: number;
  potenciaDcMax: number;
  vdcMax: number | null;
}

export interface StringConfig {
  mpptConfig: MpptConfig;
  paineisPerString: number;    // dominant value (uniform) or max if mixed
  numStrings: number;
  stringsPorMppt: number[];
  totalPaineis: number;
  isMixed: boolean;            // any MPPT has strings with different panel counts
  vocFrio: number;             // worst-case (max panels any string) Voc at T_MIN_PT
  vmpQuente: number;           // worst-case (min panels any active string) Vmpp at T_MAX
  vocSTC: number;              // max string Voc at STC
  vmpSTC: number;              // max string Vmp at STC
  iscString: number;           // Isc per string (same panel model for all)
  dcAcRatio: number;
  potenciaDCTotal: number;
}

export interface StringAlert {
  tipo: "erro" | "aviso" | "ok";
  mensagem: string;
}

export interface SemSolucaoInfo {
  abaixo:    number;  // closest panel count below target that works (0 = none found)
  acima:     number;  // closest panel count above target that works (0 = none found)
  minPerStr: number;  // electrical min panels per string
  maxPerStr: number;  // electrical max panels per string
}

export interface StringSizingResult {
  config: StringConfig;
  alertas: StringAlert[];
  tMinPortugal: number;
  tMaxCelula: number;
  vdcMaxUsado: number;
  semSolucao: boolean;         // true when no valid config found for the given numPaineis
  sugestoes?: SemSolucaoInfo;  // only present when semSolucao=true
}

const T_MIN_PT = -10;
const T_STC = 25;
const T_AMB_MAX = 40;

function resolveCoefVoc(panel: PanelElec): number {
  if (panel.coeficienteTemperaturaVoc !== null && panel.coeficienteTemperaturaVoc !== 0) {
    return panel.coeficienteTemperaturaVoc / 100;
  }
  return -0.0028;
}

function resolveNoct(panel: PanelElec): number {
  return panel.noct ?? 45;
}

function resolveVdcMax(inv: InverterElec): number {
  if (inv.vdcMax && inv.vdcMax > 0) return inv.vdcMax;
  return inv.mpptMax * 1.2;
}

export function calcStringTemps(panel: PanelElec): { tMinPt: number; tMaxCelula: number } {
  const noct = resolveNoct(panel);
  const tMaxCelula = T_AMB_MAX + (noct - 20) * (1000 / 800);
  return { tMinPt: T_MIN_PT, tMaxCelula };
}

export function calcVocAtTemp(voc: number, coefVoc: number, tCell: number): number {
  return voc * (1 + coefVoc * (tCell - T_STC));
}

export function calcVmpAtTemp(vmp: number, coefVoc: number, tCell: number): number {
  return vmp * (1 + coefVoc * (tCell - T_STC));
}

/** Maximum panels per string based on Vdc max constraint */
export function maxPaineisPerString(panel: PanelElec, inv: InverterElec): number {
  const coefVoc = resolveCoefVoc(panel);
  const vdcMax = resolveVdcMax(inv);
  const vocFrio1 = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  return Math.max(1, Math.floor(vdcMax / vocFrio1));
}

function buildAlerts(
  panel: PanelElec,
  inv: InverterElec,
  mpptConfig: MpptConfig,
  vocFrioMax: number,
  vmpQuenteMin: number,
  vocSTCMax: number,
  vmpSTCMax: number,
  iscString: number,
  dcAcRatio: number,
  numStrings: number,
  vdcMax: number,
  tMinPt: number,
  isMixed: boolean,
  numPaineisAuto: number | null,
  totalPaineis: number,
): StringAlert[] {
  const alertas: StringAlert[] = [];

  // Voc frio check (worst-case = max panels per string)
  if (vocFrioMax > vdcMax) {
    alertas.push({ tipo: "erro", mensagem: `Voc a ${tMinPt}°C (${vocFrioMax.toFixed(0)}V) excede tensão máxima DC do inversor (${vdcMax.toFixed(0)}V)` });
  } else if (vocFrioMax > vdcMax * 0.95) {
    alertas.push({ tipo: "aviso", mensagem: `Voc a ${tMinPt}°C (${vocFrioMax.toFixed(0)}V) está próximo do limite máximo DC (${vdcMax.toFixed(0)}V)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Voc em frio (${vocFrioMax.toFixed(0)}V) dentro do limite máximo DC (${vdcMax.toFixed(0)}V)` });
  }

  // Vmpp em calor check (worst-case = min panels per string)
  if (vmpQuenteMin < inv.mpptMin) {
    alertas.push({ tipo: "erro", mensagem: `Vmpp em calor (${vmpQuenteMin.toFixed(0)}V) abaixo da janela MPPT mínima (${inv.mpptMin}V)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Vmpp em calor (${vmpQuenteMin.toFixed(0)}V) dentro da janela MPPT (${inv.mpptMin}–${inv.mpptMax}V)` });
  }

  // Vmpp @ STC above MPPT max
  if (vmpSTCMax > inv.mpptMax) {
    alertas.push({ tipo: "aviso", mensagem: `Vmpp a STC (${vmpSTCMax.toFixed(0)}V) excede topo da janela MPPT (${inv.mpptMax}V) — considere reduzir painéis por string` });
  }

  // Isc per MPPT check — each MPPT individually
  mpptConfig.forEach((strings, mi) => {
    if (strings.length === 0) return;
    const iscMppt = iscString * strings.length;
    if (iscMppt > inv.corrMaxMppt) {
      alertas.push({ tipo: "erro", mensagem: `MPPT ${mi + 1}: Isc total (${iscMppt.toFixed(1)}A) excede corrente máxima do MPPT (${inv.corrMaxMppt}A)` });
    } else {
      alertas.push({ tipo: "ok", mensagem: `MPPT ${mi + 1}: Isc total (${iscMppt.toFixed(1)}A) dentro do limite (${inv.corrMaxMppt}A)` });
    }
  });

  // DC/AC ratio
  if (dcAcRatio > 1.5) {
    alertas.push({ tipo: "aviso", mensagem: `Oversizing DC/AC elevado (${(dcAcRatio * 100).toFixed(0)}%) — pode causar clipping significativo` });
  } else if (dcAcRatio > 1.3) {
    alertas.push({ tipo: "aviso", mensagem: `Oversizing DC/AC (${(dcAcRatio * 100).toFixed(0)}%) — verifique se o inversor aceita potência DC adicional` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Rácio DC/AC (${(dcAcRatio * 100).toFixed(0)}%) dentro do intervalo recomendado` });
  }

  // Total strings vs inverter capacity
  if (numStrings > inv.numMppt * inv.stringsPorMppt) {
    alertas.push({ tipo: "erro", mensagem: `Número de strings (${numStrings}) excede capacidade do inversor (${inv.numMppt} MPPTs × ${inv.stringsPorMppt} strings)` });
  }

  // Mixed panel counts per MPPT
  if (isMixed) {
    mpptConfig.forEach((strings, mi) => {
      const counts = [...new Set(strings)];
      if (counts.length > 1) {
        alertas.push({ tipo: "aviso", mensagem: `MPPT ${mi + 1} tem strings assimétricas (${strings.join(", ")} módulos) — mismatching de tensão reduz ligeiramente a produção` });
      }
    });
  }

  // Total panels divergence from auto (only in manual mode)
  if (numPaineisAuto !== null && totalPaineis !== numPaineisAuto) {
    if (totalPaineis > numPaineisAuto) {
      alertas.push({ tipo: "aviso", mensagem: `Total de painéis (${totalPaineis}) superior ao dimensionamento automático (${numPaineisAuto})` });
    } else {
      alertas.push({ tipo: "aviso", mensagem: `Total de painéis (${totalPaineis}) inferior ao dimensionamento automático (${numPaineisAuto})` });
    }
  }

  return alertas;
}

// ── Helper: find closest viable panel counts ───────────────────────────────

function temSolucaoViavel(
  n: number,
  vocFrio1: number,
  vmpQuente1: number,
  vdcMax: number,
  mpptMin: number,
  minPerStr: number,
  maxPerStr: number,
  maxStringsTotal: number,
): boolean {
  for (let s = 1; s <= Math.min(maxStringsTotal, n); s++) {
    const b = Math.floor(n / s);
    const e = n % s;
    const h = e > 0 ? b + 1 : b;
    if (b < minPerStr || h > maxPerStr) continue;
    if (vocFrio1 * h > vdcMax) continue;
    if (vmpQuente1 * b < mpptMin) continue;
    return true;
  }
  return false;
}

function encontrarRangeViavel(
  vocFrio1: number,
  vmpQuente1: number,
  vdcMax: number,
  mpptMin: number,
  minPerStr: number,
  maxPerStr: number,
  maxStringsTotal: number,
  numPaineisAlvo: number,
): SemSolucaoInfo {
  let abaixo = 0;
  let acima  = 0;
  for (let n = numPaineisAlvo - 1; n >= Math.max(1, numPaineisAlvo - 40); n--) {
    if (temSolucaoViavel(n, vocFrio1, vmpQuente1, vdcMax, mpptMin, minPerStr, maxPerStr, maxStringsTotal)) {
      abaixo = n; break;
    }
  }
  for (let n = numPaineisAlvo + 1; n <= numPaineisAlvo + 40; n++) {
    if (temSolucaoViavel(n, vocFrio1, vmpQuente1, vdcMax, mpptMin, minPerStr, maxPerStr, maxStringsTotal)) {
      acima = n; break;
    }
  }
  return { abaixo, acima, minPerStr, maxPerStr };
}

// ── Main auto-sizing: PANEL COUNT IS FIXED ────────────────────────────────────
/**
 * Calculate the best string configuration for EXACTLY `numPaineis` panels.
 *
 * Algorithm:
 *  1. Compute electrical min/max panels per string from MPPT window + Vdc max.
 *  2. For each possible string count (1..maxStrings): distribute panels as
 *     evenly as possible (floor/ceil) and check all electrical constraints.
 *  3. Rank valid configs: prefer uniform strings, then closest to MPPT centre,
 *     then fewest strings.
 *  4. If no valid config exists, return semSolucao=true with nearest viable counts.
 *
 * NEVER modifies numPaineis. totalPaineis in the result always equals numPaineis.
 */
export function calcStringSizing(
  panel: PanelElec,
  inv: InverterElec,
  numPaineis: number,
): StringSizingResult {
  const coefVoc    = resolveCoefVoc(panel);
  const vdcMax     = resolveVdcMax(inv);
  const { tMaxCelula } = calcStringTemps(panel);

  const vocFrio1   = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, coefVoc, tMaxCelula);

  // Hard electrical limits for any single string
  const maxPerStr      = Math.max(1, Math.floor(vdcMax / vocFrio1));
  const minPerStr      = Math.max(1, Math.ceil(inv.mpptMin / vmpQuente1));
  const maxStringsTotal = inv.numMppt * inv.stringsPorMppt;

  // Target panels per string: aim for ~45% between MPPT min and max
  const targetVmp         = (inv.mpptMin + inv.mpptMax) * 0.45;
  const optimalPerString  = Math.max(minPerStr, Math.min(maxPerStr, Math.round(targetVmp / panel.vmp)));

  // ── Candidate search ──────────────────────────────────────────────────────
  type Candidate = {
    numStrings: number;
    base: number;          // panels in (numStrings - extra) strings
    extra: number;         // strings that get (base+1) panels
    vocFrioMax: number;
    vmpQuenteMin: number;
    isUniform: boolean;
    distFromOptimal: number;
  };

  const candidates: Candidate[] = [];

  for (let s = 1; s <= Math.min(maxStringsTotal, numPaineis); s++) {
    const base  = Math.floor(numPaineis / s);
    const extra = numPaineis % s;           // extra strings get (base+1)
    const high  = extra > 0 ? base + 1 : base;

    // Electrical range check: shortest string must reach MPPT min, longest must not exceed Vdc max
    if (base < minPerStr) continue;
    if (high > maxPerStr) continue;

    const vocFrioMax   = vocFrio1   * high;
    const vmpQuenteMin = vmpQuente1 * base;

    if (vocFrioMax   > vdcMax)      continue;
    if (vmpQuenteMin < inv.mpptMin) continue;

    const mid = extra > 0 ? base + 0.5 : base;
    candidates.push({
      numStrings: s,
      base,
      extra,
      vocFrioMax,
      vmpQuenteMin,
      isUniform: extra === 0,
      distFromOptimal: Math.abs(mid - optimalPerString),
    });
  }

  // ── No solution ────────────────────────────────────────────────────────────
  if (candidates.length === 0) {
    const sugestoes = encontrarRangeViavel(
      vocFrio1, vmpQuente1, vdcMax, inv.mpptMin, minPerStr, maxPerStr, maxStringsTotal, numPaineis,
    );
    const emptyConfig: MpptConfig = Array.from({ length: inv.numMppt }, () => []);
    return {
      config: {
        mpptConfig:       emptyConfig,
        paineisPerString: 0,
        numStrings:       0,
        stringsPorMppt:   emptyConfig.map(() => 0),
        totalPaineis:     numPaineis,   // keep original even on failure
        isMixed:          false,
        vocFrio:          0,
        vmpQuente:        0,
        vocSTC:           0,
        vmpSTC:           0,
        iscString:        panel.isc,
        dcAcRatio:        0,
        potenciaDCTotal:  numPaineis * panel.potencia,
      },
      alertas: [{
        tipo:     "erro",
        mensagem: `Não existe configuração elétrica válida para ${numPaineis} painéis com este inversor. ` +
          `Janela MPPT: ${inv.mpptMin}–${inv.mpptMax}V · Vdc máx: ${vdcMax.toFixed(0)}V → ` +
          `Painéis/string permitidos: ${minPerStr}–${maxPerStr}.`,
      }],
      tMinPortugal: T_MIN_PT,
      tMaxCelula,
      vdcMaxUsado: vdcMax,
      semSolucao: true,
      sugestoes,
    };
  }

  // ── Pick best candidate ────────────────────────────────────────────────────
  // Priority: 1) uniform strings  2) closest to optimal  3) fewest strings
  candidates.sort((a, b) => {
    if (a.isUniform !== b.isUniform) return a.isUniform ? -1 : 1;
    if (a.distFromOptimal !== b.distFromOptimal) return a.distFromOptimal - b.distFromOptimal;
    return a.numStrings - b.numStrings;
  });

  const best = candidates[0];
  const stringsPerMppt = distributeStrings(best.numStrings, inv.numMppt);

  // Assign panels: first `extra` strings get (base+1), rest get base
  let extraLeft = best.extra;
  const mpptConfig: MpptConfig = stringsPerMppt.map(n => {
    const arr: number[] = [];
    for (let i = 0; i < n; i++) {
      arr.push(extraLeft > 0 ? best.base + 1 : best.base);
      if (extraLeft > 0) extraLeft--;
    }
    return arr;
  });

  const isMixed   = best.extra > 0;
  const highPanel = isMixed ? best.base + 1 : best.base;
  const vocSTC    = panel.voc * highPanel;
  const vmpSTC    = panel.vmp * highPanel;
  const iscString = panel.isc;
  const potenciaDCTotal = numPaineis * panel.potencia;
  const dcAcRatio = inv.potenciaDcMax > 0 ? potenciaDCTotal / inv.potenciaDcMax : 0;

  const alertas = buildAlerts(
    panel, inv, mpptConfig,
    best.vocFrioMax, best.vmpQuenteMin, vocSTC, vmpSTC,
    iscString, dcAcRatio, best.numStrings, vdcMax,
    T_MIN_PT, isMixed, null, numPaineis,
  );

  return {
    config: {
      mpptConfig,
      paineisPerString: highPanel,
      numStrings:       best.numStrings,
      stringsPorMppt:   stringsPerMppt,
      totalPaineis:     numPaineis,   // ALWAYS equals input numPaineis
      isMixed,
      vocFrio:    best.vocFrioMax,
      vmpQuente:  best.vmpQuenteMin,
      vocSTC,
      vmpSTC,
      iscString,
      dcAcRatio,
      potenciaDCTotal,
    },
    alertas,
    tMinPortugal: T_MIN_PT,
    tMaxCelula,
    vdcMaxUsado: vdcMax,
    semSolucao: false,
  };
}

function distributeStrings(total: number, numMppt: number): number[] {
  const base  = Math.floor(total / numMppt);
  const extra = total % numMppt;
  return Array.from({ length: numMppt }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Compute a StringSizingResult from a user-supplied per-string configuration.
 * mpptConfig[mpptIdx][stringIdx] = number of panels in that string.
 * numPaineisAuto: the auto-calculated panel count, used to detect divergence (pass null to suppress).
 */
export function calcStringSizingManual(
  panel: PanelElec,
  inv: InverterElec,
  mpptConfig: MpptConfig,
  numPaineisAuto: number | null = null,
): StringSizingResult {
  const coefVoc = resolveCoefVoc(panel);
  const vdcMax  = resolveVdcMax(inv);
  const { tMaxCelula } = calcStringTemps(panel);

  const vocFrio1   = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, coefVoc, tMaxCelula);

  // Flatten all panel counts
  const allCounts = mpptConfig.flat().filter(n => n > 0);
  const maxPanels = allCounts.length > 0 ? Math.max(...allCounts) : 1;
  const minPanels = allCounts.length > 0 ? Math.min(...allCounts) : 1;

  // Worst-case voltages
  const vocFrioMax   = vocFrio1   * maxPanels;
  const vmpQuenteMin = vmpQuente1 * minPanels;
  const vocSTC = panel.voc * maxPanels;
  const vmpSTC = panel.vmp * maxPanels;

  const iscString     = panel.isc;
  const stringsPorMppt = mpptConfig.map(s => s.length);
  const numStrings    = stringsPorMppt.reduce((a, b) => a + b, 0);
  const totalPaineis  = allCounts.reduce((a, b) => a + b, 0);
  const potenciaDCTotal = totalPaineis * panel.potencia;
  const dcAcRatio     = inv.potenciaDcMax > 0 ? potenciaDCTotal / inv.potenciaDcMax : 0;

  // Check if any MPPT has mixed panel counts
  const isMixed = mpptConfig.some(strings => new Set(strings).size > 1);

  const alertas = buildAlerts(
    panel, inv, mpptConfig,
    vocFrioMax, vmpQuenteMin, vocSTC, vmpSTC,
    iscString, dcAcRatio, numStrings, vdcMax,
    T_MIN_PT, isMixed, numPaineisAuto, totalPaineis,
  );

  return {
    config: {
      mpptConfig,
      paineisPerString: maxPanels,
      numStrings,
      stringsPorMppt,
      totalPaineis,
      isMixed,
      vocFrio:    vocFrioMax,
      vmpQuente:  vmpQuenteMin,
      vocSTC,
      vmpSTC,
      iscString,
      dcAcRatio,
      potenciaDCTotal,
    },
    alertas,
    tMinPortugal: T_MIN_PT,
    tMaxCelula,
    vdcMaxUsado: vdcMax,
    semSolucao: false,
  };
}
