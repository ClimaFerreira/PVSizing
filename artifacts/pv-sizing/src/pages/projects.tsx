import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useListCustomers,
  useListPanels,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import type { Project } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FolderKanban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const NONE = "__none__";

const projectSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  morada: z.string().nullable().optional(),
  panelId: z.coerce.number().int().positive().nullable().optional(),
  numPaineis: z.coerce.number().int().nonnegative().nullable().optional(),
  potenciaKwp: z.coerce.number().nonnegative().nullable().optional(),
  inclinacao: z.coerce.number().nullable().optional(),
  azimute: z.coerce.number().nullable().optional(),
  orientacao: z.string().nullable().optional(),
  layoutRows: z.coerce.number().int().nonnegative().nullable().optional(),
  layoutCols: z.coerce.number().int().nonnegative().nullable().optional(),
  mountType: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export default function Projects() {
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const { data: projects, isLoading } = useListProjects();
  const { data: customers } = useListCustomers();
  const { data: panels } = useListPanels();
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      nome: "",
      customerId: null,
      morada: "",
      panelId: null,
      numPaineis: null,
      potenciaKwp: null,
      inclinacao: 30,
      azimute: 180,
      orientacao: "S",
      layoutRows: null,
      layoutCols: null,
      mountType: "triangulos",
      notas: "",
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      nome: "",
      customerId: null,
      morada: "",
      panelId: null,
      numPaineis: null,
      potenciaKwp: null,
      inclinacao: 30,
      azimute: 180,
      orientacao: "S",
      layoutRows: null,
      layoutCols: null,
      mountType: "triangulos",
      notas: "",
    });
    setIsOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    form.reset({
      nome: p.nome,
      customerId: p.customerId,
      morada: p.morada ?? "",
      panelId: p.panelId,
      numPaineis: p.numPaineis,
      potenciaKwp: p.potenciaKwp,
      inclinacao: p.inclinacao,
      azimute: p.azimute,
      orientacao: p.orientacao ?? "S",
      layoutRows: p.layoutRows,
      layoutCols: p.layoutCols,
      mountType: p.mountType ?? "triangulos",
      notas: p.notas ?? "",
    });
    setIsOpen(true);
  };

  const onSubmit = (data: ProjectFormValues) => {
    const payload = {
      ...data,
      morada: data.morada || null,
      orientacao: data.orientacao || null,
      mountType: data.mountType || null,
      notas: data.notas || null,
    };
    if (editing) {
      update.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            toast({ title: "Estudo atualizado" });
            setIsOpen(false);
          },
          onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
        },
      );
    } else {
      create.mutate(
        { data: payload },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            toast({ title: "Estudo criado" });
            setIsOpen(false);
          },
          onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
        },
      );
    }
  };

  const onDelete = (id: number) => {
    if (!confirm("Eliminar este estudo?")) return;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Estudo eliminado" });
        },
      },
    );
  };

  const customerName = (id: number | null) =>
    customers?.find((c) => c.id === id)?.nome ?? "—";
  const panelName = (id: number | null) =>
    panels?.find((p) => p.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="text-primary" />
            Estudos / Projetos
          </h1>
          <p className="text-muted-foreground text-sm">
            Dados partilhados entre Dimensionamento FV e Layout / Mapa.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-new-project">
              <Plus className="mr-2 h-4 w-4" /> Novo Estudo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Estudo" : "Novo Estudo"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="nome" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do estudo *</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: Casa Silva — Telhado Sul" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="customerId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : NONE}
                        onValueChange={(v) => field.onChange(v === NONE ? null : Number(v))}
                      >
                        <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>— Sem cliente —</SelectItem>
                          {customers?.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="morada" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Morada</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="panelId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Painel</FormLabel>
                      <Select
                        value={field.value != null ? String(field.value) : NONE}
                        onValueChange={(v) => field.onChange(v === NONE ? null : Number(v))}
                      >
                        <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>— Sem painel —</SelectItem>
                          {panels?.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.fabricante} {p.nome} ({p.potencia}W)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="numPaineis" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº Painéis</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="potenciaKwp" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Potência (kWp)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="inclinacao" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inclinação (°)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="azimute" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Azimute (°)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="orientacao" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orientação</FormLabel>
                      <Select value={field.value ?? "S"} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {ORIENTATIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="layoutRows" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fileiras</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="layoutCols" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Colunas</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="mountType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Estrutura</FormLabel>
                    <Select value={field.value ?? "triangulos"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="triangulos">Triângulos</SelectItem>
                        <SelectItem value="coplanar">Coplanar (telhado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <FormField control={form.control} name="notas" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl><Textarea rows={3} {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={create.isPending || update.isPending}>
                    {editing ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : projects && projects.length > 0 ? (
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Painel</TableHead>
                <TableHead className="text-right">Nº Painéis</TableHead>
                <TableHead className="text-right">kWp</TableHead>
                <TableHead>Orient.</TableHead>
                <TableHead className="text-right">Inclin.</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id} data-testid={`row-project-${p.id}`}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>{customerName(p.customerId)}</TableCell>
                  <TableCell>{panelName(p.panelId)}</TableCell>
                  <TableCell className="text-right">{p.numPaineis ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {p.potenciaKwp != null ? <Badge variant="secondary">{p.potenciaKwp.toFixed(2)}</Badge> : "—"}
                  </TableCell>
                  <TableCell>{p.orientacao ?? "—"}</TableCell>
                  <TableCell className="text-right">{p.inclinacao != null ? `${p.inclinacao}°` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`button-edit-${p.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)} data-testid={`button-delete-${p.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="border rounded-lg bg-card p-12 text-center text-muted-foreground">
          <FolderKanban className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>Ainda não existem estudos. Crie o primeiro para partilhar dados entre os módulos.</p>
        </div>
      )}
    </div>
  );
}
