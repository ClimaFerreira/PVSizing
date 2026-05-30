import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import type { MesOrigem } from "./monthly-history-grid";

export type ConfidenceLevel = "alto" | "medio" | "baixo";

export interface ConfidenceResult {
  level: ConfidenceLevel;
  mesesFatura: number;
  mesesEstimados: number;
  mesesManuais: number;
  mesesVazios: number;
  tarifaCompleta: boolean;
  motivos: string[];
}

export function calcConfidence(opts: {
  origins: MesOrigem[];
  tarifaCompleta: boolean;
}): ConfidenceResult {
  const { origins, tarifaCompleta } = opts;
  const mesesFatura    = origins.filter(o => o === "fatura").length;
  const mesesEstimados = origins.filter(o => o === "estimado").length;
  const mesesManuais   = origins.filter(o => o === "manual").length;
  const mesesVazios    = origins.filter(o => o == null).length;
  const motivos: string[] = [];

  let level: ConfidenceLevel;
  if (mesesFatura >= 12 && tarifaCompleta) {
    level = "alto";
    motivos.push("12 meses extraídos da fatura");
    motivos.push("Períodos tarifários completos");
  } else if (mesesFatura + mesesManuais >= 6 || (mesesFatura >= 3 && tarifaCompleta)) {
    level = "medio";
    if (mesesFatura > 0) motivos.push(`${mesesFatura} ${mesesFatura === 1 ?"mês real" : "meses reais"} de fatura`);
    if (mesesEstimados > 0) motivos.push(`${mesesEstimados} ${mesesEstimados === 1 ?"mês estimado" : "meses estimados"}`);
    if (mesesManuais > 0) motivos.push(`${mesesManuais} ${mesesManuais === 1 ?"mês manual" : "meses manuais"}`);
    if (!tarifaCompleta) motivos.push("Tarifa V/C/P em falta");
  } else {
    level = "baixo";
    if (mesesVazios >= 9) motivos.push("Quase sem dados mensais reais");
    if (!tarifaCompleta) motivos.push("Distribuição tarifária não definida");
    if (mesesFatura === 0 && mesesManuais === 0) motivos.push("Apenas consumo anual genérico");
  }

  return { level, mesesFatura, mesesEstimados, mesesManuais, mesesVazios, tarifaCompleta, motivos };
}

const LEVEL_META = {
  alto:  { label: "Confiança alta",  cls: "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300", Icon: ShieldCheck, dot: "bg-emerald-500" },
  medio: { label: "Confiança média", cls: "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300",          Icon: Shield,      dot: "bg-amber-500"   },
  baixo: { label: "Confiança baixa", cls: "border-red-300 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300",                     Icon: ShieldAlert, dot: "bg-red-500"     },
} as const;

export default function ConfidenceIndicator({ result }: { result: ConfidenceResult }) {
  const meta = LEVEL_META[result.level];
  const Icon = meta.Icon;
  return (
    <div className={cn("rounded-lg border px-3 py-2 flex items-start gap-3", meta.cls)}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
          <p className="text-sm font-semibold">{meta.label}</p>
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
            {result.mesesFatura + result.mesesEstimados + result.mesesManuais}/12 meses
          </span>
        </div>
        {result.motivos.length > 0 && (
          <ul className="text-[11px] mt-1 space-y-0.5 list-disc list-inside opacity-90">
            {result.motivos.slice(0, 3).map(m => <li key={m}>{m}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
