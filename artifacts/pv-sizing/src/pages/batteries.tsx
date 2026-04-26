import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useListBatteries, 
  useCreateBattery, 
  useUpdateBattery, 
  useDeleteBattery,
  getListBatteriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Battery } from "@workspace/api-client-react/src/generated/api.schemas";

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

const batterySchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  fabricante: z.string().min(1, "Fabricante é obrigatório"),
  capacidade: z.coerce.number().min(0.1, "Obrigatório"),
  tensaoNominal: z.coerce.number().min(1, "Obrigatório"),
  potenciaCarga: z.coerce.number().min(1, "Obrigatório"),
  potenciaDescarga: z.coerce.number().min(1, "Obrigatório"),
  profundidadeDescarga: z.coerce.number().min(1).max(100),
  compatibilidade: z.string().nullable().optional()
});

type BatteryFormValues = z.infer<typeof batterySchema>;

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
    defaultValues: {
      nome: "",
      fabricante: "",
      capacidade: 0,
      tensaoNominal: 0,
      potenciaCarga: 0,
      potenciaDescarga: 0,
      profundidadeDescarga: 90,
      compatibilidade: ""
    },
  });

  const onSubmit = (data: BatteryFormValues) => {
    if (editingBattery) {
      updateBattery.mutate(
        { id: editingBattery.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria atualizada com sucesso" });
            setEditingBattery(null);
            form.reset();
          },
        }
      );
    } else {
      createBattery.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBatteriesQueryKey() });
            toast({ title: "Bateria criada com sucesso" });
            setIsCreateOpen(false);
            form.reset();
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
      tensaoNominal: bat.tensaoNominal,
      potenciaCarga: bat.potenciaCarga,
      potenciaDescarga: bat.potenciaDescarga,
      profundidadeDescarga: bat.profundidadeDescarga,
      compatibilidade: bat.compatibilidade || "",
    });
  };

  const filtered = batteries?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.fabricante.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Baterias</h1>
          <p className="text-muted-foreground mt-1">Gira o catálogo de sistemas de armazenamento.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) form.reset();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Bateria
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Criar Nova Bateria</DialogTitle>
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
                  <FormField control={form.control} name="capacidade" render={({ field }) => (
                    <FormItem><FormLabel>Capacidade (kWh)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="tensaoNominal" render={({ field }) => (
                    <FormItem><FormLabel>Tensão Nominal (V)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaCarga" render={({ field }) => (
                    <FormItem><FormLabel>Potência Carga (W)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaDescarga" render={({ field }) => (
                    <FormItem><FormLabel>Potência Descarga (W)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="profundidadeDescarga" render={({ field }) => (
                    <FormItem><FormLabel>DoD (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="compatibilidade" render={({ field: { value, ...rest } }) => (
                    <FormItem><FormLabel>Compatibilidade (Opcional)</FormLabel><FormControl><Input value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createBattery.isPending}>
                    {createBattery.isPending ? "A guardar..." : "Guardar Bateria"}
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
            placeholder="Pesquisar baterias..."
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
              <TableHead>Capacidade</TableHead>
              <TableHead>Tensão</TableHead>
              <TableHead>Potência Max (D/C)</TableHead>
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
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma bateria encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((bat) => (
                <TableRow key={bat.id}>
                  <TableCell className="font-medium">{bat.fabricante}</TableCell>
                  <TableCell>{bat.nome}</TableCell>
                  <TableCell>{bat.capacidade} kWh</TableCell>
                  <TableCell>{bat.tensaoNominal} V</TableCell>
                  <TableCell>{bat.potenciaDescarga}W / {bat.potenciaCarga}W</TableCell>
                  <TableCell className="text-right">
                    <Dialog open={editingBattery?.id === bat.id} onOpenChange={(open) => {
                      if (!open) { setEditingBattery(null); form.reset(); }
                      else openEdit(bat);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                          <DialogTitle>Editar Bateria</DialogTitle>
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
                              <FormField control={form.control} name="capacidade" render={({ field }) => (
                                <FormItem><FormLabel>Capacidade (kWh)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="tensaoNominal" render={({ field }) => (
                                <FormItem><FormLabel>Tensão Nominal (V)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="potenciaCarga" render={({ field }) => (
                                <FormItem><FormLabel>Potência Carga (W)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="potenciaDescarga" render={({ field }) => (
                                <FormItem><FormLabel>Potência Descarga (W)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="profundidadeDescarga" render={({ field }) => (
                                <FormItem><FormLabel>DoD (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                              )} />
                              <FormField control={form.control} name="compatibilidade" render={({ field: { value, ...rest } }) => (
                                <FormItem><FormLabel>Compatibilidade (Opcional)</FormLabel><FormControl><Input value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </div>
                            <div className="flex justify-end">
                              <Button type="submit" disabled={updateBattery.isPending}>
                                {updateBattery.isPending ? "A atualizar..." : "Atualizar Bateria"}
                              </Button>
                            </div>
                          </form>
                        </Form>
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
