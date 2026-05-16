import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Battery, Plus, Trash2, AlertTriangle, CheckCircle2,
  TrendingUp, Zap, Info, ChevronRight, Lightbulb,
} from "lucide-react";
import type { Battery as BatCat } from "@workspace/api-client-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BatteryUnit {
  batteryId: number;
  qty: number;
}

interface CenarioLike {
  excessoMensal: number[];
  excessoAnual: number;
  autoconsumoMensal: number[];
  consumoMensal: number[];
  autoconsumoAnual: number;
  energiaAnualEstimada: number;
  capacidadeBateriaRecomendada: number | null;
  poupancaAnual: number;
  investimentoEstimado: number;
}

interface Props {
  batteries: BatCat[];
  batteryUnits: BatteryUnit[];
  onUnitsChange: (units: BatteryUnit[]) => void;
  activeCenario: CenarioLike | null;
  precoKwh: number;
  perfilDiurnoPct: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ETA = 0.92; // round-trip efficiency
const CUSTO_KWH_BAT = 600; // €/kWh installed

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcSystem(units: BatteryUnit[], bats: BatCat[]) {
  const lines = units
    .map(u => ({ bat: bats.find(b => b.id === u.batteryId), qty: u.qty }))
    .filter((l): l is { bat: BatCat; qty: number } => !!l.bat && l.qty > 0);

  if (!lines.length) return null;

  const totalCap = lines.reduce((s, l) => s + l.bat.capacidade * l.qty, 0);
  const dodPct = lines[0].bat.profundidadeDescarga > 0 ? lines[0].bat.profundidadeDescarga : 80;
  const dod = dodPct / 100;
  const utilCap = totalCap * dod;
  const potCarga = lines.reduce((s, l) => {
    const pc = l.bat.potenciaCarga > 0 ? l.bat.potenciaCarga : l.bat.capacidade / 2;
    return s + pc * l.qty;
  }, 0);
  const potDesc = lines.reduce((s, l) => {
    const pd = l.bat.potenciaDescarga > 0 ? l.bat.potenciaDescarga : l.bat.capacidade;
    return s + pd * l.qty;
  }, 0);
  const tensao = lines[0].bat.tensao;
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  return { totalCap, utilCap, dodPct, potCarga, potDesc, tensao, lines, totalUnits };
}

function calcStudy(sys: NonNullable<ReturnType<typeof calcSystem>>, cenario: CenarioLike, perfilDiurnoPct: number, precoKwh: number) {
  const excessoMedioDiario = cenario.excessoAnual / 365;
  const energiaParaCarregar = sys.utilCap / ETA;

  const percCargaDiaria = energiaParaCarregar > 0
    ? Math.min(100, Math.round(excessoMedioDiario / energiaParaCarregar * 100))
    : 0;

  const diasParaEncher = excessoMedioDiario > 0 ? energiaParaCarregar / excessoMedioDiario : 999;

  // Monthly autoconsumo gain from battery
  const ganhoMensal = cenario.excessoMensal.map((exc, m) => {
    const excDia = exc / DIAS_MES[m];
    const batDia = Math.min(excDia, sys.utilCap);
    const batMes = batDia * DIAS_MES[m] * ETA;
    const consumoNoturnoMes = cenario.consumoMensal[m] * (1 - perfilDiurnoPct / 100);
    return Math.round(Math.min(batMes, consumoNoturnoMes));
  });

  const ganhoAnual = ganhoMensal.reduce((a, b) => a + b, 0);
  const poupancaAdicional = Math.round(ganhoAnual * precoKwh);
  const investimentoBat = Math.round(sys.totalCap * CUSTO_KWH_BAT);
  const paybackBat = poupancaAdicional > 0
    ? Math.round(investimentoBat / poupancaAdicional * 10) / 10
    : 99;

  const ciclosAnuais = energiaParaCarregar > 0
    ? Math.round(Math.min(365, (cenario.excessoAnual / energiaParaCarregar)))
    : 0;

  // Autoconsumo comparison
  const autoconsumoComBat = cenario.autoconsumoAnual + ganhoAnual;
  const autoconsumoPercComBat = cenario.energiaAnualEstimada > 0
    ? Math.round((autoconsumoComBat / cenario.energiaAnualEstimada) * 100)
    : 0;
  const autoconsumoPercSemBat = cenario.energiaAnualEstimada > 0
    ? Math.round((cenario.autoconsumoAnual / cenario.energiaAnualEstimada) * 100)
    : 0;

  // Sizing status
  let status: "subdimensionada" | "equilibrada" | "sobredimensionada";
  if (diasParaEncher > 4) status = "sobredimensionada";
  else if (sys.utilCap < excessoMedioDiario * 0.4) status = "subdimensionada";
  else status = "equilibrada";

  // Recommendation text
  const recCap = excessoMedioDiario > 0
    ? `${(excessoMedioDiario * 1.2).toFixed(0)}–${(excessoMedioDiario * 2).toFixed(0)} kWh`
    : null;

  return {
    excessoMedioDiario,
    energiaParaCarregar,
    percCargaDiaria,
    diasParaEncher,
    ganhoAnual,
    poupancaAdicional,
    investimentoBat,
    paybackBat,
    ciclosAnuais,
    ganhoMensal,
    autoconsumoComBat,
    autoconsumoPercComBat,
    autoconsumoPercSemBat,
    status,
    recCap,
  };
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: "subdimensionada" | "equilibrada" | "sobredimensionada" }) {
  if (status === "equilibrada") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 gap-1.5">
        <CheckCircle2 size={11} /> Equilibrada
      </Badge>
    );
  }
  if (status === "subdimensionada") {
    return (
      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 gap-1.5">
        <Info size={11} /> Subdimensionada
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 gap-1.5">
      <AlertTriangle size={11} /> Sobredimensionada
    </Badge>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WizardBatteryStudy({ batteries, batteryUnits, onUnitsChange, activeCenario, precoKwh, perfilDiurnoPct }: Props) {
  const [addBatId, setAddBatId] = useState<number | null>(batteries[0]?.id ?? null);

  const sys = useMemo(() => calcSystem(batteryUnits, batteries), [batteryUnits, batteries]);
  const study = useMemo(() => {
    if (!sys || !activeCenario) return null;
    return calcStudy(sys, activeCenario, perfilDiurnoPct, precoKwh);
  }, [sys, activeCenario, perfilDiurnoPct, precoKwh]);

  // Auto-suggestions based on recommended capacity
  const suggestions = useMemo(() => {
    if (!activeCenario?.capacidadeBateriaRecomendada) return [];
    const target = activeCenario.capacidadeBateriaRecomendada;
    return batteries.flatMap(bat => {
      const dod = bat.profundidadeDescarga > 0 ? bat.profundidadeDescarga / 100 : 0.8;
      const qtyRec = Math.max(1, Math.ceil(target / (bat.capacidade * dod)));
      return [1, qtyRec, qtyRec + 1]
        .filter((q, i, a) => q >= 1 && q <= 8 && a.indexOf(q) === i)
        .map(qty => ({
          batteryId: bat.id,
          qty,
          label: `${bat.fabricante} ${bat.nome}`,
          totalCap: bat.capacidade * qty,
          utilCap: +(bat.capacidade * qty * dod).toFixed(1),
          isRec: qty === qtyRec,
        }));
    })
      .sort((a, b) => Math.abs(a.utilCap - target) - Math.abs(b.utilCap - target))
      .slice(0, 4);
  }, [batteries, activeCenario]);

  function addLine() {
    if (!addBatId) return;
    const existing = batteryUnits.find(u => u.batteryId === addBatId);
    if (existing) {
      onUnitsChange(batteryUnits.map(u => u.batteryId === addBatId ? { ...u, qty: u.qty + 1 } : u));
    } else {
      onUnitsChange([...batteryUnits, { batteryId: addBatId, qty: 1 }]);
    }
  }

  function removeLine(idx: number) {
    onUnitsChange(batteryUnits.filter((_, i) => i !== idx));
  }

  function updateQty(idx: number, qty: number) {
    if (qty < 1) { removeLine(idx); return; }
    onUnitsChange(batteryUnits.map((u, i) => i === idx ? { ...u, qty } : u));
  }

  function applySuggestion(s: { batteryId: number; qty: number }) {
    onUnitsChange([{ batteryId: s.batteryId, qty: s.qty }]);
  }

  const fmt = (n: number) => n.toLocaleString("pt-PT");

  return (
    <div className="space-y-4">

      {/* ── Selection ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Battery size={18} className="text-primary" /> Baterias Selecionadas
          </CardTitle>
          <CardDescription>Adicione uma ou mais baterias do catálogo para o estudo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Line items */}
          {batteryUnits.length > 0 && (
            <div className="space-y-2">
              {batteryUnits.map((unit, idx) => {
                const bat = batteries.find(b => b.id === unit.batteryId);
                if (!bat) return null;
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border">
                    <Battery size={16} className="text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{bat.fabricante} {bat.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {bat.capacidade} kWh · {bat.tensao} V · DoD {bat.profundidadeDescarga > 0 ? bat.profundidadeDescarga : 80}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => updateQty(idx, unit.qty - 1)}>–</Button>
                      <span className="w-8 text-center text-sm font-bold">{unit.qty}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => updateQty(idx, unit.qty + 1)}>+</Button>
                    </div>
                    <div className="text-right shrink-0 min-w-[80px]">
                      <p className="text-sm font-bold">{(bat.capacidade * unit.qty).toFixed(1)} kWh</p>
                      <p className="text-[10px] text-muted-foreground">× {unit.qty} un.</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(idx)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add line */}
          <div className="flex items-center gap-2">
            <Select value={addBatId ? String(addBatId) : ""} onValueChange={v => setAddBatId(Number(v))}>
              <SelectTrigger className="flex-1 text-sm h-9">
                <SelectValue placeholder="Selecionar modelo…" />
              </SelectTrigger>
              <SelectContent>
                {batteries.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.fabricante} {b.nome} — {b.capacidade} kWh
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addLine} disabled={!addBatId} className="gap-1.5 shrink-0">
              <Plus size={14} /> Adicionar
            </Button>
          </div>

          {/* System totals */}
          {sys && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {[
                { label: "Cap. nominal", val: `${sys.totalCap.toFixed(1)} kWh` },
                { label: `Cap. útil (DoD ${sys.dodPct}%)`, val: `${sys.utilCap.toFixed(1)} kWh`, hi: true },
                { label: "Carga máx.", val: sys.potCarga > 0 ? `${sys.potCarga.toFixed(1)} kW` : "—" },
                { label: "Descarga máx.", val: sys.potDesc > 0 ? `${sys.potDesc.toFixed(1)} kW` : "—" },
              ].map(({ label, val, hi }) => (
                <div key={label} className={cn("rounded-lg p-2.5 text-center border", hi ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border")}>
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  <p className={cn("font-bold text-sm mt-0.5", hi ? "text-primary" : "text-foreground")}>{val}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Auto-suggestions ─────────────────────────────────────────────────── */}
      {suggestions.length > 0 && batteryUnits.length === 0 && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Lightbulb size={13} className="text-primary" /> Sugestões Automáticas
              {activeCenario?.capacidadeBateriaRecomendada && (
                <span className="font-normal normal-case tracking-normal">
                  — alvo: {activeCenario.capacidadeBateriaRecomendada.toFixed(0)} kWh úteis
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => applySuggestion(s)}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all hover:border-primary/50 hover:bg-primary/5",
                    s.isRec ? "border-primary/40 bg-primary/5" : "border-border"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{s.label}</p>
                      {s.isRec && <Badge variant="outline" className="text-[10px] text-primary border-primary/40 shrink-0">Rec.</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.qty}× — {s.totalCap.toFixed(0)} kWh nom. · {s.utilCap} kWh úteis</p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Charging study ───────────────────────────────────────────────────── */}
      {study && sys && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap size={18} className="text-amber-500" />
              Estudo de Carregamento
              <StatusChip status={study.status} />
            </CardTitle>
            <CardDescription>
              Análise da viabilidade de carregar {sys.totalCap.toFixed(1)} kWh ({sys.utilCap.toFixed(1)} kWh úteis) com o excedente solar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Excedente médio/dia",
                  val: `${study.excessoMedioDiario.toFixed(1)} kWh`,
                  sub: "disponível para bateria",
                  hi: false,
                },
                {
                  label: "Energia p/ carregar",
                  val: `${study.energiaParaCarregar.toFixed(1)} kWh`,
                  sub: `cap. útil ÷ η (${(ETA * 100).toFixed(0)}%)`,
                  hi: false,
                },
                {
                  label: "Carga diária média",
                  val: `${study.percCargaDiaria}%`,
                  sub: `≈${study.diasParaEncher.toFixed(1)} dias p/ encher`,
                  hi: study.percCargaDiaria >= 60,
                },
                {
                  label: "Ciclos/ano estimados",
                  val: `${study.ciclosAnuais}`,
                  sub: "cargas completas equivalentes",
                  hi: false,
                },
              ].map(({ label, val, sub, hi }) => (
                <div key={label} className={cn("rounded-xl p-3 text-center border", hi ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border")}>
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  <p className={cn("font-bold text-sm mt-0.5", hi ? "text-primary" : "text-foreground")}>{val}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                </div>
              ))}
            </div>

            {/* Sizing assessment */}
            <div className={cn(
              "rounded-xl p-3 border text-sm",
              study.status === "equilibrada" ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" :
              study.status === "sobredimensionada" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
              "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
            )}>
              {study.status === "equilibrada" && (
                <p className="text-emerald-800 dark:text-emerald-300">
                  <strong>Bem dimensionada.</strong> O excedente solar é suficiente para carregar a bateria em {study.diasParaEncher.toFixed(1)} dias.
                  Com {study.percCargaDiaria}% de carga diária média, o sistema é viável.
                </p>
              )}
              {study.status === "sobredimensionada" && (
                <>
                  <p className="text-amber-800 dark:text-amber-300 mb-1.5">
                    <strong>Capacidade útil: {sys.utilCap.toFixed(1)} kWh</strong> — Excedente diário médio disponível: {study.excessoMedioDiario.toFixed(1)} kWh.
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs">
                    A bateria demora {study.diasParaEncher.toFixed(1)} dias a carregar totalmente. Na maioria dos dias não carregará por completo.
                    {study.recCap && <> Capacidade recomendada: <strong>{study.recCap}</strong>.</>}
                  </p>
                </>
              )}
              {study.status === "subdimensionada" && (
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>Capacidade reduzida.</strong> O excedente solar ({study.excessoMedioDiario.toFixed(1)} kWh/dia) permite carregar a bateria várias vezes por dia.
                  Poderá aumentar a capacidade para absorver mais excedente.
                  {study.recCap && <> Capacidade recomendada: <strong>{study.recCap}</strong>.</>}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Comparison with/without battery ─────────────────────────────────── */}
      {study && sys && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp size={18} className="text-emerald-500" />
              Simulação: Com vs. Sem Bateria
            </CardTitle>
            <CardDescription>Impacto da bateria no autoconsumo e na poupança anual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    <th className="text-left pb-2 pr-4 font-medium">Indicador</th>
                    <th className="text-right pb-2 pr-4 font-medium">Sem bateria</th>
                    <th className="text-right pb-2 pr-4 font-medium">Com bateria</th>
                    <th className="text-right pb-2 font-medium text-emerald-600 dark:text-emerald-400">Ganho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    {
                      label: "Autoconsumo anual",
                      sem: `${fmt(activeCenario!.autoconsumoAnual)} kWh`,
                      com: `${fmt(study.autoconsumoComBat)} kWh`,
                      ganho: `+${fmt(study.ganhoAnual)} kWh`,
                    },
                    {
                      label: "Taxa de autoconsumo",
                      sem: `${study.autoconsumoPercSemBat}%`,
                      com: `${study.autoconsumoPercComBat}%`,
                      ganho: `+${study.autoconsumoPercComBat - study.autoconsumoPercSemBat} pp`,
                    },
                    {
                      label: "Poupança/ano",
                      sem: `${fmt(activeCenario!.poupancaAnual)} €`,
                      com: `${fmt(activeCenario!.poupancaAnual + study.poupancaAdicional)} €`,
                      ganho: `+${fmt(study.poupancaAdicional)} €`,
                    },
                  ].map(r => (
                    <tr key={r.label}>
                      <td className="py-2 pr-4 text-muted-foreground">{r.label}</td>
                      <td className="py-2 pr-4 text-right font-medium">{r.sem}</td>
                      <td className="py-2 pr-4 text-right font-semibold">{r.com}</td>
                      <td className="py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{r.ganho}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Separator />

            {/* Financial summary for battery */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Investimento bateria",
                  val: `${fmt(study.investimentoBat)} €`,
                  sub: `${sys.totalCap.toFixed(1)} kWh × ${CUSTO_KWH_BAT} €/kWh`,
                  hi: false,
                },
                {
                  label: "Poupança adicional/ano",
                  val: `${fmt(study.poupancaAdicional)} €`,
                  sub: `${fmt(study.ganhoAnual)} kWh × ${precoKwh} €/kWh`,
                  hi: false,
                },
                {
                  label: "Payback da bateria",
                  val: study.paybackBat < 50 ? `${study.paybackBat} anos` : "N/A",
                  sub: "adicional ao FV",
                  hi: study.paybackBat <= 12,
                },
              ].map(({ label, val, sub, hi }) => (
                <div key={label} className={cn("rounded-xl p-3 text-center border", hi ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700" : "bg-muted/30 border-border")}>
                  <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                  <p className={cn("font-bold text-sm mt-0.5", hi ? "text-emerald-700 dark:text-emerald-300" : "text-foreground")}>{val}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
                </div>
              ))}
            </div>

            {/* Alert if payback is high */}
            {study.paybackBat > 15 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Payback elevado ({study.paybackBat} anos).</strong> O retorno adicional da bateria é longo.
                  {study.status === "sobredimensionada"
                    ? " Reduza a capacidade para melhorar a rentabilidade."
                    : " Considere se o investimento é prioritário relativamente à expansão FV."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
