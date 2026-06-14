import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListInverters, 
  useCreateInverter, 
  useUpdateInverter, 
  useDeleteInverter,
  getListInvertersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Inverter } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasheetImport } from "@/components/datasheet-import";
import {
  inferInverterNetworkType,
  normalizeInverterNetworkFields,
  type InverterNetworkType,
} from "@/lib/inverter-network";

const inverterSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  fabricante: z.string().min(1, "Fabricante é obrigatório"),
  potenciaAc: z.coerce.number().min(1, "Obrigatório"),
  potenciaDcMax: z.coerce.number().min(1, "Obrigatório"),
  mpptMin: z.coerce.number().min(1, "Obrigatório"),
  mpptMax: z.coerce.number().min(1, "Obrigatório"),
  corrMaxMppt: z.coerce.number().min(1, "Obrigatório"),
  numMppt: z.coerce.number().min(1, "Obrigatório"),
  stringsPorMppt: z.coerce.number().min(1, "Obrigatório"),
  vdcMax: z.union([z.coerce.number(), z.null()]).optional(),
  tipoRede: z.enum(["monofasico", "trifasico", "desconhecido"]).optional(),
  tensaoAcNominal: z.string().optional(),
  ligacaoRede: z.string().optional(),
  faixaTensaoAc: z.string().optional(),
  frequenciaAc: z.string().optional(),
  potenciaAparenteAc: z.union([z.coerce.number(), z.null()]).optional(),
  correnteNominalAc: z.union([z.coerce.number(), z.null()]).optional(),
  correnteMaxAc: z.union([z.coerce.number(), z.null()]).optional(),
  fatorPotencia: z.string().optional(),
  thdi: z.string().optional(),
  correnteInjecaoDc: z.string().optional(),
  potenciaPvMax: z.union([z.coerce.number(), z.null()]).optional(),
  potenciaDcNominal: z.union([z.coerce.number(), z.null()]).optional(),
  tensaoArranque: z.union([z.coerce.number(), z.null()]).optional(),
  tensaoNominalDc: z.string().optional(),
  correnteCurtoCircuitoMppt: z.union([z.coerce.number(), z.null()]).optional(),
  bateriaTensaoRange: z.string().optional(),
  bateriaCorrenteCargaMax: z.union([z.coerce.number(), z.null()]).optional(),
  bateriaCorrenteDescargaMax: z.union([z.coerce.number(), z.null()]).optional(),
  bateriaPotenciaCargaMax: z.union([z.coerce.number(), z.null()]).optional(),
  bateriaPotenciaDescargaMax: z.union([z.coerce.number(), z.null()]).optional(),
  grauProtecao: z.string().optional(),
  comunicacao: z.string().optional(),
  observacoesTecnicas: z.string().optional(),
});

type InverterFormValues = z.infer<typeof inverterSchema>;
type InverterPayload = Pick<
  InverterFormValues,
  "nome" | "fabricante" | "potenciaAc" | "potenciaDcMax" | "mpptMin" | "mpptMax" | "corrMaxMppt" | "numMppt" | "stringsPorMppt" | "vdcMax"
  | "tipoRede" | "tensaoAcNominal" | "faixaTensaoAc" | "ligacaoRede"
>;

const normalizarKW = (value: number) => value > 500 ? value / 1000 : value;

function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tipoRedeLabel(tipo: InverterNetworkType | undefined): string {
  if (tipo === "monofasico") return "Monofásico";
  if (tipo === "trifasico") return "Trifásico";
  return "Por confirmar";
}

function numeroOpcional(value: unknown, fallback: number | null | undefined = null): number | null {
  const n = parseNumber(value, fallback ?? 0);
  return Number.isFinite(n) && n > 0 ? n : fallback ?? null;
}

function textoOpcional(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function camposAvancadosFromDados(dados: Record<string, unknown>, cur: Partial<InverterFormValues> = {}): Partial<InverterFormValues> {
  const network = normalizeInverterNetworkFields(dados);
  return {
    tipoRede: network.tipoRede,
    tensaoAcNominal: network.tensaoAcNominal || cur.tensaoAcNominal,
    faixaTensaoAc: network.faixaTensaoAc || cur.faixaTensaoAc,
    ligacaoRede: network.ligacaoRede || cur.ligacaoRede,
    frequenciaAc: textoOpcional(dados.frequenciaAc, cur.frequenciaAc),
    potenciaAparenteAc: numeroOpcional(dados.potenciaAparenteAc, cur.potenciaAparenteAc),
    correnteNominalAc: numeroOpcional(dados.correnteNominalAc, cur.correnteNominalAc),
    correnteMaxAc: numeroOpcional(dados.correnteMaxAc, cur.correnteMaxAc),
    fatorPotencia: textoOpcional(dados.fatorPotencia, cur.fatorPotencia),
    thdi: textoOpcional(dados.thdi, cur.thdi),
    correnteInjecaoDc: textoOpcional(dados.correnteInjecaoDc, cur.correnteInjecaoDc),
    potenciaPvMax: numeroOpcional(dados.potenciaPvMax, cur.potenciaPvMax),
    potenciaDcNominal: numeroOpcional(dados.potenciaDcNominal, cur.potenciaDcNominal),
    tensaoArranque: numeroOpcional(dados.tensaoArranque, cur.tensaoArranque),
    tensaoNominalDc: textoOpcional(dados.tensaoNominalDc, cur.tensaoNominalDc),
    correnteCurtoCircuitoMppt: numeroOpcional(dados.correnteCurtoCircuitoMppt, cur.correnteCurtoCircuitoMppt),
    bateriaTensaoRange: textoOpcional(dados.bateriaTensaoRange, cur.bateriaTensaoRange),
    bateriaCorrenteCargaMax: numeroOpcional(dados.bateriaCorrenteCargaMax, cur.bateriaCorrenteCargaMax),
    bateriaCorrenteDescargaMax: numeroOpcional(dados.bateriaCorrenteDescargaMax, cur.bateriaCorrenteDescargaMax),
    bateriaPotenciaCargaMax: numeroOpcional(dados.bateriaPotenciaCargaMax, cur.bateriaPotenciaCargaMax),
    bateriaPotenciaDescargaMax: numeroOpcional(dados.bateriaPotenciaDescargaMax, cur.bateriaPotenciaDescargaMax),
    grauProtecao: textoOpcional(dados.grauProtecao, cur.grauProtecao),
    comunicacao: textoOpcional(dados.comunicacao, cur.comunicacao),
    observacoesTecnicas: textoOpcional(dados.observacoesTecnicas, cur.observacoesTecnicas),
  };
}

function firstValue(dados: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = dados[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const match = raw.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePowerWatts(value: unknown, fallback = 0): number {
  const text = normalizarTexto(value);
  const number = parseNumber(value, fallback);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  if (text.includes("kw") || number < 100) return Math.round(number * 1000);
  return Math.round(number);
}

function parsePositiveInteger(value: unknown, fallback = 1): number {
  const number = parseNumber(value, fallback);
  return Math.max(1, Math.round(number));
}

function missingBasicPayloadError(payload: InverterPayload): string | null {
  const missing: string[] = [];
  if (!payload.fabricante) missing.push("fabricante");
  if (!payload.nome) missing.push("modelo");
  if (payload.potenciaAc <= 0) missing.push("potencia AC");
  if (payload.potenciaDcMax <= 0) missing.push("potencia DC/PV maxima");
  if (payload.mpptMin <= 0) missing.push("MPPT minimo");
  if (payload.mpptMax <= 0) missing.push("MPPT maximo");
  if (payload.corrMaxMppt <= 0) missing.push("corrente MPPT");
  if (payload.numMppt <= 0) missing.push("numero de MPPTs");
  if (payload.stringsPorMppt <= 0) missing.push("strings por MPPT");
  return missing.length > 0 ? missing.join(", ") : null;
}

function buildInverterPayload(dados: Record<string, unknown>, cur: Partial<InverterFormValues> = {}): InverterPayload {
  const fabricante = textoOpcional(firstValue(dados, ["fabricante", "marca"]), cur.fabricante);
  const nome = textoOpcional(firstValue(dados, ["nome", "modelo", "referencia"]), cur.nome);
  const network = normalizeInverterNetworkFields(dados);
  const payload: InverterPayload = {
    fabricante,
    nome,
    potenciaAc: parsePowerWatts(firstValue(dados, ["potenciaAc", "potenciaAcNominal", "potenciaNominalAc"]), cur.potenciaAc ?? 0),
    potenciaDcMax: parsePowerWatts(firstValue(dados, ["potenciaDcMax", "potenciaPvMax", "potenciaDc", "potenciaDcEntrada", "maxPvPower"]), cur.potenciaDcMax ?? 0),
    mpptMin: parseNumber(firstValue(dados, ["mpptMin", "tensaoMpptMin", "tensaoMinMppt"]), cur.mpptMin ?? 0),
    mpptMax: parseNumber(firstValue(dados, ["mpptMax", "tensaoMpptMax", "tensaoMaxMppt"]), cur.mpptMax ?? 0),
    corrMaxMppt: parseNumber(firstValue(dados, ["corrMaxMppt", "correnteMaxMppt", "correnteMaxEntradaMppt", "correnteCurtoCircuitoMppt"]), cur.corrMaxMppt ?? 0),
    numMppt: parsePositiveInteger(firstValue(dados, ["numMppt", "numeroMppt", "mppts"]), cur.numMppt ?? 1),
    stringsPorMppt: parsePositiveInteger(firstValue(dados, ["stringsPorMppt", "stringsMppt", "cadeiasPorMppt", "strings"]), cur.stringsPorMppt ?? 1),
    vdcMax: numeroOpcional(firstValue(dados, ["vdcMax", "tensaoDcMax", "tensaoMaximaDc", "tensaoMaximaFv"]), cur.vdcMax),
    tipoRede: network.tipoRede,
    tensaoAcNominal: network.tensaoAcNominal || cur.tensaoAcNominal || "",
    faixaTensaoAc: network.faixaTensaoAc || cur.faixaTensaoAc || "",
    ligacaoRede: network.ligacaoRede || cur.ligacaoRede || "",
  };
  const missing = missingBasicPayloadError(payload);
  if (missing) {
    throw new Error(`${fabricante || "Inversor"} ${nome || ""}: falta ${missing}`);
  }
  return payload;
}

function getMutationErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err && "message" in err) return String((err as { message?: unknown }).message);
  return "Erro desconhecido ao gravar inversor";
}

export default function Inverters() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInverter, setEditingInverter] = useState<Inverter | null>(null);

  const { data: inverters, isLoading } = useListInverters();
  const createInverter = useCreateInverter();
  const updateInverter = useUpdateInverter();
  const deleteInverter = useDeleteInverter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<InverterFormValues>({
    resolver: zodResolver(inverterSchema),
    defaultValues: {
      nome: "",
      fabricante: "",
      potenciaAc: 0,
      potenciaDcMax: 0,
      mpptMin: 0,
      mpptMax: 0,
      corrMaxMppt: 0,
      numMppt: 1,
      stringsPorMppt: 1,
      vdcMax: null,
      tipoRede: "desconhecido",
      tensaoAcNominal: "",
      ligacaoRede: "",
      faixaTensaoAc: "",
      frequenciaAc: "",
      potenciaAparenteAc: null,
      correnteNominalAc: null,
      correnteMaxAc: null,
      fatorPotencia: "",
      thdi: "",
      correnteInjecaoDc: "",
      potenciaPvMax: null,
      potenciaDcNominal: null,
      tensaoArranque: null,
      tensaoNominalDc: "",
      correnteCurtoCircuitoMppt: null,
      bateriaTensaoRange: "",
      bateriaCorrenteCargaMax: null,
      bateriaCorrenteDescargaMax: null,
      bateriaPotenciaCargaMax: null,
      bateriaPotenciaDescargaMax: null,
      grauProtecao: "",
      comunicacao: "",
      observacoesTecnicas: "",
    },
  });

  const onSubmit = (data: InverterFormValues) => {
    let payload: ReturnType<typeof buildInverterPayload>;
    try {
      payload = {
        ...buildInverterPayload(data as unknown as Record<string, unknown>),
        tipoRede: data.tipoRede ?? "desconhecido",
      };
    } catch (err) {
      toast({
        title: "Dados do inversor incompletos",
        description: getMutationErrorMessage(err),
        variant: "destructive",
      });
      return;
    }

    if (editingInverter) {
      updateInverter.mutate(
        { id: editingInverter.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor atualizado com sucesso" });
            setEditingInverter(null);
            form.reset();
          },
          onError: (err) => {
            toast({
              title: "Erro ao atualizar inversor",
              description: getMutationErrorMessage(err),
              variant: "destructive",
            });
          },
        }
      );
    } else {
      createInverter.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor criado com sucesso" });
            setIsCreateOpen(false);
            form.reset();
          },
          onError: (err) => {
            toast({
              title: "Erro ao criar inversor",
              description: getMutationErrorMessage(err),
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar este inversor?")) {
      deleteInverter.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor eliminado" });
          },
        }
      );
    }
  };

  const openEdit = (inv: Inverter) => {
    const invExtra = inv as Inverter & Partial<InverterFormValues>;
    setEditingInverter(inv);
    form.reset({
      nome: inv.nome,
      fabricante: inv.fabricante,
      potenciaAc: inv.potenciaAc,
      potenciaDcMax: inv.potenciaDcMax,
      mpptMin: inv.mpptMin,
      mpptMax: inv.mpptMax,
      corrMaxMppt: inv.corrMaxMppt,
      numMppt: inv.numMppt,
      stringsPorMppt: inv.stringsPorMppt,
      vdcMax: inv.vdcMax ?? null,
      tipoRede: invExtra.tipoRede ?? inferInverterNetworkType(invExtra),
      tensaoAcNominal: invExtra.tensaoAcNominal ?? "",
      faixaTensaoAc: invExtra.faixaTensaoAc ?? "",
      ligacaoRede: invExtra.ligacaoRede ?? "",
    });
  };

  const filtered = inverters?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.fabricante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inversores</h1>
          <p className="text-muted-foreground mt-1">Gira o catálogo de inversores.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Inversor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Criar Novo Inversor</DialogTitle>
            </DialogHeader>
            <DatasheetImport
              tipoEquipamento="inversor"
              onExtracted={(dados) => {
                try {
                  const d = dados as Record<string, unknown>;
                  const cur = form.getValues();
                  const payload = buildInverterPayload(d, cur);
                  const avancados = camposAvancadosFromDados(d, cur);
                  form.reset({
                    ...cur,
                    ...payload,
                    ...avancados,
                  });
                } catch (err) {
                  toast({
                    title: "Dados extraidos incompletos",
                    description: getMutationErrorMessage(err),
                    variant: "destructive",
                  });
                }
              }}
              onBatchCreate={async (modelos) => {
                let ok = 0;
                let firstError = "";
                for (const d of modelos) {
                  try {
                    await createInverter.mutateAsync({ data: buildInverterPayload(d) });
                    ok++;
                  } catch (err) {
                    if (!firstError) firstError = getMutationErrorMessage(err);
                  }
                }
                queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
                if (ok === 0) {
                  toast({
                    title: "Nenhum inversor foi criado",
                    description: firstError || "Os dados extraidos nao foram aceites pela API.",
                    variant: "destructive",
                  });
                  return;
                }
                toast({
                  title: `${ok} inversor(es) criado(s) com sucesso`,
                  description: firstError ? `Alguns modelos falharam. Primeiro erro: ${firstError}` : undefined,
                });
                if (ok > 0) { setIsCreateOpen(false); form.reset(); }
              }}
            />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="fabricante" render={({ field }) => (
                    <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="nome" render={({ field }) => (
                    <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaAc" render={({ field }) => (
                    <FormItem><FormLabel>Potência AC (W ou kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaDcMax" render={({ field }) => (
                    <FormItem><FormLabel>Potência DC Max (W ou kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="vdcMax" render={({ field }) => (
                    <FormItem><FormLabel>Tensão DC Max (V)</FormLabel><FormControl><Input type="number" step="1" placeholder="1000" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="mpptMin" render={({ field }) => (
                    <FormItem><FormLabel>MPPT Min (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="mpptMax" render={({ field }) => (
                    <FormItem><FormLabel>MPPT Max (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="corrMaxMppt" render={({ field }) => (
                    <FormItem><FormLabel>Corrente Max MPPT (A)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="numMppt" render={({ field }) => (
                    <FormItem><FormLabel>Nº MPPTs</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="stringsPorMppt" render={({ field }) => (
                    <FormItem><FormLabel>Strings por MPPT</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="tipoRede" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de rede AC</FormLabel>
                      <FormControl>
                        <select {...field} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="desconhecido">Por confirmar</option>
                          <option value="monofasico">Monofásico</option>
                          <option value="trifasico">Trifásico</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tensaoAcNominal" render={({ field }) => (
                    <FormItem><FormLabel>Tensão AC nominal</FormLabel><FormControl><Input placeholder="220/230 V" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="ligacaoRede" render={({ field }) => (
                    <FormItem><FormLabel>Ligação à rede</FormLabel><FormControl><Input placeholder="L+N+PE" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="faixaTensaoAc" render={({ field }) => (
                    <FormItem><FormLabel>Faixa de tensão AC</FormLabel><FormControl><Input placeholder="0.85Un-1.1Un" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createInverter.isPending}>
                    {createInverter.isPending ? "A guardar..." : "Guardar Inversor"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar inversores..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fabricante</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Potência AC</TableHead>
              <TableHead>Nº MPPTs</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Faixa MPPT</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum inversor encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((inv) => {
                const invExtra = inv as Inverter & Partial<InverterFormValues>;
                const tipoRede = invExtra.tipoRede ?? inferInverterNetworkType(invExtra);
                return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.fabricante}</TableCell>
                  <TableCell>{inv.nome}</TableCell>
                  <TableCell>{normalizarKW(Number(inv.potenciaAc)).toFixed(1)} kW</TableCell>
                  <TableCell>{inv.numMppt} (x{inv.stringsPorMppt} strings)</TableCell>
                  <TableCell>
                    <div>{tipoRedeLabel(tipoRede)}</div>
                    {(invExtra.tensaoAcNominal || invExtra.ligacaoRede) && (
                      <div className="text-xs text-muted-foreground">
                        {[invExtra.tensaoAcNominal, invExtra.ligacaoRede].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{inv.mpptMin}V - {inv.mpptMax}V</TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingInverter?.id === inv.id} onOpenChange={(open) => {
                      if (!open) { setEditingInverter(null); form.reset(); }
                      else openEdit(inv);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                          <DialogTitle>Editar Inversor</DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <FormField control={form.control} name="fabricante" render={({ field }) => (
                                <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="nome" render={({ field }) => (
                                <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="potenciaAc" render={({ field }) => (
                                <FormItem><FormLabel>Potência AC (W ou kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="potenciaDcMax" render={({ field }) => (
                                <FormItem><FormLabel>Potência DC Max (W ou kW)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="vdcMax" render={({ field }) => (
                                <FormItem><FormLabel>Tensão DC Max (V)</FormLabel><FormControl><Input type="number" step="1" placeholder="1000" value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="mpptMin" render={({ field }) => (
                                <FormItem><FormLabel>MPPT Min (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="mpptMax" render={({ field }) => (
                                <FormItem><FormLabel>MPPT Max (V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="corrMaxMppt" render={({ field }) => (
                                <FormItem><FormLabel>Corrente Max MPPT (A)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="numMppt" render={({ field }) => (
                                <FormItem><FormLabel>Nº MPPTs</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="stringsPorMppt" render={({ field }) => (
                                <FormItem><FormLabel>Strings por MPPT</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="tipoRede" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tipo de rede AC</FormLabel>
                                  <FormControl>
                                    <select {...field} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                      <option value="desconhecido">Por confirmar</option>
                                      <option value="monofasico">Monofásico</option>
                                      <option value="trifasico">Trifásico</option>
                                    </select>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="tensaoAcNominal" render={({ field }) => (
                                <FormItem><FormLabel>Tensão AC nominal</FormLabel><FormControl><Input placeholder="220/230 V" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="ligacaoRede" render={({ field }) => (
                                <FormItem><FormLabel>Ligação à rede</FormLabel><FormControl><Input placeholder="L+N+PE" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="faixaTensaoAc" render={({ field }) => (
                                <FormItem><FormLabel>Faixa de tensão AC</FormLabel><FormControl><Input placeholder="0.85Un-1.1Un" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="flex justify-end">
                              <Button type="submit" disabled={updateInverter.isPending}>
                                {updateInverter.isPending ? "A atualizar..." : "Atualizar Inversor"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(inv.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
