import { useMemo, useState, useEffect } from "react";
import { SolarPanel, Inverter, Battery } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, XCircle, Info, Zap, Sun, Battery as BatteryIcon, GitBranch, RotateCcw, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcStringSizing, calcStringSizingManual, type StringSizingResult } from "@/lib/string-sizing";
import { checkPanelInverter, checkBatteryInverter, type CompatResult } from "@/lib/compat-check";

interface Props {
  panel: SolarPanel | null;
  inverter: Inverter | null;
  battery: Battery | null;
  numPaineis: number;
  potenciaInstalada: number;
  onNumPaineisChange?: (n: number) => void;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    aviso: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    erro: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  };
  const label: Record<string, string> = { ok: "OK", aviso: "Atenção", erro: "Erro", info: "Info" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", map[status] ?? map.info)}>
      {label[status] ?? status}
    </span>
  );
}

function CompatTable({ result, title }: { result: CompatResult; title: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        {result.temErros && <Badge variant="destructive" className="text-xs">Erros</Badge>}
        {!result.temErros && result.temAvisos && <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Atenções</Badge>}
        {!result.temErros && !result.temAvisos && <Badge className="text-xs bg-emerald-500 hover:bg-emerald-500">Compatível</Badge>}
      </div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-32">Verificação</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Descrição</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Obtido</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Limite</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-20">Estado</th>
            </tr>
          </thead>
          <tbody>
            {result.itens.map((item, i) => (
              <tr key={i} className={cn("border-b last:border-0", item.status === "erro" && "bg-red-50/50 dark:bg-red-950/20", item.status === "aviso" && "bg-amber-50/50 dark:bg-amber-950/20")}>
                <td className="px-3 py-2 font-medium text-xs text-muted-foreground">{item.categoria}</td>
                <td className="px-3 py-2 text-xs">{item.descricao}</td>
                <td className="px-3 py-2 text-right text-xs font-mono">{item.valorObtido}</td>
                <td className="px-3 py-2 text-right text-xs font-mono text-muted-foreground">{item.valorLimite}</td>
                <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Stepper – small +/- control used inside the string config editor
───────────────────────────────────────────────────────────────────────────── */
function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        className="w-6 h-6 rounded border flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:bg-muted transition-colors"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >−</button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        className="w-6 h-6 rounded border flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:bg-muted transition-colors"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >+</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   String sizing card — editable configuration
───────────────────────────────────────────────────────────────────────────── */
interface StringSizingCardProps {
  autoResult: StringSizingResult;
  numMppt: number;
  maxStringsPorMppt: number;
  panelElec: { voc: number; vmp: number; isc: number; imp: number; potencia: number; coeficienteTemperaturaVoc: number | null; noct: number | null };
  invElec: { mpptMin: number; mpptMax: number; corrMaxMppt: number; numMppt: number; stringsPorMppt: number; potenciaDcMax: number; vdcMax: number | null };
  onConfigChange?: (paineisPerString: number, stringsPorMppt: number[]) => void;
}

function StringSizingCard({ autoResult, numMppt, maxStringsPorMppt, panelElec, invElec, onConfigChange }: StringSizingCardProps) {
  const [editMode, setEditMode] = useState(false);
  const [paineisEdit, setPaineisEdit] = useState(autoResult.config.paineisPerString);
  const [mpptEdit, setMpptEdit] = useState<number[]>(autoResult.config.stringsPorMppt);

  // When auto result changes (e.g. numPaineis changed externally), reset overrides
  useEffect(() => {
    if (!editMode) {
      setPaineisEdit(autoResult.config.paineisPerString);
      setMpptEdit(autoResult.config.stringsPorMppt);
    }
  }, [autoResult, editMode]);

  const result = useMemo<StringSizingResult>(() => {
    if (!editMode) return autoResult;
    return calcStringSizingManual(panelElec, invElec, paineisEdit, mpptEdit);
  }, [editMode, autoResult, panelElec, invElec, paineisEdit, mpptEdit]);

  const { config, alertas, tMinPortugal, tMaxCelula, vdcMaxUsado } = result;
  const erros = alertas.filter(a => a.tipo === "erro");
  const avisos = alertas.filter(a => a.tipo === "aviso");
  const ok = alertas.filter(a => a.tipo === "ok");

  const totalStrings = mpptEdit.reduce((a, b) => a + b, 0);
  const totalPaineis = paineisEdit * totalStrings;

  function handleResetAuto() {
    setPaineisEdit(autoResult.config.paineisPerString);
    setMpptEdit(autoResult.config.stringsPorMppt);
    setEditMode(false);
    onConfigChange?.(autoResult.config.paineisPerString, autoResult.config.stringsPorMppt);
  }

  function handleMpptChange(idx: number, val: number) {
    const next = mpptEdit.map((v, i) => (i === idx ? val : v));
    setMpptEdit(next);
    onConfigChange?.(paineisEdit, next);
  }

  function handlePaineisChange(val: number) {
    setPaineisEdit(val);
    onConfigChange?.(val, mpptEdit);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch size={18} className="text-primary" />
              Dimensionamento de Strings
            </CardTitle>
            <CardDescription className="mt-0.5">
              {editMode ? "Modo edição — ajuste a configuração manualmente" : "Cálculo automático da configuração elétrica"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editMode && (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={handleResetAuto}>
                <RotateCcw size={12} /> Automático
              </Button>
            )}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="text-xs gap-1"
              onClick={() => { setEditMode(e => !e); if (editMode) handleResetAuto(); }}
            >
              <Pencil size={12} />
              {editMode ? "Fechar edição" : "Editar config."}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Edit panel – only shown in edit mode */}
        {editMode && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuração manual</p>

            {/* Painéis per string */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium w-40 shrink-0">Painéis por string</label>
              <div className="flex items-center gap-2">
                <Stepper value={paineisEdit} min={1} max={30} onChange={handlePaineisChange} />
                <span className="text-xs text-muted-foreground ml-1">módulos</span>
              </div>
            </div>

            {/* Strings per MPPT */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Strings por MPPT</label>
              <div className="flex flex-wrap gap-3">
                {mpptEdit.map((n, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2 bg-background min-w-[80px]">
                    <span className="text-xs font-semibold text-muted-foreground">MPPT {i + 1}</span>
                    <Stepper value={n} min={0} max={maxStringsPorMppt} onChange={v => handleMpptChange(i, v)} />
                    <span className="text-xs text-muted-foreground">{n} string{n !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live total */}
            <div className="flex items-center gap-3 pt-1 border-t">
              <div className="text-sm text-muted-foreground">Total:</div>
              <div className="flex items-center gap-4 text-sm font-medium">
                <span>{totalStrings} strings × {paineisEdit} painéis = <strong>{totalPaineis} painéis</strong></span>
                <span className="text-muted-foreground">·</span>
                <span>{((totalPaineis * Number(panelElec.potencia)) / 1000).toFixed(2)} kWp</span>
              </div>
            </div>
          </div>
        )}

        {/* Summary boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Painéis/String", value: config.paineisPerString },
            { label: "Nº de Strings", value: config.numStrings },
            { label: "DC/AC Ratio", value: `${(config.dcAcRatio * 100).toFixed(0)}%` },
            { label: "Potência DC", value: `${(config.potenciaDCTotal / 1000).toFixed(2)} kWp` },
          ].map(b => (
            <div key={b.label} className={cn("rounded-lg p-3 text-center", editMode ? "bg-primary/10" : "bg-muted/40")}>
              <div className="text-xl font-bold text-foreground">{b.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{b.label}</div>
            </div>
          ))}
        </div>

        {/* MPPT distribution */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Distribuição por MPPT</p>
          <div className="flex flex-wrap gap-2">
            {config.stringsPorMppt.map((n, i) => (
              <div key={i} className={cn("rounded-lg border px-3 py-2 text-center text-sm", n > 0 ? "border-primary/30 bg-primary/5" : "border-dashed text-muted-foreground")}>
                <div className="font-semibold">MPPT {i + 1}</div>
                <div className="text-xs text-muted-foreground">{n} string{n !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Voltage analysis */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Análise Térmica de Tensão</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {[
              { label: `Voc em frio (${tMinPortugal}°C)`, value: `${config.vocFrio.toFixed(0)} V`, sub: `< ${vdcMaxUsado.toFixed(0)} V` },
              { label: `Vmpp em calor (${tMaxCelula.toFixed(0)}°C)`, value: `${config.vmpQuente.toFixed(0)} V`, sub: "janela MPPT" },
              { label: "Voc @ STC", value: `${config.vocSTC.toFixed(0)} V`, sub: "condições STD" },
              { label: "Vmpp @ STC", value: `${config.vmpSTC.toFixed(0)} V`, sub: "condições STD" },
              { label: "Isc por string", value: `${config.iscString.toFixed(2)} A`, sub: "por MPPT" },
              { label: "Vdc Max usado", value: `${vdcMaxUsado.toFixed(0)} V`, sub: "limite inversor" },
            ].map(r => (
              <div key={r.label} className="rounded-lg bg-muted/30 p-2.5">
                <div className="font-mono font-semibold">{r.value}</div>
                <div className="text-xs text-muted-foreground">{r.label}</div>
                <div className="text-xs text-muted-foreground/60">{r.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Validação Elétrica</p>
          {erros.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <XCircle size={15} className="shrink-0 mt-0.5" /> {a.mensagem}
            </div>
          ))}
          {avisos.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {a.mensagem}
            </div>
          ))}
          {ok.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {a.mensagem}
            </div>
          ))}
        </div>

        {/* Technical summary */}
        <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs space-y-1">
          <p className="font-semibold text-foreground not-italic mb-2">Resumo técnico</p>
          <p>{config.numStrings} string{config.numStrings !== 1 ? "s" : ""} × {config.paineisPerString} painéis</p>
          {config.stringsPorMppt.map((n, i) => n > 0 && (
            <p key={i}>MPPT{i + 1}: {n} string{n !== 1 ? "s" : ""} × {config.paineisPerString} módulos</p>
          ))}
          <p className="mt-1">Voc @ {tMinPortugal}°C: {config.vocFrio.toFixed(0)}V</p>
          <p>Vmpp operacional: {config.vmpQuente.toFixed(0)}V</p>
          <p>DC/AC Ratio: {config.dcAcRatio.toFixed(2)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SVG single-line diagram
───────────────────────────────────────────────────────────────────────────── */
function SingleLineDiagram({ panel, inverter, battery, numStrings, paineisPerString, stringsPorMppt }: {
  panel: SolarPanel;
  inverter: Inverter;
  battery: Battery | null;
  numStrings: number;
  paineisPerString: number;
  stringsPorMppt: number[];
}) {
  const hasBat = battery !== null;
  const numMppt = Math.min(inverter.numMppt, stringsPorMppt.filter(n => n > 0).length);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Zap size={16} className="text-primary" />Diagrama Unifilar Simplificado</CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox="0 0 700 280" className="w-full h-auto max-h-72" style={{ fontFamily: "inherit" }}>
          {Array.from({ length: numMppt }, (_, mi) => {
            const stringsOnMppt = stringsPorMppt[mi] ?? 0;
            return Array.from({ length: stringsOnMppt }, (_, si) => {
              const totalRows = stringsPorMppt.reduce((a, b) => a + b, 0);
              const rowIndex = stringsPorMppt.slice(0, mi).reduce((a, b) => a + b, 0) + si;
              const y = 30 + (rowIndex / Math.max(totalRows - 1, 1)) * 220;
              return (
                <g key={`${mi}-${si}`}>
                  <rect x={10} y={y - 14} width={50} height={28} rx="4" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" />
                  <text x={35} y={y - 2} textAnchor="middle" fontSize="7" fill="#92400e">{paineisPerString}× {panel.potencia}W</text>
                  <text x={35} y={y + 8} textAnchor="middle" fontSize="6" fill="#92400e">String {rowIndex + 1}</text>
                  <line x1={60} y1={y} x2={170} y2={y} stroke="#6b7280" strokeWidth="1.5" />
                </g>
              );
            });
          })}

          {Array.from({ length: numMppt }, (_, mi) => {
            const totalRows = stringsPorMppt.reduce((a, b) => a + b, 0);
            const rowsBeforeThis = stringsPorMppt.slice(0, mi).reduce((a, b) => a + b, 0);
            const rowsThis = stringsPorMppt[mi] ?? 0;
            const yCentre = rowsThis > 0
              ? 30 + ((rowsBeforeThis + (rowsThis - 1) / 2) / Math.max(totalRows - 1, 1)) * 220
              : 140;
            return (
              <g key={mi}>
                <rect x={170} y={yCentre - 14} width={60} height={28} rx="4" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.5" />
                <text x={200} y={yCentre - 2} textAnchor="middle" fontSize="8" fill="#1e40af">MPPT {mi + 1}</text>
                <text x={200} y={yCentre + 8} textAnchor="middle" fontSize="6.5" fill="#1e40af">{stringsPorMppt[mi]}s × {paineisPerString}p</text>
                <line x1={230} y1={yCentre} x2={270} y2={140} stroke="#6b7280" strokeWidth="1.5" />
              </g>
            );
          })}

          <rect x={270} y={100} width={110} height={80} rx="8" fill="#f0fdf4" stroke="#22c55e" strokeWidth="2" />
          <text x={325} y={128} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#15803d">Inversor</text>
          <text x={325} y={142} textAnchor="middle" fontSize="7.5" fill="#16a34a">{inverter.fabricante}</text>
          <text x={325} y={155} textAnchor="middle" fontSize="7" fill="#16a34a">{inverter.potenciaAc} kW AC</text>
          <text x={325} y={166} textAnchor="middle" fontSize="7" fill="#16a34a">{inverter.numMppt} MPPT</text>
          <line x1={380} y1={140} x2={hasBat ? 440 : 560} y2={140} stroke="#22c55e" strokeWidth="2" />

          {hasBat && (
            <g>
              <rect x={440} y={100} width={80} height={80} rx="8" fill="#fff7ed" stroke="#f97316" strokeWidth="1.5" />
              <text x={480} y={130} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#c2410c">Bateria</text>
              <text x={480} y={144} textAnchor="middle" fontSize="7" fill="#ea580c">{battery?.capacidade} kWh</text>
              <text x={480} y={156} textAnchor="middle" fontSize="7" fill="#ea580c">{battery?.fabricante}</text>
              <line x1={520} y1={140} x2={560} y2={140} stroke="#f97316" strokeWidth="1.5" />
            </g>
          )}

          <rect x={560} y={108} width={70} height={64} rx="6" fill="#faf5ff" stroke="#8b5cf6" strokeWidth="1.5" />
          <text x={595} y={135} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#6d28d9">Quadro</text>
          <text x={595} y={148} textAnchor="middle" fontSize="7" fill="#7c3aed">Geral</text>
          <text x={595} y={162} textAnchor="middle" fontSize="7" fill="#7c3aed">UPAC</text>
          <line x1={630} y1={140} x2={680} y2={140} stroke="#6b7280" strokeWidth="2" strokeDasharray="6 3" />
          <rect x={652} y={124} width={38} height={32} rx="4" fill="#f9fafb" stroke="#9ca3af" strokeWidth="1.5" />
          <text x={671} y={138} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">Rede</text>
          <text x={671} y={149} textAnchor="middle" fontSize="7" fill="#6b7280">230V AC</text>

          <text x={70} y={18} textAnchor="middle" fontSize="8" fill="#78716c">Módulos FV</text>
          <text x={200} y={18} textAnchor="middle" fontSize="8" fill="#2563eb">Entradas DC</text>
          <text x={325} y={95} textAnchor="middle" fontSize="8" fill="#15803d">Inversor</text>
          {hasBat && <text x={480} y={95} textAnchor="middle" fontSize="8" fill="#c2410c">Armazenamento</text>}
          <text x={595} y={100} textAnchor="middle" fontSize="8" fill="#6d28d9">Quadro</text>
        </svg>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main export
───────────────────────────────────────────────────────────────────────────── */
export default function WizardStep5Tecnica({ panel, inverter, battery, numPaineis, potenciaInstalada, onNumPaineisChange }: Props) {
  // Active string config — starts from auto-calc, may be overridden via the card
  const [manualConfig, setManualConfig] = useState<{ paineisPerString: number; stringsPorMppt: number[] } | null>(null);

  const panelElec = useMemo(() => panel ? {
    voc: Number(panel.voc),
    vmp: Number(panel.vmp),
    isc: Number(panel.isc),
    imp: Number(panel.imp),
    potencia: Number(panel.potencia),
    coeficienteTemperaturaVoc: panel.coeficienteTemperaturaVoc != null ? Number(panel.coeficienteTemperaturaVoc) : null,
    noct: panel.noct != null ? Number(panel.noct) : null,
  } : null, [panel]);

  const invElec = useMemo(() => inverter ? {
    mpptMin: Number(inverter.mpptMin),
    mpptMax: Number(inverter.mpptMax),
    corrMaxMppt: Number(inverter.corrMaxMppt),
    numMppt: inverter.numMppt,
    stringsPorMppt: inverter.stringsPorMppt,
    potenciaDcMax: Number(inverter.potenciaDcMax),
    vdcMax: inverter.vdcMax != null ? Number(inverter.vdcMax) : null,
  } : null, [inverter]);

  // Reset manual config whenever panel/inverter/numPaineis changes
  useEffect(() => { setManualConfig(null); }, [panel?.id, inverter?.id, numPaineis]);

  const autoSizing = useMemo<StringSizingResult | null>(() => {
    if (!panelElec || !invElec || numPaineis <= 0) return null;
    return calcStringSizing(panelElec, invElec, numPaineis);
  }, [panelElec, invElec, numPaineis]);

  const activeSizing = useMemo<StringSizingResult | null>(() => {
    if (!panelElec || !invElec || !autoSizing) return autoSizing;
    if (!manualConfig) return autoSizing;
    return calcStringSizingManual(panelElec, invElec, manualConfig.paineisPerString, manualConfig.stringsPorMppt);
  }, [panelElec, invElec, autoSizing, manualConfig]);

  const compatPanelInv = useMemo<CompatResult | null>(() => {
    if (!panel || !inverter || !panelElec || !invElec) return null;
    return checkPanelInverter(
      { potencia: panelElec.potencia, voc: panelElec.voc, vmp: panelElec.vmp, isc: panelElec.isc, imp: panelElec.imp },
      { potenciaAc: Number(inverter.potenciaAc), potenciaDcMax: invElec.potenciaDcMax, mpptMin: invElec.mpptMin, mpptMax: invElec.mpptMax, corrMaxMppt: invElec.corrMaxMppt, numMppt: invElec.numMppt, stringsPorMppt: invElec.stringsPorMppt, vdcMax: invElec.vdcMax },
      numPaineis
    );
  }, [panel, inverter, panelElec, invElec, numPaineis]);

  const compatBatInv = useMemo<CompatResult | null>(() => {
    if (!battery || !inverter || !invElec) return null;
    return checkBatteryInverter(
      { capacidade: Number(battery.capacidade), tensao: Number(battery.tensao), tecnologia: battery.tecnologia ?? null },
      { potenciaAc: Number(inverter.potenciaAc), potenciaDcMax: invElec.potenciaDcMax, mpptMin: invElec.mpptMin, mpptMax: invElec.mpptMax, corrMaxMppt: invElec.corrMaxMppt, numMppt: invElec.numMppt, stringsPorMppt: invElec.stringsPorMppt, vdcMax: invElec.vdcMax }
    );
  }, [battery, inverter, invElec]);

  if (!panel || !inverter || !panelElec || !invElec) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        Selecione um painel e um inversor no passo anterior para ver a análise técnica.
      </div>
    );
  }

  const hasErrors = (activeSizing?.alertas.some(a => a.tipo === "erro") ?? false) || (compatPanelInv?.temErros ?? false);
  const hasWarnings = (activeSizing?.alertas.some(a => a.tipo === "aviso") ?? false) || (compatPanelInv?.temAvisos ?? false) || (compatBatInv?.temAvisos ?? false);

  const displayConfig = activeSizing?.config;

  return (
    <div className="space-y-6">
      {/* Global status */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium",
        hasErrors
          ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
          : hasWarnings
            ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
            : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
      )}>
        {hasErrors ? <XCircle size={18} /> : hasWarnings ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        {hasErrors
          ? "Sistema com erros de dimensionamento — corrija antes de avançar para proposta."
          : hasWarnings
            ? "Sistema dimensionado com atenções — reveja os alertas abaixo."
            : `Sistema tecnicamente validado — ${displayConfig?.numStrings ?? 0} strings × ${displayConfig?.paineisPerString ?? 0} painéis (${((displayConfig?.potenciaDCTotal ?? 0) / 1000).toFixed(2)} kWp).`}
      </div>

      {/* Equipment summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Sun size={18} className="text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Painel</p>
            <p className="text-sm font-medium truncate">{panel.fabricante} {panel.nome}</p>
            <p className="text-xs text-muted-foreground">{panel.potencia} Wp · Voc {panel.voc}V</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Zap size={18} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Inversor</p>
            <p className="text-sm font-medium truncate">{inverter.fabricante} {inverter.nome}</p>
            <p className="text-xs text-muted-foreground">{inverter.potenciaAc} kW · {inverter.numMppt} MPPT</p>
          </div>
        </div>
        {battery && (
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
            <BatteryIcon size={18} className="text-orange-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Bateria</p>
              <p className="text-sm font-medium truncate">{battery.fabricante} {battery.nome}</p>
              <p className="text-xs text-muted-foreground">{battery.capacidade} kWh</p>
            </div>
          </div>
        )}
      </div>

      {/* String sizing card with inline editor */}
      {autoSizing && (
        <StringSizingCard
          autoResult={autoSizing}
          numMppt={inverter.numMppt}
          maxStringsPorMppt={inverter.stringsPorMppt}
          panelElec={panelElec}
          invElec={invElec}
          onConfigChange={(pps, spm) => {
            setManualConfig({ paineisPerString: pps, stringsPorMppt: spm });
            const total = pps * spm.reduce((a, b) => a + b, 0);
            if (total > 0) onNumPaineisChange?.(total);
          }}
        />
      )}

      {/* Single line diagram */}
      {activeSizing && (
        <SingleLineDiagram
          panel={panel}
          inverter={inverter}
          battery={battery}
          numStrings={activeSizing.config.numStrings}
          paineisPerString={activeSizing.config.paineisPerString}
          stringsPorMppt={activeSizing.config.stringsPorMppt}
        />
      )}

      {/* Compatibility tables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 size={16} className="text-primary" />
            Análise de Compatibilidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {compatPanelInv && <CompatTable result={compatPanelInv} title="Painel ↔ Inversor" />}
          {compatBatInv && <CompatTable result={compatBatInv} title="Bateria ↔ Inversor" />}
        </CardContent>
      </Card>
    </div>
  );
}
