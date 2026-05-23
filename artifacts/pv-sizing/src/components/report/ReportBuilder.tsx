import { useState, useMemo, useCallback } from "react";
import {
  useGetProject,
  useListCustomers,
  useListPanels,
  useListInverters,
  useListBatteries,
} from "@workspace/api-client-react";
import type { SolarPanel, Inverter, Battery } from "@workspace/api-client-react";
import { useSolar } from "@/contexts/SolarContext";
import { useMapa } from "@/contexts/MapaContext";
import { buildCrossSectionSvg, buildLayoutSvg, buildCoplanarLayoutSvg } from "@/lib/svg-utils";
import type { InverterUnit } from "@/lib/multi-inverter";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Printer, Eye, EyeOff, ChevronUp, ChevronDown, FileText, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { DEFAULT_SECTIONS, TEMPLATE_SETS, type ReportSection, type SectionId } from "./types";
import ReportPreview, { type ReportData } from "./ReportPreview";

interface Props {
  projectId: number | null;
}

export default function ReportBuilder({ projectId }: Props) {
  const [sections, setSections] = useState<ReportSection[]>(DEFAULT_SECTIONS);
  const [showPreview, setShowPreview] = useState(true);
  const [notas, setNotas] = useState("");
  const [template, setTemplate] = useState("completo");
  const { toast } = useToast();

  /* ── API data ── */
  const { data: projectRow, isLoading: loadingProject } = useGetProject(projectId ?? 0);
  const { data: customers } = useListCustomers();
  const { data: allPanels } = useListPanels();
  const { data: allInverters } = useListInverters();
  const { data: allBatteries } = useListBatteries();

  /* ── Shared contexts (spacing + map tabs) ── */
  const { params: spacingParams, results: spacingResults } = useSolar();
  const { mapData } = useMapa();

  /* ── Derive data from draftData ── */
  const draftData = projectRow?.draftData as Record<string, unknown> | null | undefined;
  const sizing = (draftData?.sizing as Record<string, unknown> | null) ?? null;
  const consumoData = (draftData?.consumoData as Record<string, unknown> | null) ?? null;
  const locData = (draftData?.locData as Record<string, unknown> | null) ?? null;
  const equipFormValues = (draftData?.equipFormValues as Record<string, unknown> | null) ?? null;
  const inverterUnitsRaw = (draftData?.inverterUnits as InverterUnit[] | null) ?? [];
  const batteryUnitsRaw = (draftData?.batteryUnits as Array<{ batteryId?: number }> | null) ?? [];

  const customerId = projectRow?.customerId ?? null;
  const customer = customers?.find((c) => c.id === customerId) ?? null;

  const panelId = (equipFormValues?.panelId as number | null | undefined)
    ?? (draftData?.panelRefId as number | null | undefined)
    ?? projectRow?.panelId ?? null;
  const panel: SolarPanel | null = allPanels?.find((p) => p.id === panelId) ?? null;

  const inverters: Inverter[] = useMemo(() => {
    const ids = inverterUnitsRaw.map((u) => u.inverterId).filter((id): id is number => id > 0);
    return [...new Set(ids)].map((id) => allInverters?.find((inv) => inv.id === id))
      .filter((inv): inv is Inverter => inv != null);
  }, [inverterUnitsRaw, allInverters]);

  const batteries: Battery[] = useMemo(() => {
    const ids = batteryUnitsRaw.map((u) => u.batteryId).filter((id): id is number => id != null && id > 0);
    return [...new Set(ids)].map((id) => allBatteries?.find((b) => b.id === id))
      .filter((b): b is Battery => b != null);
  }, [batteryUnitsRaw, allBatteries]);

  /* ── Generate SVG diagrams from live spacing context ── */
  const spacingCrossSvg = useMemo(() => {
    if (!spacingResults || spacingParams?.mountType === "coplanar") return "";
    try { return buildCrossSectionSvg(spacingResults); } catch { return ""; }
  }, [spacingResults, spacingParams?.mountType]);

  const spacingLayoutSvg = useMemo(() => {
    if (!spacingResults || !spacingParams) return "";
    try {
      if (spacingParams.mountType === "coplanar") {
        return buildCoplanarLayoutSvg(
          parseFloat(spacingParams.height) || 1,
          parseFloat(spacingParams.width) || 1,
          parseInt(spacingParams.rows) || 1,
          parseInt(spacingParams.cols) || 1,
        );
      }
      return buildLayoutSvg(
        spacingResults,
        parseInt(spacingParams.rows) || 1,
        parseInt(spacingParams.cols) || 1,
      );
    } catch { return ""; }
  }, [spacingResults, spacingParams]);

  /* ── Build report data ── */
  const reportData: ReportData = useMemo(() => ({
    projectName: projectRow?.nome ?? "Projeto Solar",
    date: new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" }),
    customer,
    panel,
    inverters,
    batteries,
    sizing,
    consumoData,
    locData,
    numPaineis: projectRow?.numPaineis ?? null,
    potenciaKwp: projectRow?.potenciaKwp ?? null,
    investimentoManual: (draftData?.investimentoManual as number | null) ?? null,
    notas,
    spacingParams,
    spacingResults,
    spacingCrossSvg,
    spacingLayoutSvg,
    mapData: mapData ?? null,
    inverterUnits: inverterUnitsRaw,
    allInverters: allInverters ?? [],
  }), [projectRow, customer, panel, inverters, batteries, sizing, consumoData, locData,
      notas, spacingParams, spacingResults, spacingCrossSvg, spacingLayoutSvg,
      mapData, inverterUnitsRaw, allInverters, draftData]);

  const enabledSections: SectionId[] = sections.filter((s) => s.enabled).map((s) => s.id);

  const applyTemplate = (t: string) => {
    setTemplate(t);
    const ids = TEMPLATE_SETS[t] ?? TEMPLATE_SETS.completo;
    setSections((prev) => prev.map((s) => ({ ...s, enabled: ids.includes(s.id) })));
  };

  const toggleSection = (id: SectionId) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));

  const moveSection = useCallback((id: SectionId, dir: -1 | 1) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }, []);

  const handlePrint = () => window.print();
  const handleDocx = () =>
    toast({ title: "Em breve", description: "Exportação DOCX estará disponível numa próxima versão." });

  /* ── Data availability indicators ── */
  const hasSpacing = !!spacingResults && (spacingResults.rowSpacing > 0 || spacingResults.totalPowerWp > 0);
  const hasMap = !!(mapData?.panelCount || mapData?.mapImageDataUrl || mapData?.panelSvg);
  const hasStrings = inverterUnitsRaw.some((u) => u.mpptConfig && u.mpptConfig.length > 0);

  if (projectId == null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4">
        <FileText className="h-12 w-12 opacity-30" />
        <p className="text-base">Abra um estudo no Wizard para gerar o relatório técnico.</p>
        <p className="text-sm">O relatório sincroniza automaticamente com todos os separadores.</p>
      </div>
    );
  }

  if (loadingProject) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span>A carregar dados do projeto…</span>
      </div>
    );
  }

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* ── Left sidebar ────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r bg-slate-50 flex flex-col">
        <div className="p-4 border-b">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">Relatório Técnico</p>
          {projectRow?.nome && (
            <p className="text-sm font-semibold text-[#0D2B45] truncate" title={projectRow.nome}>{projectRow.nome}</p>
          )}
          {/* Data sync badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge variant={sizing ? "default" : "outline"} className="text-[9px] py-0 px-1.5">
              {sizing ? "✓ Wizard" : "× Wizard"}
            </Badge>
            <Badge variant={hasSpacing ? "default" : "outline"} className="text-[9px] py-0 px-1.5">
              {hasSpacing ? "✓ Espaç." : "× Espaç."}
            </Badge>
            <Badge variant={hasMap ? "default" : "outline"} className="text-[9px] py-0 px-1.5">
              {hasMap ? "✓ Mapa" : "× Mapa"}
            </Badge>
            <Badge variant={hasStrings ? "default" : "outline"} className="text-[9px] py-0 px-1.5">
              {hasStrings ? "✓ Strings" : "× Strings"}
            </Badge>
          </div>
        </div>

        <div className="p-3 border-b">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Template</p>
          <Select value={template} onValueChange={applyTemplate}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="completo">Completo</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
              <SelectItem value="tecnico">Técnico</SelectItem>
              <SelectItem value="executivo">Executivo</SelectItem>
              <SelectItem value="simplificado">Simplificado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Secções</p>
            <div className="space-y-1">
              {sections.map((s, idx) => (
                <div key={s.id}
                  className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs group transition-colors ${s.enabled ? "bg-white border shadow-sm" : "text-slate-400"}`}
                >
                  <Checkbox
                    checked={s.enabled}
                    onCheckedChange={() => toggleSection(s.id)}
                    className="h-3.5 w-3.5"
                    id={`sec-${s.id}`}
                  />
                  <label htmlFor={`sec-${s.id}`} className="flex-1 cursor-pointer leading-tight select-none">{s.label}</label>
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => moveSection(s.id, -1)} disabled={idx === 0}
                      className="h-3 w-3 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20">
                      <ChevronUp className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={() => moveSection(s.id, 1)} disabled={idx === sections.length - 1}
                      className="h-3 w-3 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20">
                      <ChevronDown className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <Separator />

        <div className="p-3 space-y-2">
          <Button size="sm" variant="outline" className="w-full text-xs h-8 gap-1.5" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Ocultar Preview" : "Pré-visualizar"}
          </Button>
          <Button size="sm" className="w-full text-xs h-8 gap-1.5" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" /> Gerar PDF / Imprimir
          </Button>
          <Button size="sm" variant="outline" className="w-full text-xs h-8 gap-1.5 text-slate-500" onClick={handleDocx}>
            <FileText className="h-3.5 w-3.5" /> Exportar DOCX
          </Button>
        </div>
      </div>

      {/* ── Preview area ─────────────────────────────────────────────────── */}
      {showPreview ? (
        <div className="flex-1 min-h-0 overflow-auto bg-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{enabledSections.length} secções</Badge>
            {customer && <Badge variant="secondary" className="text-[10px]">{customer.nome}</Badge>}
            {projectRow?.potenciaKwp && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">
                {projectRow.potenciaKwp.toFixed(2)} kWp
              </Badge>
            )}
            <span className="ml-auto text-[10px] text-slate-500">Ctrl+P / ⌘+P → Guardar como PDF</span>
          </div>

          <div className="max-w-[21cm] mx-auto shadow-xl">
            {enabledSections.includes("notas") && (
              <div className="bg-white border border-b-0 rounded-t-lg px-6 py-4 print:hidden">
                <p className="text-xs font-semibold text-slate-500 mb-2">Notas Técnicas (editável)</p>
                <Textarea rows={3} placeholder="Observações técnicas, normas, condicionamentos…"
                  className="text-sm resize-none" value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>
            )}
            <ReportPreview sections={enabledSections} data={reportData} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-slate-100">
          <Eye className="h-10 w-10 opacity-30" />
          <p className="text-sm">Preview ocultado.</p>
          <Button size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-2" /> Mostrar Preview
          </Button>
        </div>
      )}
    </div>
  );
}
