export interface LinhaOrcamento {
  id: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  ivaPerc: number;
}

export interface OrcamentoState {
  codigo: string;
  dataEmissao: string;
  validadeDias: number;
  moeda: string;
  empresaNome: string;
  empresaMorada: string;
  empresaNif: string;
  empresaTelefone: string;
  empresaEmail: string;
  empresaIban: string;
  nomeCliente: string;
  nifCliente: string;
  moradaCliente: string;
  linhas: LinhaOrcamento[];
  observacoes: string;
  condicoesPagamento: string;
  incluirEstudoEnergetico: boolean;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function gerarCodigoOrcamento(): string {
  const ano = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 900) + 100).padStart(3, "0");
  return `ORC${seq}_${ano}`;
}

export interface OrcamentoDefaultParams {
  panelNome?: string;
  panelFabricante?: string;
  panelPotencia?: number;
  inversorNome?: string;
  inversorFabricante?: string;
  bateriaNome?: string;
  bateriaFabricante?: string;
  numeroPaineis?: number;
  investimentoTotal?: number;
  moradaInstalacao?: string;
}

function linha(descricao: string, quantidade: number, preco = 0, iva = 23, codigo = ""): LinhaOrcamento {
  return { id: uid(), codigo, descricao, quantidade, precoUnitario: preco, ivaPerc: iva };
}

export function defaultOrcamentoState(p: OrcamentoDefaultParams = {}): OrcamentoState {
  const {
    panelNome = "Painel Solar",
    panelFabricante = "",
    panelPotencia,
    inversorNome = "Inversor Solar",
    inversorFabricante = "",
    bateriaNome,
    bateriaFabricante,
    numeroPaineis = 0,
    investimentoTotal = 0,
    moradaInstalacao = "",
  } = p;

  const panelDesc = [panelFabricante, panelNome, panelPotencia ? `${panelPotencia}W` : null]
    .filter(Boolean).join(" ");
  const invDesc = [inversorFabricante, inversorNome].filter(Boolean).join(" ");
  const batDesc = bateriaNome ? [bateriaFabricante, bateriaNome].filter(Boolean).join(" ") : null;

  const kwp = numeroPaineis > 0 && panelPotencia
    ? `${((numeroPaineis * panelPotencia) / 1000).toFixed(2)} kWp`
    : null;

  const linhas: LinhaOrcamento[] = [
    linha(
      kwp
        ? `Kit Solar Fotovoltaico ${kwp}`
        : "Kit Solar Fotovoltaico P/Autoconsumo",
      1,
      investimentoTotal > 0 ? investimentoTotal : 0,
    ),
    linha(panelDesc || "Módulos Fotovoltaicos", numeroPaineis || 1),
    linha(invDesc || "Inversor", 1),
    ...(batDesc ? [linha(batDesc, 1)] : []),
    linha("Medidor Inteligente", 1),
    linha("Estrutura de Suporte Coplanar", 1),
    linha("Cabo Solar DC (RVK 1×6mm²) [m]", 0),
    linha("Cabo AC (FVV 3G10mm) [m]", 0),
    linha("Caminho de Cabos [m]", 0),
    linha("Quadro AC/DC", 1),
    linha("Proteções e Caixa Combinadora", 1),
    linha("Custos de Transporte", 1),
    linha("Serviço de Instalação", 1),
    linha("Legalização / Termo de Responsabilidade", 1),
  ];

  return {
    codigo: gerarCodigoOrcamento(),
    dataEmissao: new Date().toISOString().slice(0, 10),
    validadeDias: 15,
    moeda: "EUR",
    empresaNome: "",
    empresaMorada: "",
    empresaNif: "",
    empresaTelefone: "",
    empresaEmail: "",
    empresaIban: "",
    nomeCliente: "",
    nifCliente: "",
    moradaCliente: moradaInstalacao,
    linhas,
    observacoes:
      "Instalação dos equipamentos por técnico/empresa certificado.\nTermo de responsabilidade / legalização da instalação incluído.",
    condicoesPagamento:
      "50% no momento da encomenda · 50% na conclusão da instalação.",
    incluirEstudoEnergetico: true,
  };
}

export function calcTotais(linhas: LinhaOrcamento[], taxaIva: number) {
  const totalLiquido = linhas.reduce((acc, l) => acc + l.quantidade * l.precoUnitario, 0);
  const totalIva = totalLiquido * (taxaIva / 100);
  const totalFinal = totalLiquido + totalIva;
  return { totalLiquido, totalIva, totalFinal };
}

export function fmtEurPT(n: number): string {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function fmtDatePT(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function validadeDate(dataEmissao: string, dias: number): string {
  const d = new Date(dataEmissao);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
