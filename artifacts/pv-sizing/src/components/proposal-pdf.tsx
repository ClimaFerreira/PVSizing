import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sun, Zap, Battery, BarChart3, Leaf, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface Panel { nome: string; fabricante: string; potencia: number; voc: number; vmp: number; isc: number; imp: number; }
interface Inverter { nome: string; fabricante: string; potenciaAc: number; potenciaDcMax: number; }
interface BatteryEquip { nome: string; fabricante: string; capacidade: number; tecnologia: string; }

interface Proposal {
  id: number;
  titulo: string;
  status: string;
  consumoAnualEstimado?: number | null;
  potenciaRecomendada?: number | null;
  numPaineis?: number | null;
  producaoAnualEstimada?: number | null;
  payback?: number | null;
  tir?: number | null;
  alertas?: string[] | null;
  createdAt: string;
}

interface Props {
  proposal: Proposal;
  panel?: Panel;
  inverter?: Inverter;
  battery?: BatteryEquip;
}

export function ProposalPDF({ proposal, panel, inverter, battery }: Props) {
  const { company } = useAuth();
  const brandName = company?.nome ?? "SolarDim";
  const brandPrimary = company?.corPrimaria;

  const cobertura = proposal.consumoAnualEstimado && proposal.producaoAnualEstimada
    ? Math.min(100, (proposal.producaoAnualEstimada / proposal.consumoAnualEstimado) * 100)
    : null;

  const co2 = proposal.producaoAnualEstimada ? proposal.producaoAnualEstimada * 0.233 : null;
  const arvores = co2 ? Math.round(co2 / 21.77) : null;

  return (
    <div className="space-y-4 print:text-black print:bg-white">
      {/* Cover-style header */}
      <Card
        className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20 print:border print:shadow-none"
        style={brandPrimary ? { borderColor: brandPrimary } : undefined}
      >
        <CardContent className="pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {company?.logoUrl ? (
                <img src={company.logoUrl} alt={brandName} className="h-14 w-auto object-contain" />
              ) : (
                <Sun size={36} className="text-primary" style={brandPrimary ? { color: brandPrimary } : undefined} />
              )}
              <div>
                <div className="text-xl font-bold" style={brandPrimary ? { color: brandPrimary } : undefined}>{brandName}</div>
                <h2 className="text-lg font-semibold mt-1">{proposal.titulo}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Proposta Técnica de Sistema Fotovoltaico</p>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              {company?.nif && <div>NIF: {company.nif}</div>}
              {company?.morada && <div className="max-w-[200px]">{company.morada}</div>}
              {company?.telefone && <div>Tel: {company.telefone}</div>}
              {company?.email && <div>{company.email}</div>}
              <div className="pt-1"><Badge className="text-xs px-2 py-0.5">{proposal.status.toUpperCase()}</Badge></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo Executivo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 size={16} /> Resumo Executivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Potência Instalada", value: proposal.potenciaRecomendada != null ? `${proposal.potenciaRecomendada} kWp` : "—" },
              { label: "Módulos FV", value: proposal.numPaineis != null ? `${proposal.numPaineis} un.` : "—" },
              { label: "Produção Anual Est.", value: proposal.producaoAnualEstimada != null ? `${Number(proposal.producaoAnualEstimada).toLocaleString("pt-PT")} kWh` : "—" },
              { label: "Cobertura Solar", value: cobertura != null ? `${cobertura.toFixed(1)}%` : "—" },
              { label: "Payback Estimado", value: proposal.payback != null ? `${proposal.payback} anos` : "—" },
              { label: "TIR (25 anos)", value: proposal.tir != null ? `${proposal.tir}%` : "—" },
              { label: "Consumo Anual", value: proposal.consumoAnualEstimado != null ? `${Number(proposal.consumoAnualEstimado).toLocaleString("pt-PT")} kWh` : "—" },
              { label: "Poupança Estimada", value: proposal.consumoAnualEstimado && proposal.producaoAnualEstimada
                ? `≈ €${Math.round(Math.min(proposal.producaoAnualEstimada, proposal.consumoAnualEstimado) * 0.18 * 0.8).toLocaleString("pt-PT")}/ano`
                : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col p-3 bg-muted/40 rounded-lg">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="font-bold text-lg mt-0.5">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Equipment */}
      {(panel || inverter || battery) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Zap size={16} /> Equipamentos Selecionados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {panel && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Módulo Fotovoltaico</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Modelo", value: `${panel.fabricante} ${panel.nome}` },
                    { label: "Potência Pico", value: `${panel.potencia} Wp` },
                    { label: "Voc", value: `${panel.voc} V` },
                    { label: "Vmp", value: `${panel.vmp} V` },
                    { label: "Isc", value: `${panel.isc} A` },
                    { label: "Imp", value: `${panel.imp} A` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-sm">
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {panel && inverter && <Separator />}

            {inverter && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inversor</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Modelo", value: `${inverter.fabricante} ${inverter.nome}` },
                    { label: "Potência AC", value: `${inverter.potenciaAc} kW` },
                    { label: "Potência DC Máx", value: `${inverter.potenciaDcMax} kW` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-sm">
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {battery && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bateria</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Modelo", value: `${battery.fabricante} ${battery.nome}` },
                      { label: "Capacidade", value: `${battery.capacidade} kWh` },
                      { label: "Tecnologia", value: battery.tecnologia },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-sm">
                        <span className="text-muted-foreground text-xs">{label}</span>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Environmental impact */}
      {co2 && (
        <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400"><Leaf size={16} /> Impacto Ambiental Estimado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">CO₂ Evitado / ano</span>
                <span className="font-bold text-xl text-green-700 dark:text-green-400">{Math.round(co2).toLocaleString("pt-PT")} kg</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Equivalente em Árvores</span>
                <span className="font-bold text-xl text-green-700 dark:text-green-400">{arvores?.toLocaleString("pt-PT")} árvores/ano</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {proposal.alertas && proposal.alertas.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400"><AlertTriangle size={16} /> Alertas e Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {proposal.alertas.map((a, i) => (
                <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span> {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-4 border-t print:block space-y-1">
        {company?.iban && <p>IBAN: {company.iban}</p>}
        {company?.rodapeProposta && <p className="whitespace-pre-line">{company.rodapeProposta}</p>}
        <p>Proposta gerada por {brandName} · {new Date(proposal.createdAt).toLocaleDateString("pt-PT")} · Valores estimados sujeitos a confirmação técnica</p>
      </div>
    </div>
  );
}
