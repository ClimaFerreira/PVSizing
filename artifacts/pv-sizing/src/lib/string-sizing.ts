/**
 * String sizing and electrical validation for PV systems.
 * Temperatures in °C, voltages in V, currents in A.
 */

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
  paineisPerString: number;
  numStrings: number;
  stringsPorMppt: number[];
  vocFrio: number;
  vmpQuente: number;
  vocSTC: number;
  vmpSTC: number;
  iscString: number;
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

export function calcStringSizing(
  panel: PanelElec,
  inv: InverterElec,
  numPaineis: number
): StringSizingResult {
  const coefVoc = resolveCoefVoc(panel);
  const noct = resolveNoct(panel);
  const vdcMax = resolveVdcMax(inv);
  const { tMaxCelula } = calcStringTemps(panel);

  const vocFrio1 = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, coefVoc, tMaxCelula);

  const maxPerString = Math.floor(vdcMax / vocFrio1);
  const minPerString = Math.ceil(inv.mpptMin / vmpQuente1);

  const targetVmp = (inv.mpptMin + inv.mpptMax) * 0.45;
  let optimalPerString = Math.round(targetVmp / panel.vmp);
  optimalPerString = Math.max(minPerString, Math.min(maxPerString, optimalPerString));

  if (optimalPerString < 1) optimalPerString = 1;

  const numStrings = Math.ceil(numPaineis / optimalPerString);
  const stringsPerMppt = distributeStrings(numStrings, inv.numMppt);

  const vocFrio = vocFrio1 * optimalPerString;
  const vmpQuente = vmpQuente1 * optimalPerString;
  const vocSTC = panel.voc * optimalPerString;
  const vmpSTC = panel.vmp * optimalPerString;
  const iscString = panel.isc;
  const potenciaDCTotal = numPaineis * panel.potencia;
  const potenciaAcW = inv.potenciaDcMax;
  const dcAcRatio = potenciaAcW > 0 ? potenciaDCTotal / potenciaAcW : 0;

  const alertas: StringAlert[] = [];

  if (vocFrio > vdcMax) {
    alertas.push({ tipo: "erro", mensagem: `Voc a ${T_MIN_PT}°C (${vocFrio.toFixed(0)}V) excede tensão máxima DC do inversor (${vdcMax.toFixed(0)}V)` });
  } else if (vocFrio > vdcMax * 0.95) {
    alertas.push({ tipo: "aviso", mensagem: `Voc a ${T_MIN_PT}°C (${vocFrio.toFixed(0)}V) está próximo do limite máximo DC (${vdcMax.toFixed(0)}V)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Voc em frio (${vocFrio.toFixed(0)}V) dentro do limite máximo DC (${vdcMax.toFixed(0)}V)` });
  }

  if (vmpQuente < inv.mpptMin) {
    alertas.push({ tipo: "erro", mensagem: `Vmpp em calor extremo (${vmpQuente.toFixed(0)}V) abaixo da janela MPPT mínima (${inv.mpptMin}V)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Vmpp em calor (${vmpQuente.toFixed(0)}V) dentro da janela MPPT (${inv.mpptMin}–${inv.mpptMax}V)` });
  }

  if (vmpSTC > inv.mpptMax) {
    alertas.push({ tipo: "aviso", mensagem: `Vmpp a STC (${vmpSTC.toFixed(0)}V) excede topo da janela MPPT (${inv.mpptMax}V) — considere reduzir painéis por string` });
  }

  const maxStrPerMppt = Math.max(...stringsPerMppt);
  const iscTotalMppt = iscString * maxStrPerMppt;
  if (iscTotalMppt > inv.corrMaxMppt) {
    alertas.push({ tipo: "erro", mensagem: `Isc total por MPPT (${iscTotalMppt.toFixed(1)}A) excede corrente máxima do MPPT (${inv.corrMaxMppt}A)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Isc por MPPT (${iscTotalMppt.toFixed(1)}A) dentro do limite (${inv.corrMaxMppt}A)` });
  }

  if (dcAcRatio > 1.5) {
    alertas.push({ tipo: "aviso", mensagem: `Oversizing DC/AC elevado (${(dcAcRatio * 100).toFixed(0)}%) — pode causar clipping significativo` });
  } else if (dcAcRatio > 1.3) {
    alertas.push({ tipo: "aviso", mensagem: `Oversizing DC/AC (${(dcAcRatio * 100).toFixed(0)}%) — verifique se o inversor aceita potência DC adicional` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Rácio DC/AC (${(dcAcRatio * 100).toFixed(0)}%) dentro do intervalo recomendado` });
  }

  if (numStrings > inv.numMppt * inv.stringsPorMppt) {
    alertas.push({ tipo: "erro", mensagem: `Número de strings (${numStrings}) excede capacidade do inversor (${inv.numMppt} MPPTs × ${inv.stringsPorMppt} strings)` });
  }

  return {
    config: {
      paineisPerString: optimalPerString,
      numStrings,
      stringsPorMppt: stringsPerMppt,
      vocFrio,
      vmpQuente,
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
 * Compute a StringSizingResult from a user-supplied fixed configuration.
 * All electrical validation alerts are still computed from the given values.
 */
export function calcStringSizingManual(
  panel: PanelElec,
  inv: InverterElec,
  paineisPerString: number,
  stringsPorMpptArr: number[]
): StringSizingResult {
  const coefVoc = resolveCoefVoc(panel);
  const vdcMax = resolveVdcMax(inv);
  const { tMaxCelula } = calcStringTemps(panel);

  const vocFrio1 = calcVocAtTemp(panel.voc, coefVoc, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, coefVoc, tMaxCelula);

  const numStrings = stringsPorMpptArr.reduce((a, b) => a + b, 0);
  const numPaineis = paineisPerString * numStrings;

  const vocFrio = vocFrio1 * paineisPerString;
  const vmpQuente = vmpQuente1 * paineisPerString;
  const vocSTC = panel.voc * paineisPerString;
  const vmpSTC = panel.vmp * paineisPerString;
  const iscString = panel.isc;
  const potenciaDCTotal = numPaineis * panel.potencia;
  const potenciaAcW = inv.potenciaDcMax;
  const dcAcRatio = potenciaAcW > 0 ? potenciaDCTotal / potenciaAcW : 0;

  const alertas: StringAlert[] = [];

  if (vocFrio > vdcMax) {
    alertas.push({ tipo: "erro", mensagem: `Voc a ${T_MIN_PT}°C (${vocFrio.toFixed(0)}V) excede tensão máxima DC do inversor (${vdcMax.toFixed(0)}V)` });
  } else if (vocFrio > vdcMax * 0.95) {
    alertas.push({ tipo: "aviso", mensagem: `Voc a ${T_MIN_PT}°C (${vocFrio.toFixed(0)}V) está próximo do limite máximo DC (${vdcMax.toFixed(0)}V)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Voc em frio (${vocFrio.toFixed(0)}V) dentro do limite máximo DC (${vdcMax.toFixed(0)}V)` });
  }

  if (vmpQuente < inv.mpptMin) {
    alertas.push({ tipo: "erro", mensagem: `Vmpp em calor extremo (${vmpQuente.toFixed(0)}V) abaixo da janela MPPT mínima (${inv.mpptMin}V)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Vmpp em calor (${vmpQuente.toFixed(0)}V) dentro da janela MPPT (${inv.mpptMin}–${inv.mpptMax}V)` });
  }

  if (vmpSTC > inv.mpptMax) {
    alertas.push({ tipo: "aviso", mensagem: `Vmpp a STC (${vmpSTC.toFixed(0)}V) excede topo da janela MPPT (${inv.mpptMax}V) — considere reduzir painéis por string` });
  }

  const maxStrPerMppt = Math.max(...stringsPorMpptArr, 0);
  const iscTotalMppt = iscString * maxStrPerMppt;
  if (iscTotalMppt > inv.corrMaxMppt) {
    alertas.push({ tipo: "erro", mensagem: `Isc total por MPPT (${iscTotalMppt.toFixed(1)}A) excede corrente máxima do MPPT (${inv.corrMaxMppt}A)` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Isc por MPPT (${iscTotalMppt.toFixed(1)}A) dentro do limite (${inv.corrMaxMppt}A)` });
  }

  if (dcAcRatio > 1.5) {
    alertas.push({ tipo: "aviso", mensagem: `Oversizing DC/AC elevado (${(dcAcRatio * 100).toFixed(0)}%) — pode causar clipping significativo` });
  } else if (dcAcRatio > 1.3) {
    alertas.push({ tipo: "aviso", mensagem: `Oversizing DC/AC (${(dcAcRatio * 100).toFixed(0)}%) — verifique se o inversor aceita potência DC adicional` });
  } else {
    alertas.push({ tipo: "ok", mensagem: `Rácio DC/AC (${(dcAcRatio * 100).toFixed(0)}%) dentro do intervalo recomendado` });
  }

  if (numStrings > inv.numMppt * inv.stringsPorMppt) {
    alertas.push({ tipo: "erro", mensagem: `Número de strings (${numStrings}) excede capacidade do inversor (${inv.numMppt} MPPTs × ${inv.stringsPorMppt} strings)` });
  }

  return {
    config: {
      paineisPerString,
      numStrings,
      stringsPorMppt: stringsPorMpptArr,
      vocFrio,
      vmpQuente,
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
