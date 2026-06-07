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

const normalizarKW = (value: number) => value > 500 ? value / 1000 : value;
type TipoRedeInverter = "monofasico" | "trifasico" | "desconhecido";

function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferirTipoRede(dados: Record<string, unknown>): TipoRedeInverter {
  const tecnico = normalizarTexto(`${dados.tipoRede ??""} ${dados.ligacaoRede ??""} ${dados.tensaoAcNominal ??""} ${dados.tensaoAcSaida ??""} ${dados.formaLigacaoRede ??""}`);
  if (/\b(3l|3p|3f)\s*\+?\s*n?\s*\+?\s*pe\b|3l\+n\+pe|3p\+n\+pe|trifas|three phase|\b380\s*\/\s*400\b|\b400\s*v\b/.test(tecnico)) return "trifasico";
  if (/\bl\s*\+\s*n\s*\+\s*pe\b|\b(1f|1p)\s*\+?\s*n?\s*\+?\s*pe\b|monofas|single phase|\b220\s*\/\s*230\b|\b230\s*v\b/.test(tecnico)) return "monofasico";

  const modelo = normalizarTexto(`${dados.fabricante ??""} ${dados.nome ??""}`);
  if (/\bsg05lp1\b|\blp1\b|\beu-am2\b/.test(modelo)) return "monofasico";
  if (/\bsg04lp3\b|\blp3\b/.test(modelo)) return "trifasico";
  return "desconhecido";
}

function tipoRedeLabel(tipo: TipoRedeInverter | undefined): string {
  if (tipo === "monofasico") return "Monofasico";
  if (tipo === "trifasico") return "Trifasico";
  return "Por confirmar";
}

function numeroOpcional(value: unknown, fallback: number | null | undefined = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback ?? null;
}

function textoOpcional(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function camposAvancadosFromDados(dados: Record<string, unknown>, cur: Partial<InverterFormValues> = {}): Partial<InverterFormValues> {
  return {
    tipoRede: inferirTipoRede(dados),
    tensaoAcNominal: textoOpcional(dados.tensaoAcNominal ?? dados.tensaoAcSaida, cur.tensaoAcNominal),
    faixaTensaoAc: textoOpcional(dados.faixaTensaoAc ?? dados.rangeTensaoAc, cur.faixaTensaoAc),
    ligacaoRede: textoOpcional(dados.ligacaoRede ?? dados.formaLigacaoRede, cur.ligacaoRede),
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
    if (editingInverter) {
      updateInverter.mutate(
        { id: editingInverter.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor atualizado com sucesso" });
            setEditingInverter(null);
            form.reset();
          },
        }
      );
    } else {
      createInverter.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
            toast({ title: "Inversor criado com sucesso" });
            setIsCreateOpen(false);
            form.reset();
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
      tipoRede: invExtra.tipoRede ?? inferirTipoRede(invExtra as unknown as Record<string, unknown>),
      tensaoAcNominal: invExtra.tensaoAcNominal ?? "",
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
                const d = dados as Record<string, number | string>;
                const cur = form.getValues();
                const tipoRede = inferirTipoRede(dados);
                form.reset({
                  fabricante:    d.fabricante               ? String(d.fabricante)       : cur.fabricante,
                  nome:          d.nome                     ? String(d.nome)             : cur.nome,
                  potenciaAc:    Number(d.potenciaAc)    > 0 ? Number(d.potenciaAc)     : cur.potenciaAc,
                  potenciaDcMax: Number(d.potenciaDcMax) > 0 ? Number(d.potenciaDcMax)  : cur.potenciaDcMax,
                  mpptMin:       Number(d.mpptMin)       > 0 ? Number(d.mpptMin)        : cur.mpptMin,
                  mpptMax:       Number(d.mpptMax)       > 0 ? Number(d.mpptMax)        : cur.mpptMax,
                  corrMaxMppt:   Number(d.corrMaxMppt)   > 0 ? Number(d.corrMaxMppt)    : cur.corrMaxMppt,
                  numMppt:       Number(d.numMppt)       > 0 ? Number(d.numMppt)        : cur.numMppt,
                  stringsPorMppt: Number(d.stringsPorMppt) > 0 ? Number(d.stringsPorMppt) : cur.stringsPorMppt,
                  vdcMax: Number(d.vdcMax) > 0 ? Number(d.vdcMax) : cur.vdcMax,
                  tipoRede,
                  tensaoAcNominal: String(d.tensaoAcNominal ?? d.tensaoAcSaida ?? cur.tensaoAcNominal ?? ""),
                  ligacaoRede: String(d.ligacaoRede ?? d.formaLigacaoRede ?? cur.ligacaoRede ?? ""),
                });
              }}
              onBatchCreate={async (modelos) => {
                let ok = 0;
                for (const d of modelos) {
                  try {
                    await createInverter.mutateAsync({ data: {
                      nome: String(d.nome ?? ""),
                      fabricante: String(d.fabricante ?? ""),
                      potenciaAc: Number(d.potenciaAc ?? 0),
                      potenciaDcMax: Number(d.potenciaDcMax ?? 0),
                      mpptMin: Number(d.mpptMin ?? 0),
                      mpptMax: Number(d.mpptMax ?? 0),
                      corrMaxMppt: Number(d.corrMaxMppt ?? 0),
                      numMppt: Number(d.numMppt ?? 1),
                      stringsPorMppt: Number(d.stringsPorMppt ?? 1),
                      vdcMax: d.vdcMax ? Number(d.vdcMax) : null,
                      tipoRede: inferirTipoRede(d),
                      tensaoAcNominal: String(d.tensaoAcNominal ?? d.tensaoAcSaida ?? ""),
                      ligacaoRede: String(d.ligacaoRede ?? d.formaLigacaoRede ?? ""),
                    }});
                    ok++;
                  } catch { /* skip failed */ }
                }
                queryClient.invalidateQueries({ queryKey: getListInvertersQueryKey() });
                toast({ title: `${ok} inversor(es) criado(s) com sucesso` });
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
                          <option value="monofasico">Monofasico</option>
                          <option value="trifasico">Trifasico</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tensaoAcNominal" render={({ field }) => (
                    <FormItem><FormLabel>Tensao AC nominal</FormLabel><FormControl><Input placeholder="220/230 V" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="ligacaoRede" render={({ field }) => (
                    <FormItem><FormLabel>Ligacao a rede</FormLabel><FormControl><Input placeholder="L+N+PE" {...field} /></FormControl><FormMessage /></FormItem>
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
                const tipoRede = invExtra.tipoRede ?? inferirTipoRede(invExtra as unknown as Record<string, unknown>);
                return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.fabricante}</TableCell>
                  <TableCell>{inv.nome}</TableCell>
                  <TableCell>{normalizarKW(Number(inv.potenciaAc)).toFixed(1)} kW</TableCell>
                  <TableCell>{inv.numMppt} (x{inv.stringsPorMppt} strings)</TableCell>
                  <TableCell>{tipoRedeLabel(tipoRede)}</TableCell>
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
                                      <option value="monofasico">Monofasico</option>
                                      <option value="trifasico">Trifasico</option>
                                    </select>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="tensaoAcNominal" render={({ field }) => (
                                <FormItem><FormLabel>Tensao AC nominal</FormLabel><FormControl><Input placeholder="220/230 V" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="ligacaoRede" render={({ field }) => (
                                <FormItem><FormLabel>Ligacao a rede</FormLabel><FormControl><Input placeholder="L+N+PE" {...field} /></FormControl><FormMessage /></FormItem>
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
