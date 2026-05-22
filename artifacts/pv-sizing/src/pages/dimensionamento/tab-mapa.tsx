import { useCallback, useEffect, useRef, useState } from "react";
import { useMapa } from "@/contexts/MapaContext";
import { usePanelCtx } from "@/contexts/PanelContext";
import { useSolar } from "@/contexts/SolarContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Maximize2, Minimize2, Trash2, RotateCcw, Navigation,
  Plus, ChevronDown, ChevronRight, Layers, Zap, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface StringState {
  id: string;
  color: string;
  panelCount: number;
  label: string;
}

interface AreaState {
  id: string;
  name: string;
  color: string;
  azimuth: number;
  mountType: "triangulos" | "coplanar";
  maxPanels: number;
  panelW: number;
  panelH: number;
  powerWp: number;
  /* results from iframe */
  panelCount: number;
  totalKwp: number;
  roofArea: number;
  orientationLabel: string;
  strings: StringState[];
}

interface TabMapaProps {
  isActive?: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const AREA_COLORS = [
  "#F5A623","#1E88E5","#43A047","#E53935",
  "#8E24AA","#00ACC1","#FB8C00","#3949AB",
];

function makeDefaultArea(
  id: string,
  idx: number,
  color: string,
  azimuth: number,
  mountType: string,
  panelW: number,
  panelH: number,
  powerWp: number,
  panelProjDepth: number,
  rowSpacing: number,
): AreaState {
  return {
    id, color,
    name: `Telhado ${idx + 1}`,
    azimuth,
    mountType: (mountType === "coplanar" ? "coplanar" : "triangulos"),
    maxPanels: 0,
    panelW, panelH, powerWp,
    panelCount: 0, totalKwp: 0, roofArea: 0, orientationLabel: "", strings: [],
  };
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function TabMapa({ isActive = false }: TabMapaProps) {
  const { setMapData } = useMapa();
  const { panel, setPanel } = usePanelCtx();
  const { params: solarParams, results: solarResults } = useSolar();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ui state */
  const [sidebarWidth, setSidebarWidth] = useState(296);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);

  /* area state */
  const [areas, setAreas] = useState<AreaState[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);

  /* string state */
  const [stringCount, setStringCount] = useState(4);

  /* totals */
  const [totalPanels, setTotalPanels] = useState(0);
  const [totalKwp, setTotalKwp] = useState(0);

  /* layer */
  const [layerPanels, setLayerPanels] = useState(true);

  /* location sync */
  const prevLocRef = useRef("");

  const activeArea = areas.find(a => a.id === activeAreaId) ?? null;

  /* ── postMessage helper ── */
  const post = useCallback((msg: object) => {
    try { iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*"); }
    catch { /* noop */ }
  }, []);

  /* ── Build per-area update payload ── */
  const areaPayload = useCallback((a: AreaState) => ({
    id: a.id,
    azimuth: a.azimuth,
    mountType: a.mountType,
    panelW: a.panelW,
    panelH: a.panelH,
    powerWp: a.powerWp,
    maxPanels: a.maxPanels,
    panelProjDepth: solarResults.panelProjectedDepth,
    rowSpacing: solarResults.rowSpacing,
  }), [solarResults]);

  /* ── On iframe load ── */
  const onIframeLoad = useCallback(() => {
    setIframeReady(true);
    setTimeout(() => post({ type: "invalidateSize" }), 100);
  }, [post]);

  /* ── When tab becomes active ── */
  useEffect(() => {
    if (!isActive || !iframeReady) return;
    post({ type: "invalidateSize" });
    const t1 = setTimeout(() => post({ type: "invalidateSize" }), 300);
    const t2 = setTimeout(() => post({ type: "invalidateSize" }), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isActive, iframeReady, post]);

  /* ── Fly to location when it changes ── */
  useEffect(() => {
    if (!iframeReady) return;
    const lat = solarParams.latitude, lng = solarParams.longitude;
    if (!lat || !lng) return;
    const key = `${lat},${lng}`;
    if (key === prevLocRef.current) return;
    prevLocRef.current = key;
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    post({ type: "flyTo", lat: latN, lng: lngN, zoom: 18, name: solarParams.locationName || undefined });
  }, [iframeReady, solarParams.latitude, solarParams.longitude, solarParams.locationName, post]);

  /* ── Re-sync rowSpacing/panelProjDepth on solarResults change ── */
  useEffect(() => {
    if (!iframeReady) return;
    areas.forEach(a => post({ type: "updateArea", ...areaPayload(a) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, solarResults.rowSpacing, solarResults.panelProjectedDepth]);

  /* ── Layer visibility ── */
  useEffect(() => {
    if (!iframeReady) return;
    post({ type: "setLayer", name: "panels", visible: layerPanels });
  }, [iframeReady, layerPanels, post]);

  /* ── Receive messages from iframe ── */
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      let data: Record<string, unknown>;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; }
      catch { return; }

      switch (data.type) {
        case "areaAdded": {
          const aIdx = areas.length; // capture before setState
          const newArea = makeDefaultArea(
            data.id as string,
            aIdx,
            data.color as string,
            parseInt(panel.azimuth) || 180,
            solarParams.mountType || "triangulos",
            parseFloat(panel.panelWidth) || 1.13,
            parseFloat(panel.panelHeight) || 2.28,
            parseFloat(panel.panelPower) || 400,
            solarResults.panelProjectedDepth,
            solarResults.rowSpacing,
          );
          setAreas(prev => {
            const updated = [...prev, { ...newArea, name: `Telhado ${prev.length + 1}` }];
            return updated;
          });
          setActiveAreaId(data.id as string);
          setExpandedAreaId(data.id as string);
          // Push current settings to iframe
          setTimeout(() => post({
            type: "updateArea", id: data.id,
            azimuth: parseInt(panel.azimuth) || 180,
            mountType: solarParams.mountType || "triangulos",
            panelW: parseFloat(panel.panelWidth) || 1.13,
            panelH: parseFloat(panel.panelHeight) || 2.28,
            powerWp: parseFloat(panel.panelPower) || 400,
            maxPanels: 0,
            panelProjDepth: solarResults.panelProjectedDepth,
            rowSpacing: solarResults.rowSpacing,
          }), 50);
          break;
        }
        case "areaSelected":
          setActiveAreaId(data.id as string);
          setExpandedAreaId(data.id as string);
          break;
        case "areaUpdated":
          setAreas(prev => prev.map(a => a.id === data.id ? {
            ...a,
            panelCount: data.panelCount as number ?? 0,
            totalKwp: data.totalKwp as number ?? 0,
            roofArea: data.roofArea as number ?? 0,
            orientationLabel: data.orientationLabel as string ?? "",
          } : a));
          // Update azimuth from map if it was returned
          if (typeof data.azimuth === "number") {
            setAreas(prev => prev.map(a => a.id === data.id ? { ...a, azimuth: data.azimuth as number } : a));
          }
          break;
        case "areaDeleted":
          setAreas(prev => prev.filter(a => a.id !== data.id));
          setActiveAreaId(prev => prev === data.id ? null : prev);
          break;
        case "summaryUpdated":
          setTotalPanels(data.totalPanels as number ?? 0);
          setTotalKwp(data.totalKwp as number ?? 0);
          setMapData(prev => ({
            ...(prev ?? {}),
            panelCount: data.totalPanels as number,
            totalKwp: data.totalKwp as number,
          }));
          break;
        case "stringsUpdated":
          setAreas(prev => prev.map(a =>
            a.id === data.areaId ? { ...a, strings: (data.strings as StringState[]) ?? [] } : a
          ));
          break;
        case "areaAzimuthChanged":
          setAreas(prev => prev.map(a =>
            a.id === data.id ? { ...a, azimuth: data.azimuth as number } : a
          ));
          if (typeof data.azimuth === "number") {
            setPanel(p => ({ ...p, azimuth: String(data.azimuth) }));
          }
          break;
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas.length, panel, solarParams.mountType, solarResults, post, setMapData, setPanel]);

  /* ── Update an area's settings in React + post to map ── */
  const updateArea = useCallback((id: string, patch: Partial<AreaState>) => {
    setAreas(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...patch } : a);
      const updated = next.find(a => a.id === id);
      if (updated) post({ type: "updateArea", ...areaPayload(updated), ...patch });
      return next;
    });
  }, [areaPayload, post]);

  /* ── Resizable divider ── */
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX, startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(220, Math.min(460, startW + ev.clientX - startX)));
    const onUp = () => {
      setIsDragging(false);
      post({ type: "invalidateSize" });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, post]);

  /* ── Fullscreen ── */
  const toggleFullscreen = () => {
    document.fullscreenElement
      ? document.exitFullscreen?.()
      : containerRef.current?.requestFullscreen?.();
  };
  useEffect(() => {
    const h = () => { setIsFullscreen(!!document.fullscreenElement); setTimeout(() => post({ type: "invalidateSize" }), 150); };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [post]);

  const mapUrl = `${import.meta.env.BASE_URL}map.html`.replace("//", "/");

  return (
    <div ref={containerRef} className="flex overflow-hidden bg-[#0D2B45]" style={{ height: "calc(100vh - 112px)" }}>

      {/* ── Sidebar ── */}
      <aside className="flex flex-col bg-white border-r border-slate-200 shadow-xl shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>

        {/* Header */}
        <div className="px-4 py-3 border-b bg-[#0D2B45] shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Editor FV</h2>
              {solarParams.locationName && (
                <p className="text-[10px] text-blue-300 flex items-center gap-1 mt-0.5 truncate">
                  <Navigation size={9} className="shrink-0" /> {solarParams.locationName}
                </p>
              )}
            </div>
            <button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-white/10 text-white/70 transition-colors shrink-0">
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── SECTION: Telhados ── */}
          <div className="border-b">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
              <span className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={11} className="text-[#1E88E5]" /> Telhados ({areas.length})
              </span>
              <button
                onClick={() => post({ type: "startDraw" })}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded bg-[#0D2B45] text-white hover:bg-[#1565C0] transition-colors"
                title="Desenhar novo telhado"
              >
                <Plus size={10} /> Novo
              </button>
            </div>

            {areas.length === 0 && (
              <div className="px-4 py-5 text-center">
                <div className="text-2xl mb-2">🏠</div>
                <p className="text-xs text-muted-foreground">Clique em <strong>Novo</strong> ou no botão <strong>Área</strong> no mapa para desenhar o primeiro telhado.</p>
              </div>
            )}

            <div className="divide-y">
              {areas.map((area, idx) => {
                const isSelected = area.id === activeAreaId;
                const isExpanded = area.id === expandedAreaId;
                return (
                  <div key={area.id} className={cn("transition-colors", isSelected && "bg-blue-50/50")}>
                    {/* Area header row */}
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50"
                      onClick={() => { post({ type: "selectArea", id: area.id }); setExpandedAreaId(isExpanded ? null : area.id); }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: area.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#0D2B45] truncate">{area.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {area.panelCount > 0 ? `${area.panelCount} painéis · ${area.totalKwp.toFixed(2)} kWp` : "0 painéis"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] text-slate-400">{area.azimuth}°</span>
                        {isExpanded ? <ChevronDown size={11} className="text-slate-400" /> : <ChevronRight size={11} className="text-slate-400" />}
                        <button
                          onClick={e => { e.stopPropagation(); post({ type: "deleteArea", id: area.id }); setAreas(p => p.filter(a => a.id !== area.id)); }}
                          className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                          title="Apagar telhado"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded area settings */}
                    {isExpanded && (
                      <div className="px-3 pb-3 bg-slate-50/80 border-t border-slate-100 space-y-2.5">

                        {/* Name edit */}
                        <div className="pt-2">
                          <Label className="text-[10px] text-muted-foreground">Nome</Label>
                          <Input
                            value={area.name}
                            onChange={e => setAreas(prev => prev.map(a => a.id === area.id ? { ...a, name: e.target.value } : a))}
                            className="h-7 text-xs mt-0.5"
                          />
                        </div>

                        {/* Azimuth + mount type */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Azimute (°)</Label>
                            <Input type="number"
                              value={area.azimuth}
                              onChange={e => updateArea(area.id, { azimuth: parseInt(e.target.value) || 180 })}
                              className="h-7 text-xs mt-0.5" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Estrutura</Label>
                            <div className="flex mt-0.5 rounded border border-slate-200 overflow-hidden text-[9px] font-semibold">
                              {(["triangulos", "coplanar"] as const).map(mt => (
                                <button key={mt} type="button" onClick={() => updateArea(area.id, { mountType: mt })}
                                  className={cn("flex-1 py-1 text-center border-r last:border-r-0 transition-colors",
                                    area.mountType === mt ? "bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                                  {mt === "triangulos" ? "▲" : "▬"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Panel dims */}
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { label: "L (m)", key: "panelW" as const, step: "0.01" },
                            { label: "A (m)", key: "panelH" as const, step: "0.01" },
                            { label: "Wp",    key: "powerWp" as const, step: "1" },
                          ].map(f => (
                            <div key={f.key}>
                              <Label className="text-[9px] text-muted-foreground">{f.label}</Label>
                              <Input type="number" step={f.step}
                                value={area[f.key]}
                                onChange={e => updateArea(area.id, { [f.key]: parseFloat(e.target.value) || 0 })}
                                className="h-7 text-xs mt-0.5 px-1.5" />
                            </div>
                          ))}
                        </div>

                        {/* Max panels */}
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Máx painéis (0 = ∞)</Label>
                          <Input type="number" min="0"
                            value={area.maxPanels}
                            onChange={e => updateArea(area.id, { maxPanels: parseInt(e.target.value) || 0 })}
                            className="h-7 text-xs mt-0.5" />
                        </div>

                        {/* Area result chip */}
                        {area.panelCount > 0 && (
                          <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: area.color + "18", border: `1px solid ${area.color}40` }}>
                            <span className="text-base font-bold" style={{ color: area.color }}>{area.panelCount}</span>
                            <div className="text-[10px]">
                              <div className="font-semibold text-[#0D2B45]">{area.totalKwp.toFixed(2)} kWp</div>
                              <div className="text-muted-foreground truncate">{area.orientationLabel}</div>
                            </div>
                          </div>
                        )}

                        {/* ── Strings for this area ── */}
                        <div className="border-t border-slate-200 pt-2 space-y-1.5">
                          <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1">
                            <Zap size={10} className="text-[#F5A623]" /> Strings
                          </Label>
                          <div className="flex items-center gap-1.5">
                            <Input type="number" min="1" max="20"
                              value={stringCount}
                              onChange={e => setStringCount(parseInt(e.target.value) || 1)}
                              className="h-7 text-xs w-16 shrink-0" />
                            <button
                              onClick={() => post({ type: "autoString", areaId: area.id, count: stringCount })}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-[#0D2B45] text-white text-[10px] font-bold hover:bg-[#1565C0] transition-colors"
                            >
                              <Zap size={9} /> Auto String
                            </button>
                            <button
                              onClick={() => post({ type: "clearStrings", areaId: area.id })}
                              className="p-1.5 rounded border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                              title="Limpar strings"
                            >
                              <RotateCcw size={10} />
                            </button>
                          </div>

                          {area.strings.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {area.strings.map((s, si) => (
                                <div key={s.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                                  style={{ backgroundColor: s.color }}>
                                  S{si + 1} · {s.panelCount}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SECTION: Layers ── */}
          <div className="border-b">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
              <span className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Camadas</span>
            </div>
            <div className="px-4 py-2 space-y-1">
              <button
                onClick={() => setLayerPanels(p => !p)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
                  layerPanels ? "border-[#1E88E5]/30 bg-[#EBF5FF] text-[#0D2B45]" : "border-slate-200 bg-white text-slate-400"
                )}
              >
                {layerPanels ? <Eye size={12} className="text-[#1E88E5]" /> : <EyeOff size={12} />}
                Painéis
              </button>
            </div>
          </div>

          {/* ── SECTION: Totals ── */}
          {areas.length > 0 && (
            <div className="px-4 py-4 space-y-2">
              <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Resumo total</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0D2B45] rounded-xl px-3 py-3 text-center">
                  <div className="text-2xl font-extrabold text-white">{totalPanels}</div>
                  <div className="text-[9px] text-blue-300 mt-0.5 font-semibold uppercase tracking-wider">Painéis</div>
                </div>
                <div className="bg-[#F5A623] rounded-xl px-3 py-3 text-center">
                  <div className="text-xl font-extrabold text-[#0D2B45]">{totalKwp.toFixed(1)}</div>
                  <div className="text-[9px] text-[#7C4D00] mt-0.5 font-semibold uppercase tracking-wider">kWp</div>
                </div>
              </div>
              {areas.length > 1 && (
                <div className="space-y-1 mt-1">
                  {areas.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                      <span className="text-muted-foreground flex-1 truncate">{a.name}</span>
                      <span className="font-semibold text-[#0D2B45] shrink-0">{a.panelCount} · {a.totalKwp.toFixed(1)} kWp</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Location pin ── */}
          {solarParams.latitude && solarParams.longitude && (
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => post({ type: "flyTo", lat: parseFloat(solarParams.latitude), lng: parseFloat(solarParams.longitude), zoom: 18, name: solarParams.locationName })}
                className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-left hover:bg-slate-100 transition-colors"
              >
                <Navigation size={12} className="text-[#1E88E5] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-[#0D2B45] truncate">
                    {solarParams.locationName || "Centrar no projeto"}
                  </div>
                  <div className="text-[9px] text-muted-foreground">{solarParams.latitude}°, {solarParams.longitude}°</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Resizable divider ── */}
      <div
        onMouseDown={onDividerMouseDown}
        className={cn("w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-[#1E88E5]",
          isDragging ? "bg-[#1E88E5]" : "bg-slate-200/40")}
      />

      {/* ── Map iframe ── */}
      <div className="flex-1 relative overflow-hidden min-w-0 bg-[#0D2B45]">
        <iframe
          ref={iframeRef}
          src={mapUrl}
          onLoad={onIframeLoad}
          className="absolute inset-0 w-full h-full border-none block"
          title="Mapa Satélite"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
