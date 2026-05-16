import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, MapPin, Settings2, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown,
  Loader2, Sun, Battery, BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  Clock, Lightbulb, ArrowRight, Calculator, SlidersHorizontal, RotateCcw, Target, Euro,
  Save, HistoryIcon, Plus, Trash2,
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
import {
  saveDraft, loadDraft, clearDraft, draftAge,
  syncDraftToDb, loadDraftFromDb, clearDraftFromDb,
  getOrCreateSessionId,
  type WizardDraftData,
} from "@/lib/wizard-draft";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

import WizardStep1, { ConsumoData, DEFAULT_CONSUMO_DATA } from "@/components/wizard-step1";
import WizardStep1Cliente, {
  clienteSchema, localizacaoSchema,
  type ClienteForm, type LocalizacaoForm,
} from "@/components/wizard-step1-cliente";
// ── Code-split heavy step components ─────────────────────────────────────────
const WizardStep3Perfil          = lazy(() => import("@/components/wizard-step3-perfil"));
const WizardSugestoesInversor    = lazy(() => import("@/components/wizard-sugestoes-inversor"));
const WizardStep5Tecnica         = lazy(() => import("@/components/wizard-step5-tecnica"));
const WizardStep6MultiTecnica = lazy(() => import("@/components/wizard-step6-multi-tecnica"));
const WizardStep7Financeiro   = lazy(() => import("@/components/wizard-step7-financeiro"));
const WizardOrcamento         = lazy(() => import("@/components/wizard-orcamento"));
import { type OrcamentoState, defaultOrcamentoState } from "@/lib/orcamento";
import { type InverterUnit, criarUnidade } from "@/lib/multi-inverter";
const WizardStep1Upgrade       = lazy(() => import("@/components/wizard-step1-upgrade"));
const WizardStep6UpgradeAnalise = lazy(() => import("@/components/wizard-step6-upgrade-analise"));
const WizardCenarios            = lazy(() => import("@/components/wizard-cenarios"));
import {
  type TipoProjeto, type InstalacaoExistente,
  defaultInstalacaoExistente,
  TIPO_PROJETO_LABELS, TIPO_PROJETO_DESC,
} from "@/lib/upgrade";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type CenarioTipo = "conservador" | "equilibrado" | "agressivo";

const CENARIO_META: Record<CenarioTipo, { label: string; Icon: React.ElementType; accent: string; border: string; bg: string }> = {
  conservador: { label: "Económico",   Icon: TrendingDown, accent: "text-blue-600 dark:text-blue-400",      border: "border-blue-200 dark:border-blue-700",      bg: "bg-blue-50/60 dark:bg-blue-950/20" },
  equilibrado:  { label: "Equilibrado", Icon: Target,       accent: "text-primary",                          border: "border-primary/40",                         bg: "bg-primary/5" },
  agressivo:   { label: "Premium",     Icon: TrendingUp,   accent: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700", bg: "bg-emerald-50/60 dark:bg-emerald-950/20" },
};

// ─── Schemas ──────────────────────────────────────────────────────────────────
// localizacaoSchema and LocalizacaoForm are imported from wizard-step1-cliente

const equipamentosSchema = z.object({
  panelId:   z.coerce.number().min(1, "Selecione um painel"),
  inverterId: z.coerce.number().min(1, "Selecione um inversor"),
  batteryId: z.coerce.number().optional(),
});

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
  alertas?: Array<{ tipo: "info" | "aviso" | "erro"; mensagem: string }>;
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
  { id: 1, label: "Cliente",        icon: MapPin },
  { id: 2, label: "Consumos",       icon: Zap },
  { id: 3, label: "Perfil",         icon: Target },
  { id: 4, label: "Pré-dim. FV",    icon: BarChart3 },
  { id: 5, label: "Equipamentos",   icon: Settings2 },
  { id: 6, label: "Técnica",        icon: CheckCircle2 },
  { id: 7, label: "Poupança",       icon: Euro },
  { id: 8, label: "Orçamento",      icon: Save },
];

const STEP_TITLES = [
  "Cliente e Localização",
  "Análise de Consumos",
  "Perfil de Autoconsumo",
  "Pré-dimensionamento FV",
  "Seleção de Equipamentos",
  "Análise Técnica",
  "Estudo de Poupança e Retorno",
  "Orçamento / Proposta PDF",
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
  const [numPaineisStep5, setNumPaineisStep5] = useState<number | null>(null);
  const [manualMpptConfig, setManualMpptConfig] = useState<import("@/lib/string-sizing").MpptConfig | null>(null);
  const [inverterUnits, setInverterUnits] = useState<InverterUnit[]>([]);
  const [tipoProjeto, setTipoProjeto] = useState<TipoProjeto>("nova");
  const [instalacaoExistente, setInstalacaoExistente] = useState<InstalacaoExistente>(defaultInstalacaoExistente);
  const [investimentoManual, setInvestimentoManual] = useState<number | null>(null);
  const [orcamentoState, setOrcamentoState] = useState<OrcamentoState | null>(null);
  const [lastSaved, setLastSaved]   = useState<Date | null>(null);
  const [dbSynced, setDbSynced]     = useState(false);
  const sessionId = useRef<string>(getOrCreateSessionId());
  const saveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbSyncTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: panels }    = useListPanels();
  const { data: inverters } = useListInverters();
  const { data: batteries } = useListBatteries();
  const { data: locations } = useListLocations();
  const createProposal      = useCreateProposal();

  const [perfilDiurnoPct, setPerfilDiurnoPct] = useState(60);

  const clienteForm = useForm<ClienteForm>({ resolver: zodResolver(clienteSchema), defaultValues: { tipoCliente: "particular", morada: "", tipoTarifa: "simples", potenciaContratada: 3.45 } });
  const locForm     = useForm<LocalizacaoForm>({ resolver: zodResolver(localizacaoSchema), defaultValues: { latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 } });
  const equipForm   = useForm<EquipamentosForm>({ resolver: zodResolver(equipamentosSchema), defaultValues: {} });

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

  // ── Initialise orçamento when entering step 8 ────────────────────────────
  useEffect(() => {
    if (step !== 8 || orcamentoState !== null) return;
    const eq = equipForm.getValues();
    const panel    = panels?.find(p => p.id === eq.panelId);
    const inverter = inverters?.find(i => i.id === eq.inverterId);
    const battery  = eq.batteryId ? batteries?.find(b => b.id === eq.batteryId) : null;
    const numPaineis = numPaineisStep5 ?? effectiveSizing?.numPaineis ?? sizing?.numPaineis ?? 0;
    const investimento = investimentoManual ?? activeCenario?.investimentoEstimado ?? 0;
    setOrcamentoState(defaultOrcamentoState({
      panelNome:        panel?.nome,
      panelFabricante:  panel?.fabricante,
      panelPotencia:    panel?.potencia ? Number(panel.potencia) : undefined,
      inversorNome:     inverter?.nome,
      inversorFabricante: inverter?.fabricante,
      bateriaNome:      battery?.nome,
      bateriaFabricante: battery?.fabricante,
      numeroPaineis:    numPaineis,
      investimentoTotal: investimento,
      moradaInstalacao: clienteForm.getValues("morada"),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Draft: check on mount (localStorage → DB fallback) ────────────────────
  useEffect(() => {
    const local = loadDraft();
    if (local && (local.step > 1 || local.sizing !== null)) {
      setPendingDraft(local);
      setShowRecovery(true);
      return;
    }
    // No local draft — try remote
    loadDraftFromDb(sessionId.current).then(remote => {
      if (remote && (remote.step > 1 || remote.sizing !== null)) {
        setPendingDraft(remote);
        setShowRecovery(true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-enable battery when project type is "adicionarBateria" ──────────
  useEffect(() => {
    if (tipoProjeto === "bateria") {
      setConsumoData(prev => prev.incluirBateria ? prev : { ...prev, incluirBateria: true });
    }
  }, [tipoProjeto]);

  // ── Draft: auto-save localStorage (800ms) + DB sync (4s) ─────────────────
  useEffect(() => {
    if (saveTimerRef.current)   clearTimeout(saveTimerRef.current);
    if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);

    const snapshot = {
      step,
      consumoData: consumoData as unknown as Record<string, unknown>,
      locData: locData as unknown as Record<string, unknown> | null,
      sizing: sizing as unknown as Record<string, unknown> | null,
      selectedCenarioTipo,
      manual: manual as unknown as Record<string, unknown> | null,
      showManualAdjust,
      equipFormValues: equipForm.getValues(),
    };

    // localStorage — fast (800ms)
    saveTimerRef.current = setTimeout(() => {
      saveDraft(snapshot);
      setLastSaved(new Date());
    }, 800);

    // DB — deferred (4s), fire-and-forget
    dbSyncTimerRef.current = setTimeout(() => {
      const saved = loadDraft();
      if (saved) {
        syncDraftToDb(saved, sessionId.current).then(() => setDbSynced(true));
      }
    }, 4_000);

    return () => {
      if (saveTimerRef.current)   clearTimeout(saveTimerRef.current);
      if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, consumoData, locData, sizing, selectedCenarioTipo, manual, showManualAdjust]);

  // Currently selected sizing scenario
  const activeCenario: AutoSizeCenario | null = useMemo(() => {
    if (!sizing?.cenariosDimensionamento) return null;
    return sizing.cenariosDimensionamento.find(c => c.tipo === selectedCenarioTipo) ?? null;
  }, [sizing, selectedCenarioTipo]);

  // Switch scenario and reset manual to match; pre-populate recommended equipment
  const selectCenario = useCallback((tipo: CenarioTipo) => {
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
  }, [sizing, consumoData.coberturaMeta, equipForm]);

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

  // ── Financial projections for orçamento estudo ─────────────────────────────
  const PRECO_INJECAO_ORC = 0.06;
  const estudoFinanceiro = useMemo(() => {
    if (!activeCenario) return null;
    const { potenciaInstalada, energiaAnualEstimada, autoconsumoPerc, autoconsumoAnual,
            poupancaAnual, paybackAnos, excessoAnual } = activeCenario;
    const receitaExcedente = excessoAnual * PRECO_INJECAO_ORC;
    const investimento = investimentoManual ?? activeCenario.investimentoEstimado;
    let poupancaAcum = -investimento;
    let npvAcum = -investimento;
    let p10 = 0, p15 = 0, p25 = 0, npv25 = 0, paybackReal = paybackAnos;
    for (let ano = 1; ano <= 25; ano++) {
      const d = Math.pow(1 - 0.005, ano - 1);
      const t = Math.pow(1 + 0.03, ano - 1);
      const fluxo = poupancaAnual * d * t + receitaExcedente * d;
      poupancaAcum += fluxo;
      npvAcum += fluxo / Math.pow(1 + 0.04, ano);
      if (poupancaAcum >= 0 && paybackReal === paybackAnos) paybackReal = ano;
      if (ano === 10) p10 = poupancaAcum;
      if (ano === 15) p15 = poupancaAcum;
      if (ano === 25) { p25 = poupancaAcum; npv25 = npvAcum; }
    }
    return {
      potenciaInstalada,
      numPaineis:        activeCenario.numPaineis,
      producaoAnual:     energiaAnualEstimada,
      autoconsumoAnual,
      excessoAnual,
      autoconsumoPerc,
      poupancaAnual:     Math.round(poupancaAnual + receitaExcedente),
      paybackAnos:       paybackReal,
      investimento,
      poupanca10:        Math.round(p10),
      poupanca15:        Math.round(p15),
      poupanca25:        Math.round(p25),
      npv25:             Math.round(npv25),
      co2Anual:          Math.round(autoconsumoAnual * 0.253 / 1000 * 10) / 10,
    };
  }, [activeCenario, investimentoManual]);

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
    clearDraftFromDb(sessionId.current);
    setDbSynced(false);
    setShowRecovery(false);
    setPendingDraft(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetWizard = useCallback(() => {
    clearDraft();
    clearDraftFromDb(sessionId.current);
    setDbSynced(false);
    setConsumoData(DEFAULT_CONSUMO_DATA);
    setLocData(null);
    setSizing(null);
    setStep(1);
    setManual(null);
    setSelectedCenarioTipo("equilibrado");
    setShowManualAdjust(false);
    setLastSaved(null);
    setPerfilDiurnoPct(60);
    setManualMpptConfig(null);
    setInvestimentoManual(null);
    setOrcamentoState(null);
    clienteForm.reset({ tipoCliente: "particular", morada: "", tipoTarifa: "simples", potenciaContratada: 3.45 });
    locForm.reset({ latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 });
    equipForm.reset({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteForm, locForm, equipForm]);

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
  const handleSaveProposal = useCallback(() => {
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
  }, [effectiveSizing, sizing, panels, consumoData.consumoAnual, equipForm, createProposal, clearDraft, toast, navigate]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = async () => {
    if (step === 1) {
      // Validate both client data and location
      const clienteOk = await clienteForm.trigger();
      const locOk     = await locForm.trigger();
      if (!clienteOk || !locOk) return;
      setLocData(locForm.getValues());
      setStep(2);
    } else if (step === 2) {
      if (consumoData.consumoAnual < 100) {
        toast({ title: "Consumo deve ser ≥ 100 kWh", variant: "destructive" });
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Run auto-size with consumption + location data before showing study
      const loc = locData ?? locForm.getValues();
      await runAutoSize(consumoData, loc);
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    } else if (step === 5) {
      const vals = equipForm.getValues();
      const hasInverter = inverterUnits.length > 0
        ? inverterUnits.some(u => u.inverterId > 0)
        : Boolean(vals.inverterId);
      if (!vals.panelId || !hasInverter) {
        toast({ title: "Selecione pelo menos um painel e um inversor", variant: "destructive" });
        return;
      }
      if (inverterUnits.length > 0 && inverterUnits[0].inverterId) {
        equipForm.setValue("inverterId", inverterUnits[0].inverterId);
      }
      const eff = effectiveSizing ?? sizing;
      const selectedPanel = panels?.find(p => p.id === vals.panelId);
      const computed = eff
        ? Math.ceil((eff.potenciaInstalada * 1000) / (selectedPanel?.potencia ?? 400))
        : (manual?.numPaineis ?? 0);
      setNumPaineisStep5(computed);
      setStep(6);
    } else if (step === 6) {
      setStep(7);
    } else if (step === 7) {
      setStep(8);
    }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  const addInverterUnit = useCallback(() => {
    setInverterUnits(prev => {
      if (prev.length === 0) {
        const currentId = equipForm.getValues("inverterId");
        return [criarUnidade(currentId || 0), criarUnidade(0)];
      }
      return [...prev, criarUnidade(0)];
    });
  }, [equipForm]);

  const removeInverterUnit = useCallback((key: string) => {
    setInverterUnits(prev => prev.filter(u => u.key !== key));
  }, []);

  const updateInverterUnit = useCallback((key: string, changes: Partial<InverterUnit>) => {
    setInverterUnits(prev => {
      const next = prev.map(u => u.key === key ? { ...u, ...changes } : u);
      if (next[0]?.key === key && changes.inverterId != null) {
        equipForm.setValue("inverterId", changes.inverterId);
      }
      return next;
    });
  }, [equipForm]);

  const sliderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCoverageSlider = useCallback(([val]: number[]) => {
    if (sliderDebounceRef.current) clearTimeout(sliderDebounceRef.current);
    sliderDebounceRef.current = setTimeout(() => {
      const cenarios = sizing?.cenariosDimensionamento;
      if (!cenarios?.length) return;
      const nearest = cenarios.reduce((best, c) =>
        Math.abs(c.coberturaReal - val) < Math.abs(best.coberturaReal - val) ? c : best
      );
      selectCenario(nearest.tipo as CenarioTipo);
    }, 80);
  }, [sizing, selectCenario]);

  const handleMpptConfigChange = useCallback((config: import("@/lib/string-sizing").MpptConfig) => {
    if (inverterUnits.length === 1) {
      updateInverterUnit(inverterUnits[0].key, { mpptConfig: config });
    } else {
      setManualMpptConfig(config);
    }
  }, [inverterUnits, updateInverterUnit]);

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
                  no passo <strong>{pendingDraft?.step ?? 1}</strong> de 8.
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
            <span className="text-[11px] text-muted-foreground flex items-center gap-1" title={`Guardado localmente às ${lastSaved.toLocaleTimeString("pt-PT")}`}>
              <Save size={11} />
              {dbSynced ? "Guardado" : "Guardado localmente"}
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
      <div className="relative">
        <div className="absolute top-4 left-0 right-0 h-[2px] bg-border/60 rounded-full" />
        <div
          className="absolute top-4 left-0 h-[2px] bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div className="relative flex justify-between">
          {STEPS.map(s => {
            const active = step === s.id;
            const done   = step > s.id;
            return (
              <div key={s.id} className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-background",
                  done   ? "bg-primary border-primary text-primary-foreground shadow-sm" :
                  active ? "border-primary text-primary ring-4 ring-primary/10 shadow-sm" :
                           "border-border text-muted-foreground/50 bg-muted/20",
                )}>
                  {done
                    ? <CheckCircle2 size={13} />
                    : <span className="text-[11px] font-bold leading-none">{s.id}</span>
                  }
                </div>
                <span className={cn(
                  "text-[10px] font-medium hidden sm:block text-center leading-tight",
                  active ? "text-primary font-semibold" :
                  done   ? "text-muted-foreground" : "text-muted-foreground/40",
                )}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step section header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-l-2 border-primary pl-3 py-0.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">
            Passo {step} de {STEPS.length}
          </p>
          <h2 className="text-base font-semibold text-foreground leading-tight">
            {STEP_TITLES[step - 1]}
          </h2>
        </div>
      </div>

      <Suspense fallback={
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-72 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </CardContent>
        </Card>
      }>

      <div key={step} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      {/* ── STEP 1: Cliente e Localização ───────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Tipo de Projeto */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 size={18} /> Tipo de Projeto
              </CardTitle>
              <CardDescription>Selecione o tipo de intervenção a dimensionar.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(["nova", "upgrade", "expansao", "bateria", "substituicao"] as const).map(tipo => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setTipoProjeto(tipo)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                      tipoProjeto === tipo
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted/40",
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      tipoProjeto === tipo ? "bg-primary" : "bg-muted-foreground/30",
                    )} />
                    <div>
                      <div className="text-sm font-medium">{TIPO_PROJETO_LABELS[tipo]}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{TIPO_PROJETO_DESC[tipo]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Existing installation form — shown for all non-nova types */}
          {tipoProjeto !== "nova" && (
            <WizardStep1Upgrade
              tipoProjeto={tipoProjeto}
              data={instalacaoExistente}
              onChange={setInstalacaoExistente}
              panels={panels ?? []}
              inverters={inverters ?? []}
            />
          )}

          <WizardStep1Cliente clienteForm={clienteForm} locForm={locForm} />
        </div>
      )}

      {/* ── STEP 2: Análise de Consumos ──────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap size={20} /> Análise de Consumos</CardTitle>
            <CardDescription>
              Carregue faturas elétricas para análise automática com IA, ou introduza os valores manualmente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WizardStep1 data={consumoData} onChange={setConsumoData} />
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Perfil de Autoconsumo ───────────────────────────────────── */}
      {step === 3 && (
        <WizardStep3Perfil
          consumoData={consumoData}
          onConsumoChange={setConsumoData}
          consumoDiurnoPct={perfilDiurnoPct}
          onDiurnoChange={setPerfilDiurnoPct}
        />
      )}

      {/* ── STEP 4: Pré-Dimensionamento FV ─────────────────────────────────── */}
      {step === 4 && (
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
                          onValueChange={handleCoverageSlider}
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

              {/* ── Scenario comparison (Económico / Equilibrado / Premium) ── */}
              {sizing.cenariosDimensionamento && sizing.cenariosDimensionamento.length > 0 && (
                <Suspense fallback={
                  <div className="flex justify-center py-8">
                    <Loader2 size={28} className="animate-spin text-muted-foreground" />
                  </div>
                }>
                  <WizardCenarios
                    cenarios={sizing.cenariosDimensionamento}
                    recomendado={sizing.recomendado}
                    selectedTipo={selectedCenarioTipo}
                    coberturaMeta={consumoData.coberturaMeta}
                    onSelect={selectCenario}
                  />
                </Suspense>
              )}

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

      {/* ── STEP 5: Seleção de Equipamentos ─────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          {/* Existing system reference banner (upgrade mode) */}
          {tipoProjeto !== "nova" && instalacaoExistente.potenciaFVkWp > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="py-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Settings2 size={13} /> Instalação Existente (referência)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { label: "FV existente",  val: `${instalacaoExistente.potenciaFVkWp} kWp` },
                    { label: "Painéis",       val: instalacaoExistente.numPaineis > 0 ? `${instalacaoExistente.numPaineis} un.` : "—" },
                    { label: "Inversor AC",   val: instalacaoExistente.potenciaACkW > 0 ? `${instalacaoExistente.potenciaACkW} kW` : "—" },
                    { label: "Produção/ano",  val: instalacaoExistente.producaoAnualkWh > 0 ? `${instalacaoExistente.producaoAnualkWh.toLocaleString("pt-PT")} kWh` : "—" },
                  ].map(r => (
                    <div key={r.label} className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-2.5">
                      <div className="font-semibold text-amber-900 dark:text-amber-200">{r.val}</div>
                      <div className="text-muted-foreground">{r.label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Selecione os <strong>novos equipamentos a adicionar</strong> nos campos abaixo.
                </p>
              </CardContent>
            </Card>
          )}
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

          {/* ── Auto inverter suggestions ── */}
          {(effectiveSizing ?? sizing) && inverters && inverters.length > 0 && (
            <Suspense fallback={
              <div className="flex justify-center py-6">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            }>
              <WizardSugestoesInversor
                potenciaKwp={(effectiveSizing ?? sizing)!.potenciaInstalada}
                inverters={inverters}
                selectedInverterId={inverterUnits.length === 0 ? equipForm.watch("inverterId") : undefined}
                inverterUnits={inverterUnits}
                onSelectInverter={id => {
                  equipForm.setValue("inverterId", id);
                  setInverterUnits([]);
                }}
                onSelectMultiInverter={units => {
                  setInverterUnits(units);
                  if (units.length > 0) equipForm.setValue("inverterId", units[0].inverterId);
                }}
              />
            </Suspense>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 size={20} /> Seleção do Catálogo</CardTitle>
              <CardDescription>Confirme ou ajuste a seleção automática acima. O painel solar é sempre obrigatório.</CardDescription>
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

                  {/* ── Inversores (single or multi) ── */}
                  {inverterUnits.length === 0 ? (
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
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground">Inversores com ✓ têm potência adequada ao estudo</p>
                          <button
                            type="button"
                            className="text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                            onClick={addInverterUnit}
                          >
                            + Adicionar segundo inversor
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Inversores *</span>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addInverterUnit}>
                          <Plus size={12} /> Adicionar inversor
                        </Button>
                      </div>
                      {inverterUnits.map((unit, idx) => (
                        <div key={unit.key} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{idx + 1}.</span>
                          <Select
                            value={unit.inverterId ? String(unit.inverterId) : ""}
                            onValueChange={v => updateInverterUnit(unit.key, { inverterId: Number(v) })}
                          >
                            <SelectTrigger className="flex-1 h-9">
                              <SelectValue placeholder="Selecionar inversor..." />
                            </SelectTrigger>
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
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">×</span>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={unit.quantidade}
                              onChange={e => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v) && v >= 1) updateInverterUnit(unit.key, { quantidade: v });
                              }}
                              className="w-14 h-9 text-center px-1"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeInverterUnit(unit.key)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                      {/* Global AC/DC totals */}
                      {inverters && (() => {
                        const totalAC = inverterUnits.reduce((s, u) => {
                          const inv = inverters.find(i => i.id === u.inverterId);
                          return s + (inv ? Number(inv.potenciaAc) * u.quantidade : 0);
                        }, 0);
                        const totalDC = inverterUnits.reduce((s, u) => {
                          const inv = inverters.find(i => i.id === u.inverterId);
                          return s + (inv ? Number(inv.potenciaDcMax) * u.quantidade : 0);
                        }, 0);
                        if (totalAC === 0) return null;
                        return (
                          <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-lg text-xs">
                            <div>
                              <span className="text-muted-foreground">Total AC: </span>
                              <span className="font-semibold">{totalAC.toFixed(1)} kW</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">DC máx. total: </span>
                              <span className="font-semibold">{totalDC.toFixed(1)} kW</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

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

      {/* ── STEP 6: Análise Técnica ─────────────────────────────────────────── */}
      {step === 6 && (() => {
        const vals = equipForm.getValues();
        const eff = effectiveSizing ?? sizing;
        const panel = panels?.find(p => p.id === vals.panelId) ?? null;
        // In multi-inverter mode use the first unit's inverterId; fall back to form field
        const effectiveInverterId = inverterUnits.length > 0 ? inverterUnits[0].inverterId : vals.inverterId;
        const inverter = inverters?.find(i => i.id === effectiveInverterId) ?? null;
        const battery = vals.batteryId ? batteries?.find(b => b.id === vals.batteryId) ?? null : null;
        const numPaineis = numPaineisStep5 ?? 0;
        const potenciaRealKwp = panel ? (numPaineis * Number(panel.potencia)) / 1000 : (eff?.potenciaInstalada ?? 0);
        const isMultiInverter = inverterUnits.length > 1;

        return (
          <div className="space-y-4">
            {/* Editable configuration bar */}
            <div className="flex flex-wrap items-center gap-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <div className="flex items-center gap-2 shrink-0">
                <Zap size={16} className="text-primary" />
                <span className="text-sm font-medium">{potenciaRealKwp.toFixed(2)} kWp</span>
              </div>
              <div className="flex items-center gap-2">
                <Sun size={16} className="text-primary shrink-0" />
                <label className="text-sm font-medium shrink-0">Painéis:</label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={numPaineis}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 0) setNumPaineisStep5(v);
                  }}
                  className="w-20 h-7 text-sm text-center px-1"
                />
              </div>
              {eff && panel && numPaineis !== Math.ceil((eff.potenciaInstalada * 1000) / Number(panel.potencia)) && (
                <button
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  onClick={() => setNumPaineisStep5(Math.ceil((eff.potenciaInstalada * 1000) / Number(panel.potencia)))}
                >
                  Repor sugestão ({Math.ceil((eff.potenciaInstalada * 1000) / Number(panel.potencia))} painéis)
                </button>
              )}
            </div>

            {/* Upgrade analysis (shown before technical analysis in upgrade mode) */}
            {tipoProjeto !== "nova" && instalacaoExistente.potenciaFVkWp > 0 && (
              <WizardStep6UpgradeAnalise
                tipoProjeto={tipoProjeto}
                existente={instalacaoExistente}
                novaPotenciaFVkWp={potenciaRealKwp}
                novoInversor={inverter}
                novoPanel={panel}
                precoKwh={consumoData.precoKwh ?? 0.18}
                investimentoUpgrade={investimentoManual ?? activeCenario?.investimentoEstimado ?? 0}
                existingPanel={instalacaoExistente.panelId ? panels?.find(p => p.id === instalacaoExistente.panelId) ?? null : null}
                existingInverter={instalacaoExistente.inverterId ? inverters?.find(i => i.id === instalacaoExistente.inverterId) ?? null : null}
              />
            )}

            {isMultiInverter ? (
              <WizardStep6MultiTecnica
                panel={panel}
                inverterUnits={inverterUnits}
                allInverters={inverters ?? []}
                battery={battery}
                numPaineisTotais={numPaineis}
                onUnitChange={updateInverterUnit}
              />
            ) : (
              <WizardStep5Tecnica
                panel={panel}
                inverter={inverter}
                battery={battery}
                numPaineis={numPaineis}
                potenciaInstalada={potenciaRealKwp}
                onNumPaineisChange={setNumPaineisStep5}
                mpptConfig={inverterUnits.length === 1 ? inverterUnits[0].mpptConfig : manualMpptConfig}
                onMpptConfigChange={handleMpptConfigChange}
              />
            )}

            <Card className="border-green-500/30 bg-green-50/30 dark:bg-green-950/10">
              <CardContent className="pt-5 pb-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Guardar como Proposta Técnica</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Cria uma proposta com o estudo, equipamentos e análise técnica</p>
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
        );
      })()}

      {/* ── STEP 7: Estudo de Poupança e Retorno ─────────────────────────────── */}
      {step === 7 && activeCenario && (
        <div className="space-y-4">
          {/* Upgrade savings comparison card */}
          {tipoProjeto !== "nova" && instalacaoExistente.producaoAnualkWh > 0 && (() => {
            const producaoAdd = activeCenario.energiaAnualEstimada ?? 0;
            const precoKwhUpg = consumoData.precoKwh ?? 0.18;
            const poupancaAdd = producaoAdd * precoKwhUpg;
            const invest = investimentoManual ?? activeCenario.investimentoEstimado;
            const payback = poupancaAdd > 0 && invest > 0 ? invest / poupancaAdd : null;
            return (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp size={15} className="text-amber-600" />
                    Comparativo de Poupança — Situação Actual vs. Upgrade
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        label: "Situação Actual",
                        prod: `${instalacaoExistente.producaoAnualkWh.toLocaleString("pt-PT")} kWh/ano`,
                        delta: null,
                        cls: "bg-muted/40",
                      },
                      {
                        label: "Ganho do Upgrade",
                        prod: `+${producaoAdd.toLocaleString("pt-PT")} kWh/ano`,
                        delta: `+${poupancaAdd.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €/ano`,
                        cls: "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800",
                      },
                      {
                        label: "Total Pós Upgrade",
                        prod: `${(instalacaoExistente.producaoAnualkWh + producaoAdd).toLocaleString("pt-PT")} kWh/ano`,
                        delta: payback != null
                          ? `Payback upgrade: ${payback.toFixed(1)} anos`
                          : "Defina o investimento abaixo",
                        cls: "bg-primary/5 border border-primary/20",
                      },
                    ].map(r => (
                      <div key={r.label} className={cn("rounded-xl p-4", r.cls)}>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{r.label}</p>
                        <p className="text-lg font-bold mt-1">{r.prod}</p>
                        {r.delta && <p className="text-xs text-muted-foreground mt-0.5">{r.delta}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          <WizardStep7Financeiro
            cenario={activeCenario}
            precoKwh={consumoData.precoKwh ?? 0.18}
            consumoAnual={consumoData.consumoAnual}
            consumoDiurnoPct={perfilDiurnoPct}
            investimento={investimentoManual ?? undefined}
            onInvestimentoChange={setInvestimentoManual}
          />
        </div>
      )}
      {step === 7 && !activeCenario && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>Sem estudo de dimensionamento. Regresse ao passo 4 para calcular.</p>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 8: Proposta Técnica ─────────────────────────────────────────── */}
      {step === 8 && (
        <div className="space-y-4">
          {/* Sizing summary */}
          {(effectiveSizing ?? sizing) && (() => {
            const eff = (effectiveSizing ?? sizing)!;
            const eq  = equipForm.getValues();
            const panel    = panels?.find(p => p.id === eq.panelId);
            const inverter = inverters?.find(i => i.id === eq.inverterId);
            const battery  = eq.batteryId ? batteries?.find(b => b.id === eq.batteryId) : null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CheckCircle2 size={20} /> Resumo da Proposta</CardTitle>
                  <CardDescription>Verifique todos os dados antes de guardar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Potência instalada",  val: `${eff.potenciaInstalada} kWp` },
                      { label: "Nº de painéis",       val: `${eff.numPaineis} un.` },
                      { label: "Produção anual est.", val: `${eff.energiaAnualEstimada.toLocaleString("pt-PT")} kWh` },
                      { label: "Painel",              val: panel ? `${panel.fabricante} ${panel.nome}` : "—" },
                      { label: "Inversor",            val: inverter ? `${inverter.fabricante} ${inverter.nome}` : "—" },
                      { label: "Bateria",             val: battery ? `${battery.fabricante} ${battery.nome}` : "Sem bateria" },
                    ].map(item => (
                      <div key={item.label} className="bg-muted/40 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-semibold mt-0.5">{item.val}</p>
                      </div>
                    ))}
                  </div>
                  {activeCenario && (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Investimento est.", val: `${activeCenario.investimentoEstimado.toLocaleString("pt-PT")} €` },
                        { label: "Poupança/ano",      val: `${activeCenario.poupancaAnual.toLocaleString("pt-PT")} €` },
                        { label: "Payback simples",   val: `${activeCenario.paybackAnos} anos` },
                      ].map(item => (
                        <div key={item.label} className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="text-base font-bold text-primary mt-0.5">{item.val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <Card className="border-green-500/30 bg-green-50/30 dark:bg-green-950/10">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Guardar como Proposta Técnica</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Cria uma proposta com o estudo, equipamentos e análise técnica</p>
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

          {/* ── Resumo do Upgrade ───────────────────────────────────────── */}
          {tipoProjeto !== "nova" && instalacaoExistente.potenciaFVkWp > 0 && (() => {
            const eq8 = equipForm.getValues();
            const panelUpg = panels?.find(p => p.id === eq8.panelId);
            const potNovakWp = panelUpg && numPaineisStep5
              ? (numPaineisStep5 * Number(panelUpg.potencia)) / 1000
              : (effectiveSizing?.potenciaInstalada ?? 0);
            const producaoAdd = effectiveSizing?.energiaAnualEstimada ?? activeCenario?.energiaAnualEstimada ?? 0;
            const precoKwhUpg = consumoData.precoKwh ?? 0.18;
            const poupancaAdd = producaoAdd * precoKwhUpg;
            const invest = investimentoManual ?? activeCenario?.investimentoEstimado ?? 0;
            const payback = poupancaAdd > 0 && invest > 0 ? invest / poupancaAdd : null;
            return (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp size={18} className="text-amber-600" />
                    Resumo do Upgrade — Situação Actual vs. Proposta
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    {[
                      {
                        label: "Situação Actual",
                        items: [
                          `${instalacaoExistente.potenciaFVkWp} kWp instalados`,
                          instalacaoExistente.numPaineis > 0 ? `${instalacaoExistente.numPaineis} painéis` : "—",
                          instalacaoExistente.producaoAnualkWh > 0
                            ? `${instalacaoExistente.producaoAnualkWh.toLocaleString("pt-PT")} kWh/ano`
                            : "—",
                        ],
                      },
                      {
                        label: "Solução Proposta",
                        items: [
                          `+${potNovakWp.toFixed(2)} kWp novos`,
                          `Total: ${(instalacaoExistente.potenciaFVkWp + potNovakWp).toFixed(2)} kWp`,
                          `+${producaoAdd.toLocaleString("pt-PT")} kWh/ano (est.)`,
                        ],
                      },
                      {
                        label: "Ganho Estimado",
                        items: [
                          `+${poupancaAdd.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €/ano`,
                          invest > 0 ? `Investimento: ${invest.toLocaleString("pt-PT")} €` : "Investimento: —",
                          payback != null ? `Payback: ${payback.toFixed(1)} anos` : "Payback: defina o investimento",
                        ],
                      },
                    ].map(col => (
                      <div key={col.label} className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{col.label}</p>
                        {col.items.map((item, i) => (
                          <p key={i} className="text-sm font-medium">{item}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Orçamento Comercial ──────────────────────────────────────── */}
          {orcamentoState && (
            <WizardOrcamento
              state={orcamentoState}
              onChange={setOrcamentoState}
              estudo={estudoFinanceiro}
            />
          )}
        </div>
      )}

      </div>
      </Suspense>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50 gap-4">
        <Button
          variant="outline"
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
          className="gap-1.5"
        >
          <ChevronLeft size={15} /> Anterior
        </Button>
        <span className="text-xs text-muted-foreground font-medium tabular-nums shrink-0">
          {step} de {STEPS.length}
        </span>
        {step < 8 ? (
          <Button onClick={goNext} disabled={isSizing} className="gap-1.5">
            {isSizing && <Loader2 size={15} className="animate-spin" />}
            {step === 3 ? "Calcular" : step === 5 ? "Análise Técnica" : step === 7 ? "Gerar Orçamento" : "Seguinte"}
            {!isSizing && <ChevronRight size={15} />}
          </Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
