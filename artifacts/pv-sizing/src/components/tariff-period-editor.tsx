import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Moon, Sun, Clock } from "lucide-react";
import { dayNightFromTariff } from "@/lib/energy-simulation";

interface Props {
  percVazio: number;
  percCheio: number;
  percPonta: number;
  /** Total annual consumption (kWh) used to display absolute kWh per period. */
  consumoAnual: number;
  /**
   * Called when the user edits absolute kWh in any period.
   * Returns the new percentages AND new total annual consumption (sum of edited values).
   */
  onChange: (next: {
    percVazio: number; percCheio: number; percPonta: number;
    consumoAnual: number;
  }) => void;
}

const PERIODS = [
  { key: "percVazio", label: "Vazio", hint: "22h–8h", color: "blue",  Icon: Moon  },
  { key: "percCheio", label: "Cheio", hint: "8h–10h · 12h–19h", color: "amber", Icon: Sun   },
  { key: "percPonta", label: "Ponta", hint: "10h–12h · 19h–22h", color: "red",   Icon: Clock },
] as const;

export default function TariffPeriodEditor({ percVazio, percCheio, percPonta, consumoAnual, onChange }: Props) {
  const kwhByPeriod = useMemo(() => ({
    vazio: Math.round((percVazio / 100) * consumoAnual),
    cheio: Math.round((percCheio / 100) * consumoAnual),
    ponta: Math.round((percPonta / 100) * consumoAnual),
  }), [percVazio, percCheio, percPonta, consumoAnual]);

  const { diurnoPct, noturnoPct } = dayNightFromTariff(percVazio, percCheio, percPonta);
  const kwhDia = Math.round((diurnoPct / 100) * consumoAnual);
  const kwhNoite = Math.round((noturnoPct / 100) * consumoAnual);

  function updatePeriodKwh(periodKey: "vazio" | "cheio" | "ponta", rawKwh: string) {
    const n = parseFloat(rawKwh);
    const newKwh = isNaN(n) || n < 0 ? 0 : Math.round(n);
    const next = { ...kwhByPeriod, [periodKey]: newKwh };
    const total = next.vazio + next.cheio + next.ponta;
    if (total <= 0) return;
    onChange({
      consumoAnual: total,
      percVazio: Math.round((next.vazio / total) * 100),
      percCheio: Math.round((next.cheio / total) * 100),
      percPonta: 100 - Math.round((next.vazio / total) * 100) - Math.round((next.cheio / total) * 100),
    });
  }

  return (
    <div className="space-y-3">
      {/* Visual stacked bar */}
      <div className="flex rounded-full overflow-hidden h-3 border border-border text-[9px]">
        <div className="bg-blue-400 flex items-center justify-center text-white font-medium" style={{ width: `${percVazio}%` }}>
          {percVazio >= 12 && `V ${percVazio}%`}
        </div>
        <div className="bg-amber-400 flex items-center justify-center text-white font-medium" style={{ width: `${percCheio}%` }}>
          {percCheio >= 12 && `C ${percCheio}%`}
        </div>
        <div className="bg-red-400 flex items-center justify-center text-white font-medium" style={{ width: `${percPonta}%` }}>
          {percPonta >= 10 && `P ${percPonta}%`}
        </div>
      </div>

      {/* Per-period editable kWh inputs */}
      <div className="grid grid-cols-3 gap-2">
        {PERIODS.map(p => {
          const k = p.key === "percVazio" ? "vazio" : p.key === "percCheio" ? "cheio" : "ponta";
          const pct = p.key === "percVazio" ? percVazio : p.key === "percCheio" ? percCheio : percPonta;
          const Icon = p.Icon;
          return (
            <div key={p.key} className={cn(
              "rounded-lg border p-2 space-y-1",
              k === "vazio" && "border-blue-300/60 bg-blue-50/40 dark:bg-blue-950/20",
              k === "cheio" && "border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20",
              k === "ponta" && "border-red-300/60 bg-red-50/40 dark:bg-red-950/20",
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={cn(
                    k === "vazio" && "text-blue-600",
                    k === "cheio" && "text-amber-600",
                    k === "ponta" && "text-red-600",
                  )} />
                  <span className="text-xs font-semibold">{p.label}</span>
                </div>
                <span className="text-[10px] font-bold tabular-nums">{pct}%</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  step="10"
                  min={0}
                  value={kwhByPeriod[k]}
                  onChange={e => updatePeriodKwh(k, e.target.value)}
                  className="h-8 text-xs pr-9 tabular-nums"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">kWh</span>
              </div>
              <p className="text-[9px] text-muted-foreground leading-tight">{p.hint}</p>
            </div>
          );
        })}
      </div>

      {/* Derived day/night split */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 flex items-center gap-2">
          <Sun size={14} className="text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground leading-tight">Consumo diurno (7h–22h)</p>
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums">
              {kwhDia.toLocaleString("pt-PT")} kWh <span className="font-normal text-muted-foreground">({diurnoPct}%)</span>
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2 flex items-center gap-2">
          <Moon size={14} className="text-blue-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground leading-tight">Consumo noturno (22h–7h)</p>
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300 tabular-nums">
              {kwhNoite.toLocaleString("pt-PT")} kWh <span className="font-normal text-muted-foreground">({noturnoPct}%)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
