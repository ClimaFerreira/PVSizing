import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Zap, MapPin, Settings2, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, Sun, Battery, BarChart3, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Step schemas ─────────────────────────────────────────────────────────────
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
  { id: 1, label: "Consumo", icon: Zap },
  { id: 2, label: "Localização", icon: MapPin },
  { id: 3, label: "Equipamentos", icon: Settings2 },
  { id: 4, label: "Resultados", icon: BarChart3 },
];

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [consumoData, setConsumoData] = useState<ConsumoForm | null>(null);
  const [locData, setLocData] = useState<LocalizacaoForm | null>(null);
  const [equipData, setEquipData] = useState<EquipamentosForm | null>(null);
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

  // ── Step 1: Consumo ──────────────────────────────────────────────────────────
  const consumoForm = useForm<ConsumoForm>({
    resolver: zodResolver(consumoSchema),
    defaultValues: { consumoAnual: 3500, coberturaMeta: 80, incluirBateria: false, horasAutonomia: 4 },
  });

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
      toast({ title: `Fatura analisada (confiança: ${(data.confianca * 100).toFixed(0)}%)`, description: data.operador ? `Operador: ${data.operador}` : undefined });
    } catch {
      toast({ title: "Erro ao ler fatura", variant: "destructive" });
    } finally {
      setIsParsingInvoice(false);
    }
  };

  // ── Step 2: Localização ──────────────────────────────────────────────────────
  const locForm = useForm<LocalizacaoForm>({
    resolver: zodResolver(localizacaoSchema),
    defaultValues: { latitude: 38.7, longitude: -9.1, inclinacao: 30, azimute: 0 },
  });

  const handleLocationSelect = (locationStr: string) => {
    const loc = locations?.find(l => l.nome === locationStr);
    if (loc) {
      locForm.setValue("latitude", loc.latitude);
      locForm.setValue("longitude", loc.longitude);
    }
  };

  // ── Step 3: Equipamentos ─────────────────────────────────────────────────────
  const equipForm = useForm<EquipamentosForm>({
    resolver: zodResolver(equipamentosSchema),
    defaultValues: {},
  });

  const runAutoSize = async (consumo: ConsumoForm, loc: LocalizacaoForm) => {
    setIsSizing(true);
    try {
      const resp = await fetch(`${BASE}/api/tools/auto-size`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumoAnual: consumo.consumoAnual,
          latitude: loc.latitude,
          longitude: loc.longitude,
          inclinacao: loc.inclinacao,
          azimute: loc.azimute,
          coberturaMeta: consumo.coberturaMeta,
          incluirBateria: consumo.incluirBateria,
          horasAutonomia: consumo.horasAutonomia,
        }),
      });
      const data: AutoSizeResult = await resp.json();
      setSizing(data);
    } catch {
      toast({ title: "Erro no dimensionamento automático", variant: "destructive" });
    } finally {
      setIsSizing(false);
    }
  };

  // ── Step 4: Guardar proposta ─────────────────────────────────────────────────
  const handleSaveProposal = () => {
    if (!consumoData || !sizing || !equipData) return;
    const selectedPanel = panels?.find(p => p.id === equipData.panelId);
    const selectedInverter = inverters?.find(i => i.id === equipData.inverterId);
    const titulo = `Proposta ${selectedPanel?.fabricante ?? ""} ${sizing.potenciaRecomendada} kWp`;
    createProposal.mutate(
      {
        data: {
          titulo,
          consumoAnualEstimado: consumoData.consumoAnual,
          potenciaRecomendada: sizing.potenciaRecomendada,
          numPaineis: sizing.numPaineis,
          panelId: equipData.panelId,
          inverterId: equipData.inverterId,
          batteryId: equipData.batteryId ?? null,
          producaoAnualEstimada: sizing.energiaAnualEstimada,
          alertas: [],
        },
      },
      {
        onSuccess: (proposal) => {
          toast({ title: "Proposta guardada com sucesso!" });
          navigate(`/propostas`);
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
      const data = consumoForm.getValues();
      setConsumoData(data);
      setStep(2);
    } else if (step === 2) {
      const ok = await locForm.trigger();
      if (!ok) return;
      const data = locForm.getValues();
      setLocData(data);
      await runAutoSize(consumoData!, data);
      setStep(3);
    } else if (step === 3) {
      const ok = await equipForm.trigger();
      if (!ok) return;
      setEquipData(equipForm.getValues());
      setStep(4);
    }
  };

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
                  done ? "bg-primary border-primary text-primary-foreground" :
                  active ? "border-primary text-primary bg-primary/10" :
                  "border-muted text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground")}>
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
            <CardDescription>Indique o consumo anual ou carregue uma fatura para extração automática.</CardDescription>
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
                  {invoiceData.operador && <p className="text-xs text-muted-foreground">{invoiceData.operador} · {invoiceData.tarifario}</p>}
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
              <form className="space-y-4">
                <FormField control={consumoForm.control} name="consumoAnual" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consumo Anual (kWh)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={consumoForm.control} name="coberturaMeta" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta de Cobertura Solar: {field.value}%</FormLabel>
                    <FormControl>
                      <Slider min={10} max={100} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={consumoForm.control} name="incluirBateria" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="cursor-pointer">Incluir Armazenamento em Bateria</FormLabel>
                      <p className="text-xs text-muted-foreground">Dimensionamento de bateria incluído no resultado</p>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                {consumoForm.watch("incluirBateria") && (
                  <FormField control={consumoForm.control} name="horasAutonomia" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Autonomia Pretendida: {field.value}h</FormLabel>
                      <FormControl>
                        <Slider min={1} max={24} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} />
                      </FormControl>
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
            <CardDescription>Defina onde fica a instalação e a orientação dos painéis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {locations && locations.length > 0 && (
              <div>
                <label className="text-sm font-medium">Localidade (pré-definida)</label>
                <Select onValueChange={handleLocationSelect}>
                  <SelectTrigger className="mt-1">
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
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={locForm.control} name="azimute" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Azimute (° de Sul)</FormLabel>
                    <FormControl><Input type="number" min={-180} max={180} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </form>
            </Form>
            <p className="text-xs text-muted-foreground">Azimute: 0° = Sul, -90° = Este, +90° = Oeste</p>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Equipamentos ── */}
      {step === 3 && (
        <div className="space-y-4">
          {isSizing ? (
            <Card><CardContent className="py-12 flex flex-col items-center gap-3">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p className="text-muted-foreground">A calcular dimensionamento...</p>
            </CardContent></Card>
          ) : sizing && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader><CardTitle className="flex items-center gap-2 text-primary"><Sun size={20} /> Dimensionamento Automático</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: "Potência Pico", value: `${sizing.potenciaRecomendada} kWp` },
                    { label: "Nº Painéis", value: `≈ ${sizing.numPaineis} painéis` },
                    { label: "Produção Est.", value: `${sizing.energiaAnualEstimada.toLocaleString("pt-PT")} kWh/ano` },
                    { label: "Cobertura Prev.", value: `${sizing.coberturaPrevista}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-bold text-lg">{value}</p>
                    </div>
                  ))}
                </div>
                {sizing.capacidadeBateriaRecomendada && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800 mb-3">
                    <Battery size={16} className="text-amber-600" />
                    <span className="text-sm text-amber-700 dark:text-amber-400">Bateria recomendada: <strong>{sizing.capacidadeBateriaRecomendada} kWh</strong></span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">{sizing.explicacao}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 size={20} /> Seleção de Equipamentos</CardTitle></CardHeader>
            <CardContent>
              <Form {...equipForm}>
                <form className="space-y-4">
                  <FormField control={equipForm.control} name="panelId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Painel Solar *</FormLabel>
                      <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecionar painel..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {panels?.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.fabricante} — {p.nome} ({p.potencia}W)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={equipForm.control} name="inverterId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inversor *</FormLabel>
                      <Select onValueChange={v => field.onChange(Number(v))} value={field.value?.toString()}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecionar inversor..." /></SelectTrigger></FormControl>
                        <SelectContent>
                          {inverters?.map(i => (
                            <SelectItem key={i.id} value={String(i.id)}>{i.fabricante} — {i.nome} ({i.potenciaAc}kW AC)</SelectItem>
                          ))}
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
                          <FormControl><SelectTrigger><SelectValue placeholder="Selecionar bateria..." /></SelectTrigger></FormControl>
                          <SelectContent>
                            {batteries?.map(b => (
                              <SelectItem key={b.id} value={String(b.id)}>{b.fabricante} — {b.nome} ({b.capacidade}kWh)</SelectItem>
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
        </div>
      )}

      {/* ── STEP 4: Resultados ── */}
      {step === 4 && sizing && consumoData && equipData && (
        <div className="space-y-4">
          <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 size={22} /> Dimensionamento Concluído
              </CardTitle>
              <CardDescription>Resumo do sistema dimensionado automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Potência Instalada", value: `${sizing.potenciaRecomendada} kWp`, icon: Sun },
                  { label: "Painéis Estimados", value: `${sizing.numPaineis} un.`, icon: Settings2 },
                  { label: "Produção Anual", value: `${sizing.energiaAnualEstimada.toLocaleString("pt-PT")} kWh`, icon: BarChart3 },
                  { label: "Cobertura Prevista", value: `${sizing.coberturaPrevista}%`, icon: CheckCircle2 },
                  { label: "HSP Local", value: `${sizing.hsp} h/dia`, icon: Sun },
                  { label: "Rendimento Sistema", value: `${(sizing.fatorRendimento * 100).toFixed(0)}%`, icon: Zap },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex flex-col items-center p-3 bg-background rounded-lg border">
                    <Icon size={18} className="text-primary mb-1" />
                    <p className="text-xs text-muted-foreground text-center">{label}</p>
                    <p className="font-bold text-base text-center">{value}</p>
                  </div>
                ))}
              </div>

              {sizing.capacidadeBateriaRecomendada && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <Battery size={20} className="text-amber-600" />
                  <div>
                    <p className="font-medium text-sm text-amber-700 dark:text-amber-400">Bateria Recomendada</p>
                    <p className="text-sm text-amber-600 dark:text-amber-500">{sizing.capacidadeBateriaRecomendada} kWh</p>
                  </div>
                </div>
              )}

              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground leading-relaxed">{sizing.explicacao}</p>
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <AlertTriangle size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Este é um pré-dimensionamento automático. Confirme os valores com análise PVGIS detalhada no módulo de sistema após criar a proposta.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleSaveProposal}
              disabled={createProposal.isPending}
              className="flex-1"
            >
              {createProposal.isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle2 size={16} className="mr-2" />}
              Guardar Proposta
            </Button>
            <Button variant="outline" onClick={() => navigate("/sistemas/novo")}>
              Criar Sistema Completo
            </Button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1}>
          <ChevronLeft size={16} className="mr-1" /> Anterior
        </Button>
        {step < 4 && (
          <Button onClick={goNext} disabled={isSizing}>
            {isSizing ? <Loader2 size={16} className="mr-1 animate-spin" /> : null}
            Seguinte <ChevronRight size={16} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
