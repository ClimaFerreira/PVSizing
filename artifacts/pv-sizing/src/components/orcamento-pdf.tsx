import { cn } from "@/lib/utils";
import {
  type OrcamentoState,
  calcTotais,
  fmtEurPT,
  fmtDatePT,
  validadeDate,
} from "@/lib/orcamento";

interface EstudoEnergetico {
  potenciaInstalada: number;
  producaoAnual: number;
  autoconsumoPerc: number;
  poupancaAnual: number;
  paybackAnos: number;
  poupanca10?: number;
  poupanca15?: number;
  poupanca25?: number;
  npv25?: number;
  co2Anual?: number;
}

interface Props {
  state: OrcamentoState;
  taxaIva: number;
  estudo?: EstudoEnergetico | null;
}

const LABEL = "text-[10px] text-gray-500 uppercase tracking-wide font-semibold";
const VALUE = "text-[12px] text-gray-900 font-medium";
const TH = "border border-gray-300 bg-gray-100 px-2 py-1 text-left text-[11px] font-semibold text-gray-700";
const TD = "border border-gray-300 px-2 py-1 text-[11px] text-gray-800";
const TDR = cn(TD, "text-right");

function fmt2(n: number) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrcamentoPDF({ state, taxaIva, estudo }: Props) {
  const {
    codigo, dataEmissao, validadeDias, moeda,
    empresaNome, empresaMorada, empresaNif, empresaTelefone, empresaEmail, empresaIban,
    nomeCliente, nifCliente, moradaCliente,
    linhas, observacoes, condicoesPagamento, incluirEstudoEnergetico,
  } = state;

  const { totalLiquido, totalIva, totalFinal } = calcTotais(linhas, taxaIva);
  const dataValidade = validadeDate(dataEmissao, validadeDias);

  return (
    <div
      id="orcamento-print-content"
      className="bg-white text-gray-900 font-sans p-8 max-w-[780px] mx-auto print:p-6 print:max-w-none"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-start pb-4 mb-4 border-b-2 border-gray-700">
        {/* Company (left) */}
        <div className="space-y-0.5">
          <p className="text-[15px] font-bold text-gray-900 uppercase tracking-wide">
            {empresaNome || "Nome da Empresa"}
          </p>
          {empresaMorada && (
            <p className="text-[11px] text-gray-600 whitespace-pre-line">{empresaMorada}</p>
          )}
          {empresaTelefone && <p className="text-[11px] text-gray-600">Tel.: {empresaTelefone}</p>}
          {empresaEmail && <p className="text-[11px] text-gray-600">E-mail: {empresaEmail}</p>}
          {empresaNif && <p className="text-[11px] text-gray-600">NIF: {empresaNif}</p>}
        </div>

        {/* Budget info (right) */}
        <div className="text-right">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-1 border border-gray-300 bg-gray-100 font-semibold">Orçamento</th>
                <th className="px-3 py-1 border border-gray-300 bg-gray-100 font-semibold">Data</th>
                <th className="px-3 py-1 border border-gray-300 bg-gray-100 font-semibold">Moeda</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-1 border border-gray-300 font-medium">{codigo}</td>
                <td className="px-3 py-1 border border-gray-300">{fmtDatePT(dataEmissao)}</td>
                <td className="px-3 py-1 border border-gray-300">{moeda}</td>
              </tr>
              <tr>
                <td className="px-3 py-1 border border-gray-300" />
                <td className="px-3 py-1 border border-gray-300 text-gray-500 text-[10px]">Válido até</td>
                <td className="px-3 py-1 border border-gray-300" />
              </tr>
              <tr>
                <td className="px-3 py-1 border border-gray-300" />
                <td className="px-3 py-1 border border-gray-300 font-medium">{fmtDatePT(dataValidade)}</td>
                <td className="px-3 py-1 border border-gray-300" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Client box ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end mb-5">
        <div className="border border-gray-300 p-3 min-w-[260px]">
          <p className={cn(LABEL, "mb-1.5")}>Cliente</p>
          <p className="text-[12px] font-bold text-gray-900">{nomeCliente || "—"}</p>
          {(moradaCliente || nifCliente) && (
            <div className="flex gap-6 mt-1.5">
              {moradaCliente && (
                <div>
                  <p className={LABEL}>Morada</p>
                  <p className={VALUE}>{moradaCliente}</p>
                </div>
              )}
              {nifCliente && (
                <div>
                  <p className={LABEL}>NIF</p>
                  <p className={VALUE}>{nifCliente}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Items table ─────────────────────────────────────────────────────── */}
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr>
            <th className={cn(TH, "w-[8%]")}>Código</th>
            <th className={cn(TH, "w-[42%]")}>Descrição</th>
            <th className={cn(TH, "w-[14%] text-right")}>Preço</th>
            <th className={cn(TH, "w-[8%] text-right")}>Quant.</th>
            <th className={cn(TH, "w-[10%] text-right")}>IVA</th>
            <th className={cn(TH, "w-[18%] text-right")}>Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const lineTotal = l.quantidade * l.precoUnitario;
            return (
              <tr key={l.id}>
                <td className={TD}>{l.codigo}</td>
                <td className={TD}>{l.descricao}</td>
                <td className={TDR}>
                  {l.precoUnitario > 0 ? fmt2(l.precoUnitario) : ""}
                </td>
                <td className={TDR}>{l.quantidade > 0 ? l.quantidade : ""}</td>
                <td className={TDR}>{l.ivaPerc > 0 ? `${l.ivaPerc}%` : ""}</td>
                <td className={TDR}>
                  {lineTotal > 0 ? `${fmt2(lineTotal)} €` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Observações + Totais ─────────────────────────────────────────────── */}
      <div className="flex justify-between gap-6 mb-4">
        <div className="flex-1">
          {observacoes && (
            <>
              <p className={cn(LABEL, "mb-1")}>Observações:</p>
              <p className="text-[11px] text-gray-700 whitespace-pre-line">{observacoes}</p>
            </>
          )}
          {condicoesPagamento && (
            <div className="mt-2">
              <p className={cn(LABEL, "mb-0.5")}>Condições de Pagamento:</p>
              <p className="text-[11px] text-gray-700">{condicoesPagamento}</p>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="min-w-[200px]">
          <table className="w-full text-[11px] border-collapse">
            <tbody>
              <tr>
                <td className="py-1 pr-4 text-gray-600 border-b border-gray-200">Total Líquido</td>
                <td className="py-1 text-right font-medium border-b border-gray-200">
                  {fmtEurPT(totalLiquido)}
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-gray-600 border-b border-gray-200">IVA</td>
                <td className="py-1 text-right border-b border-gray-200" />
              </tr>
              <tr>
                <td className="py-1 pr-4 text-gray-600 border-b border-gray-200">
                  IVA <span className="font-semibold">{taxaIva}%</span>
                </td>
                <td className="py-1 text-right border-b border-gray-200">{fmtEurPT(totalIva)}</td>
              </tr>
              <tr className="bg-gray-100">
                <td className="py-1.5 pr-4 font-bold text-gray-900">Total</td>
                <td className="py-1.5 text-right font-bold text-gray-900">{fmtEurPT(totalFinal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Estudo Energético ───────────────────────────────────────────────── */}
      {incluirEstudoEnergetico && estudo && (
        <div className="mt-4 border border-gray-300 rounded p-4 bg-gray-50">
          <p className="text-[12px] font-bold text-gray-800 mb-3 border-b border-gray-300 pb-1.5">
            ☀ Estudo de Produção e Poupança Estimada
          </p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: "Potência Instalada", val: `${estudo.potenciaInstalada.toFixed(2)} kWp` },
              { label: "Produção Anual Est.", val: `${estudo.producaoAnual.toLocaleString("pt-PT")} kWh` },
              { label: "Autoconsumo Estimado", val: `${estudo.autoconsumoPerc.toFixed(0)}%` },
              { label: "Poupança Anual Est.", val: `${estudo.poupancaAnual.toLocaleString("pt-PT")} €` },
              { label: "Payback Estimado", val: `${estudo.paybackAnos} anos` },
              ...(estudo.co2Anual != null ? [{ label: "CO₂ Evitado/ano", val: `${estudo.co2Anual.toFixed(1)} t` }] : []),
            ].map(({ label, val }) => (
              <div key={label} className="bg-white border border-gray-200 rounded p-2">
                <p className={LABEL}>{label}</p>
                <p className="text-[13px] font-bold text-gray-900 mt-0.5">{val}</p>
              </div>
            ))}
          </div>
          {(estudo.poupanca10 != null || estudo.poupanca15 != null || estudo.poupanca25 != null) && (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className={TH}>Horizonte</th>
                  <th className={cn(TH, "text-right")}>Poupança Acumulada</th>
                  {estudo.npv25 != null && <th className={cn(TH, "text-right")}>VAL (desc. 4%)</th>}
                </tr>
              </thead>
              <tbody>
                {estudo.poupanca10 != null && (
                  <tr>
                    <td className={TD}>10 anos</td>
                    <td className={TDR}>{fmtEurPT(estudo.poupanca10)}</td>
                    {estudo.npv25 != null && <td className={TDR} />}
                  </tr>
                )}
                {estudo.poupanca15 != null && (
                  <tr>
                    <td className={TD}>15 anos</td>
                    <td className={TDR}>{fmtEurPT(estudo.poupanca15)}</td>
                    {estudo.npv25 != null && <td className={TDR} />}
                  </tr>
                )}
                {estudo.poupanca25 != null && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className={TD}>25 anos (vida útil)</td>
                    <td className={TDR}>{fmtEurPT(estudo.poupanca25)}</td>
                    {estudo.npv25 != null && <td className={TDR}>{fmtEurPT(estudo.npv25)}</td>}
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p className="text-[9px] text-gray-400 mt-2">
            * Valores estimados com base em dados PVGIS e perfil de consumo. Sujeito a confirmação técnica in loco.
            Taxa de escalada de tarifa: 3%/ano · Degradação painéis: 0,5%/ano · Taxa de desconto VAL: 4%.
          </p>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-gray-400 flex justify-between items-end">
        {empresaIban && (
          <p className="text-[11px] text-gray-700">
            <span className="font-semibold">IBAN:</span> {empresaIban}
          </p>
        )}
        <p className="text-[11px] text-gray-500 ml-auto">Página 1 / 1</p>
      </div>
    </div>
  );
}
