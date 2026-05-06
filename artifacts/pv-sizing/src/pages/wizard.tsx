import { useState, useRef } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Zap, MapPin, Settings2, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, Sun, Battery, BarChart3,
  AlertTriangle, TrendingUp, Clock, Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schemas ──────────────────────────────────────────────────────────────────
const consumoSchema = z.object({
  consumoAnual: z.coerce.number().min(100, "Consumo deve ser ≥ 100 kWh").max(500000),
  coberturaMeta: z.coerce.number().min(10).max(100),
  incluirBateria: z.boolean(),
  horasAutonomia: z.coerce.number().min(1).max(24),
});
const localizacaoSchema = z.object({
  latitude: z.coerce.number().min(36).max(42.5),
  longitude: z.coerce.number().min(-10).max(-6),
  inclinacao: z.coerce.number().min(0).max(90),
  azimute: z.coerce.number().min(-180).max(180),
});
const equipamentosSchema = z.object({
  panelId: z.coerce.number().min(1, "Selecione um painel"),
  inverterId: z.coerce.number().min(1, "Selecione um inversor"),
  batteryId: z.coerce.number().optional(),
});

type ConsumoForm = z.infer<typeof consumoSchema>;
type LocalizacaoForm = z.infer<typeof localizacaoSchema>;
type EquipamentosForm = z.infer<typeof equipamentosSchema>;

interface AutoSizeResult {
  potenciaRecomendada: number;
  numPaineis: number;
  energiaAnualEstimada: number;
  coberturaPrevista: number;
  capacidadeBateriaRecomendada: number | null;
  hsp: number;
  fatorRendimento: number;
  explicacao: string;
}

interface InvoiceData {
  consumoMensal?: number;
  consumoAnual?: number;
  potenciaContratada?: number;
  precoKwh?: number;
  operador?: string;
  tarifario?: string;
  confianca: number;
  notas?: string;
}

const STEPS = [
  { id: 1, label: "Consumo",     icon: Zap },
  { id: 2, label: "Localização", icon: MapPin },
  { id: 3, label: "Estudo",      icon: BarChart3 },
  { id: 4, label: "Equipamentos",icon: Settings2 },
];

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [consumoData, setConsumoData] = useState<ConsumoForm | null>(null);
  const [locData, setLocData] = useState<LocalizacaoForm | null>(null);
  const [sizing, setSizing] = useState<AutoSizeResult | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [isParsingInvoice, setIsParsingInvoice] = useState(false);
  const [isSizing, setIsSizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: panels } = useListPanels();
  const { data: inverters } = useListInverters();
  const { data: batteries } = useListBatteries();
  const { data: locations } = useListLocations();
  const createProposal = useCreateProposal();

  // ── Step 1 form ──────────────────────────────────────────────────────────────
  const consumoForm = useForm<ConsumoForm>({
    resolver: zodResolver(consumoSchema),
    defaultValues: { consumoAnual: 3500, coberturaMeta: 80, incluirBateria: false, horasAutonomia: 4 },
  });

  // ── Step 2 form ──────────────────────────────────────────────────────────────
  const locForm = useForm<LocalizacaoForm>({
    resolver: zodResolver(localizacaoSchema),
    defaultValues: { latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 },
  });

  // ── Step 4 form ──────────────────────────────────────────────────────────────
  const equipForm = useForm<EquipamentosForm>({
    resolver: zodResolver(equipamentosSchema),
    defaultValues: {},
  });

  // ── Invoice upload ────────────────────────────────────────────────────────────
  const handleInvoiceUpload = async (file: File) => {
    setIsParsingInvoice(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`${BASE}/api/tools/parse-invoice`, { method: "POST", body: fd });
      if (!resp.ok) throw new Error("Erro ao analisar fatura");
      const data: InvoiceData = await resp.json();
      setInvoiceData(data);
      if (data.consumoAnual) consumoForm.setValue("consumoAnual", Math.round(data.consumoAnual));
      else if (data.consumoMensal) consumoForm.setValue("consumoAnual", Math.round(data.consumoMensal * 12));
      toast({
        title: `Fatura analisada (confiança: ${(data.confianca * 100).toFixed(0)}%)`,
        description: data.operador ? `Operador: ${data.operador}` : undefined,
      });
    } catch {
      toast({ title: "Erro ao ler fatura", variant: "destructive" });
    } finally {
      setIsParsingInvoice(false);
    }
  };

  // ── Auto-size call ────────────────────────────────────────────────────────────
  const runAutoSize = async (consumo: ConsumoForm, loc: LocalizacaoForm) => {
    setIsSizing(true);
    try {
      const resp = await fetch(`${BASE}/api/tools/auto-size`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumoAnual: Number(consumo.consumoAnual),
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          inclinacao: Number(loc.inclinacao),
          azimute: Number(loc.azimute),
          coberturaMeta: Number(consumo.coberturaMeta),
          incluirBateria: consumo.incluirBateria,
          horasAutonomia: Number(consumo.horasAutonomia),
        }),
      });
      if (!resp.ok) throw new Error("Erro no dimensionamento");
      const data: AutoSizeResult = await resp.json();
      setSizing(data);
    } catch {
      toast({ title: "Erro no dimensionamento automático", variant: "destructive" });
    } finally {
      setIsSizing(false);
    }
  };

  // ── Save proposal ─────────────────────────────────────────────────────────────
  const handleSaveProposal = () => {
    if (!consumoData || !sizing) return;
    const equipValues = equipForm.getValues();
    const selectedPanel = panels?.find(p => p.id === equipValues.panelId);
    const titulo = `Proposta ${selectedPanel?.fabricante ?? ""} ${sizing.potenciaRecomendada} kWp`;
    createProposal.mutate(
      {
        data: {
          titulo,
          consumoAnualEstimado: consumoData.consumoAnual,
          potenciaRecomendada: sizing.potenciaRecomendada,
          numPaineis: sizing.numPaineis,
          panelId: equipValues.panelId || null,
          inverterId: equipValues.inverterId || null,
          batteryId: equipValues.batteryId ?? null,
          producaoAnualEstimada: sizing.energiaAnualEstimada,
          alertas: [],
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Proposta guardada com sucesso!" });
          navigate("/propostas");
        },
        onError: () => toast({ title: "Erro ao guardar proposta", variant: "destructive" }),
      }
    );
  };

  // ── Navigation ────────────────────────────────────────────────────────────────
  const goNext = async () => {
    if (step === 1) {
      const ok = await consumoForm.trigger();
      if (!ok) return;
      setConsumoData(consumoForm.getValues());
      setStep(2);
    } else if (step === 2) {
      const ok = await locForm.trigger();
      if (!ok) return;
      const loc = locForm.getValues();
      setLocData(loc);
      const consumo = consumoForm.getValues();
      setConsumoData(consumo);
      await runAutoSize(consumo, loc);
      setStep(3);
    } else if (step === 3) {
      // Study → Equipment
      setStep(4);
    }
  };

  const goPrev = () => setStep(s => Math.max(1, s - 1));

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dimensionamento Automático</h1>
        <p className="text-muted-foreground mt-1">Wizard passo-a-passo para dimensionar o sistema solar.</p>
      </div>

      {/* Step indicators */}
      <div className="space-y-3">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id;
            return (
              <div key={s.id} className="flex flex-col items-center gap-1">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors",
                  done  ? "bg-primary border-primary text-primary-foreground" :
                  active ? "border-primary text-primary bg-primary/10" :
                  "border-muted text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <span className={cn(
                  "text-xs font-medium hidden sm:block",
                  active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
                )}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── STEP 1: Consumo ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap size={20} /> Consumo Energético</CardTitle>
            <CardDescription>Indique o consumo anual ou carregue uma fatura para extração automática com IA.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Invoice upload */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsingInvoice ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <p className="text-sm">A analisar fatura com IA...</p>
                </div>
              ) : invoiceData ? (
                <div className="flex flex-col items-center gap-2 text-green-600">
                  <FileText size={32} />
                  <p className="font-medium text-sm">Fatura analisada com sucesso</p>
                  <Badge variant="secondary">Confiança: {(invoiceData.confianca * 100).toFixed(0)}%</Badge>
                  {invoiceData.operador && (
                    <p className="text-xs text-muted-foreground">{invoiceData.operador} · {invoiceData.tarifario}</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload size={32} />
                  <p className="font-medium text-sm">Carregue uma fatura elétrica</p>
                  <p className="text-xs">PDF ou imagem — extração automática com IA</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInvoiceUpload(f); }}
              />
            </div>

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-muted" />
              <span className="mx-3 text-xs text-muted-foreground">ou introduza manualmente</span>
              <div className="flex-grow border-t border-muted" />
            </div>

            <Form {...consumoForm}>
              <form className="space-y-5">
                <FormField control={consumoForm.control} name="consumoAnual" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consumo Anual (kWh)</FormLabel>
                    <FormControl><Input type="number" step="10" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={consumoForm.control} name="coberturaMeta" render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center">
                      <FormLabel>Meta de Cobertura Solar</FormLabel>
                      <span className="text-sm font-bold text-primary">{field.value}%</span>
                    </div>
                    <FormControl>
                      <Slider min={10} max={100} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Percentagem do consumo anual a cobrir com solar</p>
                  </FormItem>
                )} />
                <FormField control={consumoForm.control} name="incluirBateria" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="cursor-pointer flex items-center gap-2">
                        <Battery size={16} className="text-amber-500" />
                        Incluir Armazenamento em Bateria
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">Dimensiona a capacidade de bateria necessária</p>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                {consumoForm.watch("incluirBateria") && (
                  <FormField control={consumoForm.control} name="horasAutonomia" render={({ field }) => (
                    <FormItem className="pl-4 border-l-2 border-amber-300">
                      <div className="flex justify-between items-center">
                        <FormLabel>Autonomia Pretendida</FormLabel>
                        <span className="text-sm font-bold text-amber-600">{field.value}h</span>
                      </div>
                      <FormControl>
                        <Slider min={1} max={24} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Horas de funcionamento sem sol</p>
                    </FormItem>
                  )} />
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Localização ── */}
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
                <Select onValueChange={(v) => {
                  const loc = locations.find(l => l.nome === v);
                  if (loc) {
                    locForm.setValue("latitude", loc.latitude);
                    locForm.setValue("longitude", loc.longitude);
                  }
                }}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecionar localidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(l => (
                      <SelectItem key={l.nome} value={l.nome}>{l.nome} — {l.regiao}</SelectItem>
                    ))}
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
                    <p className="text-xs text-muted-foreground">0° = horizontal, 90° = vertical</p>
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

      {/* ── STEP 3: Estudo ── */}
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
              {/* Main sizing result */}
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Sun size={22} /> Estudo de Dimensionamento
                  </CardTitle>
                  <CardDescription>
                    Resultado calculado para {consumoData?.consumoAnual?.toLocaleString("pt-PT")} kWh/ano · {consumoData?.coberturaMeta}% cobertura solar
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Key metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Potência a Instalar", value: `${sizing.potenciaRecomendada} kWp`, highlight: true, icon: Zap },
                      { label: "Nº de Painéis",        value: `≈ ${sizing.numPaineis} un.`,        highlight: true, icon: Sun },
                      { label: "Produção Anual Est.",  value: `${sizing.energiaAnualEstimada.toLocaleString("pt-PT")} kWh`, highlight: false, icon: TrendingUp },
                      { label: "Cobertura Prevista",   value: `${sizing.coberturaPrevista}%`,       highlight: false, icon: BarChart3 },
                    ].map(({ label, value, highlight, icon: Icon }) => (
                      <div key={label} className={cn(
                        "rounded-xl p-4 text-center border",
                        highlight ? "bg-primary/10 border-primary/30" : "bg-background border-border"
                      )}>
                        <Icon size={18} className={cn("mx-auto mb-2", highlight ? "text-primary" : "text-muted-foreground")} />
                        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                        <p className={cn("font-bold text-lg mt-1", highlight ? "text-primary" : "text-foreground")}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  {/* Technical details */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Horas de Sol Pico (HSP)", value: `${sizing.hsp} h/dia` },
                      { label: "Rendimento Global",        value: `${(sizing.fatorRendimento * 100).toFixed(0)}%` },
                      { label: "Painel Referência",        value: "400 Wp (std.)" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col gap-0.5 p-3 bg-muted/40 rounded-lg">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-semibold text-sm">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Battery recommendation */}
                  {sizing.capacidadeBateriaRecomendada && (
                    <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                      <Battery size={22} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-amber-700 dark:text-amber-400">
                          Bateria Recomendada: {sizing.capacidadeBateriaRecomendada} kWh
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                          Para {consumoData?.horasAutonomia}h de autonomia noturna com DoD 80%
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Explanation */}
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl">
                    <Lightbulb size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">{sizing.explicacao}</p>
                  </div>

                  {/* Disclaimer */}
                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <AlertTriangle size={15} className="text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      Pré-dimensionamento estimativo. Confirme com análise PVGIS detalhada após criar o sistema.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Location summary */}
              {locData && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin size={14} />
                        {locData.latitude.toFixed(4)}°N, {locData.longitude.toFixed(4)}°E
                      </span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock size={14} />
                        Inclinação {locData.inclinacao}° · Azimute {locData.azimute}° de Sul
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

      {/* ── STEP 4: Equipamentos ── */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Sizing summary banner */}
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
              <CardTitle className="flex items-center gap-2">
                <Settings2 size={20} /> Seleção de Equipamentos
              </CardTitle>
              <CardDescription>
                Escolha os equipamentos do catálogo para esta instalação. Use o estudo acima como referência.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...equipForm}>
                <form className="space-y-5">
                  <FormField control={equipForm.control} name="panelId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Painel Solar *</FormLabel>
                      <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar painel solar..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {panels?.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.fabricante} {p.nome} — {p.potencia} W
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sizing && equipForm.watch("panelId") > 0 && (() => {
                        const panel = panels?.find(p => p.id === equipForm.watch("panelId"));
                        if (!panel) return null;
                        const realPaineis = Math.ceil((sizing.potenciaRecomendada * 1000) / panel.potencia);
                        return (
                          <p className="text-xs text-primary mt-1">
                            → Com este painel: {realPaineis} painéis para {sizing.potenciaRecomendada} kWp
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
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar inversor..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {inverters?.map(i => {
                            const match = sizing && i.potenciaAc >= sizing.potenciaRecomendada * 0.9;
                            return (
                              <SelectItem key={i.id} value={String(i.id)}>
                                {i.fabricante} {i.nome} — {i.potenciaAc} kW AC
                                {match ? " ✓" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {consumoData?.incluirBateria && (
                    <FormField control={equipForm.control} name="batteryId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bateria (opcional)</FormLabel>
                        <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar bateria..." />
                            </SelectTrigger>
                          </FormControl>
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

          {/* Save proposal */}
          <Card className="border-green-500/30 bg-green-50/30 dark:bg-green-950/10">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Guardar como Proposta Técnica</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cria uma proposta com o estudo e equipamentos selecionados
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={handleSaveProposal}
                    disabled={createProposal.isPending}
                  >
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
        <Button variant="outline" onClick={goPrev} disabled={step === 1}>
          <ChevronLeft size={16} className="mr-1" /> Anterior
        </Button>
        {step < 4 && (
          <Button onClick={goNext} disabled={isSizing}>
            {isSizing
              ? <Loader2 size={16} className="mr-1 animate-spin" />
              : null}
            {step === 3 ? "Selecionar Equipamentos" : "Seguinte"}
            <ChevronRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
