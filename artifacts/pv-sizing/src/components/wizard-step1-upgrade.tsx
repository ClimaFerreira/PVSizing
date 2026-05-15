import { Settings2, Sun, Zap, Battery, GitBranch, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  type InstalacaoExistente,
  type RegimeInjecao,
  REGIME_LABELS,
  type TipoProjeto,
  TIPO_PROJETO_LABELS,
} from "@/lib/upgrade";
import type { SolarPanel, Inverter } from "@workspace/api-client-react";

interface Props {
  tipoProjeto: TipoProjeto;
  data: InstalacaoExistente;
  onChange: (data: InstalacaoExistente) => void;
  panels: SolarPanel[];
  inverters: Inverter[];
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumInput({
  value, min = 0, max, step = 0.01, unit, onChange,
}: {
  value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="relative flex items-center">
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value === 0 ? "" : value}
        placeholder="0"
        onChange={e => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) ? 0 : v);
        }}
        className={unit ? "pr-12" : ""}
      />
      {unit && (
        <span className="absolute right-3 text-xs text-muted-foreground pointer-events-none">{unit}</span>
      )}
    </div>
  );
}

export default function WizardStep1Upgrade({ tipoProjeto, data, onChange, panels, inverters }: Props) {
  const set = <K extends keyof InstalacaoExistente>(key: K, val: InstalacaoExistente[K]) =>
    onChange({ ...data, [key]: val });

  const isUpgradeOrExpansao = tipoProjeto === "upgrade" || tipoProjeto === "expansao";
  const isSubstituicao = tipoProjeto === "substituicao";
  const isBateria = tipoProjeto === "bateria";

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 size={18} className="text-amber-600" />
          Instalação Existente — {TIPO_PROJETO_LABELS[tipoProjeto]}
        </CardTitle>
        <CardDescription>
          Introduza os dados do sistema fotovoltaico actualmente instalado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Painel existente ── */}
        {(isUpgradeOrExpansao || isSubstituicao) && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sun size={15} className="text-amber-500 shrink-0" />
              <span className="text-sm font-semibold">Módulos Fotovoltaicos Existentes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Potência FV instalada" hint="Total de painéis × Wp por painel">
                <NumInput value={data.potenciaFVkWp} unit="kWp" onChange={v => set("potenciaFVkWp", v)} />
              </Field>
              <Field label="Número de painéis">
                <NumInput value={data.numPaineis} unit="un." step={1} onChange={v => set("numPaineis", Math.round(v))} />
              </Field>
            </div>
            <Field label="Modelo dos painéis existentes" hint="Selecione do catálogo ou introduza manualmente">
              {panels.length > 0 && (
                <Select
                  value={data.panelId ? String(data.panelId) : "__manual__"}
                  onValueChange={v => {
                    if (v === "__manual__") {
                      set("panelId", null);
                    } else {
                      const id = Number(v);
                      set("panelId", id);
                      const p = panels.find(x => x.id === id);
                      if (p) onChange({ ...data, panelId: id, panelModeloManual: `${p.fabricante} ${p.nome}` });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar do catálogo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">Não está no catálogo</SelectItem>
                    {panels.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.fabricante} {p.nome} — {p.potencia} W
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(!data.panelId) && (
                <Input
                  className="mt-2"
                  placeholder="Ex: Jinko Solar JKM410M-54HL4"
                  value={data.panelModeloManual}
                  onChange={e => set("panelModeloManual", e.target.value)}
                />
              )}
            </Field>
            <Field label="Número de strings existentes" hint="Strings actualmente ligadas ao inversor">
              <NumInput value={data.numStrings} unit="strings" step={1} min={1} onChange={v => set("numStrings", Math.max(1, Math.round(v)))} />
            </Field>
          </div>
        )}

        {/* ── Inversor existente ── */}
        {!isBateria && (
          <>
            {(isUpgradeOrExpansao || isSubstituicao) && <Separator />}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Zap size={15} className="text-primary shrink-0" />
                <span className="text-sm font-semibold">Inversor Existente</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Potência AC do inversor">
                  <NumInput value={data.potenciaACkW} unit="kW" onChange={v => set("potenciaACkW", v)} />
                </Field>
              </div>
              <Field label="Modelo do inversor" hint="Selecione do catálogo ou introduza manualmente">
                {inverters.length > 0 && (
                  <Select
                    value={data.inverterId ? String(data.inverterId) : "__manual__"}
                    onValueChange={v => {
                      if (v === "__manual__") {
                        set("inverterId", null);
                      } else {
                        const id = Number(v);
                        const inv = inverters.find(x => x.id === id);
                        onChange({
                          ...data,
                          inverterId: id,
                          inversorModeloManual: inv ? `${inv.fabricante} ${inv.nome}` : "",
                          potenciaACkW: inv ? Number(inv.potenciaAc) : data.potenciaACkW,
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar do catálogo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manual__">Não está no catálogo</SelectItem>
                      {inverters.map(i => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {i.fabricante} {i.nome} — {i.potenciaAc} kW AC
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(!data.inverterId) && (
                  <Input
                    className="mt-2"
                    placeholder="Ex: Fronius Primo 5.0"
                    value={data.inversorModeloManual}
                    onChange={e => set("inversorModeloManual", e.target.value)}
                  />
                )}
              </Field>
            </div>
          </>
        )}

        <Separator />

        {/* ── Produção e operação ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={15} className="text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold">Produção e Operação</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Produção anual actual" hint="Valor do contador ou monitorização">
              <NumInput value={data.producaoAnualkWh} unit="kWh" step={100} onChange={v => set("producaoAnualkWh", v)} />
            </Field>
            <Field label="Regime de injecção / exportação">
              <Select
                value={data.regimeInjecao}
                onValueChange={v => set("regimeInjecao", v as RegimeInjecao)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(REGIME_LABELS) as [RegimeInjecao, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <Separator />

        {/* ── Bateria ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Battery size={15} className="text-orange-500 shrink-0" />
            <span className="text-sm font-semibold">Armazenamento</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Bateria já instalada</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sistema de armazenamento de energia activo</p>
            </div>
            <Switch
              checked={data.temBateria}
              onCheckedChange={v => set("temBateria", v)}
            />
          </div>
          {isBateria && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              O assistente irá dimensionar a bateria a adicionar ao sistema existente.
            </div>
          )}
        </div>

        {/* ── Síntese rápida ── */}
        {(data.potenciaFVkWp > 0 || data.potenciaACkW > 0) && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumo do Sistema Existente</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: "Pot. FV",       val: data.potenciaFVkWp > 0 ? `${data.potenciaFVkWp} kWp` : "—" },
                  { label: "Painéis",       val: data.numPaineis > 0 ? `${data.numPaineis} un.` : "—" },
                  { label: "Inversor AC",   val: data.potenciaACkW > 0 ? `${data.potenciaACkW} kW` : "—" },
                  { label: "Strings",       val: `${data.numStrings}` },
                  { label: "Produção/ano",  val: data.producaoAnualkWh > 0 ? `${data.producaoAnualkWh.toLocaleString("pt-PT")} kWh` : "—" },
                  { label: "Bateria",       val: data.temBateria ? "Sim" : "Não" },
                ].map(r => (
                  <div key={r.label} className="rounded-lg bg-muted/40 p-2.5">
                    <div className="text-sm font-semibold">{r.val}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
