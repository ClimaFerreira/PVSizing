import { useRoi } from "@/contexts/RoiContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from "recharts";
import { Battery, Zap, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export default function RoiPage() {
  const { params, setParams, results, calculate } = useRoi();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setParams(prev => ({ ...prev, [name]: value }));
  };

  const handleToggle = (checked: boolean) => {
    setParams(prev => ({ ...prev, hasBattery: checked }));
  };

  const formatEur = (val: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(val);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col mb-8">
        <h1 className="text-3xl font-bold text-[#0D2B45] tracking-tight">Estudo ROI</h1>
        <p className="text-muted-foreground">Análise financeira e de retorno de investimento.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-[#1a3d5c]/10 shadow-md">
            <CardHeader className="bg-slate-50 border-b">
              <CardTitle className="text-lg text-[#0D2B45]">Parâmetros do Sistema</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="investmentCost">Custo do Investimento (€)</Label>
                <Input type="number" id="investmentCost" name="investmentCost" value={params.investmentCost} onChange={handleChange} placeholder="Ex: 4500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="panelPower">Potência Painel (Wp)</Label>
                  <Input type="number" id="panelPower" name="panelPower" value={params.panelPower} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numPanels">Nº Painéis</Label>
                  <Input type="number" id="numPanels" name="numPanels" value={params.numPanels} onChange={handleChange} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inclination">Inclinação (°)</Label>
                  <Input type="number" id="inclination" name="inclination" value={params.inclination} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label>Orientação</Label>
                  <Select value={params.orientation} onValueChange={(val) => handleSelectChange("orientation", val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Orientação" />
                    </SelectTrigger>
                    <SelectContent>
                      {["S", "SW", "SE", "W", "E", "NW", "NE", "N"].map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="annualConsumption">Consumo Anual (kWh)</Label>
                <Input type="number" id="annualConsumption" name="annualConsumption" value={params.annualConsumption} onChange={handleChange} placeholder="Opcional" />
              </div>

              <div className="flex items-center justify-between py-2">
                <Label htmlFor="hasBattery" className="flex items-center gap-2 cursor-pointer">
                  <Battery size={16} className="text-[#F5A623]" /> Com Baterias
                </Label>
                <Switch id="hasBattery" checked={params.hasBattery} onCheckedChange={handleToggle} />
              </div>

              {params.hasBattery && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label htmlFor="batteryCapacity">Capacidade Bateria (kWh)</Label>
                  <Input type="number" id="batteryCapacity" name="batteryCapacity" value={params.batteryCapacity} onChange={handleChange} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2 border-t mt-4">
                <div className="space-y-2">
                  <Label htmlFor="electricityPrice">Custo Compra (€/kWh)</Label>
                  <Input type="number" id="electricityPrice" name="electricityPrice" value={params.electricityPrice} onChange={handleChange} step="0.01" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedInTariff">Tarifa Venda (€/kWh)</Label>
                  <Input type="number" id="feedInTariff" name="feedInTariff" value={params.feedInTariff} onChange={handleChange} step="0.01" />
                </div>
              </div>

              <Button onClick={calculate} className="w-full bg-[#F5A623] hover:bg-[#e0941c] text-[#0D2B45] font-bold mt-4 h-12 text-lg">
                Calcular Retorno
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {!results ? (
            <div className="h-full min-h-[400px] flex items-center justify-center border-2 border-dashed rounded-xl bg-slate-50 text-muted-foreground">
              Preencha os dados e clique em Calcular
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-[#0D2B45] text-white border-none shadow-lg">
                  <CardContent className="pt-6">
                    <div className="text-[#8ca3b8] font-medium text-sm">Poupança Anual</div>
                    <div className="text-4xl font-bold text-[#F5A623] mt-1">{formatEur(results.annualSavingsEur)}<span className="text-lg text-[#8ca3b8] font-normal">/ano</span></div>
                  </CardContent>
                </Card>
                <Card className="border-[#1E88E5] shadow-md">
                  <CardContent className="pt-6">
                    <div className="text-muted-foreground font-medium text-sm">Payback (Retorno)</div>
                    <div className="text-4xl font-bold text-[#0D2B45] mt-1">{results.paybackYears === Infinity ? ">25" : results.paybackYears.toFixed(1)} <span className="text-lg text-muted-foreground font-normal">anos</span></div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-1">
                  <Zap size={16} className="text-[#1E88E5]" />
                  <div className="text-xs text-muted-foreground">Potência Sistema</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{results.totalPowerKwp.toFixed(2)} kWp</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-1">
                  <Zap size={16} className="text-[#F5A623]" />
                  <div className="text-xs text-muted-foreground">Produção Anual</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{Math.round(results.annualProductionKwh)} kWh</div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-1">
                  <ArrowDownToLine size={16} className="text-[#10B981]" />
                  <div className="text-xs text-muted-foreground">Autoconsumo</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{Math.round(results.selfKwh)} kWh <span className="text-xs text-muted-foreground font-normal">({Math.round(results.selfRate*100)}%)</span></div>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-1">
                  <ArrowUpFromLine size={16} className="text-[#8B5CF6]" />
                  <div className="text-xs text-muted-foreground">Injeção Rede</div>
                  <div className="text-lg font-semibold text-[#0D2B45]">{Math.round(results.exportKwh)} kWh</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-base text-[#0D2B45]">Produção Mensal (kWh)</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.monthlyKwh.map((val, i) => ({ month: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i], val }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} width={40} />
                        <RechartsTooltip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="val" fill="#1E88E5" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-4 border-b">
                    <CardTitle className="text-base text-[#0D2B45]">Retorno a 25 Anos (€)</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={results.cumulativeNet.map((val, i) => ({ year: i + 1, val }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} tickCount={6} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} width={40} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="3 3" />
                        <defs>
                          <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="val" stroke="#0D2B45" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              
              <div className="flex gap-4">
                 <div className="flex-1 bg-slate-50 p-4 rounded-lg border text-center">
                    <div className="text-xs text-muted-foreground">Ganho Líquido (20 anos)</div>
                    <div className="text-xl font-bold text-[#0D2B45]">{formatEur(results.netAfter20)}</div>
                 </div>
                 <div className="flex-1 bg-slate-50 p-4 rounded-lg border text-center">
                    <div className="text-xs text-muted-foreground">Ganho Líquido (25 anos)</div>
                    <div className="text-xl font-bold text-[#10B981]">{formatEur(results.netAfter25)}</div>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
