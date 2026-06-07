/**
 * Compatibility checks: Panel ↔ Inverter, Battery ↔ Inverter
 */

export type CheckStatus = "ok" | "aviso" | "erro" | "info";

export interface CompatItem {
  categoria: string;
  descricao: string;
  valorObtido: string;
  valorLimite: string;
  status: CheckStatus;
}

export interface CompatResult {
  itens: CompatItem[];
  temErros: boolean;
  temAvisos: boolean;
}

export interface PanelCompat {
  potencia: number;
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
}

export interface InverterCompat {
  potenciaAc: number;
  potenciaDcMax: number;
  mpptMin: number;
  mpptMax: number;
  corrMaxMppt: number;
  numMppt: number;
  stringsPorMppt: number;
  vdcMax: number | null;
}

export interface BatteryCompat {
  capacidade: number;
  tensao: number;
  tecnologia: string | null;
}

function currentLimitWithTolerance(limit: number): number {
  return limit + Math.max(0.5, limit * 0.02);
}

/**
 * Sanity check on panel electrical data (physics constraints).
 * Voc must be > Vmp, Isc must be > Imp.
 * Call this before string sizing to catch bad datasheet imports.
 */
export function checkPanelData(panel: PanelCompat): CompatResult {
  const itens: CompatItem[] = [];

  const vocVmpOk = panel.voc > panel.vmp;
  itens.push({
    categoria: "Voc vs Vmp",
    descricao: "Tensão em circuito aberto deve ser superior à tensão de máxima potência",
    valorObtido: `Voc ${panel.voc} V / Vmp ${panel.vmp} V`,
    valorLimite: "Voc > Vmp",
    status: vocVmpOk ?"ok" : "erro",
  });

  const iscImpOk = panel.isc > panel.imp;
  itens.push({
    categoria: "Isc vs Imp",
    descricao: "Corrente de curto-circuito deve ser superior à corrente de máxima potência",
    valorObtido: `Isc ${panel.isc} A / Imp ${panel.imp} A`,
    valorLimite: "Isc > Imp",
    status: iscImpOk ?"ok" : "erro",
  });

  const pmppConsistente = panel.vmp > 0 && panel.imp > 0
    ?Math.abs(panel.vmp * panel.imp - panel.potencia) / panel.potencia < 0.15
    : true;
  itens.push({
    categoria: "Pmpp consistência",
    descricao: "Potência Vmp × Imp deve aproximar-se da Pmpp declarada (tolerância ±15%)",
    valorObtido: `${(panel.vmp * panel.imp).toFixed(0)} W`,
    valorLimite: `~${panel.potencia} Wp`,
    status: pmppConsistente ?"ok" : "aviso",
  });

  return buildResult(itens);
}

export function checkPanelInverter(
  panel: PanelCompat,
  inv: InverterCompat,
  numPaineis: number
): CompatResult {
  const itens: CompatItem[] = [];

  const vdcMax = inv.vdcMax && inv.vdcMax > 0 ?inv.vdcMax : inv.mpptMax * 1.2;
  const potenciaDC = numPaineis * panel.potencia;
  const dcAcRatio = potenciaDC / (inv.potenciaAc * 1000);
  const iscString = panel.isc;
  const potenciaDCKwp = potenciaDC / 1000;
  const dcExcedeMax = inv.potenciaDcMax > 0 && potenciaDCKwp > inv.potenciaDcMax * 1.05;

  itens.push({
    categoria: "Potência DC/AC",
    descricao: "Rácio de oversizing DC/AC (90–130% excelente · 80–140% aceitável)",
    valorObtido: `${(dcAcRatio * 100).toFixed(0)}%`,
    valorLimite: "90–130%",
    status: (dcAcRatio < 0.6 || (dcAcRatio > 1.7 && dcExcedeMax)) ?"erro"
          : (dcAcRatio < 0.8 || dcAcRatio > 1.4) ?"aviso"
          : "ok",
  });

  itens.push({
    categoria: "Potência DC",
    descricao: "Potência DC total vs. limite do inversor",
    valorObtido: `${potenciaDCKwp.toFixed(2)} kWp`,
    valorLimite: `${inv.potenciaDcMax} kW`,
    status: dcExcedeMax ?"erro" : potenciaDCKwp > inv.potenciaDcMax ?"aviso" : "ok",
  });

  itens.push({
    categoria: "Tensão Voc",
    descricao: "Voc de 1 painel vs. janela MPPT",
    valorObtido: `${panel.voc} V`,
    valorLimite: `< ${vdcMax.toFixed(0)} V`,
    status: panel.voc > vdcMax ?"erro" : panel.voc < inv.mpptMin ?"aviso" : "ok",
  });

  itens.push({
    categoria: "Janela MPPT",
    descricao: "Vmp de 1 painel enquadrado na janela MPPT",
    valorObtido: `${panel.vmp} V`,
    valorLimite: `${inv.mpptMin}–${inv.mpptMax} V`,
    status: panel.vmp < inv.mpptMin || panel.vmp > inv.mpptMax ?"info" : "ok",
  });

  itens.push({
    categoria: "Corrente MPPT",
    descricao: "Isc por string vs. corrente máxima MPPT",
    valorObtido: `${iscString.toFixed(1)} A`,
    valorLimite: `${inv.corrMaxMppt} A`,
    status: iscString > currentLimitWithTolerance(inv.corrMaxMppt) ?"erro" : iscString > inv.corrMaxMppt * 0.9 ?"aviso" : "ok",
  });

  itens.push({
    categoria: "MPPTs",
    descricao: "Número de MPPTs disponíveis",
    valorObtido: `${inv.numMppt} MPPTs × ${inv.stringsPorMppt} strings`,
    valorLimite: "≥ 1 MPPT",
    status: inv.numMppt >= 1 ?"ok" : "erro",
  });

  return buildResult(itens);
}

export function checkBatteryInverter(
  bat: BatteryCompat,
  inv: InverterCompat
): CompatResult {
  const itens: CompatItem[] = [];

  itens.push({
    categoria: "Tensão bateria",
    descricao: "Tensão nominal da bateria",
    valorObtido: `${bat.tensao} V`,
    valorLimite: "48 V / 51.2 V típico",
    status: bat.tensao >= 40 && bat.tensao <= 60 ?"ok" : "aviso",
  });

  itens.push({
    categoria: "Capacidade",
    descricao: "Energia total armazenada",
    valorObtido: `${bat.capacidade} kWh`,
    valorLimite: "—",
    status: "info",
  });

  const autonomiaEst = bat.capacidade / Math.max(inv.potenciaAc * 0.3, 0.1);
  itens.push({
    categoria: "Autonomia est.",
    descricao: "Estimativa de autonomia a 30% carga AC",
    valorObtido: `${autonomiaEst.toFixed(1)} h`,
    valorLimite: "—",
    status: "info",
  });

  if (bat.tecnologia) {
    itens.push({
      categoria: "Tecnologia",
      descricao: "Tipo de química da bateria",
      valorObtido: bat.tecnologia,
      valorLimite: "LiFePO4 recomendado",
      status: bat.tecnologia === "LiFePO4" ?"ok" : "aviso",
    });
  }

  return buildResult(itens);
}

function buildResult(itens: CompatItem[]): CompatResult {
  return {
    itens,
    temErros: itens.some(i => i.status === "erro"),
    temAvisos: itens.some(i => i.status === "aviso"),
  };
}
