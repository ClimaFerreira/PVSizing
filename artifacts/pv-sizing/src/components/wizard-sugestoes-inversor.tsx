import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Zap, CheckCircle2, Info, Sun, BarChart3 } from "lucide-react";
import { criarUnidade, type InverterUnit } from "@/lib/multi-inverter";

// ── Types ──────────────────────────────────────────────────────────────────────

type TipoLigacao  = "indeferente" | "monofasico" | "trifasico";
type TipoInversor = "sem-preferencia" | "string" | "hibrido" | "ac-coupled";
type BateriaOpcao = "nao" | "a-estudar" | "sim";
type Topologia    = "automatico" | "um" | "multi";

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
  potenciaAcUnit:  number;
  potenciaAcTotal: number;
  ratioDcAc:       number;
  fase:            "mono" | "tri";
  isHybrid:        boolean;
  tag:             "ideal" | "ok";
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
// Covers common brands sold in Portugal: Huawei, GoodWe, SolarEdge, Solax, Solis, Fronius, SMA, SunGrow
const HYBRID_RE = /HYB|HYBRID|GEN24|X-HYB|RHI|LP[12]|-EH|-ET|SH-\d|MULTI|STOREDGE|-H\d|\.HV\d/i;

function isHybridInverter(nome: string): boolean {
  return HYBRID_RE.test(nome);
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

    // Phase inference: ≤ 6 kW → monofásico, > 6 kW → trifásico
    const fase: "mono" | "tri" = potAc <= 6.0 ? "mono" : "tri";
    const isHybrid = isHybridInverter(inv.nome);

    // ── Hard filters ──────────────────────────────────────────────────────────

    // Monofásico: exclude trifásico inverters + respect AC limit
    if (p.tipoLigacao === "monofasico") {
      if (fase !== "mono") continue;
      if (p.limiteAcKw !== null && p.limiteAcKw > 0 && potAc > p.limiteAcKw) continue;
    }

    // Trifásico: exclude monofásico inverters
    if (p.tipoLigacao === "trifasico" && fase === "mono") continue;

    // Global AC limit (when set and connection is indeferente)
    if (
      p.tipoLigacao === "indeferente" &&
      p.limiteAcKw !== null &&
      p.limiteAcKw > 0 &&
      potAc > p.limiteAcKw
    ) continue;

    // Híbrido mode: only show hybrids
    if (p.tipoInversor === "hibrido" && !isHybrid) continue;

    // String mode: only show non-hybrids
    if (p.tipoInversor === "string" && isHybrid) continue;

    // ── Unit count to generate ────────────────────────────────────────────────
    const unitCounts: number[] =
      p.topologia === "um"    ? [1]       :
      p.topologia === "multi" ? [2, 3]    :
                                [1, 2, 3]; // automático

    for (const units of unitCounts) {
      const totalAc = potAc * units;
      const ratio   = potenciaKwp / totalAc;
      if (ratio < 0.80 || ratio > 1.35) continue;

      combos.push({
        key:             units === 1 ? `s-${inv.id}` : `m${units}-${inv.id}`,
        tipo:            units === 1 ? "unico" : units === 2 ? "duplo" : "triplo",
        inverterId:      inv.id,
        nome:            inv.nome,
        fabricante:      inv.fabricante,
        unidades:        units,
        potenciaAcUnit:  potAc,
        potenciaAcTotal: totalAc,
        ratioDcAc:       Math.round(ratio * 100) / 100,
        fase,
        isHybrid,
        tag:             ratio >= 0.90 && ratio <= 1.20 ? "ideal" : "ok",
      });
    }
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  return combos.sort((a, b) => {
    // Hybrid priority when battery = sim
    if (p.bateria === "sim") {
      if (a.isHybrid !== b.isHybrid) return a.isHybrid ? -1 : 1;
    }
    // Three-phase priority
    if (p.tipoLigacao === "trifasico") {
      if (a.fase !== b.fase) return a.fase === "tri" ? -1 : 1;
    }
    // Ideal ratio first
    if (a.tag !== b.tag) return a.tag === "ideal" ? -1 : 1;
    // Closest ratio to 1.10
    return Math.abs(a.ratioDcAc - 1.1) - Math.abs(b.ratioDcAc - 1.1);
  }).slice(0, 9);
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

const TAG_STYLE: Record<"ideal" | "ok", string> = {
  ideal: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  ok:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

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

  function setParam<K extends keyof InstalacaoParams>(key: K, val: InstalacaoParams[K]) {
    setParams(prev => ({ ...prev, [key]: val }));
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

  function handleSelect(combo: Combo) {
    if (combo.tipo === "unico") {
      onSelectInverter(combo.inverterId);
    } else {
      onSelectMultiInverter([{ ...criarUnidade(combo.inverterId), quantidade: combo.unidades }]);
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
          <div className="flex gap-3 flex-wrap">
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
                { value: "sem-preferencia", label: "Indiferente"    },
                { value: "string",          label: "String"         },
                { value: "hibrido",         label: "Híbrido"        },
                { value: "ac-coupled",      label: "AC-coupled"     },
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
              <p className="text-xs font-medium mb-1.5">
                Limite de potência AC (kW)
              </p>
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

          {/* Context hints */}
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
              AC-coupled: o inversor solar (string) e o inversor de bateria (ex. Victron) são unidades separadas. Seleccione um inversor string nas sugestões; configure a bateria no campo abaixo.
            </div>
          )}
        </div>

        <Separator />

        {/* ── Auto suggestions ── */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Soluções Automáticas
          </p>

          {combos.length === 0 ? (
            <div className="flex items-center gap-2 p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground">
              <Info size={16} className="shrink-0" />
              Nenhuma combinação encontrada. Alargue os parâmetros (ex: mude ligação para "Indiferente" ou remova o limite AC).
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
                      <div className="flex items-center gap-1 shrink-0">
                        {combo.isHybrid && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            HYB
                          </span>
                        )}
                        {isSelected && (
                          <CheckCircle2 size={15} className="text-primary" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs">
                          <span className="font-semibold">{combo.potenciaAcTotal} kW</span>
                          <span className="text-muted-foreground"> AC</span>
                          {combo.unidades > 1 && (
                            <span className="text-muted-foreground">
                              {" "}({combo.potenciaAcUnit}×{combo.unidades})
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
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0",
                        TAG_STYLE[combo.tag],
                      )}>
                        {combo.tag === "ideal" ? "Ideal" : "Aceitável"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-3">
            Ratio DC/AC ideal: 0,90–1,20 · Monofásico ≤ 6 kW, Trifásico &gt; 6 kW (heurística de potência).
            A detecção híbrido/string é baseada no nome do modelo.
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
