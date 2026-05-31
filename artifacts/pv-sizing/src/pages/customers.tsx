import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { 
  useListCustomers, 
  useCreateCustomer, 
  useUpdateCustomer, 
  useDeleteCustomer,
  getListCustomersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Customer, CreateCustomerBodyTipoCliente, CreateCustomerBodyPerfilConsumo } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Search, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const customerSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  morada: z.string().min(1, "Morada é obrigatória"),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  tipoCliente: z.enum(["Residencial", "Comercial", "Industrial"]),
  precoEletricidade: z.coerce.number().min(0),
  potenciaContratada: z.coerce.number().min(0),
  perfilConsumo: z.enum(["Diurno", "Noturno", "Personalizado"]),
  consumoMensal: z.coerce.number().nullable().optional(),
  consumoAnual: z.coerce.number().nullable().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

type Coordinates = {
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
};

const parseCoordinates = (value: string): Coordinates | null => {
  let decodedValue = value.trim();

  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    decodedValue = value.trim();
  }

  const match =
    decodedValue.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) ??
    decodedValue.match(/(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)/);

  if (!match) {
    return null;
  }

  const latitude = Number(match[1].replace(",", "."));
  const longitude = Number(match[2].replace(",", "."));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
};

const buildAddressQueries = (address: string) => {
  const cleanAddress = address.replace(/\s+/g, " ").trim();
  const expandedAddress = cleanAddress
    .replace(/\bAv\.?\b/gi, "Avenida")
    .replace(/\bMal\.?\b/gi, "Marechal")
    .replace(/\bMarech\.?\b/gi, "Marechal");
  const withoutPostcode = expandedAddress
    .replace(/\b\d{4}-\d{3}\b/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .trim();

  return Array.from(
    new Set(
      [cleanAddress, expandedAddress, withoutPostcode]
        .filter(Boolean)
        .flatMap((query) => [
          query,
          query.toLowerCase().includes("portugal") ? query : `${query}, Portugal`,
        ])
    )
  );
};

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [coordinatesText, setCoordinatesText] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  const { data: customers, isLoading } = useListCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      nome: "",
      morada: "",
      latitude: 38.7223, // Lisbon default
      longitude: -9.1393,
      tipoCliente: "Residencial",
      precoEletricidade: 0.16,
      potenciaContratada: 6.9,
      perfilConsumo: "Diurno",
      consumoMensal: null,
      consumoAnual: null,
    },
  });

  const onSubmit = (data: CustomerFormValues) => {
    if (editingCustomer) {
      updateCustomer.mutate(
        { id: editingCustomer.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
            toast({ title: "Cliente atualizado com sucesso" });
            setEditingCustomer(null);
            resetForm();
          },
        }
      );
    } else {
      createCustomer.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
            toast({ title: "Cliente criado com sucesso" });
            setIsCreateOpen(false);
            resetForm();
          },
        }
      );
    }
  };

  const resetForm = () => {
    form.reset();
    setCoordinatesText("");
  };

  const applyCoordinatesText = (value: string) => {
    setCoordinatesText(value);

    const coordinates = parseCoordinates(value);
    if (!coordinates) {
      return;
    }

    form.setValue("latitude", coordinates.latitude, { shouldDirty: true, shouldValidate: true });
    form.setValue("longitude", coordinates.longitude, { shouldDirty: true, shouldValidate: true });
  };

  const findCoordinatesByAddress = async () => {
    const address = form.getValues("morada").trim();

    if (!address) {
      toast({
        title: "Introduza a morada primeiro",
        description: "Preencha a morada completa antes de procurar coordenadas.",
      });
      return;
    }

    setIsGeocoding(true);

    try {
      let firstResult: NominatimResult | undefined;

      for (const query of buildAddressQueries(address)) {
        const searchParams = new URLSearchParams({
          q: query,
          format: "jsonv2",
          addressdetails: "1",
          limit: "1",
          countrycodes: "pt",
          "accept-language": "pt",
        });

        const response = await fetch(`https://nominatim.openstreetmap.org/search?${searchParams}`, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          continue;
        }

        const results: NominatimResult[] = await response.json();
        firstResult = results[0];

        if (firstResult) {
          break;
        }
      }

      if (!firstResult) {
        toast({
          title: "Coordenadas não encontradas",
          description: "Confirme a morada ou cole as coordenadas manualmente.",
        });
        return;
      }

      const latitude = Number(firstResult.lat);
      const longitude = Number(firstResult.lon);

      form.setValue("latitude", latitude, { shouldDirty: true, shouldValidate: true });
      form.setValue("longitude", longitude, { shouldDirty: true, shouldValidate: true });
      setCoordinatesText(`${latitude}, ${longitude}`);

      toast({
        title: "Coordenadas encontradas",
        description: firstResult.display_name,
      });
    } catch {
      toast({
        title: "Não foi possível procurar coordenadas",
        description: "Tente novamente ou cole as coordenadas manualmente.",
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem a certeza que deseja eliminar este cliente?")) {
      deleteCustomer.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
            toast({ title: "Cliente eliminado" });
          },
        }
      );
    }
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setCoordinatesText(`${customer.latitude}, ${customer.longitude}`);
    form.reset({
      nome: customer.nome,
      morada: customer.morada,
      latitude: customer.latitude,
      longitude: customer.longitude,
      tipoCliente: customer.tipoCliente as "Residencial" | "Comercial" | "Industrial",
      precoEletricidade: customer.precoEletricidade,
      potenciaContratada: customer.potenciaContratada,
      perfilConsumo: customer.perfilConsumo as "Diurno" | "Noturno" | "Personalizado",
      consumoMensal: customer.consumoMensal,
      consumoAnual: customer.consumoAnual,
    });
  };

  const filtered = customers?.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.morada.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderCoordinateFields = () => (
    <>
      <FormItem className="col-span-2">
        <Label htmlFor="customer-coordinates">Coordenadas</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="customer-coordinates"
            value={coordinatesText}
            onChange={(event) => applyCoordinatesText(event.target.value)}
            placeholder="38.70476291364403, -9.415706227415274 ou URL do Google Maps"
          />
          <Button
            type="button"
            variant="outline"
            className="sm:shrink-0"
            onClick={findCoordinatesByAddress}
            disabled={isGeocoding}
          >
            <Search className="mr-2 h-4 w-4" />
            {isGeocoding ? "A procurar..." : "Procurar pela morada"}
          </Button>
        </div>
      </FormItem>
      <FormField control={form.control} name="latitude" render={({ field }) => (
        <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input type="number" step="0.000001" {...field} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={form.control} name="longitude" render={({ field }) => (
        <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input type="number" step="0.000001" {...field} /></FormControl><FormMessage /></FormItem>
      )} />
    </>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Gira os perfis de consumo e dados dos clientes.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsCreateOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Cliente</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="nome" render={({ field }) => (
                    <FormItem className="col-span-2"><FormLabel>Nome / Empresa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="morada" render={({ field }) => (
                    <FormItem className="col-span-2"><FormLabel>Morada Completa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  {renderCoordinateFields()}
                  
                  <FormField control={form.control} name="tipoCliente" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Cliente</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Residencial">Residencial</SelectItem>
                          <SelectItem value="Comercial">Comercial</SelectItem>
                          <SelectItem value="Industrial">Industrial</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="perfilConsumo" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Perfil de Consumo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Diurno">Diurno</SelectItem>
                          <SelectItem value="Noturno">Noturno</SelectItem>
                          <SelectItem value="Personalizado">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="precoEletricidade" render={({ field }) => (
                    <FormItem><FormLabel>Preço Energia (€/kWh)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="potenciaContratada" render={({ field }) => (
                    <FormItem><FormLabel>Potência Contratada (kVA)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <FormField control={form.control} name="consumoMensal" render={({ field: { value, ...rest } }) => (
                    <FormItem><FormLabel>Consumo Mensal Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="consumoAnual" render={({ field: { value, ...rest } }) => (
                    <FormItem><FormLabel>Consumo Anual Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createCustomer.isPending}>
                    {createCustomer.isPending ?"A guardar..." : "Guardar Cliente"}
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
            placeholder="Pesquisar clientes..."
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
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Morada</TableHead>
              <TableHead>Potência Contratada</TableHead>
              <TableHead>Preço Energia</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ?(
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 inline-block" /></TableCell>
                </TableRow>
              ))
            ) : filtered?.length === 0 ?(
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((cust) => (
                <TableRow key={cust.id}>
                  <TableCell className="font-medium">{cust.nome}</TableCell>
                  <TableCell>
                    <Badge variant={cust.tipoCliente === "Residencial" ?"default" : cust.tipoCliente === "Comercial" ?"secondary" : "outline"}>
                      {cust.tipoCliente}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={cust.morada}>{cust.morada}</TableCell>
                  <TableCell>{cust.potenciaContratada} kVA</TableCell>
                  <TableCell>{cust.precoEletricidade} €/kWh</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/clientes/${cust.id}`}>
                        <Button variant="ghost" size="icon" title="Ver detalhes">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Dialog open={editingCustomer?.id === cust.id} onOpenChange={(open) => {
                        if (!open) { setEditingCustomer(null); resetForm(); }
                        else openEdit(cust);
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Editar Cliente</DialogTitle>
                          </DialogHeader>
                          <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                              <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="nome" render={({ field }) => (
                                  <FormItem className="col-span-2"><FormLabel>Nome / Empresa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="morada" render={({ field }) => (
                                  <FormItem className="col-span-2"><FormLabel>Morada Completa</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                {renderCoordinateFields()}
                                
                                <FormField control={form.control} name="tipoCliente" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Tipo de Cliente</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="Residencial">Residencial</SelectItem>
                                        <SelectItem value="Comercial">Comercial</SelectItem>
                                        <SelectItem value="Industrial">Industrial</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )} />

                                <FormField control={form.control} name="perfilConsumo" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Perfil de Consumo</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger></FormControl>
                                      <SelectContent>
                                        <SelectItem value="Diurno">Diurno</SelectItem>
                                        <SelectItem value="Noturno">Noturno</SelectItem>
                                        <SelectItem value="Personalizado">Personalizado</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )} />

                                <FormField control={form.control} name="precoEletricidade" render={({ field }) => (
                                  <FormItem><FormLabel>Preço Energia (€/kWh)</FormLabel><FormControl><Input type="number" step="0.001" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="potenciaContratada" render={({ field }) => (
                                  <FormItem><FormLabel>Potência Contratada (kVA)</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                
                                <FormField control={form.control} name="consumoMensal" render={({ field: { value, ...rest } }) => (
                                  <FormItem><FormLabel>Consumo Mensal Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="consumoAnual" render={({ field: { value, ...rest } }) => (
                                  <FormItem><FormLabel>Consumo Anual Est. (kWh)</FormLabel><FormControl><Input type="number" value={value || ""} {...rest} /></FormControl><FormMessage /></FormItem>
                                )} />
                              </div>
                              <div className="flex justify-end">
                                <Button type="submit" disabled={updateCustomer.isPending}>
                                  {updateCustomer.isPending ?"A atualizar..." : "Atualizar Cliente"}
                                </Button>
                              </div>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cust.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
