import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  useGetSystem,
  useGetCustomer,
  useGetPanel,
  useGetInverter,
  useGetBattery,
  useCheckSystemCompatibility,
  useGetSystemPvgis,
  useCalculateFinancial,
  getGetSystemQueryKey,
  getCheckSystemCompatibilityQueryKey,
  getGetSystemPvgisQueryKey,
  getGetCustomerQueryKey,
  getGetPanelQueryKey,
  getGetInverterQueryKey,
  getGetBatteryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Calculator, Euro, Zap, ArrowDownToLine, ArrowUpFromLine, Activity } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

const financialSchema = z.object({
  custodoSistema: z.coerce.number().min(0, "Custo obrigatório"),
  percentagemAutoconsumo: z.coerce.number().min(0).max(100),
  precoVendaExcedente: z.coerce.number().min(0),
});

type FinancialFormValues = z.infer<typeof financialSchema>;

export default function SystemDetail() {
  const { id } = useParams<{ id: string }>();
  const systemId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [hasCalculatedFinances, setHasCalculatedFinances] = useState(false);

  const { data: system, isLoading: loadingSystem } = useGetSystem(systemId, {
    query: { enabled: !!systemId, queryKey: getGetSystemQueryKey(systemId) }
  });

  const { data: customer } = useGetCustomer(system?.customerId || 0, {
    query: { enabled: !!system?.customerId, queryKey: getGetCustomerQueryKey(system?.customerId || 0) }
  });

  const { data: panel } = useGetPanel(system?.panelId || 0, {
    query: { enabled: !!system?.panelId, queryKey: getGetPanelQueryKey(system?.panelId || 0) }
  });

  const { data: inverter } = useGetInverter(system?.inverterId || 0, {
    query: { enabled: !!system?.inverterId, queryKey: getGetInverterQueryKey(system?.inverterId || 0) }
  });

  const { data: battery } = useGetBattery(system?.batteryId || 0, {
    query: { enabled: !!system?.batteryId, queryKey: getGetBatteryQueryKey(system?.batteryId || 0) }
  });

  const { data: compatibility, isLoading: loadingCompat } = useCheckSystemCompatibility(
    { 
      panelId: system?.panelId || 0, 
      inverterId: system?.inverterId || 0, 
      numPaineis: system?.numPaineis || 0, 
      numStrings: system?.numStrings || 0, 
      paineisporstring: system?.paineisporstring || 0 
    },
    {
      query: {
        enabled: !!system,
        queryKey: getCheckSystemCompatibilityQueryKey({ 
          panelId: system?.panelId || 0, 
          inverterId: system?.inverterId || 0, 
          numPaineis: system?.numPaineis || 0, 
          numStrings: system?.numStrings || 0, 
          paineisporstring: system?.paineisporstring || 0 
        })
      }
    }
  );

  const { data: pvgis, isLoading: loadingPvgis } = useGetSystemPvgis(systemId, {
    query: { enabled: !!systemId, queryKey: getGetSystemPvgisQueryKey(systemId) }
  });

  const calcFinancial = useCalculateFinancial();

  const form = useForm<FinancialFormValues>({
    resolver: zodResolver(financialSchema),
    defaultValues: {
      custodoSistema: 5000,
      percentagemAutoconsumo: 60,
      precoVendaExcedente: 0.05,
    },
  });

  const onCalculateFinancials = (data: FinancialFormValues) => {
    calcFinancial.mutate(
      { id: systemId, data },
      {
        onSuccess: (res) => {
          toast({ title: "Cálculos financeiros atualizados" });
          setHasCalculatedFinances(true);
        },
      }
    );
  };

  const finResults = calcFinancial.data;

  if (loadingSystem || !system) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalPowerW = (panel?.potencia || 0) * system.numPaineis;
  const totalPowerkW = (totalPowerW / 1000).toFixed(2);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Sistema #{system.id}</h1>
            {compatibility?.estado === "Válido" ? (
               <Badge className="bg-emerald-500 hover:bg-emerald-600">Válido</Badge>
            ) : compatibility?.estado === "Inválido" ? (
               <Badge variant="destructive">Inválido</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1">
            Cliente: {customer?.nome || "A carregar..."} | Potência: {totalPowerkW} kWp
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="production">Produção PVGIS</TabsTrigger>
          <TabsTrigger value="financial">Análise Financeira</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Equipamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Módulos PV</p>
                    <p className="font-medium">{panel?.fabricante} {panel?.nome}</p>
                    <p className="text-xs text-muted-foreground">{system.numPaineis}x {panel?.potencia}Wp</p>
                  </div>
                </div>
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Inversor</p>
                    <p className="font-medium">{inverter?.fabricante} {inverter?.nome}</p>
                    <p className="text-xs text-muted-foreground">{inverter?.potenciaAc}W AC</p>
                  </div>
                </div>
                <div className="flex items-start justify-between pb-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Bateria</p>
                    {battery ? (
                      <>
                        <p className="font-medium">{battery.fabricante} {battery.nome}</p>
                        <p className="text-xs text-muted-foreground">{battery.capacidade}kWh</p>
                      </>
                    ) : (
                      <p className="text-sm italic">Sem bateria associada</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Validação Elétrica</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingCompat ? (
                  <Skeleton className="h-32 w-full" />
                ) : compatibility ? (
                  <div className="space-y-4">
                    {compatibility.estado === "Válido" ? (
                      <Alert className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <CheckCircle className="h-4 w-4 stroke-emerald-600" />
                        <AlertTitle>Sistema Válido</AlertTitle>
                        <AlertDescription className="text-emerald-600/90 text-xs">
                          Tensão, corrente e potência dentro dos limites do inversor.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Sistema Inválido</AlertTitle>
                        <AlertDescription>
                          A configuração excede os limites operativos.
                        </AlertDescription>
                      </Alert>
                    )}

                    {compatibility.erros && compatibility.erros.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-destructive">Problemas:</p>
                        <ul className="text-xs text-destructive space-y-1 list-disc pl-4">
                          {compatibility.erros.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="production" className="mt-6 space-y-6">
          {loadingPvgis ? (
            <div className="space-y-4">
              <Skeleton className="h-[400px] w-full" />
            </div>
          ) : pvgis ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-sidebar">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <Zap className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-sidebar-foreground/70">Produção Anual Estimada</p>
                      <p className="text-3xl font-bold text-sidebar-foreground">{pvgis.producaoAnual.toFixed(0)} kWh</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-sidebar">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                      <Activity className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-sidebar-foreground/70">Produção Específica</p>
                      <p className="text-3xl font-bold text-sidebar-foreground">{pvgis.producaoEspecifica.toFixed(0)} kWh/kWp</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Produção Mensal</CardTitle>
                  <CardDescription>Estimativa PVGIS baseada nas coordenadas do cliente e configuração dos módulos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pvgis.producaoMensal} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="nomeMes" 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        />
                        <YAxis 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          tickFormatter={(val) => `${val} kWh`}
                        />
                        <RechartsTooltip 
                          formatter={(value: number) => [`${value.toFixed(1)} kWh`, 'Produção']}
                          cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                          contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar 
                          dataKey="producao" 
                          fill="hsl(var(--primary))" 
                          radius={[4, 4, 0, 0]} 
                          maxBarSize={50}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>Não foi possível carregar os dados do PVGIS.</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="financial" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Parâmetros Financeiros</CardTitle>
                <CardDescription>Ajuste os valores para simular o retorno.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onCalculateFinancials)} className="space-y-4">
                    <FormField control={form.control} name="custodoSistema" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custo do Sistema (€)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="percentagemAutoconsumo" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taxa Autoconsumo (%)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <p className="text-xs text-muted-foreground">Ex: 60 = 60% da energia é consumida localmente</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="precoVendaExcedente" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço Venda Excedente (€/kWh)</FormLabel>
                        <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={calcFinancial.isPending}>
                      <Calculator className="mr-2 h-4 w-4" />
                      {calcFinancial.isPending ? "A calcular..." : "Calcular Retorno"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <div className="lg:col-span-2">
              {finResults ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="col-span-1 sm:col-span-2 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center justify-center text-center space-y-2">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Período de Retorno (Payback)</p>
                        <div className="flex items-end gap-2">
                          <span className="text-5xl font-black text-primary">{finResults.payback.toFixed(1)}</span>
                          <span className="text-xl font-medium text-muted-foreground mb-1">anos</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-emerald-500/10 text-emerald-600">
                          <ArrowDownToLine className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Poupança Energia</p>
                          <p className="text-2xl font-bold">{finResults.poupancaAnual.toFixed(2)} € <span className="text-sm font-normal text-muted-foreground">/ano</span></p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground border-t pt-3">
                        Baseado em {finResults.autoconsumo.toFixed(0)} kWh consumidos x {customer?.precoEletricidade} €/kWh
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-blue-500/10 text-blue-600">
                          <ArrowUpFromLine className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Receita Excedente</p>
                          <p className="text-2xl font-bold">{finResults.receitaExcedente.toFixed(2)} € <span className="text-sm font-normal text-muted-foreground">/ano</span></p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground border-t pt-3">
                        Baseado em {finResults.excedente.toFixed(0)} kWh injetados
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-lg bg-muted/20">
                  <Calculator className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">Análise Financeira</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Preencha os parâmetros financeiros ao lado e clique em calcular para visualizar a estimativa de retorno do investimento.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
