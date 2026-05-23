import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SectionId } from "./types";
import type { SolarPanel, Inverter, Battery, Customer } from "@workspace/api-client-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmt(n: number | null | undefined, dec = 2, unit = "") {
  if (n == null) return "—";
  return `${n.toLocaleString("pt-PT", { minimumFractionDigits: dec, maximumFractionDigits: dec })}${unit ? " " + unit : ""}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="report-section mt-8 first:mt-0">
      <h2 className="text-lg font-bold text-[#0D2B45] border-b-2 border-[#F59E0B] pb-1 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function KvRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-1 pr-4 text-sm text-gray-500 w-48 align-top">{k}</td>
      <td className="py-1 text-sm font-medium text-gray-900">{v}</td>
    </tr>
  );
}

export interface ReportData {
  projectName: string;
  date: string;
  customer: Customer | null;
  panel: SolarPanel | null;
  inverters: Inverter[];
  batteries: Battery[];
  sizing: Record<string, unknown> | null;
  consumoData: Record<string, unknown> | null;
  locData: Record<string, unknown> | null;
  numPaineis: number | null;
  potenciaKwp: number | null;
  investimentoManual: number | null;
  notas: string;
}

interface Props {
  sections: SectionId[];
  data: ReportData;
}

export default function ReportPreview({ sections, data }: Props) {
  const { projectName, date, customer, panel, inverters, batteries, sizing, consumoData, locData, numPaineis, potenciaKwp, investimentoManual, notas } = data;

  const sz = sizing as {
    potenciaRecomendada?: number;
    numPaineis?: number;
    energiaAnualEstimada?: number;
    coberturaPrevista?: number;
    coberturaReal?: number;
    poupancaAnual?: number;
    paybackAnos?: number;
    hsp?: number;
    producaoMensal?: number[];
    percVazio?: number;
    percCheio?: number;
    percPonta?: number;
    consumoDiario?: number;
    consumoAnualAjustado?: number;
    fatorRendimento?: number;
  } | null;

  const cd = consumoData as {
    consumoMensal?: number;
    consumoAnual?: number;
    tarifaEnergia?: number;
    potenciaContratada?: number;
    tipoTarifa?: string;
    cpe?: string;
    distribuidora?: string;
    facturasData?: Array<{ mes: string; valor?: number; consumo?: number }>;
  } | null;

  const ld = locData as {
    municipio?: string;
    latitude?: number;
    longitude?: number;
    inclinacao?: number;
    azimute?: number;
  } | null;

  const potKwp = potenciaKwp ?? sz?.potenciaRecomendada ?? null;
  const nPaineis = numPaineis ?? sz?.numPaineis ?? null;
  const poupanca = sz?.poupancaAnual ?? null;
  const payback = sz?.paybackAnos ?? null;
  const tarifa = cd?.tarifaEnergia ?? customer?.precoEletricidade ?? null;
  const investimento = investimentoManual ?? (poupanca && payback ? Math.round(poupanca * payback) : null);
  const roi = (investimento && poupanca) ? ((poupanca * 25 - investimento) / investimento * 100) : null;

  const producaoMensal = sz?.producaoMensal ?? [];
  const producaoChartData = MESES.map((m, i) => ({ mes: m, kwh: producaoMensal[i] ?? 0 }));

  return (
    <div id="report-content" className="report-root font-sans text-gray-900 bg-white">
      {/* ── CAPA ─────────────────────────────────────────────────────────── */}
      {sections.includes("capa") && (
        <div className="report-page a4-page flex flex-col items-center justify-between py-16 px-12 min-h-[29.7cm] page-break-after">
          <div className="w-full">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-lg bg-[#0D2B45] flex items-center justify-center">
                <span className="text-yellow-400 font-bold text-sm">☀</span>
              </div>
              <span className="text-2xl font-bold text-[#0D2B45]">SolarDim</span>
            </div>
            <div className="h-2 w-full bg-gradient-to-r from-[#0D2B45] to-[#F59E0B] rounded mb-12" />
          </div>
          <div className="w-full text-center flex-1 flex flex-col justify-center gap-6">
            <p className="text-sm uppercase tracking-widest text-gray-400 font-semibold">Relatório Técnico</p>
            <h1 className="text-4xl font-extrabold text-[#0D2B45] leading-tight">{projectName || "Projeto Solar"}</h1>
            {customer && (
              <p className="text-xl text-gray-600 font-medium">{customer.nome}</p>
            )}
            {potKwp && (
              <div className="inline-flex items-center justify-center gap-2 mx-auto mt-4 px-6 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-3xl font-bold text-amber-600">{fmt(potKwp, 2)} kWp</span>
              </div>
            )}
          </div>
          <div className="w-full mt-12 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Data</p>
              <p className="font-medium">{date}</p>
            </div>
            {customer?.morada && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Localização</p>
                <p className="font-medium">{customer.morada}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DADOS CLIENTE ─────────────────────────────────────────────────── */}
      {sections.includes("cliente") && customer && (
        <div className="report-page a4-page py-10 px-12 page-break-after">
          <Section title="Dados do Cliente">
            <table className="w-full">
              <tbody>
                <KvRow k="Nome" v={customer.nome} />
                <KvRow k="Morada" v={customer.morada || "—"} />
                <KvRow k="Tipo de Cliente" v={customer.tipoCliente} />
                <KvRow k="Perfil de Consumo" v={customer.perfilConsumo} />
                <KvRow k="Potência Contratada" v={fmt(customer.potenciaContratada, 1, "kVA")} />
                {customer.consumoMensal && <KvRow k="Consumo Mensal" v={fmt(customer.consumoMensal, 0, "kWh")} />}
                {customer.consumoAnual && <KvRow k="Consumo Anual" v={fmt(customer.consumoAnual, 0, "kWh")} />}
                <KvRow k="Preço Eletricidade" v={fmt(tarifa, 4, "€/kWh")} />
                {cd?.cpe && <KvRow k="CPE" v={cd.cpe} />}
                {cd?.distribuidora && <KvRow k="Distribuidora" v={cd.distribuidora} />}
                {ld?.municipio && <KvRow k="Município" v={ld.municipio} />}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {/* ── CONSUMOS ──────────────────────────────────────────────────────── */}
      {sections.includes("consumos") && sz && (
        <div className="report-page a4-page py-10 px-12 page-break-after">
          <Section title="Análise de Consumos">
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Consumo Diário", value: fmt(sz.consumoDiario, 1, "kWh/dia") },
                { label: "Consumo Anual", value: fmt(sz.consumoAnualAjustado, 0, "kWh/ano") },
                { label: "Tarifa Energia", value: fmt(tarifa, 4, "€/kWh") },
              ].map(({ label, value }) => (
                <div key={label} className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-lg font-bold text-blue-800">{value}</p>
                </div>
              ))}
            </div>
            {producaoMensal.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-3">Perfil de Produção Solar Estimada (kWh/mês)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={producaoChartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-PT")} kWh`, "Produção"]} />
                    <Bar dataKey="kwh" radius={[3, 3, 0, 0]}>
                      {producaoChartData.map((_, i) => (
                        <Cell key={i} fill={i >= 3 && i <= 8 ? "#F59E0B" : "#93C5FD"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {(sz.percVazio || sz.percCheio || sz.percPonta) && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Vazio", v: sz.percVazio, color: "bg-green-50 text-green-700" },
                  { label: "Cheio", v: sz.percCheio, color: "bg-amber-50 text-amber-700" },
                  { label: "Ponta", v: sz.percPonta, color: "bg-red-50 text-red-700" },
                ].map(({ label, v, color }) => v ? (
                  <div key={label} className={`rounded p-3 text-center ${color}`}>
                    <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
                    <p className="text-base font-bold">{fmt(v, 1, "%")}</p>
                  </div>
                ) : null)}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── DIMENSIONAMENTO FV ────────────────────────────────────────────── */}
      {sections.includes("dimensionamento") && sz && (
        <div className="report-page a4-page py-10 px-12 page-break-after">
          <Section title="Dimensionamento Fotovoltaico">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Sistema</p>
                <table className="w-full">
                  <tbody>
                    <KvRow k="Potência Instalada" v={<span className="text-amber-600 font-bold">{fmt(potKwp, 2, "kWp")}</span>} />
                    <KvRow k="Nº de Módulos" v={`${nPaineis ?? "—"} painéis`} />
                    <KvRow k="HSP (Média Anual)" v={fmt(sz.hsp, 2, "h/dia")} />
                    <KvRow k="Rendimento Global" v={fmt(sz.fatorRendimento ? sz.fatorRendimento * 100 : null, 1, "%")} />
                    <KvRow k="Cobertura Solar" v={<span className="text-emerald-600 font-bold">{fmt(sz.coberturaReal ?? sz.coberturaPrevista, 1, "%")}</span>} />
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Localização</p>
                <table className="w-full">
                  <tbody>
                    {ld?.municipio && <KvRow k="Município" v={ld.municipio} />}
                    {ld?.latitude && <KvRow k="Latitude" v={fmt(ld.latitude, 4, "°")} />}
                    {ld?.longitude && <KvRow k="Longitude" v={fmt(ld.longitude, 4, "°")} />}
                    {ld?.inclinacao && <KvRow k="Inclinação" v={fmt(ld.inclinacao, 1, "°")} />}
                    {ld?.azimute && <KvRow k="Azimute" v={fmt(ld.azimute, 1, "°")} />}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              {[
                { label: "Energia Anual Estimada", value: fmt(sz.energiaAnualEstimada, 0, "kWh/ano"), color: "bg-amber-50 border-amber-200" },
                { label: "Cobertura Solar", value: fmt(sz.coberturaReal ?? sz.coberturaPrevista, 1, "%"), color: "bg-emerald-50 border-emerald-200" },
                { label: "HSP Média", value: fmt(sz.hsp, 2, "h/dia"), color: "bg-blue-50 border-blue-200" },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-lg p-4 text-center border ${color}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-xl font-bold text-gray-800">{value}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ── EQUIPAMENTOS ──────────────────────────────────────────────────── */}
      {sections.includes("equipamentos") && (
        <div className="report-page a4-page py-10 px-12 page-break-after">
          <Section title="Equipamentos">
            {panel && (
              <div className="mb-6">
                <p className="text-sm font-bold text-[#0D2B45] mb-2 uppercase tracking-wider">Módulo Solar</p>
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <p className="font-semibold text-base">{panel.fabricante} {panel.nome}</p>
                  <div className="grid grid-cols-3 gap-4 mt-3">
                    <div className="text-center"><p className="text-xs text-gray-400">Potência</p><p className="font-bold text-amber-600">{panel.potencia} Wp</p></div>
                    <div className="text-center"><p className="text-xs text-gray-400">Voc</p><p className="font-bold">{panel.voc} V</p></div>
                    <div className="text-center"><p className="text-xs text-gray-400">Isc</p><p className="font-bold">{panel.isc} A</p></div>
                    <div className="text-center"><p className="text-xs text-gray-400">Vmp</p><p className="font-bold">{panel.vmp} V</p></div>
                    <div className="text-center"><p className="text-xs text-gray-400">Imp</p><p className="font-bold">{panel.imp} A</p></div>
                    {nPaineis && <div className="text-center"><p className="text-xs text-gray-400">Quantidade</p><p className="font-bold">{nPaineis}</p></div>}
                  </div>
                </div>
              </div>
            )}

            {inverters.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-bold text-[#0D2B45] mb-2 uppercase tracking-wider">Inversor(es)</p>
                <div className="space-y-2">
                  {inverters.map((inv) => (
                    <div key={inv.id} className="bg-gray-50 rounded-lg p-4 border">
                      <p className="font-semibold">{inv.fabricante} {inv.nome}</p>
                      <div className="grid grid-cols-4 gap-3 mt-2">
                        <div className="text-center"><p className="text-xs text-gray-400">Pot. AC</p><p className="font-bold">{inv.potenciaAc} kW</p></div>
                        <div className="text-center"><p className="text-xs text-gray-400">Pot. DC máx</p><p className="font-bold">{inv.potenciaDcMax} kW</p></div>
                        <div className="text-center"><p className="text-xs text-gray-400">MPPT</p><p className="font-bold">{inv.numMppt}</p></div>
                        <div className="text-center"><p className="text-xs text-gray-400">Strings/MPPT</p><p className="font-bold">{inv.stringsPorMppt}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {batteries.length > 0 && (
              <div>
                <p className="text-sm font-bold text-[#0D2B45] mb-2 uppercase tracking-wider">Bateria(s)</p>
                <div className="space-y-2">
                  {batteries.map((bat) => (
                    <div key={bat.id} className="bg-gray-50 rounded-lg p-4 border">
                      <p className="font-semibold">{bat.fabricante} {bat.nome}</p>
                      <div className="grid grid-cols-4 gap-3 mt-2">
                        <div className="text-center"><p className="text-xs text-gray-400">Capacidade</p><p className="font-bold">{bat.capacidade} kWh</p></div>
                        <div className="text-center"><p className="text-xs text-gray-400">Tensão</p><p className="font-bold">{bat.tensao} V</p></div>
                        <div className="text-center"><p className="text-xs text-gray-400">Tecnologia</p><p className="font-bold">{bat.tecnologia}</p></div>
                        <div className="text-center"><p className="text-xs text-gray-400">DoD</p><p className="font-bold">{bat.profundidadeDescarga}%</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!panel && inverters.length === 0 && batteries.length === 0 && (
              <p className="text-sm text-gray-400 italic">Equipamentos não definidos — complete o passo 5 do wizard.</p>
            )}
          </Section>
        </div>
      )}

      {/* ── PRODUÇÃO ANUAL ────────────────────────────────────────────────── */}
      {sections.includes("producao") && sz && producaoMensal.length > 0 && (
        <div className="report-page a4-page py-10 px-12 page-break-after">
          <Section title="Produção Anual Estimada">
            <div className="overflow-hidden rounded-lg border mb-6">
              <table className="w-full text-sm">
                <thead className="bg-[#0D2B45] text-white">
                  <tr>
                    <th className="py-2 px-3 text-left font-medium">Mês</th>
                    <th className="py-2 px-3 text-right font-medium">Produção (kWh)</th>
                    <th className="py-2 px-3 text-right font-medium">% do Total</th>
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((m, i) => {
                    const v = producaoMensal[i] ?? 0;
                    const total = producaoMensal.reduce((a, b) => a + b, 0) || 1;
                    return (
                      <tr key={m} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="py-1.5 px-3">{m}</td>
                        <td className="py-1.5 px-3 text-right font-mono">{v.toLocaleString("pt-PT")}</td>
                        <td className="py-1.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 bg-amber-400 rounded-full" style={{ width: `${(v / total) * 100}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8 text-right">{((v / total) * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[#0D2B45] bg-amber-50 font-bold">
                    <td className="py-2 px-3">Total</td>
                    <td className="py-2 px-3 text-right font-mono">{producaoMensal.reduce((a, b) => a + b, 0).toLocaleString("pt-PT")}</td>
                    <td className="py-2 px-3 text-right">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <p className="text-xs text-amber-500 uppercase tracking-wider mb-1">Energia Anual Estimada</p>
                <p className="text-2xl font-extrabold text-amber-700">{fmt(sz.energiaAnualEstimada, 0, "kWh")}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-xs text-emerald-500 uppercase tracking-wider mb-1">Cobertura Solar</p>
                <p className="text-2xl font-extrabold text-emerald-700">{fmt(sz.coberturaReal ?? sz.coberturaPrevista, 1, "%")}</p>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ── FINANCEIRO & ROI ──────────────────────────────────────────────── */}
      {sections.includes("financeiro") && sz && (
        <div className="report-page a4-page py-10 px-12 page-break-after">
          <Section title="Análise Financeira">
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: "Poupança Anual", value: fmt(poupanca, 2, "€"), color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                { label: "Período de Retorno", value: fmt(payback, 1, "anos"), color: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "Investimento Estimado", value: fmt(investimento, 2, "€"), color: "bg-gray-50 border-gray-200 text-gray-700" },
                { label: "ROI (25 anos)", value: roi != null ? fmt(roi, 1, "%") : "—", color: "bg-amber-50 border-amber-200 text-amber-700" },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-xl border p-5 text-center ${color}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-2">{label}</p>
                  <p className="text-2xl font-extrabold">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#0D2B45] text-white">
                  <tr>
                    <th className="py-2 px-3 text-left font-medium">Indicador</th>
                    <th className="py-2 px-3 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-white"><td className="py-2 px-3">Poupança Anual Estimada</td><td className="py-2 px-3 text-right font-semibold text-emerald-600">{fmt(poupanca, 2, "€")}</td></tr>
                  <tr className="border-b bg-gray-50"><td className="py-2 px-3">Poupança a 25 anos (sem inflação)</td><td className="py-2 px-3 text-right font-semibold">{fmt(poupanca ? poupanca * 25 : null, 2, "€")}</td></tr>
                  <tr className="border-b bg-white"><td className="py-2 px-3">Preço da Eletricidade</td><td className="py-2 px-3 text-right">{fmt(tarifa, 4, "€/kWh")}</td></tr>
                  <tr className="border-b bg-gray-50"><td className="py-2 px-3">Investimento Estimado</td><td className="py-2 px-3 text-right">{fmt(investimento, 2, "€")}</td></tr>
                  <tr className="border-b bg-white"><td className="py-2 px-3">Período de Retorno</td><td className="py-2 px-3 text-right font-semibold text-blue-600">{fmt(payback, 1, "anos")}</td></tr>
                  {roi != null && <tr className="bg-amber-50"><td className="py-2 px-3 font-semibold">ROI a 25 anos</td><td className="py-2 px-3 text-right font-bold text-amber-700">{fmt(roi, 1, "%")}</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ── NOTAS TÉCNICAS ────────────────────────────────────────────────── */}
      {sections.includes("notas") && (
        <div className="report-page a4-page py-10 px-12">
          <Section title="Notas Técnicas">
            {notas.trim() ? (
              <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed border rounded-lg p-4 bg-gray-50 min-h-[10cm]">{notas}</div>
            ) : (
              <div className="border rounded-lg p-4 bg-gray-50 min-h-[10cm] text-gray-400 italic text-sm">
                Notas técnicas — edite este campo no painel lateral para adicionar observações, normas aplicáveis ou condicionamentos técnicos.
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
