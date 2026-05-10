import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, MapPin, Settings2, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown,
  Loader2, Sun, Battery, BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  Clock, Lightbulb, ArrowRight, Calculator, SlidersHorizontal, RotateCcw, Target, Euro,
  Save, HistoryIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { saveDraft, loadDraft, clearDraft, draftAge, type WizardDraftData } from "@/lib/wizard-draft";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

import WizardStep1, { ConsumoData, DEFAULT_CONSUMO_DATA } from "@/components/wizard-step1";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type CenarioTipo = "conservador" | "equilibrado" | "agressivo";

const CENARIO_META: Record<CenarioTipo, { label: string; Icon: React.ElementType; accent: string; border: string; bg: string }> = {
  conservador: { label: "Conservador", Icon: TrendingDown, accent: "text-blue-600 dark:text-blue-400",   border: "border-blue-200 dark:border-blue-700",   bg: "bg-blue-50/60 dark:bg-blue-950/20" },
  equilibrado:  { label: "Equilibrado",  Icon: Target,        accent: "text-primary",                       border: "border-primary/40",                       bg: "bg-primary/5" },
  agressivo:   { label: "Agressivo",   Icon: TrendingUp,    accent: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700", bg: "bg-emerald-50/60 dark:bg-emerald-950/20" },
};

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

interface AutoSizeCenario {
  tipo: CenarioTipo;
  label: string;
  descricao: string;
  potenciaInstalada: number;
  numPaineis: number;
  energiaAnualEstimada: number;
  coberturaReal: number;
  producaoMensal: number[];
  consumoMensal: number[];
  autoconsumoMensal: number[];
  excessoMensal: number[];
  autoconsumoAnual: number;
  excessoAnual: number;
  autoconsumoPerc: number;
  investimentoEstimado: number;
  poupancaAnual: number;
  paybackAnos: number;
  capacidadeBateriaRecomendada: number | null;
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
  cenariosDimensionamento: AutoSizeCenario[];
  recomendado: CenarioTipo;
  explicacao: string;
}

interface ManualOverride {
  numPaineis: number;
  potenciaWp: number;
  hsp: number;
  rendimento: number;
  capacidadeBateria: number;
  coberturaMeta: number;
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
  const [showManualAdjust, setShowManualAdjust] = useState(false);
  const [manual, setManual]       = useState<ManualOverride | null>(null);
  const [selectedCenarioTipo, setSelectedCenarioTipo] = useState<CenarioTipo>("equilibrado");
  const [showRecovery, setShowRecovery] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<WizardDraftData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: panels }    = useListPanels();
  const { data: inverters } = useListInverters();
  const { data: batteries } = useListBatteries();
  const { data: locations } = useListLocations();
  const createProposal      = useCreateProposal();

  const locForm   = useForm<LocalizacaoForm>({ resolver: zodResolver(localizacaoSchema), defaultValues: { latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 } });
  const equipForm = useForm<EquipamentosForm>({ resolver: zodResolver(equipamentosSchema), defaultValues: {} });

  // When new sizing arrives, pick recommended scenario and initialise manual from it
  useEffect(() => {
    if (sizing) {
      const tipo: CenarioTipo = (sizing.recomendado ?? "equilibrado") as CenarioTipo;
      setSelectedCenarioTipo(tipo);
      const c = sizing.cenariosDimensionamento?.find(x => x.tipo === tipo) ?? null;
      setManual({
        numPaineis: c?.numPaineis ?? sizing.numPaineis,
        potenciaWp: 400,
        hsp: sizing.hsp,
        rendimento: sizing.fatorRendimento,
        capacidadeBateria: c?.capacidadeBateriaRecomendada ?? sizing.capacidadeBateriaRecomendada ?? 0,
        coberturaMeta: consumoData.coberturaMeta,
      });
      setShowManualAdjust(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizing]);

  // ── Draft: check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const draft = loadDraft();
    if (draft && (draft.step > 1 || draft.sizing !== null)) {
      setPendingDraft(draft);
      setShowRecovery(true);
    }
  }, []);

  // ── Draft: auto-save (debounced 800ms) ────────────────────────────────────
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft({
        step,
        consumoData: consumoData as unknown as Record<string, unknown>,
        locData: locData as unknown as Record<string, unknown> | null,
        sizing: sizing as unknown as Record<string, unknown> | null,
        selectedCenarioTipo,
        manual: manual as unknown as Record<string, unknown> | null,
        showManualAdjust,
        equipFormValues: equipForm.getValues(),
      });
      setLastSaved(new Date());
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, consumoData, locData, sizing, selectedCenarioTipo, manual, showManualAdjust]);

  // Currently selected sizing scenario
  const activeCenario: AutoSizeCenario | null = useMemo(() => {
    if (!sizing?.cenariosDimensionamento) return null;
    return sizing.cenariosDimensionamento.find(c => c.tipo === selectedCenarioTipo) ?? null;
  }, [sizing, selectedCenarioTipo]);

  // Switch scenario and reset manual to match
  const selectCenario = (tipo: CenarioTipo) => {
    setSelectedCenarioTipo(tipo);
    if (sizing) {
      const c = sizing.cenariosDimensionamento?.find(x => x.tipo === tipo) ?? null;
      setManual({
        numPaineis: c?.numPaineis ?? sizing.numPaineis,
        potenciaWp: 400,
        hsp: sizing.hsp,
        rendimento: sizing.fatorRendimento,
        capacidadeBateria: c?.capacidadeBateriaRecomendada ?? sizing.capacidadeBateriaRecomendada ?? 0,
        coberturaMeta: consumoData.coberturaMeta,
      });
      setShowManualAdjust(false);
    }
  };

  // Effective sizing: active scenario base + manual overrides
  const effectiveSizing = useMemo(() => {
    if (!sizing || !manual) return sizing;
    const potenciaInstalada = +(manual.numPaineis * manual.potenciaWp / 1000).toFixed(2);
    const energiaAnualEstimada = Math.round(potenciaInstalada * manual.hsp * 365 * manual.rendimento);
    const coberturaReal = sizing.consumoAnualAjustado > 0
      ? Math.round((energiaAnualEstimada / sizing.consumoAnualAjustado) * 100)
      : 0;
    return {
      ...sizing,
      potenciaInstalada,
      potenciaRecomendada: potenciaInstalada,
      numPaineis: manual.numPaineis,
      energiaAnualEstimada,
      coberturaReal,
      coberturaAlvo: manual.coberturaMeta,
      capacidadeBateriaRecomendada: manual.capacidadeBateria > 0 ? manual.capacidadeBateria : null,
      hsp: manual.hsp,
      fatorRendimento: manual.rendimento,
    };
  }, [sizing, manual]);

  // Compare manual vs active cenario (not the equilibrado top-level values)
  const isManualModified = useMemo(() => {
    if (!manual || !sizing) return false;
    const base = activeCenario ?? sizing;
    return (
      manual.numPaineis !== base.numPaineis ||
      manual.potenciaWp !== 400 ||
      Math.abs(manual.hsp - sizing.hsp) > 0.01 ||
      Math.abs(manual.rendimento - sizing.fatorRendimento) > 0.005 ||
      (manual.capacidadeBateria > 0 && manual.capacidadeBateria !== (base.capacidadeBateriaRecomendada ?? 0))
    );
  }, [manual, activeCenario, sizing]);

  // ── Draft handlers ─────────────────────────────────────────────────────────
  const restoreDraft = useCallback((draft: WizardDraftData) => {
    setConsumoData(draft.consumoData as unknown as ConsumoData);
    if (draft.locData) {
      setLocData(draft.locData as unknown as LocalizacaoForm);
      locForm.reset(draft.locData as unknown as LocalizacaoForm);
    }
    if (draft.sizing) setSizing(draft.sizing as unknown as AutoSizeResult);
    setSelectedCenarioTipo(draft.selectedCenarioTipo as CenarioTipo);
    if (draft.manual) setManual(draft.manual as unknown as ManualOverride);
    setShowManualAdjust(draft.showManualAdjust);
    if (draft.equipFormValues && Object.keys(draft.equipFormValues).length > 0) {
      equipForm.reset(draft.equipFormValues);
    }
    setStep(draft.step);
    setShowRecovery(false);
    setPendingDraft(null);
    toast({ title: "Estudo retomado", description: "O teu estudo foi recuperado com sucesso." });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locForm, equipForm]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setShowRecovery(false);
    setPendingDraft(null);
  }, []);

  const resetWizard = useCallback(() => {
    clearDraft();
    setConsumoData(DEFAULT_CONSUMO_DATA);
    setLocData(null);
    setSizing(null);
    setStep(1);
    setManual(null);
    setSelectedCenarioTipo("equilibrado");
    setShowManualAdjust(false);
    setLastSaved(null);
    locForm.reset({ latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 });
    equipForm.reset({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locForm, equipForm]);

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
          precoKwh:          consumo.precoKwh ?? 0.18,
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
    const eff = effectiveSizing ?? sizing;
    if (!eff) return;
    const eq    = equipForm.getValues();
    const panel = panels?.find(p => p.id === eq.panelId);
    createProposal.mutate(
      { data: {
        titulo:                `Proposta ${panel?.fabricante ?? ""} ${eff.potenciaRecomendada} kWp`,
        consumoAnualEstimado:  consumoData.consumoAnual,
        potenciaRecomendada:   eff.potenciaRecomendada,
        numPaineis:            eff.numPaineis,
        panelId:               eq.panelId || null,
        inverterId:            eq.inverterId || null,
        batteryId:             eq.batteryId ?? null,
        producaoAnualEstimada: eff.energiaAnualEstimada,
        alertas:               [],
      }},
      {
        onSuccess: () => { clearDraft(); toast({ title: "Proposta guardada!" }); navigate("/propostas"); },
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

      {/* ── Recovery dialog ───────────────────────────────────────────────── */}
      <AlertDialog open={showRecovery} onOpenChange={setShowRecovery}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HistoryIcon size={18} className="text-primary" />
              Estudo em progresso encontrado
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Foi encontrado um estudo guardado automaticamente{" "}
                  <strong>{pendingDraft ? draftAge(pendingDraft) : ""}</strong>,
                  no passo <strong>{pendingDraft?.step ?? 1}</strong> de 4.
                </p>
                {pendingDraft?.sizing && (
                  <p className="text-sm text-muted-foreground">
                    Estudo calculado ·{" "}
                    {String((pendingDraft.sizing as Record<string, unknown>).potenciaRecomendada ?? "—")} kWp ·{" "}
                    {String((pendingDraft.sizing as Record<string, unknown>).numPaineis ?? "—")} painéis
                  </p>
                )}
                <p>Deseja continuar ou iniciar um novo estudo?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Iniciar novo</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDraft && restoreDraft(pendingDraft)}>
              Continuar estudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dimensionamento Automático</h1>
          <p className="text-muted-foreground mt-1">Wizard passo-a-passo para dimensionar o sistema solar.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          {lastSaved && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Save size={11} />
              Guardado
            </span>
          )}
          {(step > 1 || sizing) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-8 px-2"
              onClick={resetWizard}
              title="Reiniciar estudo"
            >
              <RotateCcw size={14} className="mr-1" />
              Reiniciar
            </Button>
          )}
        </div>
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
              {/* ── Coverage slider ─────────────────────────────────────────── */}
              {sizing.cenariosDimensionamento && sizing.cenariosDimensionamento.length > 0 && (() => {
                const cenarios = sizing.cenariosDimensionamento;
                const minCob = Math.min(...cenarios.map(c => c.coberturaReal));
                const maxCob = Math.max(...cenarios.map(c => c.coberturaReal));
                const rangeMin = Math.max(10, minCob - 5);
                const rangeMax = maxCob + 5;
                const activeCob = Math.min(rangeMax, Math.max(rangeMin,
                  activeCenario?.coberturaReal ?? cenarios[1]?.coberturaReal ?? 80
                ));
                const handleSlider = ([val]: number[]) => {
                  const nearest = cenarios.reduce((best, c) =>
                    Math.abs(c.coberturaReal - val) < Math.abs(best.coberturaReal - val) ? c : best
                  );
                  selectCenario(nearest.tipo as CenarioTipo);
                };
                return (
                  <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                    <CardContent className="pt-5 pb-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Cenário de Dimensionamento</p>
                          <p className="text-xs text-muted-foreground">Arraste para comparar cenários e ver a produção mensal</p>
                        </div>
                        <div className="text-right">
                          <span className="text-3xl font-bold text-primary">{activeCenario?.coberturaReal ?? "—"}%</span>
                          <p className="text-xs text-muted-foreground">{activeCenario?.label ?? "—"}</p>
                        </div>
                      </div>

                      <div className="relative pt-1">
                        <Slider
                          min={rangeMin}
                          max={rangeMax}
                          step={1}
                          value={[activeCob]}
                          onValueChange={handleSlider}
                          className="w-full"
                        />
                        {/* Scenario tick marks */}
                        <div className="relative mt-3">
                          {cenarios.map(c => {
                            const pct = ((c.coberturaReal - rangeMin) / (rangeMax - rangeMin)) * 100;
                            const isActive = c.tipo === selectedCenarioTipo;
                            const meta = CENARIO_META[c.tipo as CenarioTipo];
                            return (
                              <button
                                key={c.tipo}
                                onClick={() => selectCenario(c.tipo as CenarioTipo)}
                                style={{ left: `${pct}%` }}
                                className="absolute -translate-x-1/2 flex flex-col items-center gap-0.5 group"
                              >
                                <div className={cn(
                                  "w-0.5 h-2 rounded-full transition-colors",
                                  isActive ? "bg-primary" : "bg-muted-foreground/40"
                                )} />
                                <span className={cn(
                                  "text-[10px] font-medium whitespace-nowrap transition-colors",
                                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                )}>
                                  {meta?.label ?? c.tipo} · {c.coberturaReal}%
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Mini KPI strip */}
                      <div className="flex gap-3 pt-5 flex-wrap">
                        {[
                          { label: "Potência", val: `${activeCenario?.potenciaInstalada ?? "—"} kWp` },
                          { label: "Painéis", val: `${activeCenario?.numPaineis ?? "—"} un.` },
                          { label: "Payback", val: `${activeCenario?.paybackAnos ?? "—"} anos` },
                          { label: "Investimento", val: activeCenario ? `${activeCenario.investimentoEstimado.toLocaleString("pt-PT")} €` : "—" },
                          { label: "Poupança/ano", val: activeCenario ? `${activeCenario.poupancaAnual.toLocaleString("pt-PT")} €` : "—" },
                        ].map(({ label, val }) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{label}:</span>
                            <span className="text-xs font-bold">{val}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── Scenario selector ───────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {sizing.cenariosDimensionamento?.map(c => {
                  const isSelected = c.tipo === selectedCenarioTipo;
                  const isRec = c.tipo === sizing.recomendado;
                  const meta = CENARIO_META[c.tipo as CenarioTipo];
                  const Icon = meta?.Icon ?? Sun;
                  return (
                    <div
                      key={c.tipo}
                      onClick={() => selectCenario(c.tipo as CenarioTipo)}
                      className={cn(
                        "relative rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-sm select-none",
                        isSelected
                          ? `border-primary bg-primary/5 shadow-sm`
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      {isRec && (
                        <div className="absolute -top-2.5 left-3">
                          <Badge className="text-[10px] py-0 px-1.5 bg-primary text-primary-foreground">⭐ Recomendado</Badge>
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5">
                          <Icon size={16} className={cn(isSelected ? "text-primary" : "text-muted-foreground")} />
                          <span className={cn("font-semibold text-sm", isSelected ? "text-primary" : "")}>{c.label}</span>
                        </div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-3 leading-snug">{c.descricao}</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Potência</span>
                          <span className="font-bold">{c.potenciaInstalada} kWp</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Painéis (400 Wp)</span>
                          <span className="font-semibold">{c.numPaineis} un.</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cobertura anual</span>
                          <span className={cn("font-semibold", c.coberturaReal >= consumoData.coberturaMeta ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>{c.coberturaReal}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Autoconsumo</span>
                          <span className="font-semibold">{c.autoconsumoPerc}%</span>
                        </div>
                        <Separator className="my-1.5" />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Investimento est.</span>
                          <span className="font-semibold">{c.investimentoEstimado.toLocaleString("pt-PT")} €</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Poupança/ano</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">{c.poupancaAnual.toLocaleString("pt-PT")} €</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Payback simples</span>
                          <span className={cn("font-bold", isSelected ? "text-primary" : "")}>{c.paybackAnos} anos</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Monthly chart + financial summary (active scenario) ──────── */}
              {activeCenario && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 size={18} className="text-primary" />
                      Perfil Mensal — {activeCenario.label}
                      {isManualModified && (
                        <Badge variant="outline" className="text-primary border-primary/40 text-xs ml-1">Ajustado</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>Produção estimada (autoconsumo + excedente) vs consumo mensal</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ResponsiveContainer width="100%" height={190}>
                      <ComposedChart
                        data={activeCenario.producaoMensal.map((_, i) => ({
                          mes: MONTH_LABELS[i],
                          autoconsumo: activeCenario.autoconsumoMensal[i],
                          excesso: activeCenario.excessoMensal[i],
                          consumo: activeCenario.consumoMensal[i],
                        }))}
                        margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                      >
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, padding: "6px 10px" }}
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = {
                              autoconsumo: "Autoconsumo", excesso: "Excedente (rede)", consumo: "Consumo",
                            };
                            return [`${Math.round(value).toLocaleString("pt-PT")} kWh`, labels[name] ?? name];
                          }}
                        />
                        <Bar dataKey="autoconsumo" stackId="prod" fill="#22c55e" name="autoconsumo" radius={[0, 0, 2, 2]} />
                        <Bar dataKey="excesso" stackId="prod" fill="#f59e0b" name="excesso" radius={[2, 2, 0, 0]} />
                        <Line type="monotone" dataKey="consumo" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="consumo" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground justify-center flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-green-500 inline-block" /> Autoconsumo</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-amber-400 inline-block" /> Excedente (rede)</span>
                      <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-muted-foreground inline-block" /> Consumo</span>
                    </div>

                    <Separator />

                    {/* Financial KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Investimento est.", value: `${activeCenario.investimentoEstimado.toLocaleString("pt-PT")} €`, sub: "painéis + instalação", hi: false, Icon: Euro },
                        { label: "Poupança/ano",       value: `${activeCenario.poupancaAnual.toLocaleString("pt-PT")} €`,       sub: `${activeCenario.autoconsumoAnual.toLocaleString("pt-PT")} kWh autoconsumo`, hi: false, Icon: TrendingUp },
                        { label: "Payback simples",    value: `${activeCenario.paybackAnos} anos`,                               sub: "sem subsídios ou injeção", hi: true, Icon: Target },
                        { label: "Autoconsumo",        value: `${activeCenario.autoconsumoPerc}%`,                               sub: `excedente: ${activeCenario.excessoAnual.toLocaleString("pt-PT")} kWh/ano`, hi: false, Icon: BarChart3 },
                      ].map(({ label, value, sub, hi, Icon: Ic }) => (
                        <div key={label} className={cn("rounded-xl p-3 text-center border", hi ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border")}>
                          <Ic size={15} className={cn("mx-auto mb-1.5", hi ? "text-primary" : "text-muted-foreground")} />
                          <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                          <p className={cn("font-bold text-sm mt-0.5", hi ? "text-primary" : "text-foreground")}>{value}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Summer excess warning */}
                    {activeCenario.excessoMensal.slice(4, 9).some(e => e > (activeCenario.consumoMensal[6] ?? 0) * 0.4) && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                        <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          <strong>Excedente de verão elevado</strong> — Nos meses de Maio–Setembro a produção excede o consumo.{" "}
                          {selectedCenarioTipo !== "conservador" && "Considere o cenário Conservador para melhor autoconsumo ou adicione bateria."}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="border-primary/40 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Sun size={22} /> Estudo de Dimensionamento
                    {isManualModified && (
                      <Badge variant="outline" className="text-primary border-primary/40 text-xs ml-1 font-medium">
                        <SlidersHorizontal size={10} className="mr-1" /> Ajustado
                      </Badge>
                    )}
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
                    {(() => {
                      const eff = effectiveSizing ?? sizing;
                      return [
                        {
                          label: "Potência Instalada",
                          value: `${eff.potenciaInstalada} kWp`,
                          sub: isManualModified ? `cenário base: ${(activeCenario ?? sizing).potenciaInstalada} kWp` : `mín. teórica: ${sizing.potenciaMinima} kWp`,
                          hi: true, Icon: Zap,
                        },
                        {
                          label: isManualModified ? `Nº Painéis (${manual!.potenciaWp} Wp)` : "Nº Painéis (400 Wp)",
                          value: `${eff.numPaineis} un.`,
                          sub: isManualModified ? `cenário base: ${(activeCenario ?? sizing).numPaineis} un.` : `${eff.potenciaInstalada} kWp reais`,
                          hi: true, Icon: Sun,
                        },
                        {
                          label: "Produção Anual Real",
                          value: `${eff.energiaAnualEstimada.toLocaleString("pt-PT")} kWh`,
                          sub: isManualModified ? `cenário base: ${(activeCenario ?? sizing).energiaAnualEstimada.toLocaleString("pt-PT")} kWh` : `base: ${eff.potenciaInstalada} kWp × HSP`,
                          hi: false, Icon: TrendingUp,
                        },
                        {
                          label: "Cobertura Real",
                          value: `${eff.coberturaReal}%`,
                          sub: isManualModified ? `cenário base: ${(activeCenario ?? sizing).coberturaReal}% · alvo: ${eff.coberturaAlvo}%` : `alvo: ${eff.coberturaAlvo}%`,
                          hi: false, Icon: BarChart3,
                        },
                      ];
                    })().map(({ label, value, sub, hi, Icon }) => (
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

              {/* ── Manual Adjustment Card ── */}
              {manual && (
                <Card className={cn("transition-colors", showManualAdjust ? "border-primary/50" : "border-dashed")}>
                  <div
                    className="px-5 py-4 flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setShowManualAdjust(v => !v)}
                  >
                    <div className="flex items-center gap-2.5">
                      <SlidersHorizontal size={18} className={cn(showManualAdjust ? "text-primary" : "text-muted-foreground")} />
                      <div>
                        <p className="text-sm font-semibold">Ajuste Manual da Solução</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isManualModified
                            ? `Ajustado: ${(effectiveSizing ?? sizing)!.potenciaInstalada} kWp · ${(effectiveSizing ?? sizing)!.numPaineis} painéis · ${(effectiveSizing ?? sizing)!.coberturaReal}% cobertura`
                            : "Personalizar potência, painéis, HSP e rendimento"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isManualModified && <Badge variant="outline" className="text-primary border-primary/40 text-xs">Ajustado</Badge>}
                      <ChevronDown size={16} className={cn("text-muted-foreground transition-transform duration-200", showManualAdjust && "rotate-180")} />
                    </div>
                  </div>

                  {showManualAdjust && (
                    <CardContent className="pt-0 pb-5 space-y-5">
                      <Separator />

                      {/* Input grid */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Parâmetros Ajustáveis</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Nº de Painéis</label>
                            <Input type="number" min={1} step={1} value={manual.numPaineis}
                              onChange={e => { const v = +e.target.value; setManual(m => m ? { ...m, numPaineis: v } : m); }}
                              onBlur={e => { const v = Math.max(1, Math.round(+e.target.value || 1)); setManual(m => m ? { ...m, numPaineis: v } : m); }} />
                            <p className="text-[10px] text-muted-foreground mt-1">Auto: {sizing.numPaineis} un.</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Potência/Painel (Wp)</label>
                            <Input type="number" min={100} max={700} step={5} value={manual.potenciaWp}
                              onChange={e => { const v = +e.target.value; setManual(m => m ? { ...m, potenciaWp: v } : m); }}
                              onBlur={e => { const v = Math.max(100, Math.min(700, Math.round(+e.target.value || 400))); setManual(m => m ? { ...m, potenciaWp: v } : m); }} />
                            <p className="text-[10px] text-muted-foreground mt-1">Auto: 400 Wp</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Potência Instalada</label>
                            <div className="h-10 px-3 flex items-center rounded-md border border-dashed bg-muted/40 text-sm font-bold text-primary">
                              {(manual.numPaineis * manual.potenciaWp / 1000).toFixed(2)} kWp
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">Auto: {sizing.potenciaInstalada} kWp</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">HSP (h/dia)</label>
                            <Input type="number" min={1} max={8} step={0.01} value={manual.hsp}
                              onChange={e => { const v = +e.target.value; setManual(m => m ? { ...m, hsp: v } : m); }}
                              onBlur={e => { const v = Math.max(1, Math.min(8, +e.target.value || 1)); setManual(m => m ? { ...m, hsp: v } : m); }} />
                            <p className="text-[10px] text-muted-foreground mt-1">Auto: {sizing.hsp} h/dia</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Rendimento Global (%)</label>
                            <Input type="number" min={50} max={100} step={1} value={Math.round(manual.rendimento * 100)}
                              onChange={e => { const v = +e.target.value; setManual(m => m ? { ...m, rendimento: v / 100 } : m); }}
                              onBlur={e => { const v = Math.max(50, Math.min(100, +e.target.value || 78)); setManual(m => m ? { ...m, rendimento: v / 100 } : m); }} />
                            <p className="text-[10px] text-muted-foreground mt-1">Auto: {Math.round(sizing.fatorRendimento * 100)}%</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Meta de Cobertura (%)</label>
                            <Input type="number" min={10} max={150} step={1} value={manual.coberturaMeta}
                              onChange={e => { const v = +e.target.value; setManual(m => m ? { ...m, coberturaMeta: v } : m); }}
                              onBlur={e => { const v = Math.max(10, Math.min(150, +e.target.value || 80)); setManual(m => m ? { ...m, coberturaMeta: v } : m); }} />
                            <p className="text-[10px] text-muted-foreground mt-1">Auto: {consumoData.coberturaMeta}%</p>
                          </div>
                          {consumoData.incluirBateria && (
                            <div>
                              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Capacidade Bateria (kWh)</label>
                              <Input type="number" min={0} step={0.5} value={manual.capacidadeBateria}
                                onChange={e => { const v = +e.target.value; setManual(m => m ? { ...m, capacidadeBateria: v } : m); }}
                                onBlur={e => { const v = Math.max(0, +e.target.value || 0); setManual(m => m ? { ...m, capacidadeBateria: v } : m); }} />
                              <p className="text-[10px] text-muted-foreground mt-1">Auto: {sizing.capacidadeBateriaRecomendada ?? 0} kWh</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Comparison table + warnings */}
                      {(() => {
                        const mPotInstalada = +(manual.numPaineis * manual.potenciaWp / 1000).toFixed(2);
                        const mEnergiaAnual = Math.round(mPotInstalada * manual.hsp * 365 * manual.rendimento);
                        const mCobertura = sizing.consumoAnualAjustado > 0
                          ? Math.round((mEnergiaAnual / sizing.consumoAnualAjustado) * 100) : 0;
                        const mExcedente = Math.max(0, mEnergiaAnual - sizing.consumoAnualAjustado);
                        const abaixoMeta = mCobertura < manual.coberturaMeta;
                        const acimaExcesso = mCobertura > manual.coberturaMeta * 1.3;
                        const pNeeded = abaixoMeta
                          ? Math.ceil(((manual.coberturaMeta / 100 * sizing.consumoAnualAjustado) / (manual.hsp * 365 * manual.rendimento) - mPotInstalada) * 1000 / manual.potenciaWp)
                          : 0;
                        const rows = [
                          { label: "Potência Instalada", auto: `${sizing.potenciaInstalada} kWp`,                                       adj: `${mPotInstalada} kWp`,                                   d: mPotInstalada - sizing.potenciaInstalada,           fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)} kWp` },
                          { label: "Nº Painéis",         auto: `${sizing.numPaineis} un.`,                                              adj: `${manual.numPaineis} un.`,                               d: manual.numPaineis - sizing.numPaineis,              fmt: (v: number) => `${v > 0 ? "+" : ""}${v} un.` },
                          { label: "Produção Anual",     auto: `${sizing.energiaAnualEstimada.toLocaleString("pt-PT")} kWh`,            adj: `${mEnergiaAnual.toLocaleString("pt-PT")} kWh`,           d: mEnergiaAnual - sizing.energiaAnualEstimada,        fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-PT")} kWh` },
                          { label: "Cobertura Real",     auto: `${sizing.coberturaReal}%`,                                             adj: `${mCobertura}%`,                                         d: mCobertura - sizing.coberturaReal,                 fmt: (v: number) => `${v > 0 ? "+" : ""}${v}%` },
                        ];
                        return (
                          <>
                            <div>
                              <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Comparação Automático vs Ajustado</p>
                              <div className="rounded-lg border overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-muted/50 border-b">
                                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Parâmetro</th>
                                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Automático</th>
                                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Ajustado</th>
                                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Δ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, i) => (
                                      <tr key={row.label} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                                        <td className="px-3 py-2 text-xs font-medium">{row.label}</td>
                                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">{row.auto}</td>
                                        <td className="px-3 py-2 text-right text-xs font-semibold">{row.adj}</td>
                                        <td className={cn("px-3 py-2 text-right text-xs font-semibold",
                                          row.d > 0 ? "text-green-600 dark:text-green-400" :
                                          row.d < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                                        )}>{row.fmt(row.d)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {abaixoMeta && (
                                <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                                  <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                  <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                                    <p className="font-semibold">Sistema subdimensionado</p>
                                    <p>Automático: {sizing.coberturaReal}% · Ajustado: {mCobertura}% · Meta: {manual.coberturaMeta}%</p>
                                    {pNeeded > 0 && <p>Adicione {pNeeded} painel{pNeeded > 1 ? "is" : ""} para atingir a meta.</p>}
                                  </div>
                                </div>
                              )}
                              {acimaExcesso && (
                                <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                  <TrendingUp size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                  <div className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5">
                                    <p className="font-semibold">Sistema sobredimensionado</p>
                                    <p>Cobertura ajustada ({mCobertura}%) excede a meta ({manual.coberturaMeta}%) em {mCobertura - manual.coberturaMeta}%.</p>
                                  </div>
                                </div>
                              )}
                              {mExcedente > 0 && (
                                <div className="flex items-start gap-2.5 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                                  <Zap size={14} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                                  <p className="text-xs text-green-700 dark:text-green-400">
                                    Excedente estimado: <strong>{mExcedente.toLocaleString("pt-PT")} kWh/ano</strong>
                                    {" "}({Math.round(mExcedente / sizing.consumoAnualAjustado * 100)}% do consumo) — disponível para injeção na rede.
                                  </p>
                                </div>
                              )}
                            </div>

                            {inverters && inverters.length > 0 && (
                              <div>
                                <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Compatibilidade Inversores</p>
                                <div className="space-y-1.5">
                                  {inverters
                                    .filter(i => i.potenciaAc >= mPotInstalada * 0.75 && i.potenciaAc <= mPotInstalada * 1.35)
                                    .slice(0, 4)
                                    .map(i => {
                                      const ratio = i.potenciaAc / mPotInstalada;
                                      const ok = ratio >= 0.85 && ratio <= 1.25;
                                      return (
                                        <div key={i.id} className={cn(
                                          "flex items-center justify-between px-3 py-2 rounded-lg border text-xs",
                                          ok ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                                             : "border-border bg-muted/30"
                                        )}>
                                          <span className="font-medium">{i.fabricante} {i.nome}</span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground">{i.potenciaAc} kW AC</span>
                                            <Badge variant="outline" className={cn("text-[10px] px-1.5", ok
                                              ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
                                              : "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700")}>
                                              {ok ? "✓ Adequado" : "≈ Marginal"}
                                            </Badge>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  {inverters.filter(i => i.potenciaAc >= mPotInstalada * 0.75 && i.potenciaAc <= mPotInstalada * 1.35).length === 0 && (
                                    <p className="text-xs text-muted-foreground">Nenhum inversor compatível no catálogo. Necessário ≥ {(mPotInstalada * 0.85).toFixed(1)} kW AC.</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {isManualModified && (
                              <div className="flex justify-end pt-1">
                                <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground"
                                  onClick={() => setManual({
                                    numPaineis: (activeCenario ?? sizing).numPaineis, potenciaWp: 400, hsp: sizing.hsp,
                                    rendimento: sizing.fatorRendimento,
                                    capacidadeBateria: (activeCenario ?? sizing).capacidadeBateriaRecomendada ?? 0,
                                    coberturaMeta: consumoData.coberturaMeta,
                                  })}>
                                  <RotateCcw size={12} /> Repor Automático
                                </Button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </CardContent>
                  )}
                </Card>
              )}

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
          {(effectiveSizing ?? sizing) && (() => {
            const eff = (effectiveSizing ?? sizing)!;
            return (
              <div className="flex flex-wrap gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-primary" />
                  <span className="text-sm font-medium">{eff.potenciaInstalada} kWp instalados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sun size={16} className="text-primary" />
                  <span className="text-sm font-medium">
                    {eff.numPaineis} painéis{isManualModified && manual ? ` de ${manual.potenciaWp} Wp` : " de 400 Wp"}
                  </span>
                </div>
                {eff.capacidadeBateriaRecomendada && (
                  <div className="flex items-center gap-2">
                    <Battery size={16} className="text-amber-500" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Bateria: {eff.capacidadeBateriaRecomendada} kWh
                    </span>
                  </div>
                )}
                {isManualModified && (
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-primary" />
                    <span className="text-xs text-primary font-medium">Valores ajustados manualmente</span>
                  </div>
                )}
              </div>
            );
          })()}

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
                      {(effectiveSizing ?? sizing) && (equipForm.watch("panelId") ?? 0) > 0 && (() => {
                        const eff = (effectiveSizing ?? sizing)!;
                        const panel = panels?.find(p => p.id === equipForm.watch("panelId"));
                        if (!panel) return null;
                        const n   = Math.ceil((eff.potenciaInstalada * 1000) / panel.potencia);
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
