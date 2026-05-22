import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FileText, Sparkles, Pencil } from "lucide-react";

export type MesOrigem = "fatura" | "estimado" | "manual" | null;

const MES_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"] as const;

interface Props {
  /** 12 monthly values in kWh; null = empty. */
  values: (number | null)[];
  /** 12 origin tags aligned with values. */
  origins: MesOrigem[];
  onChange: (values: (number | null)[], origins: MesOrigem[]) => void;
  title?: string;
  /** Read-only render when true (no editing). */
  readOnly?: boolean;
}

const ORIGIN_META: Record<NonNullable<MesOrigem>, { label: string; cls: string; Icon: typeof FileText }> = {
  fatura:    { label: "fatura",    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", Icon: FileText },
  estimado:  { label: "estimado",  cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",             Icon: Sparkles },
  manual:    { label: "manual",    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",         Icon: Pencil   },
};

export default function MonthlyHistoryGrid({ values, origins, onChange, title, readOnly }: Props) {
  const safeVals = useMemo(() => Array.from({ length: 12 }, (_, i) => values[i] ?? null), [values]);
  const safeOrig = useMemo(() => Array.from({ length: 12 }, (_, i) => origins[i] ?? null), [origins]);
  const filled = safeVals.filter((v): v is number => v != null && v > 0);
  const annual = filled.length === 12
    ? filled.reduce((s, v) => s + v, 0)
    : filled.length > 0 ? Math.round((filled.reduce((s, v) => s + v, 0) / filled.length) * 12) : 0;
  const maxVal = Math.max(...filled, 1);

  const counts = {
    fatura:   safeOrig.filter(o => o === "fatura").length,
    estimado: safeOrig.filter(o => o === "estimado").length,
    manual:   safeOrig.filter(o => o === "manual").length,
    vazio:    safeOrig.filter(o => o == null).length,
  };

  function updateMonth(idx: number, raw: string) {
    const trimmed = raw.trim();
    const n = trimmed === "" ? null : parseFloat(trimmed);
    const v: number | null = n != null && !isNaN(n) && n >= 0 ? Math.round(n) : null;
    const nextVals = safeVals.map((x, i) => i === idx ? v : x);
    const nextOrig = safeOrig.map((x, i) =>
      i === idx
        ? (v == null ? null : (x === "fatura" && v === safeVals[i] ? "fatura" : "manual"))
        : x,
    ) as MesOrigem[];
    onChange(nextVals, nextOrig);
  }

  function fillMissingWithAverage() {
    if (filled.length === 0 || filled.length === 12) return;
    const avg = Math.round(filled.reduce((s, v) => s + v, 0) / filled.length);
    const nextVals = safeVals.map(v => v ?? avg);
    const nextOrig = safeOrig.map((o, i) => o ?? (safeVals[i] == null ? "estimado" : o)) as MesOrigem[];
    onChange(nextVals, nextOrig);
  }

  return (
    <div className="space-y-3">
      {(title || !readOnly) && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {title && <p className="text-sm font-medium">{title}</p>}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {(["fatura","estimado","manual"] as const).map(k =>
              counts[k] > 0 && (
                <Badge key={k} variant="outline" className={cn("gap-1 text-[10px] h-5 px-1.5", ORIGIN_META[k].cls)}>
                  {(() => { const Icon = ORIGIN_META[k].Icon; return <Icon size={9} />; })()}
                  {counts[k]} {ORIGIN_META[k].label}
                </Badge>
              )
            )}
            {counts.vazio > 0 && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-dashed text-muted-foreground">
                {counts.vazio} em falta
              </Badge>
            )}
            {!readOnly && counts.vazio > 0 && filled.length > 0 && (
              <button
                type="button"
                onClick={fillMissingWithAverage}
                className="text-[11px] text-primary font-medium hover:underline"
              >
                Preencher em falta com média
              </button>
            )}
          </div>
        </div>
      )}

      {/* 12-month editable grid */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
        {safeVals.map((v, i) => {
          const o = safeOrig[i];
          const oMeta = o ? ORIGIN_META[o] : null;
          return (
            <div key={i} className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground text-center block">
                {MES_LABELS[i]}
              </label>
              <Input
                type="number"
                step="10"
                min={0}
                value={v ?? ""}
                placeholder="—"
                readOnly={readOnly}
                onChange={readOnly ? undefined : e => updateMonth(i, e.target.value)}
                className={cn(
                  "h-8 text-xs text-center px-1 tabular-nums",
                  oMeta && o === "fatura"   && "border-emerald-500/40 bg-emerald-500/5",
                  oMeta && o === "estimado" && "border-blue-500/40   bg-blue-500/5",
                  oMeta && o === "manual"   && "border-amber-500/40  bg-amber-500/5",
                )}
              />
              {oMeta && (
                <div className="flex justify-center">
                  <span className={cn("inline-flex items-center gap-0.5 text-[8px] px-1 rounded leading-tight", oMeta.cls.replace("border-","border "))}>
                    <oMeta.Icon size={7} />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mini bar chart */}
      {filled.length > 0 && (
        <div className="flex items-end gap-1 h-16 pt-1">
          {safeVals.map((v, i) => {
            const o = safeOrig[i];
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-all",
                    v == null || v <= 0
                      ? "bg-muted/30 border border-dashed border-muted-foreground/20"
                      : o === "fatura"   ? "bg-emerald-500/70"
                      : o === "estimado" ? "bg-blue-500/60"
                      : o === "manual"   ? "bg-amber-500/70"
                      : "bg-primary/70",
                  )}
                  style={{ height: v != null && v > 0 ? `${Math.max(4, (v / maxVal) * 48)}px` : "4px" }}
                  title={v != null ? `${MES_LABELS[i]}: ${v} kWh (${o ?? "—"})` : `${MES_LABELS[i]}: sem dados`}
                />
                <span className="text-[8px] text-muted-foreground leading-none">{MES_LABELS[i].slice(0, 1)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Annual summary */}
      {annual > 0 && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {filled.length === 12 ? "Soma anual" : `Média de ${filled.length} mês${filled.length === 1 ? "" : "es"} × 12`}
          </span>
          <span className="font-bold text-primary text-sm">{annual.toLocaleString("pt-PT")} kWh/ano</span>
        </div>
      )}
    </div>
  );
}
