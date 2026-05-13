import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Euro, TrendingUp, TrendingDown, Zap, Sun, Battery,
  BarChart3, Target, Clock, Leaf,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface AutoSizeCenario {
  potenciaInstalada: number;
  numPaineis: number;
  energiaAnualEstimada: number;
  autoconsumoAnual: number;
  excessoAnual: number;
  autoconsumoPerc: number;
  investimentoEstimado: number;
  poupancaAnual: number;
  paybackAnos: number;
  capacidadeBateriaRecomendada: number | null;
}

interface Props {
  cenario:       AutoSizeCenario;
  precoKwh:      number;
  consumoAnual:  number;
  consumoDiurnoPct: number;
}

const TAXA_ESCALADA  = 0.03;  // 3% tariff escalation per year
const TAXA_DESCONTO  = 0.04;  // 4% discount rate for NPV
const DEGRADACAO     = 0.005; // 0.5% panel degradation per year
const PRECO_INJECAO  = 0.06;  // €/kWh for grid injection (SERUP/OMIE reference)
const ANOS_VIDA      = 25;

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("pt-PT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtEur(n: number) {
  return `${fmt(Math.round(n))} €`;
}

export default function WizardStep7Financeiro({ cenario, precoKwh, consumoAnual, consumoDiurnoPct }: Props) {
  const {
    investimentoEstimado,
    poupancaAnual,
    paybackAnos,
    autoconsumoAnual,
    excessoAnual,
    autoconsumoPerc,
    energiaAnualEstimada,
    potenciaInstalada,
  } = cenario;

  const custoAtual       = consumoAnual * precoKwh;
  const receitaExcedente = excessoAnual * PRECO_INJECAO;
  const poupancaTotal    = poupancaAnual + receitaExcedente;
  const custoApos        = custoAtual - poupancaAnual;
  const reducaoFatura    = consumoAnual > 0 ? Math.round((poupancaAnual / custoAtual) * 100) : 0;

  // Year-by-year projection
  const projecao = useMemo(() => {
    const rows: { ano: number; poupanca: number; poupancaAcum: number; npvAcum: number }[] = [];
    let poupancaAcum = -investimentoEstimado;
    let npvAcum      = -investimentoEstimado;

    for (let ano = 1; ano <= ANOS_VIDA; ano++) {
      const degradFactor   = Math.pow(1 - DEGRADACAO, ano - 1);
      const tarifaFactor   = Math.pow(1 + TAXA_ESCALADA, ano - 1);
      const poupancaAno    = poupancaAnual * degradFactor * tarifaFactor;
      const receitaAno     = receitaExcedente * degradFactor;
      const fluxoAno       = poupancaAno + receitaAno;
      poupancaAcum        += fluxoAno;
      npvAcum             += fluxoAno / Math.pow(1 + TAXA_DESCONTO, ano);
      rows.push({ ano, poupanca: Math.round(fluxoAno), poupancaAcum: Math.round(poupancaAcum), npvAcum: Math.round(npvAcum) });
    }
    return rows;
  }, [investimentoEstimado, poupancaAnual, receitaExcedente]);

  const p10  = projecao.find(r => r.ano === 10)?.poupancaAcum ?? 0;
  const p15  = projecao.find(r => r.ano === 15)?.poupancaAcum ?? 0;
  const p25  = projecao[ANOS_VIDA - 1]?.poupancaAcum ?? 0;
  const npv25 = projecao[ANOS_VIDA - 1]?.npvAcum ?? 0;
  const paybackReal = projecao.findIndex(r => r.poupancaAcum >= 0) + 1;

  // Simple IRR approximation (annualized return)
  const irr = p25 > 0 ? Math.pow((investimentoEstimado + p25) / investimentoEstimado, 1 / ANOS_VIDA) - 1 : 0;

  // CO2 savings (0.253 kg CO2/kWh — Portuguese grid factor)
  const co2Anual = Math.round(autoconsumoAnual * 0.253 / 1000 * 10) / 10; // tonnes/year

  const KPI = ({ icon: Icon, label, value, sub, highlight = false, color = "" }: {
    icon: React.ElementType; label: string; value: string; sub?: string; highlight?: boolean; color?: string;
  }) => (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-xl border",
      highlight ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
    )}>
      <Icon size={20} className={cn("mt-0.5 shrink-0", color || (highlight ? "text-primary" : "text-muted-foreground"))} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold leading-tight", highlight && "text-primary")}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header KPIs */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Euro size={20} /> Resumo do Investimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI icon={Euro}      label="Investimento estimado"  value={fmtEur(investimentoEstimado)}         sub={`${potenciaInstalada} kWp`} />
            <KPI icon={TrendingUp} label="Poupança anual"        value={fmtEur(poupancaTotal)}                sub="energia + injeção" highlight />
            <KPI icon={Clock}     label="Payback simples"        value={`${paybackReal > 0 ? paybackReal : paybackAnos} anos`}  sub="estimado" highlight />
            <KPI icon={BarChart3} label="Poupança a 25 anos"     value={fmtEur(p25)}                          sub="valor nominal" />
          </div>
        </CardContent>
      </Card>

      {/* Before/After */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Zap size={20} /> Fatura Elétrica — Antes e Depois</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
            <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Custo atual/ano</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">{fmtEur(custoAtual)}</p>
              <p className="text-xs text-muted-foreground mt-1">{fmt(consumoAnual)} kWh × {fmt(precoKwh * 1000, 0)} m€/kWh</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TrendingDown size={28} className="text-primary" />
              <Badge variant="default" className="text-sm px-3 py-1">−{reducaoFatura}%</Badge>
              <p className="text-xs text-muted-foreground text-center">redução estimada da fatura</p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Custo após instalação/ano</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{fmtEur(Math.max(0, custoApos))}</p>
              <p className="text-xs text-muted-foreground mt-1">energia da rede residual</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Energy detail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Sun size={20} /> Energia e Autoconsumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KPI icon={Sun}     label="Produção anual"          value={`${fmt(energiaAnualEstimada)} kWh`}   sub="estimada" />
            <KPI icon={Zap}     label="Autoconsumo direto"      value={`${fmt(autoconsumoAnual)} kWh`}        sub={`${autoconsumoPerc}% da produção`} highlight />
            <KPI icon={TrendingUp} label="Excedente (injeção)"  value={`${fmt(excessoAnual)} kWh`}            sub={`${fmtEur(receitaExcedente)}/ano · ${fmt(PRECO_INJECAO * 100, 0)} c€/kWh`} />
            <KPI icon={Euro}    label="Poupança energética"     value={fmtEur(poupancaAnual)}                  sub="energia autoconsumida" highlight />
            <KPI icon={Euro}    label="Receita por excedentes"  value={fmtEur(receitaExcedente)}               sub="injeção na rede" />
            <KPI icon={Leaf}    label="CO₂ evitado"             value={`${co2Anual} t CO₂/ano`}               sub="fator 253 g/kWh (rede PT)" color="text-green-600" />
          </div>
        </CardContent>
      </Card>

      {/* 25-year chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><BarChart3 size={20} /> Projeção a 25 Anos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projecao} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="ano" tick={{ fontSize: 11 }} tickFormatter={v => `${v}a`} interval={4} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} />
                <Tooltip
                  formatter={(v: number) => [`${fmt(v)} €`, ""]}
                  labelFormatter={l => `Ano ${l}`}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="poupancaAcum" name="Poupança Acumulada" stroke="hsl(var(--primary))" fill="url(#gradAcum)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">10 anos</p>
              <p className={cn("text-base font-bold", p10 >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600")}>{fmtEur(p10)}</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">15 anos</p>
              <p className={cn("text-base font-bold", p15 >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600")}>{fmtEur(p15)}</p>
            </div>
            <div className="text-center p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <p className="text-xs text-muted-foreground">25 anos</p>
              <p className="text-base font-bold text-primary">{fmtEur(p25)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial metrics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Target size={20} /> Rentabilidade do Investimento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Payback simples</p>
              <p className="text-lg font-bold">{paybackReal > 0 ? paybackReal : ">"+ ANOS_VIDA} anos</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">VAL (NPV) a 25 anos</p>
              <p className={cn("text-lg font-bold", npv25 >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600")}>{fmtEur(npv25)}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">TIR estimada</p>
              <p className="text-lg font-bold">{(irr * 100).toFixed(1)}%</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Redução da fatura</p>
              <p className="text-lg font-bold text-primary">−{reducaoFatura}%</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Projeção com {(TAXA_ESCALADA * 100).toFixed(0)}% escalada tarifária/ano, {(DEGRADACAO * 100 * 10).toFixed(0)}%/10a degradação de painéis, {(TAXA_DESCONTO * 100).toFixed(0)}% taxa de desconto. Valores estimados — não constituem aconselhamento financeiro.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
