import type { MpptConfig } from "./string-sizing";

export interface InverterUnit {
  key: string;
  inverterId: number;
  quantidade: number;
  mpptConfig: MpptConfig | null;
  numPaineisOverride: number | null;
}

export function criarUnidade(inverterId = 0): InverterUnit {
  return {
    key: Math.random().toString(36).slice(2, 9),
    inverterId,
    quantidade: 1,
    mpptConfig: null,
    numPaineisOverride: null,
  };
}

/**
 * Distribute panels proportionally among inverter units by DC capacity.
 * Units with numPaineisOverride get their fixed value; remaining panels are
 * split proportionally among the rest (last unit absorbs rounding).
 */
export function distribuirPaineis(
  units: InverterUnit[],
  dcMaxMap: Map<number, number>,
  totalPaineis: number,
): Map<string, number> {
  const result = new Map<string, number>();

  const unitsAuto  = units.filter(u => u.numPaineisOverride === null);
  const unitsFixed = units.filter(u => u.numPaineisOverride !== null);

  let remaining = totalPaineis;
  for (const u of unitsFixed) {
    const n = u.numPaineisOverride!;
    result.set(u.key, n);
    remaining -= n;
  }

  const totalDcAuto = unitsAuto.reduce(
    (s, u) => s + (dcMaxMap.get(u.inverterId) ?? 1) * u.quantidade,
    0,
  );

  let autoAssigned = 0;
  unitsAuto.forEach((u, idx) => {
    if (idx === unitsAuto.length - 1) {
      result.set(u.key, Math.max(1, remaining - autoAssigned));
    } else {
      const share =
        totalDcAuto > 0
          ? ((dcMaxMap.get(u.inverterId) ?? 1) * u.quantidade) / totalDcAuto
          : 1 / unitsAuto.length;
      const n = Math.max(1, Math.round(remaining * share));
      result.set(u.key, n);
      autoAssigned += n;
    }
  });

  return result;
}

export interface MultiTotais {
  potenciaDCkWp: number;
  potenciaACkW: number;
  numPaineis: number;
  numUnidades: number;
  dcAcRatio: number;
}

export function calcMultiTotais(
  units: InverterUnit[],
  acMap: Map<number, number>,
  numPaineisMap: Map<string, number>,
  panelPotenciaW: number,
): MultiTotais {
  let potenciaDCkWp = 0;
  let potenciaACkW = 0;
  let numPaineis = 0;
  let numUnidades = 0;

  for (const u of units) {
    const n = numPaineisMap.get(u.key) ?? 0;
    const ac = (acMap.get(u.inverterId) ?? 0) * u.quantidade;
    potenciaDCkWp += (n * panelPotenciaW) / 1000;
    potenciaACkW += ac;
    numPaineis += n;
    numUnidades += u.quantidade;
  }

  return {
    potenciaDCkWp,
    potenciaACkW,
    numPaineis,
    numUnidades,
    dcAcRatio: potenciaACkW > 0 ? potenciaDCkWp / potenciaACkW : 0,
  };
}
