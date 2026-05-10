/**
 * String sizing and electrical validation for PV systems.
 * Temperatures in °C, voltages in V, currents in A.
 *
 * MpptConfig: per-MPPT, per-string panel counts.
 *   mpptConfig[mpptIdx][stringIdx] = numPaineis
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

export interface StringSizingResult {
  config: StringConfig;
  alertas: StringAlert[];
  tMinPortugal: number;
  tMaxCelula: number;
  vdcMaxUsado: number;
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
        alertas.push({ tipo: "aviso", mensagem: `MPPT ${mi + 1} tem strings com painéis diferentes (${strings.join(", ")} módulos) — pode reduzir produção por mismatching de tensão` });
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

export function calcStringSizing(
  panel: PanelElec,
  inv: InverterElec,
  numPaineis: number
): StringSizingResult {
  const coefVoc = resolveCoefVoc(panel);
  const vdcMax = resolveVdcMax(inv);
  const { tMaxCelula } = calcStringTemps(panel);

  const vocFrio1 = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, coefVoc, tMaxCelula);

  const maxPerStr = Math.floor(vdcMax / vocFrio1);
  const minPerStr = Math.ceil(inv.mpptMin / vmpQuente1);

  const targetVmp = (inv.mpptMin + inv.mpptMax) * 0.45;
  let optimalPerString = Math.round(targetVmp / panel.vmp);
  optimalPerString = Math.max(minPerStr, Math.min(maxPerStr, optimalPerString));
  if (optimalPerString < 1) optimalPerString = 1;

  const numStrings = Math.ceil(numPaineis / optimalPerString);
  const stringsPerMppt = distributeStrings(numStrings, inv.numMppt);

  // Build uniform mpptConfig
  const mpptConfig: MpptConfig = stringsPerMppt.map(n => Array(n).fill(optimalPerString));
  const totalPaineis = numStrings * optimalPerString;

  const vocFrioMax = vocFrio1 * optimalPerString;
  const vmpQuenteMin = vmpQuente1 * optimalPerString;
  const vocSTC = panel.voc * optimalPerString;
  const vmpSTC = panel.vmp * optimalPerString;
  const iscString = panel.isc;
  const potenciaDCTotal = numPaineis * panel.potencia;
  const potenciaAcW = inv.potenciaDcMax;
  const dcAcRatio = potenciaAcW > 0 ? potenciaDCTotal / potenciaAcW : 0;

  const alertas = buildAlerts(
    panel, inv, mpptConfig,
    vocFrioMax, vmpQuenteMin, vocSTC, vmpSTC,
    iscString, dcAcRatio, numStrings, vdcMax,
    T_MIN_PT, false, null, totalPaineis,
  );

  return {
    config: {
      mpptConfig,
      paineisPerString: optimalPerString,
      numStrings,
      stringsPorMppt: stringsPerMppt,
      totalPaineis,
      isMixed: false,
      vocFrio: vocFrioMax,
      vmpQuente: vmpQuenteMin,
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
  };
}

function distributeStrings(total: number, numMppt: number): number[] {
  const base = Math.floor(total / numMppt);
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
  const vdcMax = resolveVdcMax(inv);
  const { tMaxCelula } = calcStringTemps(panel);

  const vocFrio1 = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, coefVoc, tMaxCelula);

  // Flatten all panel counts
  const allCounts = mpptConfig.flat().filter(n => n > 0);
  const maxPanels = allCounts.length > 0 ? Math.max(...allCounts) : 1;
  const minPanels = allCounts.length > 0 ? Math.min(...allCounts) : 1;

  // Worst-case voltages
  const vocFrioMax = vocFrio1 * maxPanels;
  const vmpQuenteMin = vmpQuente1 * minPanels;
  const vocSTC = panel.voc * maxPanels;
  const vmpSTC = panel.vmp * maxPanels;

  const iscString = panel.isc;
  const stringsPorMppt = mpptConfig.map(s => s.length);
  const numStrings = stringsPorMppt.reduce((a, b) => a + b, 0);
  const totalPaineis = allCounts.reduce((a, b) => a + b, 0);
  const potenciaDCTotal = totalPaineis * panel.potencia;
  const dcAcRatio = inv.potenciaDcMax > 0 ? potenciaDCTotal / inv.potenciaDcMax : 0;

  // Check if any MPPT has mixed panel counts
  const isMixed = mpptConfig.some(strings => {
    const uniq = new Set(strings);
    return uniq.size > 1;
  });

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
      vocFrio: vocFrioMax,
      vmpQuente: vmpQuenteMin,
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
  };
}
