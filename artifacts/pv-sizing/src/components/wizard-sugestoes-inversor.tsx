import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Zap, CheckCircle2, Info, Sun, BarChart3, AlertTriangle, X, SlidersHorizontal,
} from "lucide-react";
import { criarUnidade, type InverterUnit } from "@/lib/multi-inverter";

// ── Types ──────────────────────────────────────────────────────────────────────

type TipoLigacao  = "indeferente" | "monofasico" | "trifasico";
type TipoInversor = "sem-preferencia" | "string" | "hibrido" | "ac-coupled";
type BateriaOpcao = "nao" | "a-estudar" | "sim";
type Topologia    = "automatico" | "um" | "multi";
type ComboTag     = "ideal" | "ok" | "requer-validacao" | "nao-recomendado";

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
  tipoRede?: "monofasico" | "trifasico" | "desconhecido";
  tensaoAcNominal?: string;
  ligacaoRede?: string;
};

interface ComboViolacao {
  codigo:   "fase" | "limite-ac" | "tipo-inversor";
  mensagem: string;
}

interface Combo {
  key:             string;
  tipo:            "unico" | "duplo" | "triplo";
  inverterId:      number;
  nome:            string;
  fabricante:      string;
  unidades:        number;
  potenciaDcAlvo:  number;
  potenciaAcUnit:  number;
  potenciaAcTotal: number;
  ratioDcAc:       number;
  fase:            "mono" | "tri" | "desconhecido";
  isHybrid:        boolean;
  tag:             ComboTag;
  violacoes:       ComboViolacao[];
  isAlternativa:   boolean;  // flagged when shown as fallback
}

interface Props {
  potenciaKwpEstudo:    number;  // from scenario/effectiveSizing
  potenciaKwpEfetiva:   number;  // from actual panel selection (may differ)
  energiaAnualEstimada: number;
  inverters:            InverterItem[] | undefined;
  selectedInverterId:   number | undefined;
  inverterUnits:        InverterUnit[];
  onSelectInverter:     (inverterId: number) => void;
  onSelectMultiInverter:(units: InverterUnit[]) => void;
}

// ── Unit normalisation (handles records stored in W instead of kW) ────────────
function normalizarKW(val: number): number {
  return val > 500 ? val / 1000 : val;
}

// ── Hybrid detection ──────────────────────────────────────────────────────────
const HYBRID_RE = /HYB|HYBRID|GEN24|X-HYB|RHI|LP[12]|-EH|-ET|SH-\d|MULTI|STOREDGE|-H\d|\.HV\d/i;
const isHybridInverter = (nome: string) => HYBRID_RE.test(nome);

function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferirFaseInversor(inv: InverterItem, potAc: number): "mono" | "tri" | "desconhecido" {
  const tecnico = normalizarTexto(`${inv.tipoRede ??""} ${inv.ligacaoRede ??""} ${inv.tensaoAcNominal ??""}`);
  if (/\b(3l|3p|3f)\s*\+?\s*n?\s*\+?\s*pe\b|3l\+n\+pe|3p\+n\+pe|trifas|three phase|\b380\s*\/\s*400\b|\b400\s*v\b/.test(tecnico)) return "tri";
  if (/\bl\s*\+\s*n\s*\+\s*pe\b|\b(1f|1p)\s*\+?\s*n?\s*\+?\s*pe\b|monofas|single phase|\b220\s*\/\s*230\b|\b230\s*v\b/.test(tecnico)) return "mono";

  const modelo = normalizarTexto(`${inv.fabricante} ${inv.nome}`);
  if (/\bsg05lp1\b|\blp1\b|\beu-am2\b/.test(modelo)) return "mono";
  if (/\bsg04lp3\b|\blp3\b/.test(modelo)) return "tri";
  return potAc <= 6 ? "mono" : "desconhecido";
}

// ── Tag classification ─────────────────────────────────────────────────────────
function classifyTag(ratio: number, violacoes: ComboViolacao[]): ComboTag {
  if (violacoes.length > 0)              return "requer-validacao";
  if (ratio < 0.70 || ratio > 1.50)     return "nao-recomendado";
  if (ratio >= 0.90 && ratio <= 1.30)   return "ideal";
  return "ok";
}

// ── Compute violations for one combo ─────────────────────────────────────────
function computarViolacoes(
  fase:        "mono" | "tri" | "desconhecido",
  isHybrid:    boolean,
  totalAc:     number,
  p:           InstalacaoParams,
): ComboViolacao[] {
  const v: ComboViolacao[] = [];

  // Phase
  if (fase === "desconhecido" && p.tipoLigacao !== "indeferente")
    v.push({ codigo: "fase", mensagem: "Tipo de rede AC por confirmar na ficha tecnica" });
  if (p.tipoLigacao === "monofasico" && fase === "tri")
    v.push({ codigo: "fase", mensagem: "Inversor trifásico (ligação monofásica pretendida)" });
  if (p.tipoLigacao === "trifasico" && fase === "mono")
    v.push({ codigo: "fase", mensagem: "Inversor monofásico (ligação trifásica pretendida)" });

  // AC limit
  if (p.limiteAcKw !== null && p.limiteAcKw > 0 && totalAc > p.limiteAcKw)
    v.push({
      codigo:   "limite-ac",
      mensagem: `Potência AC total (${totalAc} kW) excede o limite definido (${p.limiteAcKw} kW)`,
    });

  // Inverter type
  if (p.tipoInversor === "hibrido" && !isHybrid)
    v.push({ codigo: "tipo-inversor", mensagem: "Inversor sem bateria integrada — considere solução AC-coupled" });
  if (p.tipoInversor === "string" && isHybrid)
    v.push({ codigo: "tipo-inversor", mensagem: "Inversor híbrido (custo superior ao necessário sem bateria)" });

  return v;
}

// ── Combination generator ─────────────────────────────────────────────────────
const MIN_STRICT = 3;   // show fallbacks when strict results are below this
const MAX_TOTAL  = 12;

function gerarCombinacoes(
  potenciaKwp: number,
  inverters:   InverterItem[],
  p:           InstalacaoParams,
): Combo[] {
  if (!inverters.length || potenciaKwp <= 0) return [];

  const unitCounts: number[] =
    p.topologia === "um"    ? [1]       :
    p.topologia === "multi" ? [2, 3]    :
                              [1, 2, 3];

  const allCombos: Combo[] = [];
  const seen = new Set<string>();

  for (const inv of inverters) {
    const potAc = normalizarKW(Number(inv.potenciaAc));
    if (!potAc || potAc <= 0) continue;

    const fase = inferirFaseInversor(inv, potAc);
    const isHybrid = isHybridInverter(inv.nome);

    for (const units of unitCounts) {
      const totalAc = +(potAc * units).toFixed(2);
      const ratio   = Math.round((potenciaKwp / totalAc) * 100) / 100;
      if (ratio < 0.55 || ratio > 1.75) continue;

      const key = units === 1 ? `s-${inv.id}` : `m${units}-${inv.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const violacoes = computarViolacoes(fase, isHybrid, totalAc, p);

      allCombos.push({
        key,
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
        tag:             classifyTag(ratio, violacoes),
        violacoes,
        isAlternativa:   false,
      });
    }
  }

  // ── Sort helper ───────────────────────────────────────────────────────────
  const TAG_ORDER: Record<ComboTag, number> = {
    ideal: 0, ok: 1, "requer-validacao": 2, "nao-recomendado": 3,
  };

  function sortCombos(list: Combo[], batteriaSim: boolean) {
    return list.sort((a, b) => {
      if (batteriaSim && a.isHybrid !== b.isHybrid) return a.isHybrid ? -1 : 1;
      if (a.tag !== b.tag) return TAG_ORDER[a.tag] - TAG_ORDER[b.tag];
      if (a.violacoes.length !== b.violacoes.length) return a.violacoes.length - b.violacoes.length;
      return Math.abs(a.ratioDcAc - 1.1) - Math.abs(b.ratioDcAc - 1.1);
    });
  }

  const battSim = p.bateria === "sim";
  const strict  = sortCombos(allCombos.filter(c => c.violacoes.length === 0), battSim);
  const alts    = sortCombos(allCombos.filter(c => c.violacoes.length > 0), battSim);

  if (strict.length >= MIN_STRICT) return strict.slice(0, MAX_TOTAL);

  // Mark alternatives
  alts.forEach(c => { c.isAlternativa = true; });

  const merged = [...strict, ...alts];
  return merged.slice(0, MAX_TOTAL);
}

// ── Tag metadata ──────────────────────────────────────────────────────────────
const TAG_META: Record<ComboTag, {
  label: string; pill: string; border: string; borderSelected: string;
}> = {
  ideal: {
    label:          "Ideal",
    pill:           "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    border:         "border-green-200 dark:border-green-800",
    borderSelected: "border-green-500",
  },
  ok: {
    label:          "Aceitável",
    pill:           "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    border:         "border-amber-200 dark:border-amber-800",
    borderSelected: "border-amber-500",
  },
  "requer-validacao": {
    label:          "Requer validação",
    pill:           "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    border:         "border-blue-200 dark:border-blue-800",
    borderSelected: "border-blue-500",
  },
  "nao-recomendado": {
    label:          "Não recomendado",
    pill:           "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    border:         "border-red-300 dark:border-red-700",
    borderSelected: "border-red-500",
  },
};

// ── ToggleGroup helper ────────────────────────────────────────────────────────
function ToggleGroup<T extends string>({
  label, options, value, onChange,
}: {
  label:    string;
  options:  { value: T; label: string }[];
  value:    T;
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

// ── DataRow ───────────────────────────────────────────────────────────────────
function DataRow({
  label, value, highlight,
}: {
  label:      string;
  value:      string;
  highlight?: "ok" | "warn" | "bad";
}) {
  const cls =
    highlight === "ok"   ? "text-green-600 dark:text-green-400 font-semibold" :
    highlight === "warn" ? "text-amber-600 dark:text-amber-400 font-semibold" :
    highlight === "bad"  ? "text-red-600   dark:text-red-400   font-semibold" :
                           "font-medium";
  return (
    <>
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={cls}>{value}</span>
    </>
  );
}

// ── ComboCard ─────────────────────────────────────────────────────────────────
function ComboCard({
  combo, isSelected, pendingConfirm, onSelect, onConfirm, onCancelConfirm,
}: {
  combo:           Combo;
  isSelected:      boolean;
  pendingConfirm:  boolean;
  onSelect:        () => void;
  onConfirm:       () => void;
  onCancelConfirm: () => void;
}) {
  const meta = TAG_META[combo.tag];

  const ratioHighlight: "ok" | "warn" | "bad" | undefined =
    combo.ratioDcAc >= 0.90 && combo.ratioDcAc <= 1.20 ? "ok"  :
    combo.ratioDcAc >= 0.75 && combo.ratioDcAc <= 1.35 ? "warn":
                                                          "bad";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all flex flex-col gap-2",
        isSelected
          ? cn("ring-1 ring-primary border-primary bg-primary/5")
          : combo.tag === "nao-recomendado"
            ? cn("opacity-80", meta.border)
            : combo.tag === "requer-validacao"
              ? meta.border
              : "hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      {/* ── Top row ── */}
      <div className="flex items-start justify-between gap-2">
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
          {isSelected && <CheckCircle2 size={14} className="text-primary" />}
        </div>
      </div>

      {/* ── Data grid ── */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        <DataRow label="Potência DC alvo" value={`${combo.potenciaDcAlvo} kWp`} />
        <DataRow label="Potência AC total" value={`${combo.potenciaAcTotal} kW`} />
        <DataRow
          label="DC/AC ratio"
          value={combo.ratioDcAc.toString()}
          highlight={ratioHighlight}
        />
        <DataRow label="Nº inversores" value={combo.unidades.toString()} />
        <DataRow label="Tipo" value={combo.fase === "mono" ? "Monofásico" : combo.fase === "tri" ? "Trifásico" : "Por confirmar"} />
        <DataRow
          label="Compatível bateria"
          value={combo.isHybrid ? "Sim (integrada)" : "AC-coupled"}
          highlight={combo.isHybrid ? "ok" : undefined}
        />
      </div>

      {/* ── Violações ── */}
      {combo.violacoes.length > 0 && (
        <div className="space-y-0.5">
          {combo.violacoes.map((v, i) => (
            <p key={i} className="text-[10px] text-blue-600 dark:text-blue-400 flex items-start gap-1">
              <AlertTriangle size={9} className="shrink-0 mt-0.5" />
              {v.mensagem}
            </p>
          ))}
        </div>
      )}

      {/* ── Bottom row: estado + acção ── */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", meta.pill)}>
          {meta.label}
        </span>

        {pendingConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">Confirmar?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-5 px-2 text-[10px]"
              onClick={onConfirm}
            >
              Sim
            </Button>
            <button type="button" onClick={onCancelConfirm} className="text-muted-foreground hover:text-foreground">
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

      {combo.tag === "nao-recomendado" && (
        <p className="text-[10px] text-red-600 dark:text-red-400 flex items-start gap-1">
          <AlertTriangle size={9} className="shrink-0 mt-0.5" />
          Ratio DC/AC fora do intervalo 0,75–1,35. Risco de perdas ou sobrecarga.
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WizardSugestoesInversor({
  potenciaKwpEstudo,
  potenciaKwpEfetiva,
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

  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);

  function setParam<K extends keyof InstalacaoParams>(k: K, v: InstalacaoParams[K]) {
    setParams(prev => ({ ...prev, [k]: v }));
  }

  const combos = useMemo(
    () => (inverters ? gerarCombinacoes(potenciaKwpEfetiva, inverters, params) : []),
    [potenciaKwpEfetiva, inverters, params],
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

  // Split strict vs alternativas for display
  const comboStrict = combos.filter(c => !c.isAlternativa);
  const comboAlts   = combos.filter(c =>  c.isAlternativa);

  const potenciasDiferem = Math.abs(potenciaKwpEfetiva - potenciaKwpEstudo) >= 0.01;

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
              Escolha a solução técnica compatível com o sistema dimensionado.
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5">
              <Sun size={13} className="text-primary" />
              <div className="text-xs font-semibold text-primary">
                <span>FV alvo estudo: {potenciaKwpEstudo} kWp</span>
                {potenciasDiferem && (
                  <span className="block font-semibold text-primary">
                    <SlidersHorizontal size={11} className="inline mr-1" />
                    FV ajustada: {potenciaKwpEfetiva} kWp
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
              <BarChart3 size={13} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Produção anual: {energiaAnualEstimada.toLocaleString("pt-PT")} kWh
              </span>
            </div>
          </div>
        </div>
        {potenciasDiferem && (
          <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
            <Info size={11} />
            As sugestões usam a potência ajustada ({potenciaKwpEfetiva} kWp) — calculada do painel seleccionado.
          </p>
        )}
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
                placeholder="Ex: 6 ou 20.7"
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
              Com bateria activada, os inversores híbridos são priorizados.
              {params.tipoInversor === "sem-preferencia" && " Filtre por «Híbrido» acima para ver apenas essa tipologia."}
            </div>
          )}
          {params.tipoInversor === "ac-coupled" && (
            <div className="mt-3 flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-700 text-xs text-blue-700 dark:text-blue-400">
              <Info size={13} className="shrink-0 mt-0.5" />
              AC-coupled: inversor solar (string) + inversor de bateria separados (ex. Victron MultiPlus).
              Seleccione um inversor string; configure a bateria nos campos abaixo.
            </div>
          )}
        </div>

        <Separator />

        {/* ── Sugestões ── */}
        <div>
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Soluções Automáticas
            </p>
            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              {(["ideal","ok","requer-validacao","nao-recomendado"] as ComboTag[]).map(t => (
                <span key={t} className="flex items-center gap-1">
                  <span className={cn(
                    "inline-block w-2 h-2 rounded-full",
                    t === "ideal"             ? "bg-green-400" :
                    t === "ok"                ? "bg-amber-400" :
                    t === "requer-validacao"  ? "bg-blue-400"  :
                                               "bg-red-400",
                  )} />
                  {TAG_META[t].label}
                </span>
              ))}
            </div>
          </div>

          {combos.length === 0 ? (
            <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-lg">
              <Info size={18} className="text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">Nenhuma combinação encontrada no catálogo.</p>
                <p className="text-xs">
                  Potência DC alvo: <strong>{potenciaKwpEfetiva} kWp</strong>.
                  Tente alargue os filtros: mude o tipo de ligação para «Indiferente», remova o limite AC,
                  ou mude o número de inversores para «Automático».
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Strict results */}
              {comboStrict.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {comboStrict.map(combo => (
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

              {/* Fallback alternatives */}
              {comboAlts.length > 0 && (
                <>
                  <div className="flex items-center gap-3 my-3">
                    <Separator className="flex-1" />
                    <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap flex items-center gap-1.5">
                      <AlertTriangle size={11} className="text-blue-500" />
                      {comboStrict.length === 0
                        ? "Sem correspondência exacta — soluções alternativas disponíveis"
                        : "Alternativas (fora de alguns filtros)"}
                    </span>
                    <Separator className="flex-1" />
                  </div>
                  {comboStrict.length === 0 && (
                    <p className="text-xs text-muted-foreground mb-3 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-800">
                      O catálogo não tem inversores que cumpram todos os filtros para {potenciaKwpEfetiva} kWp.
                      As soluções abaixo requerem validação — verifique as advertências em cada card.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {comboAlts.map(combo => (
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
                </>
              )}
            </>
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
