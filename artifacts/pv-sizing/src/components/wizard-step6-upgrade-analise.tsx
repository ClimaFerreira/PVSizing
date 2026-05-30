import { useMemo } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Sun, Zap, Battery,
  TrendingUp, ArrowRight, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type InstalacaoExistente,
  type TipoProjeto,
  type UpgradeValidacoes,
  calcUpgradeValidacoes,
  REGIME_LABELS,
  TIPO_PROJETO_LABELS,
} from "@/lib/upgrade";
import type { SolarPanel, Inverter } from "@workspace/api-client-react";

interface Props {
  tipoProjeto: TipoProjeto;
  existente: InstalacaoExistente;
  novaPotenciaFVkWp: number;
  novoInversor: Inverter | null;
  novoPanel: SolarPanel | null;
  precoKwh: number;
  investimentoUpgrade: number;
  existingPanel: SolarPanel | null;
  existingInverter: Inverter | null;
}

function CheckRow({
  label, ok, info, detail,
}: {
  label: string;
  ok: "ok" | "aviso" | "erro" | "info";
  info: string;
  detail?: string;
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm",
      ok === "ok"    && "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800",
      ok === "aviso" && "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800",
      ok === "erro"  && "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800",
      ok === "info"  && "bg-muted/40 border",
    )}>
      <div className="shrink-0 mt-0.5">
        {ok === "ok"    && <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />}
        {ok === "aviso" && <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />}
        {ok === "erro"  && <XCircle      size={15} className="text-red-600 dark:text-red-400" />}
        {ok === "info"  && <Info         size={15} className="text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "font-medium text-xs",
          ok === "ok"    && "text-emerald-700 dark:text-emerald-300",
          ok === "aviso" && "text-amber-700 dark:text-amber-300",
          ok === "erro"  && "text-red-700 dark:text-red-300",
          ok === "info"  && "text-foreground",
        )}>{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{info}</div>
        {detail && <div className="text-xs text-muted-foreground mt-0.5 italic">{detail}</div>}
      </div>
    </div>
  );
}

export default function WizardStep6UpgradeAnalise({
  tipoProjeto, existente, novaPotenciaFVkWp, novoInversor, novoPanel,
  precoKwh, investimentoUpgrade, existingPanel, existingInverter,
}: Props) {
  const val = useMemo<UpgradeValidacoes>(() => calcUpgradeValidacoes(
    existente,
    novaPotenciaFVkWp,
    novoInversor ?Number(novoInversor.potenciaAc) : null,
    novoInversor ?Number(novoInversor.potenciaDcMax) : null,
    precoKwh,
    investimentoUpgrade,
  ), [existente, novaPotenciaFVkWp, novoInversor, precoKwh, investimentoUpgrade]);

  const existingPanelLabel = existingPanel
    ?`${existingPanel.fabricante} ${existingPanel.nome} (${existingPanel.potencia} W)`
    : existente.panelModeloManual || "Não especificado";

  const existingInvLabel = existingInverter
    ?`${existingInverter.fabricante} ${existingInverter.nome} (${existingInverter.potenciaAc} kW AC)`
    : existente.inversorModeloManual || `${existente.potenciaACkW} kW AC`;

  const newPanelLabel = novoPanel
    ?`${novoPanel.fabricante} ${novoPanel.nome} (${novoPanel.potencia} W)`
    : "—";

  const newInvLabel = novoInversor
    ?`${novoInversor.fabricante} ${novoInversor.nome} (${novoInversor.potenciaAc} kW AC)`
    : "Reutilizar inversor existente";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <TrendingUp size={18} className="text-amber-600 shrink-0" />
        <div>
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {TIPO_PROJETO_LABELS[tipoProjeto]}
          </span>
          <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">
            Análise de compatibilidade e impacto da intervenção proposta
          </p>
        </div>
      </div>

      {/* Existing vs New comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
        {/* Existing system */}
        <Card className="border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sistema Existente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {existente.potenciaFVkWp > 0 && (
              <div className="flex items-center gap-2">
                <Sun size={13} className="text-amber-500 shrink-0" />
                <span className="text-muted-foreground">FV:</span>
                <span className="font-medium">{existente.potenciaFVkWp} kWp</span>
              </div>
            )}
            {existente.numPaineis > 0 && (
              <div className="flex items-center gap-2">
                <Sun size={13} className="text-amber-500 shrink-0" />
                <span className="text-muted-foreground">Painéis:</span>
                <span className="font-medium">{existente.numPaineis} un.</span>
              </div>
            )}
            {(existingPanelLabel !== "Não especificado") && (
              <div className="text-xs text-muted-foreground leading-tight">{existingPanelLabel}</div>
            )}
            {existente.potenciaACkW > 0 && (
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-primary shrink-0" />
                <span className="text-muted-foreground">Inversor:</span>
                <span className="font-medium">{existente.potenciaACkW} kW AC</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground leading-tight">{existingInvLabel}</div>
            {existente.numStrings > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Strings:</span>
                <span className="text-xs font-medium">{existente.numStrings}</span>
              </div>
            )}
            {existente.producaoAnualkWh > 0 && (
              <div className="flex items-center gap-2">
                <BarChartIcon size={13} />
                <span className="text-muted-foreground text-xs">Produção:</span>
                <span className="text-xs font-medium">{existente.producaoAnualkWh.toLocaleString("pt-PT")} kWh/ano</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Battery size={13} className={existente.temBateria ?"text-orange-500" : "text-muted-foreground"} />
              <span className="text-xs">{existente.temBateria ?"Com bateria" : "Sem bateria"}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 italic">
              {REGIME_LABELS[existente.regimeInjecao]}
            </div>
          </CardContent>
        </Card>

        {/* Arrow */}
        <div className="flex items-center justify-center py-4 sm:py-8">
          <div className="flex flex-col items-center gap-1">
            <ArrowRight size={20} className="text-primary hidden sm:block" />
            <ArrowRight size={20} className="text-primary rotate-90 sm:hidden" />
            <span className="text-xs text-muted-foreground">upgrade</span>
          </div>
        </div>

        {/* New/upgraded system */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-primary uppercase tracking-wide">
              Após Intervenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {val.totalDCkWpFinal > 0 && (
              <div className="flex items-center gap-2">
                <Sun size={13} className="text-amber-500 shrink-0" />
                <span className="text-muted-foreground">FV total:</span>
                <span className="font-semibold text-primary">{val.totalDCkWpFinal.toFixed(2)} kWp</span>
              </div>
            )}
            {novaPotenciaFVkWp > 0 && (
              <div className="text-xs text-muted-foreground">
                + {novaPotenciaFVkWp.toFixed(2)} kWp novos
              </div>
            )}
            {newPanelLabel !== "—" && (
              <div className="text-xs text-muted-foreground leading-tight">{newPanelLabel}</div>
            )}
            {val.totalACkWFinal > 0 && (
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-primary shrink-0" />
                <span className="text-muted-foreground">AC total:</span>
                <span className="font-semibold text-primary">{val.totalACkWFinal.toFixed(1)} kW</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground leading-tight">{newInvLabel}</div>
            {val.producaoAdicionalEstkWh > 0 && (
              <div className="flex items-center gap-2">
                <TrendingUp size={13} className="text-emerald-600 shrink-0" />
                <span className="text-xs text-muted-foreground">+ Produção:</span>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  +{val.producaoAdicionalEstkWh.toLocaleString("pt-PT")} kWh/ano
                </span>
              </div>
            )}
            {val.poupancaAdicionalEstEuro > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">+ Poupança:</span>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  +{val.poupancaAdicionalEstEuro.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €/ano
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compatibility checks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 size={15} className="text-primary" />
            Compatibilidade e Recomendações
          </CardTitle>
          <CardDescription className="text-xs">
            Verificação automática dos requisitos técnicos do upgrade
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {novaPotenciaFVkWp > 0 && (
            <CheckRow
              label="Reutilização das strings existentes"
              ok={val.podeReutilizarStrings ?"ok" : "aviso"}
              info={val.podeReutilizarStrings
                ?`Os novos painéis (${novaPotenciaFVkWp} kWp) cabem no headroom DC do inversor existente.`
                : "A adição ultrapassa a capacidade DC do inversor existente. Recomenda-se novo inversor ou AC coupling."}
            />
          )}
          {novaPotenciaFVkWp > 0 && (
            <CheckRow
              label="Inversor existente suficiente"
              ok={val.precisaNovoInversor ?"aviso" : "ok"}
              info={val.precisaNovoInversor
                ?`DC/AC ratio total seria ${((val.totalDCkWpFinal / Math.max(existente.potenciaACkW, 0.001)) * 100).toFixed(0)}% — acima do limite. Considere novo inversor ou AC coupling.`
                : `DC/AC ratio global: ${((val.totalDCkWpFinal / Math.max(val.totalACkWFinal, 0.001)) * 100).toFixed(0)}% — dentro dos limites recomendados.`}
            />
          )}
          <CheckRow
            label="AC Coupling possível"
            ok={val.podeACCoupling ?"ok" : "info"}
            info={val.podeACCoupling
              ?"O inversor existente tem capacidade AC disponível para ligação de micro-inversor ou inversor de bateria em AC coupling."
              : "O inversor existente está a operar próximo da potência nominal. AC coupling poderá não ser viável."}
          />
          <CheckRow
            label="Retrofit de bateria"
            ok={val.podeBateriaRetrofit ?"ok" : "info"}
            info={val.podeBateriaRetrofit
              ?"Não existe bateria instalada — é possível adicionar sistema de armazenamento."
              : "Já existe bateria no sistema. Verifique compatibilidade para expansão de capacidade."}
          />
          {novaPotenciaFVkWp > 0 && (
            <CheckRow
              label="Limites de potência"
              ok={val.limitePotenciaOk ?"ok" : "aviso"}
              info={val.limitePotenciaOk
                ?"A potência dos novos painéis está dentro dos limites admissíveis do inversor seleccionado."
                : "A potência adicionada excede os limites do inversor. Verifique a configuração."}
            />
          )}
        </CardContent>
      </Card>

      {/* Financial impact */}
      {(val.producaoAdicionalEstkWh > 0 || val.paybackUpgradeAnos != null) && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp size={15} className="text-emerald-600" />
              Impacto Estimado do Upgrade
            </CardTitle>
            <CardDescription className="text-xs">
              Estimativa baseada em irradiância média de Portugal (1 350 kWh/kWp/ano)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Prod. adicional",
                  value: val.producaoAdicionalEstkWh > 0
                    ?`${val.producaoAdicionalEstkWh.toLocaleString("pt-PT")} kWh`
                    : "—",
                  sub: "por ano (est.)",
                  color: "emerald",
                },
                {
                  label: "Produção total",
                  value: existente.producaoAnualkWh > 0
                    ?`${(existente.producaoAnualkWh + val.producaoAdicionalEstkWh).toLocaleString("pt-PT")} kWh`
                    : "—",
                  sub: "após upgrade (est.)",
                  color: "primary",
                },
                {
                  label: "Poupança adicional",
                  value: val.poupancaAdicionalEstEuro > 0
                    ?`${val.poupancaAdicionalEstEuro.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €`
                    : "—",
                  sub: "por ano (est.)",
                  color: "emerald",
                },
                {
                  label: "Payback upgrade",
                  value: val.paybackUpgradeAnos != null
                    ?`${val.paybackUpgradeAnos.toFixed(1)} anos`
                    : "—",
                  sub: investimentoUpgrade > 0 ?`invest. ${investimentoUpgrade.toLocaleString("pt-PT")} €` : "defina o investimento",
                  color: val.paybackUpgradeAnos != null && val.paybackUpgradeAnos <= 10 ?"emerald" : "amber",
                },
              ].map(b => (
                <div key={b.label} className="rounded-lg bg-muted/40 p-3 text-center">
                  <div className={cn(
                    "text-lg font-bold",
                    b.color === "emerald" && "text-emerald-700 dark:text-emerald-400",
                    b.color === "primary" && "text-primary",
                    b.color === "amber"   && "text-amber-700 dark:text-amber-400",
                  )}>{b.value}</div>
                  <div className="text-xs font-medium mt-0.5">{b.label}</div>
                  <div className="text-[10px] text-muted-foreground">{b.sub}</div>
                </div>
              ))}
            </div>
            {existente.producaoAnualkWh > 0 && val.producaoAdicionalEstkWh > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Existente: {existente.producaoAnualkWh.toLocaleString("pt-PT")} kWh/ano</span>
                <span>→</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Total: {(existente.producaoAnualkWh + val.producaoAdicionalEstkWh).toLocaleString("pt-PT")} kWh/ano
                </span>
                <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-0 ml-auto">
                  +{((val.producaoAdicionalEstkWh / existente.producaoAnualkWh) * 100).toFixed(0)}%
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Local icon alias (BarChart3 from lucide)
function BarChartIcon({ size }: { size: number }) {
  return <TrendingUp size={size} className="text-muted-foreground" />;
}
