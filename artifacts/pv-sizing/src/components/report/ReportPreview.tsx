import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { SectionId } from "./types";
import type { SolarPanel, Inverter, Battery, Customer } from "@workspace/api-client-react";
import type { SolarParams, SolarResult } from "@/contexts/SolarContext";
import type { MapData } from "@/contexts/MapaContext";
import type { InverterUnit } from "@/lib/multi-inverter";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

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

function PageHeader({ projectName, sectionTitle }: { projectName: string; sectionTitle: string }) {
  return (
    <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-200 print:block">
      <span className="text-xs font-semibold text-[#0D2B45] uppercase tracking-wider">{sectionTitle}</span>
      <span className="text-xs text-gray-400 truncate max-w-[16ch]">{projectName}</span>
    </div>
  );
}

function PageFooter({ page, date }: { page: number; date: string }) {
  return (
    <div className="flex items-center justify-between mt-6 pt-3 border-t border-gray-200 text-[10px] text-gray-400">
      <span>SolarDim — Relatório Técnico</span>
      <span>{date}</span>
      <span>Pág. {page}</span>
    </div>
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
  /* spacing */
  spacingParams: SolarParams | null;
  spacingResults: SolarResult | null;
  spacingCrossSvg: string;
  spacingLayoutSvg: string;
  /* map */
  mapData: MapData | null;
  /* strings/MPPT */
  inverterUnits: InverterUnit[];
  allInverters: Inverter[];
}

interface Props {
  sections: SectionId[];
  data: ReportData;
}

export default function ReportPreview({ sections, data }: Props) {
  const {
    projectName, date, customer, panel, inverters, batteries,
    sizing, consumoData, locData, numPaineis, potenciaKwp,
    investimentoManual, notas,
    spacingParams, spacingResults, spacingCrossSvg, spacingLayoutSvg,
    mapData, inverterUnits, allInverters,
  } = data;

  const sz = sizing as {
    potenciaRecomendada?: number; numPaineis?: number; energiaAnualEstimada?: number;
    coberturaPrevista?: number; coberturaReal?: number; poupancaAnual?: number;
    paybackAnos?: number; hsp?: number; producaoMensal?: number[];
    percVazio?: number; percCheio?: number; percPonta?: number;
    consumoDiario?: number; consumoAnualAjustado?: number; fatorRendimento?: number;
  } | null;

  const cd = consumoData as {
    consumoMensal?: number; consumoAnual?: number; tarifaEnergia?: number;
    potenciaContratada?: number; tipoTarifa?: string; cpe?: string; distribuidora?: string;
  } | null;

  const ld = locData as {
    municipio?: string; latitude?: number; longitude?: number;
    inclinacao?: number; azimute?: number;
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

  const isCoplanar = spacingParams?.mountType === "coplanar";
  let pageNum = 0;
  const pg = () => ++pageNum;

  return (
    <div id="report-content" className="report-root font-sans text-gray-900 bg-white">

      {/* ── CAPA ──────────────────────────────────────────────────────────── */}
      {sections.includes("capa") && (
        <div className="report-page a4-page flex flex-col items-center justify-between py-16 px-12 min-h-[29.7cm] page-break-after">
          <div className="w-full">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-lg bg-[#0D2B45] flex items-center justify-center">
                <span className="text-yellow-400 font-bold text-lg">☀</span>
              </div>
              <span className="text-2xl font-bold text-[#0D2B45]">SolarDim</span>
            </div>
            <div className="h-2 w-full bg-gradient-to-r from-[#0D2B45] to-[#F59E0B] rounded mb-12" />
          </div>
          <div className="w-full text-center flex-1 flex flex-col justify-center gap-6">
            <p className="text-sm uppercase tracking-widest text-gray-400 font-semibold">Relatório Técnico</p>
            <h1 className="text-4xl font-extrabold text-[#0D2B45] leading-tight">{projectName || "Projeto Solar"}</h1>
            {customer && <p className="text-xl text-gray-600 font-medium">{customer.nome}</p>}
            {(customer?.morada || ld?.municipio) && (
              <p className="text-base text-gray-400">{customer?.morada ?? ld?.municipio}</p>
            )}
            {potKwp && (
              <div className="inline-flex items-center justify-center gap-2 mx-auto mt-4 px-6 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <span className="text-3xl font-bold text-amber-600">{fmt(potKwp, 2)} kWp</span>
                {nPaineis && <span className="text-base text-amber-400">· {nPaineis} painéis</span>}
              </div>
            )}
          </div>
          <div className="w-full mt-12 grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Data</p><p className="font-medium">{date}</p></div>
            {spacingParams?.locationName && (
              <div><p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Localização</p><p className="font-medium">{spacingParams.locationName}</p></div>
            )}
            {ld?.municipio && (
              <div><p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Município</p><p className="font-medium">{ld.municipio}</p></div>
            )}
          </div>
        </div>
      )}

      {/* ── DADOS CLIENTE ──────────────────────────────────────────────────── */}
      {sections.includes("cliente") && customer && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Dados do Cliente" />
          <Section title="Dados do Cliente">
            <table className="w-full"><tbody>
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
              {ld?.municipio && <KvRow k="Município (PVGIS)" v={ld.municipio} />}
              {(ld?.latitude ?? spacingParams?.latitude) && (
                <KvRow k="Latitude" v={fmt(ld?.latitude ?? Number(spacingParams?.latitude), 4, "°")} />
              )}
              {(ld?.longitude ?? spacingParams?.longitude) && (
                <KvRow k="Longitude" v={fmt(ld?.longitude ?? Number(spacingParams?.longitude), 4, "°")} />
              )}
            </tbody></table>
          </Section>
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── CONSUMOS ───────────────────────────────────────────────────────── */}
      {sections.includes("consumos") && sz && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Análise de Consumos" />
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
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── DIMENSIONAMENTO FV ─────────────────────────────────────────────── */}
      {sections.includes("dimensionamento") && sz && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Dimensionamento Fotovoltaico" />
          <Section title="Dimensionamento Fotovoltaico">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Sistema</p>
                <table className="w-full"><tbody>
                  <KvRow k="Potência Instalada" v={<span className="text-amber-600 font-bold">{fmt(potKwp, 2, "kWp")}</span>} />
                  <KvRow k="Nº de Módulos" v={`${nPaineis ?? "—"} painéis`} />
                  <KvRow k="HSP (Média Anual)" v={fmt(sz.hsp, 2, "h/dia")} />
                  <KvRow k="Rendimento Global" v={fmt(sz.fatorRendimento ? sz.fatorRendimento * 100 : null, 1, "%")} />
                  <KvRow k="Cobertura Solar" v={<span className="text-emerald-600 font-bold">{fmt(sz.coberturaReal ?? sz.coberturaPrevista, 1, "%")}</span>} />
                  <KvRow k="Energia Anual Estimada" v={fmt(sz.energiaAnualEstimada, 0, "kWh/ano")} />
                </tbody></table>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Localização / Solar</p>
                <table className="w-full"><tbody>
                  {ld?.municipio && <KvRow k="Município" v={ld.municipio} />}
                  {(ld?.latitude ?? spacingParams?.latitude) && <KvRow k="Latitude" v={fmt(ld?.latitude ?? Number(spacingParams?.latitude), 4, "°")} />}
                  {(ld?.longitude ?? spacingParams?.longitude) && <KvRow k="Longitude" v={fmt(ld?.longitude ?? Number(spacingParams?.longitude), 4, "°")} />}
                  {(ld?.inclinacao ?? spacingParams?.angle) && <KvRow k="Inclinação" v={fmt(ld?.inclinacao ?? Number(spacingParams?.angle), 1, "°")} />}
                  {(ld?.azimute ?? spacingParams?.longitude) && <KvRow k="Azimute" v={fmt(ld?.azimute, 1, "°")} />}
                  {spacingResults?.altitudeAngle != null && <KvRow k="Ângulo Solar (21 Dez)" v={fmt(spacingResults.altitudeAngle, 1, "°")} />}
                </tbody></table>
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
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── EQUIPAMENTOS ───────────────────────────────────────────────────── */}
      {sections.includes("equipamentos") && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Equipamentos" />
          <Section title="Equipamentos">
            {panel && (
              <div className="mb-6">
                <p className="text-sm font-bold text-[#0D2B45] mb-2 uppercase tracking-wider">Módulo Solar</p>
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <p className="font-semibold text-base">{panel.fabricante} {panel.nome}</p>
                  <div className="grid grid-cols-3 gap-4 mt-3">
                    {[
                      { k: "Potência", v: `${panel.potencia} Wp`, hi: true },
                      { k: "Voc", v: `${panel.voc} V` },
                      { k: "Isc", v: `${panel.isc} A` },
                      { k: "Vmp", v: `${panel.vmp} V` },
                      { k: "Imp", v: `${panel.imp} A` },
                      { k: "Quantidade", v: nPaineis ? `${nPaineis} un.` : "—" },
                      ...(panel.noct ? [{ k: "NOCT", v: `${panel.noct} °C` }] : []),
                      ...(panel.coeficienteTemperatura ? [{ k: "Coef. Temp.", v: `${panel.coeficienteTemperatura} %/°C` }] : []),
                    ].map(({ k, v, hi }) => (
                      <div key={k} className="text-center">
                        <p className="text-xs text-gray-400">{k}</p>
                        <p className={`font-bold ${hi ? "text-amber-600" : ""}`}>{v}</p>
                      </div>
                    ))}
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
                      <div className="grid grid-cols-4 gap-3 mt-2 text-center">
                        <div><p className="text-xs text-gray-400">Pot. AC</p><p className="font-bold">{inv.potenciaAc} kW</p></div>
                        <div><p className="text-xs text-gray-400">Pot. DC máx</p><p className="font-bold">{inv.potenciaDcMax} kW</p></div>
                        <div><p className="text-xs text-gray-400">MPPT</p><p className="font-bold">{inv.numMppt}</p></div>
                        <div><p className="text-xs text-gray-400">Strings/MPPT</p><p className="font-bold">{inv.stringsPorMppt}</p></div>
                        <div><p className="text-xs text-gray-400">MPPT min</p><p className="font-bold">{inv.mpptMin} V</p></div>
                        <div><p className="text-xs text-gray-400">MPPT max</p><p className="font-bold">{inv.mpptMax} V</p></div>
                        {inv.vdcMax && <div><p className="text-xs text-gray-400">Vdc máx</p><p className="font-bold">{inv.vdcMax} V</p></div>}
                        <div><p className="text-xs text-gray-400">I máx MPPT</p><p className="font-bold">{inv.corrMaxMppt} A</p></div>
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
                      <div className="grid grid-cols-4 gap-3 mt-2 text-center">
                        <div><p className="text-xs text-gray-400">Capacidade</p><p className="font-bold">{bat.capacidade} kWh</p></div>
                        <div><p className="text-xs text-gray-400">Tensão</p><p className="font-bold">{bat.tensao} V</p></div>
                        <div><p className="text-xs text-gray-400">Tecnologia</p><p className="font-bold">{bat.tecnologia}</p></div>
                        <div><p className="text-xs text-gray-400">DoD</p><p className="font-bold">{bat.profundidadeDescarga}%</p></div>
                        {bat.potenciaCarga > 0 && <div><p className="text-xs text-gray-400">Carga máx</p><p className="font-bold">{bat.potenciaCarga} kW</p></div>}
                        {bat.potenciaDescarga > 0 && <div><p className="text-xs text-gray-400">Descarga máx</p><p className="font-bold">{bat.potenciaDescarga} kW</p></div>}
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
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── PRODUÇÃO ANUAL ─────────────────────────────────────────────────── */}
      {sections.includes("producao") && sz && producaoMensal.length > 0 && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Produção Anual Estimada" />
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
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── ESPAÇAMENTO / SOMBRAS ──────────────────────────────────────────── */}
      {sections.includes("espacamento") && spacingResults && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Espaçamento / Sombras" />
          <Section title="Espaçamento entre Painéis e Análise de Sombras">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Parâmetros</p>
                <table className="w-full"><tbody>
                  <KvRow k="Tipo de Estrutura" v={isCoplanar ? "Coplanar (telhado)" : "Triângulos"} />
                  <KvRow k="Altura do Painel" v={fmt(spacingResults.panelHeight, 2, "m")} />
                  <KvRow k="Largura do Painel" v={fmt(spacingResults.panelWidth, 2, "m")} />
                  <KvRow k="Inclinação" v={fmt(spacingResults.panelAngle, 1, "°")} />
                  <KvRow k="Latitude" v={`${spacingParams?.latitude ?? "—"}°`} />
                  {spacingParams?.locationName && <KvRow k="Localização" v={spacingParams.locationName} />}
                  <KvRow k="Fileiras × Colunas" v={`${spacingParams?.rows ?? "—"} × ${spacingParams?.cols ?? "—"}`} />
                </tbody></table>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Resultados (21 Dez)</p>
                <table className="w-full"><tbody>
                  {!isCoplanar && <>
                    <KvRow k="Distância Início→Início (d)" v={<span className="text-blue-700 font-bold">{fmt(spacingResults.rowSpacing, 3, "m")}</span>} />
                    <KvRow k="Espaço Livre (Gap)" v={<span className={spacingResults.gap < 0.5 ? "text-red-600 font-bold" : "text-gray-900 font-bold"}>{fmt(spacingResults.gap, 3, "m")}</span>} />
                    <KvRow k="Sombra (L)" v={fmt(spacingResults.shadowLength, 2, "m")} />
                    <KvRow k="Projeção Horizontal" v={fmt(spacingResults.panelProjectedDepth, 2, "m")} />
                    <KvRow k="Comprimento Total N-S" v={fmt(spacingResults.totalLength, 2, "m")} />
                    <KvRow k="Largura Total E-O" v={fmt(spacingResults.totalWidth, 2, "m")} />
                    <KvRow k="Ângulo Solar 21 Dez" v={<span className="text-amber-600 font-bold">{fmt(spacingResults.altitudeAngle, 1, "°")}</span>} />
                    <KvRow k="Declinação" v={fmt(spacingResults.declinationAngle, 1, "°")} />
                  </>}
                  <KvRow k="Potência Total" v={<span className="text-amber-600 font-bold">{fmt(spacingResults.totalPowerWp / 1000, 2, "kWp")}</span>} />
                </tbody></table>
              </div>
            </div>

            {!isCoplanar && spacingResults.gap < 0.5 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
                ⚠ Atenção: O espaço livre ({fmt(spacingResults.gap, 3, "m")}) pode ser insuficiente para manutenção segura. Recomenda-se mínimo de 0.5 m.
              </div>
            )}

            {spacingCrossSvg && !isCoplanar && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Perfil e Sombreamento (secção transversal)</p>
                <div className="bg-slate-50 rounded border p-2 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: spacingCrossSvg }} />
              </div>
            )}
            {spacingLayoutSvg && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Disposição Top-down</p>
                <div className="bg-blue-50 rounded border p-2 overflow-hidden max-w-sm mx-auto"
                  dangerouslySetInnerHTML={{ __html: spacingLayoutSvg }} />
              </div>
            )}
          </Section>
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── MAPA SATÉLITE ──────────────────────────────────────────────────── */}
      {sections.includes("mapa") && mapData && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Mapa Satélite e Layout" />
          <Section title="Mapa Satélite e Layout FV">
            {mapData.mapImageDataUrl && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Vista Satélite</p>
                <div className="rounded border overflow-hidden">
                  <img
                    src={mapData.mapImageDataUrl}
                    alt="Mapa Satélite"
                    className="w-full object-cover max-h-72"
                  />
                </div>
              </div>
            )}
            {mapData.panelSvg && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Layout Painéis</p>
                <div className="bg-[#1a2744] rounded border overflow-hidden max-h-64 flex items-center justify-center p-2"
                  dangerouslySetInnerHTML={{ __html: mapData.panelSvg }} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Telhado / Área</p>
                <table className="w-full"><tbody>
                  {mapData.roofArea != null && <KvRow k="Área Telhado" v={fmt(mapData.roofArea, 1, "m²")} />}
                  {mapData.roofBoundsW != null && <KvRow k="Largura (E-O)" v={fmt(mapData.roofBoundsW, 1, "m")} />}
                  {mapData.roofBoundsH != null && <KvRow k="Comprimento (N-S)" v={fmt(mapData.roofBoundsH, 1, "m")} />}
                  {mapData.azimuth != null && <KvRow k="Azimute" v={fmt(mapData.azimuth, 1, "°")} />}
                  {mapData.orientationLabel && <KvRow k="Orientação" v={mapData.orientationLabel} />}
                  {mapData.mountType && <KvRow k="Tipo Estrutura" v={mapData.mountType === "coplanar" ? "Coplanar" : "Triângulos"} />}
                  {mapData.penaltyPct != null && mapData.penaltyPct > 0 && <KvRow k="Penalização Orientação" v={fmt(mapData.penaltyPct, 1, "%")} />}
                </tbody></table>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Sistema FV</p>
                <table className="w-full"><tbody>
                  {mapData.panelCount != null && <KvRow k="Painéis" v={`${mapData.panelCount} un.`} />}
                  {mapData.panelW != null && mapData.panelH != null && <KvRow k="Dimensões Painel" v={`${mapData.panelW} × ${mapData.panelH} m`} />}
                  {mapData.powerWp != null && <KvRow k="Potência Painel" v={fmt(mapData.powerWp, 0, "Wp")} />}
                  {mapData.totalKwp != null && <KvRow k="Potência Total" v={<span className="text-amber-600 font-bold">{fmt(mapData.totalKwp, 2, "kWp")}</span>} />}
                  {mapData.adjKwp != null && mapData.adjKwp !== mapData.totalKwp && <KvRow k="Potência Ajustada" v={fmt(mapData.adjKwp, 2, "kWp")} />}
                </tbody></table>
              </div>
            </div>
            {!mapData.mapImageDataUrl && !mapData.panelSvg && (
              <div className="bg-slate-50 rounded border p-6 text-center text-sm text-gray-400 mt-4">
                <p>Aceda ao separador "Mapa Satélite", desenhe a área do telhado e os dados serão incluídos automaticamente no relatório.</p>
              </div>
            )}
          </Section>
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── STRINGS / MPPT ─────────────────────────────────────────────────── */}
      {sections.includes("strings") && inverterUnits.length > 0 && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Strings / MPPT" />
          <Section title="Configuração de Strings e MPPT">
            <div className="space-y-4">
              {inverterUnits.map((unit, ui) => {
                const inv = allInverters.find(i => i.id === unit.inverterId);
                const mppt = unit.mpptConfig;
                const totalModules = mppt
                  ? mppt.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0)
                  : null;
                return (
                  <div key={unit.key} className="rounded-lg border overflow-hidden">
                    <div className="bg-[#0D2B45] text-white px-4 py-2 flex items-center justify-between">
                      <span className="font-semibold text-sm">
                        Unidade {ui + 1} — {inv ? `${inv.fabricante} ${inv.nome}` : `Inversor #${unit.inverterId}`}
                      </span>
                      {unit.quantidade > 1 && (
                        <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">{unit.quantidade}×</span>
                      )}
                    </div>
                    <div className="p-4">
                      {inv && (
                        <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                          <div className="text-center bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-400">Pot. AC</p>
                            <p className="font-bold">{inv.potenciaAc} kW</p>
                          </div>
                          <div className="text-center bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-400">Nº MPPT</p>
                            <p className="font-bold">{inv.numMppt}</p>
                          </div>
                          <div className="text-center bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-400">Módulos</p>
                            <p className="font-bold text-amber-600">{totalModules ?? unit.numPaineisOverride ?? "—"}</p>
                          </div>
                        </div>
                      )}
                      {mppt && mppt.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Distribuição por MPPT</p>
                          <div className="overflow-hidden rounded border">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="py-1.5 px-3 text-left font-medium text-gray-600">MPPT</th>
                                  <th className="py-1.5 px-3 text-center font-medium text-gray-600">Strings</th>
                                  {mppt[0]?.map((_, si) => (
                                    <th key={si} className="py-1.5 px-3 text-center font-medium text-gray-600">
                                      Str {si + 1} (mód.)
                                    </th>
                                  ))}
                                  <th className="py-1.5 px-3 text-right font-medium text-gray-600">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mppt.map((row, mi) => {
                                  const rowTotal = row.reduce((a, b) => a + b, 0);
                                  return (
                                    <tr key={mi} className={mi % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                      <td className="py-1.5 px-3 font-medium text-[#0D2B45]">MPPT {mi + 1}</td>
                                      <td className="py-1.5 px-3 text-center">{row.length}</td>
                                      {row.map((n, si) => (
                                        <td key={si} className="py-1.5 px-3 text-center font-mono">{n}</td>
                                      ))}
                                      <td className="py-1.5 px-3 text-right font-bold text-amber-600">{rowTotal}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Configure as strings no passo de Técnica do wizard para ver a distribuição MPPT.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── FINANCEIRO & ROI ───────────────────────────────────────────────── */}
      {sections.includes("financeiro") && sz && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 page-break-after flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Análise Financeira" />
          <Section title="Análise Financeira e Retorno do Investimento">
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
            <div className="rounded-lg border overflow-hidden mb-6">
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
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}

      {/* ── NOTAS TÉCNICAS ─────────────────────────────────────────────────── */}
      {sections.includes("notas") && (() => { const p = pg(); return (
        <div className="report-page a4-page py-10 px-12 flex flex-col">
          <PageHeader projectName={projectName} sectionTitle="Notas Técnicas" />
          <Section title="Notas Técnicas">
            {notas.trim() ? (
              <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed border rounded-lg p-4 bg-gray-50 min-h-[8cm]">{notas}</div>
            ) : (
              <div className="border rounded-lg p-4 bg-gray-50 min-h-[8cm] text-gray-400 italic text-sm">
                Notas técnicas — edite este campo no painel lateral para adicionar observações, normas aplicáveis ou condicionamentos técnicos.
              </div>
            )}
          </Section>
          <div className="flex-1" />
          <PageFooter page={p} date={date} />
        </div>
      ); })()}
    </div>
  );
}
