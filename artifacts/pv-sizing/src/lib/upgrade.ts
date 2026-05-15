export type TipoProjeto =
  | "nova"
  | "upgrade"
  | "bateria"
  | "expansao"
  | "substituicao";

export const TIPO_PROJETO_LABELS: Record<TipoProjeto, string> = {
  nova:         "Nova Instalação",
  upgrade:      "Upgrade de Instalação Existente",
  bateria:      "Adicionar Bateria",
  expansao:     "Expansão FV",
  substituicao: "Substituição de Inversor",
};

export const TIPO_PROJETO_DESC: Record<TipoProjeto, string> = {
  nova:         "Instalação fotovoltaica nova, sem sistema existente.",
  upgrade:      "Expansão ou melhoria de sistema FV já instalado.",
  bateria:      "Integração de bateria em sistema FV existente.",
  expansao:     "Adicionar mais painéis ao sistema actual.",
  substituicao: "Substituição do inversor por modelo mais eficiente.",
};

export type RegimeInjecao = "autoconsumo" | "net_metering" | "exportacao_total";

export const REGIME_LABELS: Record<RegimeInjecao, string> = {
  autoconsumo:      "Autoconsumo (excedente injectado na rede)",
  net_metering:     "Net Metering (compensação em créditos)",
  exportacao_total: "Exportação total à rede",
};

export interface InstalacaoExistente {
  potenciaFVkWp:        number;
  numPaineis:           number;
  panelId:              number | null;
  panelModeloManual:    string;
  inverterId:           number | null;
  inversorModeloManual: string;
  potenciaACkW:         number;
  numStrings:           number;
  producaoAnualkWh:     number;
  temBateria:           boolean;
  regimeInjecao:        RegimeInjecao;
}

export const defaultInstalacaoExistente: InstalacaoExistente = {
  potenciaFVkWp:        0,
  numPaineis:           0,
  panelId:              null,
  panelModeloManual:    "",
  inverterId:           null,
  inversorModeloManual: "",
  potenciaACkW:         0,
  numStrings:           1,
  producaoAnualkWh:     0,
  temBateria:           false,
  regimeInjecao:        "autoconsumo",
};

export interface UpgradeValidacoes {
  podeReutilizarStrings:    boolean;
  precisaNovoInversor:      boolean;
  podeACCoupling:           boolean;
  podeBateriaRetrofit:      boolean;
  limitePotenciaOk:         boolean;
  totalDCkWpFinal:          number;
  totalACkWFinal:           number;
  producaoAdicionalEstkWh:  number;
  poupancaAdicionalEstEuro: number;
  paybackUpgradeAnos:       number | null;
}

export function calcUpgradeValidacoes(
  existente: InstalacaoExistente,
  novaPotenciaFVkWp: number,
  novoInversorACkW: number | null,
  novoInversorDCMaxkW: number | null,
  precoKwh: number,
  investimentoUpgrade: number,
): UpgradeValidacoes {
  const totalDC = existente.potenciaFVkWp + novaPotenciaFVkWp;
  const totalAC = novoInversorACkW != null
    ? existente.potenciaACkW + novoInversorACkW
    : existente.potenciaACkW;

  // New DC fits in existing inverter headroom
  const existingHeadroomkW = Math.max(
    0,
    existente.potenciaACkW * 1.5 - existente.potenciaFVkWp,
  );
  const podeReutilizarStrings =
    novaPotenciaFVkWp > 0 && novaPotenciaFVkWp <= existingHeadroomkW;

  // Total would exceed DC/AC 1.55 if keeping existing inverter
  const totalDCACRatio = totalDC / Math.max(existente.potenciaACkW, 0.001);
  const precisaNovoInversor =
    totalDCACRatio > 1.55 && novoInversorACkW == null;

  // AC coupling: existing inverter not fully loaded (< 90%)
  const podeACCoupling =
    existente.potenciaACkW > 0 &&
    existente.potenciaFVkWp / existente.potenciaACkW < 0.9;

  const podeBateriaRetrofit = !existente.temBateria;

  const limitePotenciaOk = novoInversorDCMaxkW != null
    ? novaPotenciaFVkWp <= novoInversorDCMaxkW * 1.55
    : podeReutilizarStrings || novoInversorACkW != null;

  // Average 1 350 kWh/kWp/yr for Portugal
  const producaoAdicionalEstkWh = novaPotenciaFVkWp * 1350;
  const poupancaAdicionalEstEuro = producaoAdicionalEstkWh * precoKwh;

  const paybackUpgradeAnos =
    poupancaAdicionalEstEuro > 0 && investimentoUpgrade > 0
      ? investimentoUpgrade / poupancaAdicionalEstEuro
      : null;

  return {
    podeReutilizarStrings,
    precisaNovoInversor,
    podeACCoupling,
    podeBateriaRetrofit,
    limitePotenciaOk,
    totalDCkWpFinal: totalDC,
    totalACkWFinal:  totalAC,
    producaoAdicionalEstkWh,
    poupancaAdicionalEstEuro,
    paybackUpgradeAnos,
  };
}
