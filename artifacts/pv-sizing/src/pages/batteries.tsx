import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListBatteries, 
  useCreateBattery, 
  useUpdateBattery, 
  useDeleteBattery,
  getListBatteriesQueryKey,
  Battery,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatasheetImport } from "@/components/datasheet-import";

const TECNOLOGIAS = ["LiFePO4", "Li-ion", "AGM", "Gel"] as const;

const batterySchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  fabricante: z.string().min(1, "Fabricante é obrigatório"),
  capacidade: z.coerce.number().min(0.1, "Obrigatório"),
  tensao: z.coerce.number().min(1, "Obrigatório"),
  tecnologia: z.enum(TECNOLOGIAS),
  potenciaCarga: z.coerce.number().min(0).optional(),
  potenciaDescarga: z.coerce.number().min(0).optional(),
  profundidadeDescarga: z.coerce.number().min(0).max(100).optional(),
  eficienciaRoundTrip: z.coerce.number().min(0).max(100).optional(),
  ciclosVida: z.coerce.number().int().min(0).optional(),
  correnteCargaMax: z.coerce.number().min(0).optional(),
  correnteDescargaMax: z.coerce.number().min(0).optional(),
  garantiaAnos: z.coerce.number().int().min(0).optional(),
  compatibilidade: z.string().optional(),
  observacoesTecnicas: z.string().optional(),
});

type BatteryFormValues = z.infer<typeof batterySchema>;

const DEFAULT_BATTERY_VALUES: BatteryFormValues = {
  nome: "",
  fabricante: "",
  capacidade: 0,
  tensao: 48,
  tecnologia: "LiFePO4",
  potenciaCarga: 0,
  potenciaDescarga: 0,
  profundidadeDescarga: 80,
  eficienciaRoundTrip: 90,
  ciclosVida: 0,
  correnteCargaMax: 0,
  correnteDescargaMax: 0,
  garantiaAnos: 0,
  compatibilidade: "",
  observacoesTecnicas: "",
};

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const toText = (value: unknown) => value == null ? "" : String(value);

const toTecnologia = (value: unknown, fallback: typeof TECNOLOGIAS[number] = "LiFePO4") =>
  TECNOLOGIAS.includes(value as typeof TECNOLOGIAS[number])
    ? (value as typeof TECNOLOGIAS[number])
    : fallback;

const calcCapacidadeUtil = (capacidade: number, profundidadeDescarga = 80) =>
  Math.round(capacidade * (profundidadeDescarga / 100) * 100) / 100;

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Erro desconhecido";

const addNumberIfPositive = (target: Record<string, unknown>, key: keyof BatteryFormValues | "capacidadeUtil", value: unknown) => {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) target[key] = n;
};

const addTextIfPresent = (target: Record<string, unknown>, key: keyof BatteryFormValues, value: unknown) => {
  const text = String(value ?? "").trim();
  if (text) target[key] = text;
};

const buildBatteryPayload = (data: BatteryFormValues) => {
  const profundidadeDescarga = data.profundidadeDescarga ?? 80;
  const payload: Record<string, unknown> = {
    nome: data.nome.trim(),
    fabricante: data.fabricante.trim(),
    capacidade: Number(data.capacidade),
    tensao: Number(data.tensao),
    tecnologia: data.tecnologia,
  };

  addNumberIfPositive(payload, "potenciaCarga", data.potenciaCarga);
  addNumberIfPositive(payload, "potenciaDescarga", data.potenciaDescarga);
  addNumberIfPositive(payload, "profundidadeDescarga", data.profundidadeDescarga);
  addNumberIfPositive(payload, "eficienciaRoundTrip", data.eficienciaRoundTrip);
  addNumberIfPositive(payload, "ciclosVida", data.ciclosVida);
  addNumberIfPositive(payload, "correnteCargaMax", data.correnteCargaMax);
  addNumberIfPositive(payload, "correnteDescargaMax", data.correnteDescargaMax);
  addNumberIfPositive(payload, "garantiaAnos", data.garantiaAnos);
  addTextIfPresent(payload, "compatibilidade", data.compatibilidade);
  addTextIfPresent(payload, "observacoesTecnicas", data.observacoesTecnicas);

  if (Number.isFinite(Number(data.capacidade)) && Number(data.capacidade) > 0) {
    addNumberIfPositive(payload, "capacidadeUtil", calcCapacidadeUtil(Number(data.capacidade), profundidadeDescarga));
  }

  return payload as BatteryFormValues & { capacidadeUtil?: number };
};

export default function Batteries() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBattery, setEditingBattery] = useState<Battery | null>(null);

  const { data: batteries, isLoading } = useListBatteries();
  const createBattery = useCreateBattery();
  const updateBattery = useUpdateBattery();
  const deleteBattery = useDeleteBattery();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<BatteryFormValues>({
    resolver: zodResolver(batterySchema),
    defaultValues: DEFAULT_BATTERY_VALUES,
  });

  const onSubmit = (data: BatteryFormValues) => {
    const payload = buildBatteryPayload(data);
    if (editingBattery) {
      updateBattery.mutate(
        { id: editingBattery.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria atualizada com sucesso" });
            setEditingBattery(null);
            form.reset(DEFAULT_BATTERY_VALUES);
          },
          onError: (err) => {
            toast({ title: "Erro ao atualizar bateria", description: errorMessage(err), variant: "destructive" });
          },
        }
      );
    } else {
      createBattery.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria criada com sucesso" });
            setIsCreateOpen(false);
            form.reset(DEFAULT_BATTERY_VALUES);
          },
          onError: (err) => {
            toast({ title: "Erro ao criar bateria", description: errorMessage(err), variant: "destructive" });
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar esta bateria?")) {
      deleteBattery.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria eliminada" });
          },
        }
      );
    }
  };

  const openEdit = (bat: Battery) => {
    setEditingBattery(bat);
    form.reset({
      nome: bat.nome,
      fabricante: bat.fabricante,
      capacidade: bat.capacidade,
      tensao: bat.tensao,
      tecnologia: bat.tecnologia,
      potenciaCarga: bat.potenciaCarga ?? 0,
      potenciaDescarga: bat.potenciaDescarga ?? 0,
      profundidadeDescarga: bat.profundidadeDescarga ?? 80,
      eficienciaRoundTrip: bat.eficienciaRoundTrip ?? 90,
      ciclosVida: bat.ciclosVida ?? 0,
      correnteCargaMax: bat.correnteCargaMax ?? 0,
      correnteDescargaMax: bat.correnteDescargaMax ?? 0,
      garantiaAnos: bat.garantiaAnos ?? 0,
      compatibilidade: bat.compatibilidade ?? "",
      observacoesTecnicas: bat.observacoesTecnicas ?? "",
    });
  };

  const filtered = batteries?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.fabricante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const BatteryForm = ({ isEdit = false }: { isEdit?: boolean }) => {
    const capacidadeUtil = calcCapacidadeUtil(
      Number(form.watch("capacidade") ?? 0),
      Number(form.watch("profundidadeDescarga") ?? 80),
    );

    return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="fabricante" render={({ field }) => (
            <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="nome" render={({ field }) => (
            <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="capacidade" render={({ field }) => (
            <FormItem><FormLabel>Capacidade (kWh)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="tensao" render={({ field }) => (
            <FormItem><FormLabel>Tensão Nominal (V)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="tecnologia" render={({ field }) => (
            <FormItem><FormLabel>Tecnologia</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {TECNOLOGIAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            <FormMessage /></FormItem>
          )} />
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Dados técnicos avançados</p>
            <p className="text-xs text-muted-foreground">Usados no dimensionamento de bateria e no relatório quando disponíveis.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="profundidadeDescarga" render={({ field }) => (
              <FormItem><FormLabel>DoD (%)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormItem>
              <FormLabel>Capacidade útil calculada (kWh)</FormLabel>
              <FormControl><Input value={capacidadeUtil || 0} readOnly /></FormControl>
            </FormItem>
            <FormField control={form.control} name="eficienciaRoundTrip" render={({ field }) => (
              <FormItem><FormLabel>Eficiência round-trip (%)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ciclosVida" render={({ field }) => (
              <FormItem><FormLabel>Ciclos / vida útil</FormLabel><FormControl><Input type="number" step="100" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="potenciaCarga" render={({ field }) => (
              <FormItem><FormLabel>Potência carga máx. (kW)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="potenciaDescarga" render={({ field }) => (
              <FormItem><FormLabel>Potência descarga máx. (kW)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="correnteCargaMax" render={({ field }) => (
              <FormItem><FormLabel>Corrente carga máx. (A)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="correnteDescargaMax" render={({ field }) => (
              <FormItem><FormLabel>Corrente descarga máx. (A)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="garantiaAnos" render={({ field }) => (
              <FormItem><FormLabel>Garantia (anos)</FormLabel><FormControl><Input type="number" step="1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="compatibilidade" render={({ field }) => (
              <FormItem><FormLabel>Compatibilidade / tensão</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>
          <FormField control={form.control} name="observacoesTecnicas" render={({ field }) => (
            <FormItem><FormLabel>Observações técnicas</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        {!isEdit && (
          <DatasheetImport
            tipoEquipamento="bateria"
            onExtracted={(data) => {
              const cur = form.getValues();
              form.reset({
                nome:        data.nome        ? String(data.nome)        : cur.nome,
                fabricante:  data.fabricante  ? String(data.fabricante)  : cur.fabricante,
                capacidade:  Number(data.capacidade) > 0 ? Number(data.capacidade) : cur.capacidade,
                tensao:      Number(data.tensao)      > 0 ? Number(data.tensao)      : cur.tensao,
                tecnologia:  toTecnologia(data.tecnologia, cur.tecnologia),
                potenciaCarga: toNumber(data.potenciaCarga, cur.potenciaCarga ?? 0),
                potenciaDescarga: toNumber(data.potenciaDescarga, cur.potenciaDescarga ?? 0),
                profundidadeDescarga: toNumber(data.profundidadeDescarga, cur.profundidadeDescarga ?? 80),
                eficienciaRoundTrip: toNumber(data.eficienciaRoundTrip, cur.eficienciaRoundTrip ?? 90),
                ciclosVida: toNumber(data.ciclosVida, cur.ciclosVida ?? 0),
                correnteCargaMax: toNumber(data.correnteCargaMax, cur.correnteCargaMax ?? 0),
                correnteDescargaMax: toNumber(data.correnteDescargaMax, cur.correnteDescargaMax ?? 0),
                garantiaAnos: toNumber(data.garantiaAnos, cur.garantiaAnos ?? 0),
                compatibilidade: toText(data.compatibilidade) || cur.compatibilidade,
                observacoesTecnicas: toText(data.observacoesTecnicas) || cur.observacoesTecnicas,
              });
            }}
            onBatchCreate={async (modelos) => {
              let ok = 0;
              let failed = 0;
              let firstError = "";
              for (const d of modelos) {
                try {
                  await createBattery.mutateAsync({ data: {
                    nome: String(d.nome ?? ""),
                    fabricante: String(d.fabricante ?? ""),
                    capacidade: Number(d.capacidade ?? 0),
                    tensao: Number(d.tensao ?? 48),
                    tecnologia: toTecnologia(d.tecnologia),
                    potenciaCarga: toNumber(d.potenciaCarga),
                    potenciaDescarga: toNumber(d.potenciaDescarga),
                    profundidadeDescarga: toNumber(d.profundidadeDescarga, 80),
                    eficienciaRoundTrip: toNumber(d.eficienciaRoundTrip, 90),
                    ciclosVida: toNumber(d.ciclosVida),
                    correnteCargaMax: toNumber(d.correnteCargaMax),
                    correnteDescargaMax: toNumber(d.correnteDescargaMax),
                    capacidadeUtil: calcCapacidadeUtil(Number(d.capacidade ?? 0), toNumber(d.profundidadeDescarga, 80)),
                    garantiaAnos: toNumber(d.garantiaAnos),
                    compatibilidade: toText(d.compatibilidade) || null,
                    observacoesTecnicas: toText(d.observacoesTecnicas) || null,
                  }});
                  ok++;
                } catch (err) {
                  failed++;
                  if (!firstError) firstError = errorMessage(err);
                }
              }
              queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
              toast({
                title: `${ok} bateria(s) criada(s) com sucesso`,
                description: failed > 0 ? `${failed} falharam. ${firstError}` : undefined,
                variant: failed > 0 ? "destructive" : undefined,
              });
              if (ok > 0) { setIsCreateOpen(false); form.reset(DEFAULT_BATTERY_VALUES); }
            }}
          />
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={isEdit ? updateBattery.isPending : createBattery.isPending}>
            {isEdit
              ? (updateBattery.isPending ? "A atualizar..." : "Atualizar Bateria")
              : (createBattery.isPending ? "A criar..." : "Criar Bateria")}
          </Button>
        </div>
      </form>
    </Form>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Baterias</h1>
          <p className="text-muted-foreground mt-1">Gira o catálogo de sistemas de armazenamento.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset(DEFAULT_BATTERY_VALUES);
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Bateria
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Bateria</DialogTitle>
            </DialogHeader>
            <BatteryForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar baterias..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fabricante</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Capacidade</TableHead>
              <TableHead>Tensão</TableHead>
              <TableHead>Tecnologia</TableHead>
              <TableHead>DoD / Ef.</TableHead>
              <TableHead>Potência</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhuma bateria encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((bat) => (
                <TableRow key={bat.id}>
                  <TableCell className="font-medium">{bat.fabricante}</TableCell>
                  <TableCell>{bat.nome}</TableCell>
                  <TableCell>
                    <div>{bat.capacidade} kWh</div>
                    {bat.capacidadeUtil != null && (
                      <div className="text-xs text-muted-foreground">útil {bat.capacidadeUtil} kWh</div>
                    )}
                  </TableCell>
                  <TableCell>{bat.tensao} V</TableCell>
                  <TableCell>{bat.tecnologia}</TableCell>
                  <TableCell>
                    <div>DoD {bat.profundidadeDescarga ?? 80}%</div>
                    <div className="text-xs text-muted-foreground">Ef. {bat.eficienciaRoundTrip ?? 90}%</div>
                  </TableCell>
                  <TableCell>
                    <div>{bat.potenciaCarga || 0} / {bat.potenciaDescarga || 0} kW</div>
                    {(bat.correnteCargaMax || bat.correnteDescargaMax) ? (
                      <div className="text-xs text-muted-foreground">{bat.correnteCargaMax ?? 0} / {bat.correnteDescargaMax ?? 0} A</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingBattery?.id === bat.id} onOpenChange={(open) => {
                      if (!open) { setEditingBattery(null); form.reset(DEFAULT_BATTERY_VALUES); }
                      else openEdit(bat);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Editar Bateria</DialogTitle>
                        </DialogHeader>
                        <BatteryForm isEdit />
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(bat.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
