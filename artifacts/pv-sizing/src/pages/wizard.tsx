import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  useListPanels,
  useListInverters,
  useListBatteries,
  useListLocations,
  useCreateProposal,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, MapPin, Settings2, CheckCircle2, ChevronRight, ChevronLeft,
  Loader2, Sun, Battery, BarChart3, AlertTriangle, TrendingUp,
  Clock, Lightbulb, ArrowRight, Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

import WizardStep1, { ConsumoData, DEFAULT_CONSUMO_DATA } from "@/components/wizard-step1";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schemas ──────────────────────────────────────────────────────────────────
const localizacaoSchema = z.object({
  latitude:  z.coerce.number().min(36).max(42.5),
  longitude: z.coerce.number().min(-10).max(-6),
  inclinacao: z.coerce.number().min(0).max(90),
  azimute:   z.coerce.number().min(-180).max(180),
});
const equipamentosSchema = z.object({
  panelId:   z.coerce.number().min(1, "Selecione um painel"),
  inverterId: z.coerce.number().min(1, "Selecione um inversor"),
  batteryId: z.coerce.number().optional(),
});

type LocalizacaoForm  = z.infer<typeof localizacaoSchema>;
type EquipamentosForm = z.infer<typeof equipamentosSchema>;

interface CenarioPainel {
  potenciaWp: number;
  quantidade: number;
  potenciaInstalada: number;
  energiaAnual: number;
  coberturaReal: number;
}

interface AutoSizeResult {
  consumoDiario: number;
  consumoAnualAjustado: number;
  energiaAlvoDiaria: number;
  potenciaBruta: number;
  margemPerdas: number;
  fatorRendimento: number;
  potenciaMinima: number;
  potenciaInstalada: number;
  potenciaRecomendada: number;
  numPaineis: number;
  energiaAnualEstimada: number;
  coberturaPrevista: number;
  coberturaAlvo: number;
  coberturaReal: number;
  capacidadeBateriaRecomendada: number | null;
  hsp: number;
  percVazio: number;
  percCheio: number;
  percPonta: number;
  cenariosPaineis: CenarioPainel[];
  explicacao: string;
}

const STEPS = [
  { id: 1, label: "Consumo",      icon: Zap },
  { id: 2, label: "Localização",  icon: MapPin },
  { id: 3, label: "Estudo",       icon: BarChart3 },
  { id: 4, label: "Equipamentos", icon: Settings2 },
];

export default function Wizard() {
  const [step, setStep]           = useState(1);
  const [consumoData, setConsumoData] = useState<ConsumoData>(DEFAULT_CONSUMO_DATA);
  const [locData, setLocData]     = useState<LocalizacaoForm | null>(null);
  const [sizing, setSizing]       = useState<AutoSizeResult | null>(null);
  const [isSizing, setIsSizing]   = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: panels }    = useListPanels();
  const { data: inverters } = useListInverters();
  const { data: batteries } = useListBatteries();
  const { data: locations } = useListLocations();
  const createProposal      = useCreateProposal();

  const locForm   = useForm<LocalizacaoForm>({ resolver: zodResolver(localizacaoSchema), defaultValues: { latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 } });
  const equipForm = useForm<EquipamentosForm>({ resolver: zodResolver(equipamentosSchema), defaultValues: {} });

  // ── Auto-size ─────────────────────────────────────────────────────────────
  const runAutoSize = async (consumo: ConsumoData, loc: LocalizacaoForm) => {
    setIsSizing(true);
    try {
      const resp = await fetch(`${BASE}/api/tools/auto-size`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumoAnual:      consumo.consumoAnual,
          latitude:          loc.latitude,
          longitude:         loc.longitude,
          inclinacao:        loc.inclinacao,
          azimute:           loc.azimute,
          coberturaMeta:     consumo.coberturaMeta,
          crescimentoFuturo: consumo.crescimentoFuturo,
          incluirBateria:    consumo.incluirBateria,
          horasAutonomia:    consumo.horasAutonomia,
          percVazio:         consumo.percVazio,
          percCheio:         consumo.percCheio,
          percPonta:         consumo.percPonta,
        }),
      });
      if (!resp.ok) throw new Error();
      setSizing(await resp.json());
    } catch {
      toast({ title: "Erro no dimensionamento automático", variant: "destructive" });
    } finally {
      setIsSizing(false);
    }
  };

  // ── Save proposal ─────────────────────────────────────────────────────────
  const handleSaveProposal = () => {
    if (!sizing) return;
    const eq    = equipForm.getValues();
    const panel = panels?.find(p => p.id === eq.panelId);
    createProposal.mutate(
      { data: {
        titulo:                `Proposta ${panel?.fabricante ?? ""} ${sizing.potenciaRecomendada} kWp`,
        consumoAnualEstimado:  consumoData.consumoAnual,
        potenciaRecomendada:   sizing.potenciaRecomendada,
        numPaineis:            sizing.numPaineis,
        panelId:               eq.panelId || null,
        inverterId:            eq.inverterId || null,
        batteryId:             eq.batteryId ?? null,
        producaoAnualEstimada: sizing.energiaAnualEstimada,
        alertas:               [],
      }},
      {
        onSuccess: () => { toast({ title: "Proposta guardada!" }); navigate("/propostas"); },
        onError:   () => toast({ title: "Erro ao guardar proposta", variant: "destructive" }),
      }
    );
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = async () => {
    if (step === 1) {
      if (consumoData.consumoAnual < 100) {
        toast({ title: "Consumo deve ser ≥ 100 kWh", variant: "destructive" });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!(await locForm.trigger())) return;
      const loc = locForm.getValues();
      setLocData(loc);
      await runAutoSize(consumoData, loc);
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dimensionamento Automático</h1>
        <p className="text-muted-foreground mt-1">Wizard passo-a-passo para dimensionar o sistema solar.</p>
      </div>

      {/* Step indicators */}
      <div className="space-y-3">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between">
          {STEPS.map(s => {
            const Icon   = s.icon;
            const active = step === s.id;
            const done   = step > s.id;
            return (
              <div key={s.id} className="flex flex-col items-center gap-1">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors",
                  done   ? "bg-primary border-primary text-primary-foreground" :
                  active ? "border-primary text-primary bg-primary/10" :
                           "border-muted text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block",
                  active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── STEP 1: Consumo ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap size={20} /> Consumo Energético</CardTitle>
            <CardDescription>
              Carregue faturas elétricas para análise automática com IA, ou introduza os valores manualmente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WizardStep1 data={consumoData} onChange={setConsumoData} />
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Localização ─────────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin size={20} /> Localização e Orientação</CardTitle>
            <CardDescription>Defina onde fica a instalação e a orientação dos painéis para calcular o rendimento solar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {locations && locations.length > 0 && (
              <div>
                <label className="text-sm font-medium">Localidade (pré-definida)</label>
                <Select onValueChange={v => {
                  const loc = locations.find(l => l.nome === v);
                  if (loc) { locForm.setValue("latitude", loc.latitude); locForm.setValue("longitude", loc.longitude); }
                }}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecionar localidade..." /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => <SelectItem key={l.nome} value={l.nome}>{l.nome} — {l.regiao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Form {...locForm}>
              <form className="grid grid-cols-2 gap-4">
                <FormField control={locForm.control} name="latitude" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={locForm.control} name="longitude" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl><Input type="number" step="0.0001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={locForm.control} name="inclinacao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inclinação (°)</FormLabel>
                    <FormControl><Input type="number" min={0} max={90} {...field} /></FormControl>
                    <p className="text-xs text-muted-foreground">0°=horizontal · Óptimo ≈ 30–35°</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={locForm.control} name="azimute" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Azimute (° de Sul)</FormLabel>
                    <FormControl><Input type="number" min={-180} max={180} {...field} /></FormControl>
                    <p className="text-xs text-muted-foreground">0°=Sul · -90°=Este · +90°=Oeste</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Estudo ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {isSizing ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-4">
                <Loader2 size={40} className="animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">A calcular dimensionamento...</p>
                  <p className="text-sm text-muted-foreground mt-1">A processar dados de consumo e irradiância solar</p>
                </div>
              </CardContent>
            </Card>
          ) : sizing ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Sun size={22} /> Estudo de Dimensionamento
                  </CardTitle>
                  <CardDescription>
                    {consumoData.consumoAnual.toLocaleString("pt-PT")} kWh/ano base
                    {consumoData.crescimentoFuturo > 0 && ` + ${consumoData.crescimentoFuturo}% futuro = ${sizing.consumoAnualAjustado.toLocaleString("pt-PT")} kWh/ano`}
                    {" · "}{consumoData.coberturaMeta}% cobertura solar
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Key metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Potência Instalada",   value: `${sizing.potenciaInstalada} kWp`,                             sub: `mín. teórica: ${sizing.potenciaMinima} kWp`, hi: true,  Icon: Zap },
                      { label: "Nº Painéis (400 Wp)",  value: `${sizing.numPaineis} un.`,                                     sub: `${sizing.potenciaInstalada} kWp reais`,       hi: true,  Icon: Sun },
                      { label: "Produção Anual Real",   value: `${sizing.energiaAnualEstimada.toLocaleString("pt-PT")} kWh`,   sub: `base: ${sizing.potenciaInstalada} kWp × HSP`, hi: false, Icon: TrendingUp },
                      { label: "Cobertura Real",        value: `${sizing.coberturaReal}%`,                                    sub: `alvo: ${sizing.coberturaAlvo}%`,              hi: false, Icon: BarChart3 },
                    ].map(({ label, value, sub, hi, Icon }) => (
                      <div key={label} className={cn("rounded-xl p-4 text-center border", hi ? "bg-primary/10 border-primary/30" : "bg-background border-border")}>
                        <Icon size={18} className={cn("mx-auto mb-2", hi ? "text-primary" : "text-muted-foreground")} />
                        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                        <p className={cn("font-bold text-lg mt-1", hi ? "text-primary" : "text-foreground")}>{value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Formula walkthrough */}
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Calculator size={16} className="text-primary" /> Fórmula de Cálculo
                    </p>
                    <div className="space-y-2 text-sm">
                      {[
                        { label: "1. Consumo diário",                        formula: `${sizing.consumoAnualAjustado.toLocaleString("pt-PT")} kWh/ano ÷ 365 dias`,                                     result: `${sizing.consumoDiario} kWh/dia`,             hi: false },
                        { label: "2. Energia solar diária alvo",             formula: `${sizing.consumoDiario} kWh/dia × ${consumoData.coberturaMeta}% cobertura`,                                     result: `${sizing.energiaAlvoDiaria} kWh/dia`,        hi: false },
                        { label: "3. Potência bruta (sem perdas)",           formula: `${sizing.energiaAlvoDiaria} kWh/dia ÷ ${sizing.hsp} h/dia (HSP)`,                                              result: `${sizing.potenciaBruta} kWp`,                hi: false },
                        { label: `4. Potência mínima teórica (perdas ${(sizing.margemPerdas*100).toFixed(0)}%)`, formula: `${sizing.potenciaBruta} kWp ÷ ${sizing.fatorRendimento.toFixed(2)} (rendimento)`, result: `${sizing.potenciaMinima} kWp`, hi: false },
                        { label: `5. Arredondamento → painéis reais`,        formula: `⌈${sizing.potenciaMinima} kWp ÷ 0,40 kWp/painel⌉ = ${sizing.numPaineis} × 400 Wp`,                              result: `${sizing.potenciaInstalada} kWp instalados`, hi: true  },
                        { label: "6. Cobertura real após arredondamento",    formula: `${sizing.energiaAnualEstimada.toLocaleString("pt-PT")} kWh ÷ ${sizing.consumoAnualAjustado.toLocaleString("pt-PT")} kWh`, result: `${sizing.coberturaReal}%`,           hi: true  },
                      ].map(({ label, formula, result, hi }) => (
                        <div key={label} className={cn(
                          "grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-3 py-2",
                          hi ? "bg-primary/10 border border-primary/20 font-semibold" : "bg-muted/40"
                        )}>
                          <div>
                            <p className={cn("text-xs font-medium", hi ? "text-primary" : "text-muted-foreground")}>{label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formula}</p>
                          </div>
                          <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                          <p className={cn("text-sm font-bold shrink-0", hi ? "text-primary" : "text-foreground")}>{result}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 pl-1">
                      Perdas: inversor (~4%), temperatura (~5%), sombreamento (~3%), cabos e sujidade (~5%), mismatch (~5%)
                    </p>
                  </div>

                  <Separator />

                  {/* Tech details + tariff distribution */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Horas Sol Pico (HSP)", value: `${sizing.hsp} h/dia` },
                      { label: "Rendimento Global",     value: `${(sizing.fatorRendimento * 100).toFixed(0)}%` },
                      { label: "Consumo Diário",        value: `${sizing.consumoDiario} kWh/dia` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col gap-0.5 p-3 bg-muted/40 rounded-lg">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-semibold text-sm">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Tariff distribution (always shown) */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Distribuição tarifária utilizada no cálculo</p>
                    <div className="flex rounded-full overflow-hidden h-5 border border-border text-[10px]">
                      <div className="bg-blue-400 flex items-center justify-center text-white font-semibold transition-all" style={{ width: `${sizing.percVazio}%` }}>
                        {sizing.percVazio >= 15 && `Vazio ${sizing.percVazio}%`}
                      </div>
                      <div className="bg-amber-400 flex items-center justify-center text-white font-semibold transition-all" style={{ width: `${sizing.percCheio}%` }}>
                        {sizing.percCheio >= 12 && `Cheio ${sizing.percCheio}%`}
                      </div>
                      <div className="bg-red-400 flex items-center justify-center text-white font-semibold transition-all" style={{ width: `${sizing.percPonta}%` }}>
                        {sizing.percPonta >= 10 && `Ponta ${sizing.percPonta}%`}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      A distribuição tarifária influencia o dimensionamento da bateria (consumo em Vazio = horas noturnas a cobrir)
                    </p>
                  </div>

                  <Separator />

                  {/* Panel scenarios */}
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <Sun size={16} className="text-primary" /> Cenários de Painéis Solares
                    </p>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Potência Painel</th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Nº Painéis</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Pot. Instalada</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Produção/ano</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Cobertura real</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sizing.cenariosPaineis.map((c, i) => (
                            <tr key={c.potenciaWp} className={cn(
                              "border-b last:border-0",
                              c.potenciaWp === 400 ? "bg-primary/5 font-semibold" : i % 2 === 0 ? "bg-background" : "bg-muted/20"
                            )}>
                              <td className="px-3 py-2">
                                {c.potenciaWp} Wp
                                {c.potenciaWp === 400 && <Badge variant="outline" className="ml-2 text-xs">Ref.</Badge>}
                              </td>
                              <td className="px-3 py-2 text-center font-bold">{c.quantidade}</td>
                              <td className="px-3 py-2 text-right">{c.potenciaInstalada.toFixed(2)} kWp</td>
                              <td className="px-3 py-2 text-right">{c.energiaAnual.toLocaleString("pt-PT")} kWh</td>
                              <td className="px-3 py-2 text-right">
                                <span className={cn(
                                  "font-semibold",
                                  c.coberturaReal >= sizing.coberturaAlvo ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                                )}>
                                  {c.coberturaReal}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 pl-1">
                      Cobertura a verde ≥ {sizing.coberturaAlvo}% (alvo). Os valores incluem arredondamento para cima do nº de painéis.
                    </p>
                  </div>

                  {/* Battery */}
                  {sizing.capacidadeBateriaRecomendada && (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                      <Battery size={22} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-amber-700 dark:text-amber-400">
                          Bateria Recomendada: {sizing.capacidadeBateriaRecomendada} kWh
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                          Para {consumoData.horasAutonomia}h de autonomia · {sizing.percVazio}% consumo em Vazio (período noturno) · DoD 80%
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Explanation */}
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl">
                    <Lightbulb size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{sizing.explicacao}</p>
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <AlertTriangle size={15} className="text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      Pré-dimensionamento estimativo. Confirme com análise PVGIS detalhada após criar o sistema.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {locData && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin size={14} />{locData.latitude.toFixed(4)}°N, {locData.longitude.toFixed(4)}°E
                      </span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock size={14} />Inclinação {locData.inclinacao}° · Azimute {locData.azimute}° de Sul
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
                <AlertTriangle size={32} />
                <p>Erro ao calcular dimensionamento. Volte atrás e tente novamente.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── STEP 4: Equipamentos ────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          {sizing && (
            <div className="flex flex-wrap gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-primary" />
                <span className="text-sm font-medium">{sizing.potenciaRecomendada} kWp necessários</span>
              </div>
              <div className="flex items-center gap-2">
                <Sun size={16} className="text-primary" />
                <span className="text-sm font-medium">≈ {sizing.numPaineis} painéis de 400 Wp</span>
              </div>
              {sizing.capacidadeBateriaRecomendada && (
                <div className="flex items-center gap-2">
                  <Battery size={16} className="text-amber-500" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Bateria: {sizing.capacidadeBateriaRecomendada} kWh
                  </span>
                </div>
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 size={20} /> Seleção de Equipamentos</CardTitle>
              <CardDescription>Escolha os equipamentos do catálogo. Use o resumo acima como referência.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...equipForm}>
                <form className="space-y-5">
                  <FormField control={equipForm.control} name="panelId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Painel Solar *</FormLabel>
                      <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecionar painel solar..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {panels?.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.fabricante} {p.nome} — {p.potencia} W
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sizing && (equipForm.watch("panelId") ?? 0) > 0 && (() => {
                        const panel = panels?.find(p => p.id === equipForm.watch("panelId"));
                        if (!panel) return null;
                        const n   = Math.ceil((sizing.potenciaRecomendada * 1000) / panel.potencia);
                        const kWp = (n * panel.potencia / 1000).toFixed(2);
                        return (
                          <p className="text-xs text-primary mt-1">
                            → Com este painel ({panel.potencia} Wp): <strong>{n} painéis</strong> = {kWp} kWp instalados
                          </p>
                        );
                      })()}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={equipForm.control} name="inverterId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inversor *</FormLabel>
                      <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecionar inversor..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {inverters?.map(i => {
                            const ok = sizing && i.potenciaAc >= sizing.potenciaRecomendada * 0.9;
                            return (
                              <SelectItem key={i.id} value={String(i.id)}>
                                {i.fabricante} {i.nome} — {i.potenciaAc} kW AC{ok ? " ✓" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Inversores com ✓ têm potência adequada ao estudo</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {consumoData.incluirBateria && (
                    <FormField control={equipForm.control} name="batteryId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bateria (opcional)</FormLabel>
                        <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecionar bateria..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            {batteries?.map(b => (
                              <SelectItem key={b.id} value={String(b.id)}>
                                {b.fabricante} {b.nome} — {b.capacidade} kWh
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  )}
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="border-green-500/30 bg-green-50/30 dark:bg-green-950/10">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Guardar como Proposta Técnica</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cria uma proposta com o estudo e equipamentos selecionados</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button onClick={handleSaveProposal} disabled={createProposal.isPending}>
                    {createProposal.isPending
                      ? <Loader2 size={16} className="mr-2 animate-spin" />
                      : <CheckCircle2 size={16} className="mr-2" />}
                    Guardar Proposta
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/sistemas/novo")}>
                    Criar Sistema Completo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
          <ChevronLeft size={16} className="mr-1" /> Anterior
        </Button>
        {step < 4 && (
          <Button onClick={goNext} disabled={isSizing}>
            {isSizing && <Loader2 size={16} className="mr-1 animate-spin" />}
            {step === 3 ? "Selecionar Equipamentos" : "Seguinte"}
            <ChevronRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
