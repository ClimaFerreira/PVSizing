export interface FinancialInput {
  investimento: number;
  autoconsumoAnualKwh: number;
  excedenteAnualKwh: number;
  precoKwh: number;
  precoInjecao: number;
  taxaEscaladaPct?: number;
  taxaDegradacaoPct?: number;
  taxaDescontoPct?: number;
  anos?: number;
}

export interface FinancialYear {
  ano: number;
  poupanca: number;
  poupancaAcum: number;
  npvAcum: number;
}

export interface FinancialResult {
  poupancaEnergiaAno1: number;
  receitaExcedenteAno1: number;
  poupancaTotalAno1: number;
  paybackSimplesAnos: number | null;
  paybackDinamicoAnos: number | null;
  paybackDescontadoAnos: number | null;
  npvFinal: number;
  projecao: FinancialYear[];
}

function fractionalPayback(
  previousAccumulated: number,
  currentCashflow: number,
  year: number,
): number {
  if (currentCashflow <= 0) return year;
  const fraction = Math.max(0, Math.min(1, -previousAccumulated / currentCashflow));
  return Math.round((year - 1 + fraction) * 10) / 10;
}

export function calculateFinancialStudy(input: FinancialInput): FinancialResult {
  const investimento = Math.max(0, input.investimento);
  const autoconsumo = Math.max(0, input.autoconsumoAnualKwh);
  const excedente = Math.max(0, input.excedenteAnualKwh);
  const precoKwh = Math.max(0, input.precoKwh);
  const precoInjecao = Math.max(0, input.precoInjecao);
  const escalada = Math.max(0, input.taxaEscaladaPct ?? 3) / 100;
  const degradacao = Math.max(0, input.taxaDegradacaoPct ?? 0.5) / 100;
  const desconto = Math.max(0, input.taxaDescontoPct ?? 4) / 100;
  const anos = Math.max(1, Math.round(input.anos ?? 25));

  const poupancaEnergiaAno1 = autoconsumo * precoKwh;
  const receitaExcedenteAno1 = excedente * precoInjecao;
  const poupancaTotalAno1 = poupancaEnergiaAno1 + receitaExcedenteAno1;
  const paybackSimplesAnos =
    investimento > 0 && poupancaTotalAno1 > 0
      ? Math.round((investimento / poupancaTotalAno1) * 10) / 10
      : null;

  const projecao: FinancialYear[] = [];
  let acumulado = -investimento;
  let npvAcumulado = -investimento;
  let paybackDinamicoAnos: number | null = investimento === 0 ? 0 : null;
  let paybackDescontadoAnos: number | null = investimento === 0 ? 0 : null;

  for (let ano = 1; ano <= anos; ano++) {
    const degradFactor = Math.pow(1 - degradacao, ano - 1);
    const escalFactor = Math.pow(1 + escalada, ano - 1);
    const poupancaEnergia = poupancaEnergiaAno1 * degradFactor * escalFactor;
    const receitaExcedente = receitaExcedenteAno1 * degradFactor;
    const fluxo = poupancaEnergia + receitaExcedente;
    const fluxoDescontado = fluxo / Math.pow(1 + desconto, ano);

    const acumuladoAnterior = acumulado;
    const npvAnterior = npvAcumulado;
    acumulado += fluxo;
    npvAcumulado += fluxoDescontado;

    if (paybackDinamicoAnos === null && acumulado >= 0) {
      paybackDinamicoAnos = fractionalPayback(acumuladoAnterior, fluxo, ano);
    }
    if (paybackDescontadoAnos === null && npvAcumulado >= 0) {
      paybackDescontadoAnos = fractionalPayback(npvAnterior, fluxoDescontado, ano);
    }

    projecao.push({
      ano,
      poupanca: Math.round(fluxo),
      poupancaAcum: Math.round(acumulado),
      npvAcum: Math.round(npvAcumulado),
    });
  }

  return {
    poupancaEnergiaAno1,
    receitaExcedenteAno1,
    poupancaTotalAno1,
    paybackSimplesAnos,
    paybackDinamicoAnos,
    paybackDescontadoAnos,
    npvFinal: npvAcumulado,
    projecao,
  };
}
