import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Zap, CheckCircle2, Info } from "lucide-react";
import { criarUnidade, type InverterUnit } from "@/lib/multi-inverter";

type InverterItem = {
  id: number;
  nome: string;
  fabricante: string;
  potenciaAc: number | string;
};

type FaseFilter = "todos" | "mono" | "tri";
type TipoFilter = "todos" | "unico" | "multi";

interface Combo {
  key: string;
  tipo: "unico" | "duplo" | "triplo";
  inverterId: number;
  nome: string;
  fabricante: string;
  unidades: number;
  potenciaAcUnit: number;
  potenciaAcTotal: number;
  ratioDcAc: number;
  fase: "mono" | "tri";
  tag: "ideal" | "ok";
}

interface Props {
  potenciaKwp: number;
  inverters: InverterItem[] | undefined;
  selectedInverterId: number | undefined;
  inverterUnits: InverterUnit[];
  onSelectInverter: (inverterId: number) => void;
  onSelectMultiInverter: (units: InverterUnit[]) => void;
}

function gerarCombinacoes(
  potenciaKwp: number,
  inverters: InverterItem[],
  filtroFase: FaseFilter,
  filtroTipo: TipoFilter,
): Combo[] {
  const combos: Combo[] = [];

  for (const inv of inverters) {
    const potAc = Number(inv.potenciaAc);
    if (!potAc || potAc <= 0) continue;

    const fase: "mono" | "tri" = potAc <= 6.0 ? "mono" : "tri";
    if (filtroFase !== "todos" && fase !== filtroFase) continue;

    if (filtroTipo !== "multi") {
      const ratio = potenciaKwp / potAc;
      if (ratio >= 0.80 && ratio <= 1.35) {
        combos.push({
          key: `s-${inv.id}`,
          tipo: "unico",
          inverterId: inv.id,
          nome: inv.nome,
          fabricante: inv.fabricante,
          unidades: 1,
          potenciaAcUnit: potAc,
          potenciaAcTotal: potAc,
          ratioDcAc: Math.round(ratio * 100) / 100,
          fase,
          tag: ratio >= 0.90 && ratio <= 1.20 ? "ideal" : "ok",
        });
      }
    }

    if (filtroTipo !== "unico") {
      for (const units of [2, 3] as const) {
        const totalAc = potAc * units;
        const ratio = potenciaKwp / totalAc;
        if (ratio >= 0.80 && ratio <= 1.35) {
          combos.push({
            key: `m${units}-${inv.id}`,
            tipo: units === 2 ? "duplo" : "triplo",
            inverterId: inv.id,
            nome: inv.nome,
            fabricante: inv.fabricante,
            unidades: units,
            potenciaAcUnit: potAc,
            potenciaAcTotal: totalAc,
            ratioDcAc: Math.round(ratio * 100) / 100,
            fase,
            tag: ratio >= 0.90 && ratio <= 1.20 ? "ideal" : "ok",
          });
        }
      }
    }
  }

  return combos
    .sort((a, b) => {
      if (a.tag !== b.tag) return a.tag === "ideal" ? -1 : 1;
      return Math.abs(a.ratioDcAc - 1.1) - Math.abs(b.ratioDcAc - 1.1);
    })
    .slice(0, 9);
}

const TAG_STYLE = {
  ideal: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  ok:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

const FASE_LABELS: Record<FaseFilter, string> = {
  todos: "Qualquer fase",
  mono:  "Monofásico",
  tri:   "Trifásico",
};

const TIPO_LABELS: Record<TipoFilter, string> = {
  todos: "Qualquer",
  unico: "1 Inversor",
  multi: "Multi-Inversor",
};

export default function WizardSugestoesInversor({
  potenciaKwp,
  inverters,
  selectedInverterId,
  inverterUnits,
  onSelectInverter,
  onSelectMultiInverter,
}: Props) {
  const [filtroFase, setFiltroFase] = useState<FaseFilter>("todos");
  const [filtroTipo, setFiltroTipo] = useState<TipoFilter>("todos");

  const combos = useMemo(
    () => (inverters ? gerarCombinacoes(potenciaKwp, inverters, filtroFase, filtroTipo) : []),
    [potenciaKwp, inverters, filtroFase, filtroTipo],
  );

  const selectedKey = useMemo(() => {
    if (inverterUnits.length > 0) {
      const u = inverterUnits[0];
      return u.quantidade > 1 ? `m${u.quantidade}-${u.inverterId}` : `s-${u.inverterId}`;
    }
    if (selectedInverterId) return `s-${selectedInverterId}`;
    return null;
  }, [selectedInverterId, inverterUnits]);

  function handleSelect(combo: Combo) {
    if (combo.tipo === "unico") {
      onSelectInverter(combo.inverterId);
    } else {
      onSelectMultiInverter([{ ...criarUnidade(combo.inverterId), quantidade: combo.unidades }]);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap size={18} className="text-primary" />
          Soluções Automáticas de Inversores
        </CardTitle>
        <CardDescription>
          Combinações geradas automaticamente para{" "}
          <strong>{potenciaKwp} kWp</strong>. Seleccione uma para pré-preencher
          a seleção de catálogo abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border p-1">
            {(["todos", "mono", "tri"] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroFase(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  filtroFase === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {FASE_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg border p-1">
            {(["todos", "unico", "multi"] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroTipo(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  filtroTipo === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TIPO_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {combos.length === 0 ? (
          <div className="flex items-center gap-2 p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground">
            <Info size={16} className="shrink-0" />
            Nenhuma combinação encontrada para os filtros selecionados. Experimente
            "Qualquer fase".
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {combos.map(combo => {
              const isSelected = combo.key === selectedKey;
              return (
                <button
                  key={combo.key}
                  type="button"
                  onClick={() => handleSelect(combo)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all",
                    isSelected
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {combo.unidades > 1 ? `${combo.unidades}× ` : ""}
                        {combo.nome}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {combo.fabricante}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 size={15} className="text-primary shrink-0 mt-0.5" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs">
                        <span className="font-semibold">{combo.potenciaAcTotal} kW</span>
                        <span className="text-muted-foreground"> AC</span>
                        {combo.unidades > 1 && (
                          <span className="text-muted-foreground">
                            {" "}({combo.potenciaAcUnit} kW × {combo.unidades})
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Ratio DC/AC:{" "}
                        <span className="font-medium">{combo.ratioDcAc}</span>
                        {" · "}
                        {combo.fase === "mono" ? "Monofásico" : "Trifásico"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0",
                        TAG_STYLE[combo.tag],
                      )}
                    >
                      {combo.tag === "ideal" ? "Ideal" : "Aceitável"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Ratio DC/AC ideal: 0,90–1,20 (verde). Monofásico ≤ 6 kW, Trifásico &gt; 6 kW (heurística).
          {selectedKey && (
            <span className="text-primary font-medium ml-2">
              ✓ Selecionado — confirme nos campos abaixo.
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
