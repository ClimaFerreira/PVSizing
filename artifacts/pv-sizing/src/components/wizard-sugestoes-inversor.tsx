import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Zap, CheckCircle2, Info, Sun, BarChart3, AlertTriangle, X } from "lucide-react";
import { criarUnidade, type InverterUnit } from "@/lib/multi-inverter";

// ── Types ──────────────────────────────────────────────────────────────────────

type TipoLigacao  = "indeferente" | "monofasico" | "trifasico";
type TipoInversor = "sem-preferencia" | "string" | "hibrido" | "ac-coupled";
type BateriaOpcao = "nao" | "a-estudar" | "sim";
type Topologia    = "automatico" | "um" | "multi";
type ComboTag     = "ideal" | "ok" | "nao-recomendado";

interface InstalacaoParams {
  tipoLigacao:  TipoLigacao;
  tipoInversor: TipoInversor;
  bateria:      BateriaOpcao;
  limiteAcKw:   number | null;
  topologia:    Topologia;
}

type InverterItem = {
  id: number;
  nome: string;
  fabricante: string;
  potenciaAc: number | string;
};

interface Combo {
  key:             string;
  tipo:            "unico" | "duplo" | "triplo";
  inverterId:      number;
  nome:            string;
  fabricante:      string;
  unidades:        number;
  potenciaDcAlvo:  number;   // kWp (fixed — same for all, comes from panel sizing)
  potenciaAcUnit:  number;
  potenciaAcTotal: number;
  ratioDcAc:       number;
  fase:            "mono" | "tri";
  isHybrid:        boolean;
  tag:             ComboTag;
}

interface Props {
  potenciaKwp:          number;
  energiaAnualEstimada: number;
  inverters:            InverterItem[] | undefined;
  selectedInverterId:   number | undefined;
  inverterUnits:        InverterUnit[];
  onSelectInverter:     (inverterId: number) => void;
  onSelectMultiInverter:(units: InverterUnit[]) => void;
}

// ── Hybrid detection heuristic ────────────────────────────────────────────────
const HYBRID_RE = /HYB|HYBRID|GEN24|X-HYB|RHI|LP[12]|-EH|-ET|SH-\d|MULTI|STOREDGE|-H\d|\.HV\d/i;
function isHybridInverter(nome: string) { return HYBRID_RE.test(nome); }

// ── Tag classification ─────────────────────────────────────────────────────────
// Ideal: 0.90–1.20 · Aceitável: 0.75–0.89 or 1.21–1.35 · Não recomendado: outside those
function classifyTag(ratio: number): ComboTag {
  if (ratio >= 0.90 && ratio <= 1.20) return "ideal";
  if (ratio >= 0.75 && ratio <= 1.35) return "ok";
  return "nao-recomendado";
}

// ── Combination generator ─────────────────────────────────────────────────────
function gerarCombinacoes(
  potenciaKwp: number,
  inverters:   InverterItem[],
  p:           InstalacaoParams,
): Combo[] {
  const combos: Combo[] = [];

  for (const inv of inverters) {
    const potAc = Number(inv.potenciaAc);
    if (!potAc || potAc <= 0) continue;

    const fase: "mono" | "tri" = potAc <= 6.0 ? "mono" : "tri";
    const isHybrid = isHybridInverter(inv.nome);

    // ── Hard filters ──────────────────────────────────────────────────────────
    if (p.tipoLigacao === "monofasico") {
      if (fase !== "mono") continue;
      if (p.limiteAcKw !== null && p.limiteAcKw > 0 && potAc > p.limiteAcKw) continue;
    }
    if (p.tipoLigacao === "trifasico" && fase === "mono") continue;
    if (
      p.tipoLigacao === "indeferente" &&
      p.limiteAcKw !== null && p.limiteAcKw > 0 &&
      potAc > p.limiteAcKw
    ) continue;
    if (p.tipoInversor === "hibrido" && !isHybrid) continue;
    if (p.tipoInversor === "string"  &&  isHybrid) continue;

    // ── Unit counts ───────────────────────────────────────────────────────────
    const unitCounts: number[] =
      p.topologia === "um"    ? [1]       :
      p.topologia === "multi" ? [2, 3]    :
                                [1, 2, 3];

    for (const units of unitCounts) {
      const totalAc = potAc * units;
      const ratio   = Math.round((potenciaKwp / totalAc) * 100) / 100;
      // Range: 0.65–1.50 (wider than before to include "Não recomendado")
      if (ratio < 0.65 || ratio > 1.50) continue;

      combos.push({
        key:             units === 1 ? `s-${inv.id}` : `m${units}-${inv.id}`,
        tipo:            units === 1 ? "unico" : units === 2 ? "duplo" : "triplo",
        inverterId:      inv.id,
        nome:            inv.nome,
        fabricante:      inv.fabricante,
        unidades:        units,
        potenciaDcAlvo:  potenciaKwp,
        potenciaAcUnit:  potAc,
        potenciaAcTotal: totalAc,
        ratioDcAc:       ratio,
        fase,
        isHybrid,
        tag:             classifyTag(ratio),
      });
    }
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  return combos.sort((a, b) => {
    if (p.bateria === "sim") {
      if (a.isHybrid !== b.isHybrid) return a.isHybrid ? -1 : 1;
    }
    if (p.tipoLigacao === "trifasico") {
      if (a.fase !== b.fase) return a.fase === "tri" ? -1 : 1;
    }
    const order: Record<ComboTag, number> = { ideal: 0, ok: 1, "nao-recomendado": 2 };
    if (a.tag !== b.tag) return order[a.tag] - order[b.tag];
    return Math.abs(a.ratioDcAc - 1.1) - Math.abs(b.ratioDcAc - 1.1);
  }).slice(0, 12);
}

// ── Tag metadata ──────────────────────────────────────────────────────────────
const TAG_META: Record<ComboTag, { label: string; pill: string; border: string }> = {
  ideal: {
    label:  "Ideal",
    pill:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  ok: {
    label:  "Aceitável",
    pill:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
  },
  "nao-recomendado": {
    label:  "Não recomendado",
    pill:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    border: "border-red-300 dark:border-red-700",
  },
};

// ── ToggleGroup helper ────────────────────────────────────────────────────────
function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1 rounded-lg border p-1 w-fit">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              value === o.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── ComboCard ─────────────────────────────────────────────────────────────────
function ComboCard({
  combo,
  isSelected,
  pendingConfirm,
  onSelect,
  onConfirm,
  onCancelConfirm,
}: {
  combo:            Combo;
  isSelected:       boolean;
  pendingConfirm:   boolean;
  onSelect:         () => void;
  onConfirm:        () => void;
  onCancelConfirm:  () => void;
}) {
  const meta = TAG_META[combo.tag];

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        isSelected
          ? "border-primary ring-1 ring-primary bg-primary/5"
          : combo.tag === "nao-recomendado"
            ? cn("border opacity-80", meta.border)
            : "border hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      {/* ── Top row: name + badges ── */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">
            {combo.unidades > 1 ? `${combo.unidades}× ` : ""}
            {combo.nome}
          </p>
          <p className="text-[10px] text-muted-foreground">{combo.fabricante}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {combo.isHybrid && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              HYB
            </span>
          )}
          {isSelected && <CheckCircle2 size={15} className="text-primary" />}
        </div>
      </div>

      {/* ── Data grid ── */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] mb-2">
        <DataRow label="Potência DC alvo" value={`${combo.potenciaDcAlvo} kWp`} />
        <DataRow label="Potência AC total" value={`${combo.potenciaAcTotal} kW`} />
        <DataRow
          label="DC/AC ratio"
          value={combo.ratioDcAc.toString()}
          highlight={
            combo.ratioDcAc >= 0.90 && combo.ratioDcAc <= 1.20
              ? "ok"
              : combo.ratioDcAc >= 0.75 && combo.ratioDcAc <= 1.35
                ? "warn"
                : "bad"
          }
        />
        <DataRow label="Nº de inversores" value={combo.unidades.toString()} />
        <DataRow
          label="Tipo"
          value={combo.fase === "mono" ? "Monofásico" : "Trifásico"}
        />
        <DataRow
          label="Compatível com bateria"
          value={combo.isHybrid ? "Sim" : "Não"}
          highlight={combo.isHybrid ? "ok" : undefined}
        />
      </div>

      {/* ── Estado pill ── */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", meta.pill)}>
          {meta.label}
        </span>

        {/* ── Action area ── */}
        {pendingConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
              Confirmar?
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-5 px-2 text-[10px]"
              onClick={onConfirm}
            >
              Sim
            </Button>
            <button
              type="button"
              onClick={onCancelConfirm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>
        ) : isSelected ? (
          <span className="text-[10px] text-primary font-medium">Seleccionado</span>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded transition-colors",
              combo.tag === "nao-recomendado"
                ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-300 dark:border-red-700"
                : "text-primary hover:bg-primary/10",
            )}
          >
            Seleccionar
          </button>
        )}
      </div>

      {/* ── Ratio warning annotation ── */}
      {combo.tag === "nao-recomendado" && (
        <p className="mt-1.5 text-[10px] text-red-600 dark:text-red-400 flex items-start gap-1">
          <AlertTriangle size={10} className="shrink-0 mt-0.5" />
          Ratio DC/AC fora do intervalo recomendado (0,75–1,35). Risco de perdas de produção ou sobrecarga.
        </p>
      )}
    </div>
  );
}

function DataRow({
  label,
  value,
  highlight,
}: {
  label:     string;
  value:     string;
  highlight?: "ok" | "warn" | "bad";
}) {
  const valueClass =
    highlight === "ok"   ? "text-green-600 dark:text-green-400 font-semibold" :
    highlight === "warn" ? "text-amber-600 dark:text-amber-400 font-semibold" :
    highlight === "bad"  ? "text-red-600   dark:text-red-400   font-semibold" :
                           "font-medium";
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClass}>{value}</span>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WizardSugestoesInversor({
  potenciaKwp,
  energiaAnualEstimada,
  inverters,
  selectedInverterId,
  inverterUnits,
  onSelectInverter,
  onSelectMultiInverter,
}: Props) {
  const [params, setParams] = useState<InstalacaoParams>({
    tipoLigacao:  "indeferente",
    tipoInversor: "sem-preferencia",
    bateria:      "nao",
    limiteAcKw:   null,
    topologia:    "automatico",
  });

  // Key of the combo awaiting "Não recomendado" confirmation
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);

  function setParam<K extends keyof InstalacaoParams>(k: K, v: InstalacaoParams[K]) {
    setParams(prev => ({ ...prev, [k]: v }));
  }

  const combos = useMemo(
    () => (inverters ? gerarCombinacoes(potenciaKwp, inverters, params) : []),
    [potenciaKwp, inverters, params],
  );

  const selectedKey = useMemo(() => {
    if (inverterUnits.length > 0) {
      const u = inverterUnits[0];
      return u.quantidade > 1 ? `m${u.quantidade}-${u.inverterId}` : `s-${u.inverterId}`;
    }
    if (selectedInverterId) return `s-${selectedInverterId}`;
    return null;
  }, [selectedInverterId, inverterUnits]);

  function applyCombo(combo: Combo) {
    if (combo.tipo === "unico") {
      onSelectInverter(combo.inverterId);
    } else {
      onSelectMultiInverter([{ ...criarUnidade(combo.inverterId), quantidade: combo.unidades }]);
    }
    setPendingConfirm(null);
  }

  function handleSelectClick(combo: Combo) {
    if (combo.tag === "nao-recomendado") {
      setPendingConfirm(combo.key);
    } else {
      applyCombo(combo);
    }
  }

  return (
    <Card>
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap size={18} className="text-primary" />
              Seleção da Solução Técnica
            </CardTitle>
            <CardDescription className="mt-1">
              Escolha agora a solução técnica compatível com o sistema dimensionado.
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5">
              <Sun size={13} className="text-primary" />
              <span className="text-xs font-semibold text-primary">
                Potência FV alvo: {potenciaKwp} kWp
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
              <BarChart3 size={13} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Produção anual: {energiaAnualEstimada.toLocaleString("pt-PT")} kWh
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── Parâmetros da Instalação ── */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Parâmetros da Instalação
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ToggleGroup
              label="Tipo de ligação à rede"
              value={params.tipoLigacao}
              onChange={v => setParam("tipoLigacao", v)}
              options={[
                { value: "indeferente", label: "Indiferente" },
                { value: "monofasico",  label: "Monofásica"  },
                { value: "trifasico",   label: "Trifásica"   },
              ]}
            />

            <ToggleGroup
              label="Tipo de inversor pretendido"
              value={params.tipoInversor}
              onChange={v => setParam("tipoInversor", v)}
              options={[
                { value: "sem-preferencia", label: "Indiferente" },
                { value: "string",          label: "String"      },
                { value: "hibrido",         label: "Híbrido"     },
                { value: "ac-coupled",      label: "AC-coupled"  },
              ]}
            />

            <ToggleGroup
              label="Bateria"
              value={params.bateria}
              onChange={v => setParam("bateria", v)}
              options={[
                { value: "nao",       label: "Não"       },
                { value: "a-estudar", label: "A estudar" },
                { value: "sim",       label: "Sim"       },
              ]}
            />

            <div>
              <p className="text-xs font-medium mb-1.5">Limite de potência AC (kW)</p>
              <Input
                type="number"
                min={0}
                step={0.1}
                placeholder="Ex: 6 ou 15"
                value={params.limiteAcKw ?? ""}
                onChange={e => {
                  const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                  setParam("limiteAcKw", v);
                }}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Monofásico típico PT: ≤ 6 kW · Deixe vazio para sem limite
              </p>
            </div>

            <div className="sm:col-span-2">
              <ToggleGroup
                label="Número de inversores"
                value={params.topologia}
                onChange={v => setParam("topologia", v)}
                options={[
                  { value: "automatico", label: "Automático (todas as opções)" },
                  { value: "um",         label: "1 Inversor"                   },
                  { value: "multi",      label: "Múltiplos inversores"         },
                ]}
              />
            </div>
          </div>

          {params.bateria === "sim" && (
            <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400">
              <Info size={13} className="shrink-0 mt-0.5" />
              Com bateria activada, os inversores híbridos são priorizados nas sugestões.
              {params.tipoInversor === "sem-preferencia" && " Active «Híbrido» acima para filtrar apenas essa tipologia."}
            </div>
          )}
          {params.tipoInversor === "ac-coupled" && (
            <div className="mt-3 flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-700 text-xs text-blue-700 dark:text-blue-400">
              <Info size={13} className="shrink-0 mt-0.5" />
              AC-coupled: o inversor solar (string) e o inversor de bateria (ex. Victron) são unidades separadas.
              Seleccione um inversor string nas sugestões; configure a bateria no campo abaixo.
            </div>
          )}
        </div>

        <Separator />

        {/* ── Auto suggestions ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Soluções Automáticas
            </p>
            {combos.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400" />Ideal (0,90–1,20)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />Aceitável (0,75–1,35)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-400" />Não rec.
                </span>
              </div>
            )}
          </div>

          {combos.length === 0 ? (
            <div className="flex items-center gap-2 p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground">
              <Info size={16} className="shrink-0" />
              Nenhuma combinação encontrada. Alargue os parâmetros (ex: mude ligação para "Indiferente" ou remova o limite AC).
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {combos.map(combo => (
                <ComboCard
                  key={combo.key}
                  combo={combo}
                  isSelected={combo.key === selectedKey}
                  pendingConfirm={pendingConfirm === combo.key}
                  onSelect={() => handleSelectClick(combo)}
                  onConfirm={() => applyCombo(combo)}
                  onCancelConfirm={() => setPendingConfirm(null)}
                />
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-3">
            Monofásico ≤ 6 kW, Trifásico &gt; 6 kW (heurística de potência).
            Detecção híbrido/string baseada no nome do modelo.
            {selectedKey && (
              <span className="text-primary font-medium ml-1">
                ✓ Combinação seleccionada — confirme ou ajuste nos campos abaixo.
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
