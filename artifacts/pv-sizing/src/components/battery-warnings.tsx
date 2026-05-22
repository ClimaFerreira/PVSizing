import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Info, Battery } from "lucide-react";

export interface BatteryWarning {
  level: "info" | "warn" | "alert";
  title: string;
  detail?: string;
}

export interface BatteryWarningInputs {
  /** kWh úteis configurada pelo utilizador */
  utilCap: number;
  /** kWh úteis recomendada pelo cálculo */
  recommendedUtilMin: number | null;
  recommendedUtilMax: number | null;
  /** kWh/dia médios disponíveis para carregar */
  excessoMedioDiario: number;
  /** kWh/dia consumidos durante a noite (22h–7h) */
  consumoNoturnoDiario: number;
  /** % carga diária média alcançada */
  percCargaDiaria: number;
  /** ciclos/ano estimados */
  ciclosAnuais: number;
  /** Potência de carga máxima (kW) */
  potCarga: number;
  /** Potência de descarga máxima (kW) */
  potDesc: number;
  /** Payback (anos) — só calculado quando preço definido */
  payback: number | null;
}

export function deriveBatteryWarnings(i: BatteryWarningInputs): BatteryWarning[] {
  const w: BatteryWarning[] = [];

  // Capacity vs recommended
  if (i.recommendedUtilMin != null && i.recommendedUtilMax != null) {
    if (i.utilCap > i.recommendedUtilMax * 1.15) {
      w.push({
        level: "warn",
        title: "Bateria acima do recomendado",
        detail: `Capacidade útil ${i.utilCap.toFixed(1)} kWh excede o intervalo recomendado (${i.recommendedUtilMin.toFixed(0)}–${i.recommendedUtilMax.toFixed(0)} kWh).`,
      });
    } else if (i.utilCap < i.recommendedUtilMin * 0.7) {
      w.push({
        level: "warn",
        title: "Bateria abaixo do recomendado",
        detail: `Capacidade útil ${i.utilCap.toFixed(1)} kWh é inferior ao mínimo recomendado (${i.recommendedUtilMin.toFixed(0)} kWh).`,
      });
    }
  }

  // Surplus availability
  if (i.utilCap > i.excessoMedioDiario * 2.5 && i.excessoMedioDiario > 0) {
    w.push({
      level: "alert",
      title: "Excedente solar insuficiente para carregar",
      detail: `Excedente médio de ${i.excessoMedioDiario.toFixed(1)} kWh/dia — a bateria não carregará totalmente.`,
    });
  }

  // Charge completion
  if (i.percCargaDiaria < 40 && i.utilCap > 0) {
    w.push({
      level: "warn",
      title: "Carga diária baixa",
      detail: `Apenas ~${i.percCargaDiaria}% da capacidade é carregada por dia. Pode não compensar.`,
    });
  }

  // Night consumption vs storage
  if (i.consumoNoturnoDiario > 0 && i.utilCap > i.consumoNoturnoDiario * 1.6) {
    w.push({
      level: "warn",
      title: "Consumo noturno insuficiente para descarregar",
      detail: `Apenas ~${i.consumoNoturnoDiario.toFixed(1)} kWh/dia de consumo noturno — parte da energia armazenada ficará sem uso.`,
    });
  }

  // Cycles
  if (i.ciclosAnuais < 120 && i.utilCap > 0) {
    w.push({
      level: "alert",
      title: "Poucos ciclos/ano estimados",
      detail: `Apenas ~${i.ciclosAnuais} ciclos/ano — payback técnico provavelmente fraco.`,
    });
  }

  // Power ratings
  if (i.potCarga > 0 && i.potCarga < i.utilCap / 6) {
    w.push({
      level: "info",
      title: "Potência de carga limitada",
      detail: `${i.potCarga.toFixed(1)} kW para ${i.utilCap.toFixed(1)} kWh úteis — carga lenta (>${(i.utilCap / Math.max(i.potCarga,0.1)).toFixed(1)} h).`,
    });
  }
  if (i.potDesc > 0 && i.potDesc < i.utilCap / 6) {
    w.push({
      level: "info",
      title: "Potência de descarga limitada",
      detail: `${i.potDesc.toFixed(1)} kW para ${i.utilCap.toFixed(1)} kWh úteis — pode não cobrir picos de consumo.`,
    });
  }

  // Payback
  if (i.payback != null && i.payback > 15) {
    w.push({
      level: "warn",
      title: "Payback elevado",
      detail: `Retorno do investimento adicional em bateria: ${i.payback.toFixed(1)} anos.`,
    });
  }

  return w;
}

const LEVEL_META = {
  info:  { cls: "border-blue-200 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300",       Icon: Info,          iconCls: "text-blue-600" },
  warn:  { cls: "border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300", Icon: AlertTriangle, iconCls: "text-amber-600" },
  alert: { cls: "border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300",            Icon: AlertTriangle, iconCls: "text-red-600"   },
} as const;

export default function BatteryWarnings({ warnings }: { warnings: BatteryWarning[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Battery size={18} className="text-amber-500" /> Verificações Críticas da Bateria
        </CardTitle>
        <CardDescription>Alertas inteligentes com base na simulação horária mensal</CardDescription>
      </CardHeader>
      <CardContent>
        {warnings.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-sm">
            <CheckCircle2 size={16} className="text-emerald-600" />
            Bateria coerente com o consumo e excedente solar.
          </div>
        ) : (
          <div className="space-y-2">
            {warnings.map((w, i) => {
              const meta = LEVEL_META[w.level];
              const Icon = meta.Icon;
              return (
                <div key={i} className={cn("flex items-start gap-2 p-2.5 rounded-lg border text-xs", meta.cls)}>
                  <Icon size={14} className={cn("mt-0.5 shrink-0", meta.iconCls)} />
                  <div className="min-w-0">
                    <p className="font-semibold">{w.title}</p>
                    {w.detail && <p className="opacity-90 mt-0.5 leading-snug">{w.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
