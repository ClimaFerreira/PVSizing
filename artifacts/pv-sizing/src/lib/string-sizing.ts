/**
 * String sizing and electrical validation for PV systems.
 * Temperatures are in C, voltages in V, currents in A.
 *
 * KEY INVARIANT: automatic sizing never changes the requested panel count.
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
  potenciaAc: number;
  potenciaDcMax: number;
  vdcMax: number | null;
  correnteCurtoCircuitoMppt?: number | null;
}

export interface StringConfig {
  mpptConfig: MpptConfig;
  paineisPerString: number;
  numStrings: number;
  stringsPorMppt: number[];
  totalPaineis: number;
  isMixed: boolean;
  vocFrio: number;
  vmpQuente: number;
  vocSTC: number;
  vmpSTC: number;
  iscString: number;
  impString: number;
  dcAcRatio: number;
  potenciaDCTotal: number;
}

export interface StringAlert {
  tipo: "erro" | "aviso" | "ok";
  mensagem: string;
}

export interface SemSolucaoInfo {
  abaixo: number;
  acima: number;
  minPerStr: number;
  maxPerStr: number;
}

export interface StringSizingResult {
  config: StringConfig;
  alertas: StringAlert[];
  tMinPortugal: number;
  tMaxCelula: number;
  vdcMaxUsado: number;
  semSolucao: boolean;
  sugestoes?: SemSolucaoInfo;
}

const T_MIN_PT = -10;
const T_STC = 25;
const T_AMB_MAX = 40;
const DEFAULT_COEF_VOC = -0.0028;
const DEFAULT_COEF_VMP = -0.0035;

function resolveCoefVoc(panel: PanelElec): number {
  if (panel.coeficienteTemperaturaVoc != null && panel.coeficienteTemperaturaVoc !== 0) {
    return panel.coeficienteTemperaturaVoc / 100;
  }
  return DEFAULT_COEF_VOC;
}

function resolveVdcMax(inv: InverterElec): number {
  return inv.vdcMax && inv.vdcMax > 0 ? inv.vdcMax : inv.mpptMax * 1.2;
}

function currentLimitWithTolerance(limit: number): number {
  return Math.max(limit * 1.02, limit + 0.5);
}

export function calcStringTemps(panel: PanelElec): { tMinPt: number; tMaxCelula: number } {
  const noct = panel.noct ?? 45;
  return { tMinPt: T_MIN_PT, tMaxCelula: T_AMB_MAX + ((noct - 20) / 800) * 1000 };
}

export function calcVocAtTemp(voc: number, coefVoc: number, tCell: number): number {
  return voc * (1 + coefVoc * (tCell - T_STC));
}

export function calcVmpAtTemp(vmp: number, coefVmp: number, tCell: number): number {
  return vmp * (1 + coefVmp * (tCell - T_STC));
}

function electricalLimits(panel: PanelElec, inv: InverterElec) {
  const { tMaxCelula } = calcStringTemps(panel);
  const vdcMax = resolveVdcMax(inv);
  const vocFrio1 = calcVocAtTemp(panel.voc, resolveCoefVoc(panel), T_MIN_PT);
  const vmpFrio1 = calcVmpAtTemp(panel.vmp, DEFAULT_COEF_VMP, T_MIN_PT);
  const vmpQuente1 = calcVmpAtTemp(panel.vmp, DEFAULT_COEF_VMP, tMaxCelula);
  const minPerStr = Math.max(1, Math.ceil(inv.mpptMin / vmpQuente1));
  const maxPerStr = Math.max(1, Math.min(
    Math.floor(vdcMax / vocFrio1),
    Math.floor(inv.mpptMax / vmpFrio1),
  ));
  const iscLimit = inv.correnteCurtoCircuitoMppt && inv.correnteCurtoCircuitoMppt > 0
    ? inv.correnteCurtoCircuitoMppt
    : inv.corrMaxMppt;
  const byImp = panel.imp > 0
    ? Math.floor(currentLimitWithTolerance(inv.corrMaxMppt) / panel.imp)
    : inv.stringsPorMppt;
  const byIsc = panel.isc > 0
    ? Math.floor(currentLimitWithTolerance(iscLimit) / panel.isc)
    : inv.stringsPorMppt;
  const stringsPerMppt = Math.max(0, Math.min(inv.stringsPorMppt, byImp, byIsc));

  return {
    tMaxCelula,
    vdcMax,
    vocFrio1,
    vmpFrio1,
    vmpQuente1,
    minPerStr,
    maxPerStr,
    iscLimit,
    stringsPerMppt,
    maxStringsTotal: inv.numMppt * stringsPerMppt,
  };
}

export function maxPaineisPerString(panel: PanelElec, inv: InverterElec): number {
  return electricalLimits(panel, inv).maxPerStr;
}

function configWorks(n: number, minPerStr: number, maxPerStr: number, maxStrings: number): boolean {
  for (let count = 1; count <= Math.min(maxStrings, n); count++) {
    const low = Math.floor(n / count);
    const high = Math.ceil(n / count);
    if (low >= minPerStr && high <= maxPerStr) return true;
  }
  return false;
}

function nearestCounts(
  target: number,
  minPerStr: number,
  maxPerStr: number,
  maxStrings: number,
): SemSolucaoInfo {
  let abaixo = 0;
  let acima = 0;
  for (let n = target - 1; n >= Math.max(1, target - 40); n--) {
    if (configWorks(n, minPerStr, maxPerStr, maxStrings)) {
      abaixo = n;
      break;
    }
  }
  for (let n = target + 1; n <= target + 40; n++) {
    if (configWorks(n, minPerStr, maxPerStr, maxStrings)) {
      acima = n;
      break;
    }
  }
  return { abaixo, acima, minPerStr, maxPerStr };
}

function distributeStrings(total: number, mppts: number): number[] {
  const base = Math.floor(total / mppts);
  const extra = total % mppts;
  return Array.from({ length: mppts }, (_, index) => base + (index < extra ? 1 : 0));
}

function buildAlerts(
  panel: PanelElec,
  inv: InverterElec,
  config: MpptConfig,
  totalPaineis: number,
  numPaineisAuto: number | null,
): StringAlert[] {
  const limits = electricalLimits(panel, inv);
  const counts = config.flat().filter(value => value > 0);
  const alerts: StringAlert[] = [];

  if (counts.length === 0) {
    return [{ tipo: "erro", mensagem: "Adicione pelo menos uma string com paineis." }];
  }

  const maxPanels = Math.max(...counts);
  const minPanels = Math.min(...counts);
  const vocCold = limits.vocFrio1 * maxPanels;
  const vmpCold = limits.vmpFrio1 * maxPanels;
  const vmpHot = limits.vmpQuente1 * minPanels;

  if (vocCold > limits.vdcMax) {
    alerts.push({ tipo: "erro", mensagem: `Voc em frio (${vocCold.toFixed(0)} V) excede o limite DC (${limits.vdcMax.toFixed(0)} V).` });
  } else {
    alerts.push({ tipo: "ok", mensagem: `Voc em frio (${vocCold.toFixed(0)} V) dentro do limite DC (${limits.vdcMax.toFixed(0)} V).` });
  }

  if (vmpHot < inv.mpptMin || vmpCold > inv.mpptMax) {
    alerts.push({
      tipo: "erro",
      mensagem: `A string sai da janela MPPT: ${vmpHot.toFixed(0)} V em calor / ${vmpCold.toFixed(0)} V em frio; limite ${inv.mpptMin}-${inv.mpptMax} V.`,
    });
  } else {
    alerts.push({
      tipo: "ok",
      mensagem: `Vmpp em operacao (${vmpHot.toFixed(0)}-${vmpCold.toFixed(0)} V) dentro da janela ${inv.mpptMin}-${inv.mpptMax} V.`,
    });
  }

  config.forEach((strings, index) => {
    if (strings.length === 0) return;
    const imp = panel.imp * strings.length;
    const isc = panel.isc * strings.length;
    const impTolerance = currentLimitWithTolerance(inv.corrMaxMppt);
    const iscTolerance = currentLimitWithTolerance(limits.iscLimit);

    if (imp > impTolerance) {
      alerts.push({ tipo: "erro", mensagem: `MPPT ${index + 1}: Imp total ${imp.toFixed(1)} A excede ${inv.corrMaxMppt} A.` });
    } else if (imp > inv.corrMaxMppt) {
      alerts.push({ tipo: "aviso", mensagem: `MPPT ${index + 1}: Imp ${imp.toFixed(1)} A ligeiramente acima do valor nominal ${inv.corrMaxMppt} A; confirme a ficha tecnica.` });
    }

    if (isc > iscTolerance) {
      alerts.push({ tipo: "erro", mensagem: `MPPT ${index + 1}: Isc total ${isc.toFixed(1)} A excede o limite de curto-circuito ${limits.iscLimit} A.` });
    } else if (isc > limits.iscLimit) {
      alerts.push({ tipo: "aviso", mensagem: `MPPT ${index + 1}: Isc ${isc.toFixed(1)} A ligeiramente acima de ${limits.iscLimit} A; confirme a ficha tecnica.` });
    } else if (imp <= inv.corrMaxMppt) {
      alerts.push({ tipo: "ok", mensagem: `MPPT ${index + 1}: Imp/Isc ${imp.toFixed(1)}/${isc.toFixed(1)} A dentro dos limites.` });
    }

    if (strings.length > inv.stringsPorMppt) {
      alerts.push({ tipo: "erro", mensagem: `MPPT ${index + 1}: ${strings.length} strings excedem as ${inv.stringsPorMppt} entradas disponiveis.` });
    }
    if (new Set(strings).size > 1) {
      alerts.push({ tipo: "erro", mensagem: `MPPT ${index + 1}: strings em paralelo devem ter o mesmo numero de paineis. Use MPPTs separados para strings assimetricas.` });
    }
  });

  if (config.length > inv.numMppt || config.slice(inv.numMppt).some(strings => strings.length > 0)) {
    alerts.push({ tipo: "erro", mensagem: `A configuracao usa mais de ${inv.numMppt} MPPTs.` });
  }

  const dcKwp = totalPaineis * panel.potencia / 1000;
  const dcAcRatio = inv.potenciaAc > 0 ? dcKwp / inv.potenciaAc : 0;
  if (inv.potenciaDcMax > 0 && dcKwp > inv.potenciaDcMax * 1.05) {
    alerts.push({ tipo: "erro", mensagem: `Potencia FV ${dcKwp.toFixed(2)} kWp excede o limite do inversor ${inv.potenciaDcMax.toFixed(2)} kW.` });
  } else if (inv.potenciaDcMax > 0 && dcKwp > inv.potenciaDcMax) {
    alerts.push({ tipo: "aviso", mensagem: `Potencia FV ${dcKwp.toFixed(2)} kWp ligeiramente acima do limite nominal ${inv.potenciaDcMax.toFixed(2)} kW; confirme a tolerancia do fabricante.` });
  } else if (inv.potenciaDcMax > 0) {
    alerts.push({ tipo: "ok", mensagem: `Potencia FV ${dcKwp.toFixed(2)} kWp dentro do limite ${inv.potenciaDcMax.toFixed(2)} kW.` });
  }

  if (dcAcRatio < 0.6 || dcAcRatio > 1.7) {
    alerts.push({ tipo: "erro", mensagem: `Relacao DC/AC ${(dcAcRatio * 100).toFixed(0)}% fora do intervalo tecnico recomendado.` });
  } else if (dcAcRatio < 0.8 || dcAcRatio > 1.4) {
    alerts.push({ tipo: "aviso", mensagem: `Relacao DC/AC ${(dcAcRatio * 100).toFixed(0)}%; reveja o equilibrio entre paineis e inversor.` });
  } else {
    alerts.push({ tipo: "ok", mensagem: `Relacao DC/AC ${(dcAcRatio * 100).toFixed(0)}% adequada.` });
  }

  if (numPaineisAuto != null && totalPaineis !== numPaineisAuto) {
    alerts.push({ tipo: "aviso", mensagem: `A configuracao manual usa ${totalPaineis} paineis; o dimensionamento indicava ${numPaineisAuto}.` });
  }

  return alerts;
}

function resultFromConfig(
  panel: PanelElec,
  inv: InverterElec,
  mpptConfig: MpptConfig,
  numPaineisAuto: number | null,
): StringSizingResult {
  const limits = electricalLimits(panel, inv);
  const counts = mpptConfig.flat().filter(value => value > 0);
  const maxPanels = counts.length ? Math.max(...counts) : 0;
  const minPanels = counts.length ? Math.min(...counts) : 0;
  const totalPaineis = counts.reduce((sum, value) => sum + value, 0);
  const potenciaDCTotal = totalPaineis * panel.potencia;
  const dcAcRatio = inv.potenciaAc > 0 ? potenciaDCTotal / 1000 / inv.potenciaAc : 0;
  const alerts = buildAlerts(panel, inv, mpptConfig, totalPaineis, numPaineisAuto);

  return {
    config: {
      mpptConfig,
      paineisPerString: maxPanels,
      numStrings: counts.length,
      stringsPorMppt: mpptConfig.map(strings => strings.length),
      totalPaineis,
      isMixed: mpptConfig.some(strings => new Set(strings).size > 1),
      vocFrio: limits.vocFrio1 * maxPanels,
      vmpQuente: limits.vmpQuente1 * minPanels,
      vocSTC: panel.voc * maxPanels,
      vmpSTC: panel.vmp * maxPanels,
      iscString: panel.isc,
      impString: panel.imp,
      dcAcRatio,
      potenciaDCTotal,
    },
    alertas: alerts,
    tMinPortugal: T_MIN_PT,
    tMaxCelula: limits.tMaxCelula,
    vdcMaxUsado: limits.vdcMax,
    semSolucao: false,
  };
}

export function calcStringSizing(
  panel: PanelElec,
  inv: InverterElec,
  numPaineis: number,
): StringSizingResult {
  const limits = electricalLimits(panel, inv);
  const targetVoltage = inv.mpptMin + (inv.mpptMax - inv.mpptMin) * 0.5;
  const targetPanels = Math.max(
    limits.minPerStr,
    Math.min(limits.maxPerStr, Math.round(targetVoltage / panel.vmp)),
  );
  const candidates: Array<{ config: MpptConfig; score: number }> = [];

  for (let stringCount = 1; stringCount <= Math.min(limits.maxStringsTotal, numPaineis); stringCount++) {
    const low = Math.floor(numPaineis / stringCount);
    const high = Math.ceil(numPaineis / stringCount);
    if (low < limits.minPerStr || high > limits.maxPerStr) continue;

    const stringsPerMppt = distributeStrings(stringCount, inv.numMppt);
    let extras = numPaineis % stringCount;
    const config = stringsPerMppt.map(count => Array.from({ length: count }, () => {
      const panels = extras > 0 ? high : low;
      extras = Math.max(0, extras - 1);
      return panels;
    }));

    // Parallel strings on one MPPT must be equal. Asymmetry is valid across MPPTs.
    if (config.some(strings => new Set(strings).size > 1)) continue;
    const uniformPenalty = numPaineis % stringCount === 0 ? 0 : 2;
    const average = numPaineis / stringCount;
    candidates.push({ config, score: uniformPenalty + Math.abs(average - targetPanels) + stringCount * 0.01 });
  }

  if (!candidates.length) {
    const empty = Array.from({ length: inv.numMppt }, () => [] as number[]);
    const sugestoes = nearestCounts(numPaineis, limits.minPerStr, limits.maxPerStr, limits.maxStringsTotal);
    const base = resultFromConfig(panel, inv, empty, null);
    return {
      ...base,
      config: { ...base.config, totalPaineis: numPaineis, potenciaDCTotal: numPaineis * panel.potencia },
      alertas: [{
        tipo: "erro",
        mensagem: `Sem configuracao valida para ${numPaineis} paineis. Cada string admite ${limits.minPerStr}-${limits.maxPerStr} paineis e existem ${limits.maxStringsTotal} strings eletricamente utilizaveis.`,
      }],
      semSolucao: true,
      sugestoes,
    };
  }

  candidates.sort((a, b) => a.score - b.score);
  return resultFromConfig(panel, inv, candidates[0].config, null);
}

export function calcStringSizingManual(
  panel: PanelElec,
  inv: InverterElec,
  mpptConfig: MpptConfig,
  numPaineisAuto: number | null = null,
): StringSizingResult {
  return resultFromConfig(panel, inv, mpptConfig, numPaineisAuto);
}
