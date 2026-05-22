import { Loader2, CheckCircle2, AlertTriangle, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface Props {
  status: SaveStatus;
  lastSavedAt: Date | null;
  className?: string;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function SaveStatusIndicator({ status, lastSavedAt, className }: Props) {
  const base = "inline-flex items-center gap-1.5 text-xs font-medium";
  if (status === "saving") {
    return (
      <span className={cn(base, "text-muted-foreground", className)} data-testid="save-indicator-saving">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        A guardar…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={cn(base, "text-destructive", className)} data-testid="save-indicator-error">
        <AlertTriangle className="h-3.5 w-3.5" />
        Erro ao guardar
      </span>
    );
  }
  if (status === "offline") {
    return (
      <span className={cn(base, "text-amber-600 dark:text-amber-400", className)} data-testid="save-indicator-offline">
        <CloudOff className="h-3.5 w-3.5" />
        Só local (sem projeto)
      </span>
    );
  }
  if (status === "saved" && lastSavedAt) {
    return (
      <span className={cn(base, "text-emerald-600 dark:text-emerald-400", className)} data-testid="save-indicator-saved">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Guardado às {fmtTime(lastSavedAt)}
      </span>
    );
  }
  return null;
}
