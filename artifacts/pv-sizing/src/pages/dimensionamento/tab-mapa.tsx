import { useCallback, useEffect, useRef, useState } from "react";
import { useMapa } from "@/contexts/MapaContext";
import { usePanelCtx } from "@/contexts/PanelContext";
import { useSolar } from "@/contexts/SolarContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Maximize2,
  Minimize2,
  MousePointer2,
  Grid2x2,
  PencilLine,
  Trash2,
  RotateCcw,
  Info,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PanelMode = "auto" | "calculator" | "manual";

interface TabMapaProps {
  isActive?: boolean;
}

export default function TabMapa({ isActive = false }: TabMapaProps) {
  const { mapData, setMapData } = useMapa();
  const { panel, setPanel } = usePanelCtx();
  const { params: solarParams, results: solarResults } = useSolar();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [panelMode, setPanelMode] = useState<PanelMode>("auto");
  const [manualPanels, setManualPanels] = useState("20");
  const [sidebarWidth, setSidebarWidth] = useState(272);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const prevLocRef = useRef("");

  const calcPanels = (parseInt(solarParams.rows) || 0) * (parseInt(solarParams.cols) || 0);

  const getMaxPanels = useCallback((): number => {
    if (panelMode === "auto") return 0;
    if (panelMode === "calculator") return calcPanels;
    return parseInt(manualPanels) || 0;
  }, [panelMode, calcPanels, manualPanels]);

  const buildConfig = useCallback(() => ({
    panelW: parseFloat(panel.panelWidth) || 1.13,
    panelH: parseFloat(panel.panelHeight) || 2.28,
    powerWp: parseFloat(panel.panelPower) || 400,
    azimuth: parseInt(panel.azimuth) || 180,
    maxPanels: getMaxPanels(),
    mountType: solarParams.mountType || "triangulos",
    panelProjDepth: solarResults.panelProjectedDepth,
    rowSpacing: solarResults.rowSpacing,
  }), [panel, solarParams.mountType, solarResults, getMaxPanels]);

  const post = useCallback((msg: object) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    } catch { /* noop */ }
  }, []);

  /* ── When iframe loads, mark ready and send initial config ── */
  const onIframeLoad = useCallback(() => {
    setIframeReady(true);
    // Send config immediately after load
    setTimeout(() => {
      post({ type: "setConfig", ...buildConfig() });
      post({ type: "invalidateSize" });
    }, 100);
  }, [post, buildConfig]);

  /* ── When tab becomes active: invalidate map + re-sync config ── */
  useEffect(() => {
    if (!isActive || !iframeReady) return;
    post({ type: "invalidateSize" });
    post({ type: "setConfig", ...buildConfig() });
    const t1 = setTimeout(() => post({ type: "invalidateSize" }), 250);
    const t2 = setTimeout(() => post({ type: "invalidateSize" }), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isActive, iframeReady, post, buildConfig]);

  /* ── Fly to location when it changes (only when tab active) ── */
  useEffect(() => {
    if (!iframeReady) return;
    const lat = solarParams.latitude;
    const lng = solarParams.longitude;
    if (!lat || !lng) return;
    const locKey = `${lat},${lng}`;
    if (locKey === prevLocRef.current) return;
    prevLocRef.current = locKey;
    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    post({
      type: "flyTo",
      lat: latN,
      lng: lngN,
      zoom: 18,
      name: solarParams.locationName || `${lat}, ${lng}`,
    });
  }, [iframeReady, solarParams.latitude, solarParams.longitude, solarParams.locationName, post]);

  /* ── Sync panel config whenever it changes ── */
  useEffect(() => {
    if (!iframeReady) return;
    post({ type: "setConfig", ...buildConfig() });
  }, [iframeReady, buildConfig, post]);

  /* ── Receive messages from iframe ── */
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      let data: Record<string, unknown>;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; }
      catch { return; }

      if (data.type === "roofMeasured") {
        setMapData(prev => {
          const next = { ...(prev ?? {}), ...data };
          if (prev?.mapImageDataUrl && !data.mapImageDataUrl) next.mapImageDataUrl = prev.mapImageDataUrl;
          return next;
        });
        if (typeof data.azimuth === "number") {
          setPanel(prev => {
            const az = String(data.azimuth);
            return prev.azimuth === az ? prev : { ...prev, azimuth: az };
          });
        }
      } else if (data.type === "roofCleared") {
        setMapData(null);
      } else if (data.type === "mapCapture") {
        setMapData(prev => prev ? { ...prev, mapImageDataUrl: data.imageDataUrl as string } : null);
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [setMapData, setPanel]);

  /* ── Resizable divider ── */
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) =>
      setSidebarWidth(Math.max(200, Math.min(440, startW + ev.clientX - startX)));
    const onUp = () => {
      setIsDragging(false);
      post({ type: "invalidateSize" });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth, post]);

  const handlePanelChange = (key: keyof typeof panel, val: string) =>
    setPanel(prev => ({ ...prev, [key]: val }));

  /* ── Fullscreen ── */
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    document.fullscreenElement ? document.exitFullscreen?.() : el.requestFullscreen?.();
  };
  useEffect(() => {
    const h = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => post({ type: "invalidateSize" }), 150);
    };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [post]);

  const isCoplanar = solarParams.mountType === "coplanar";

  // The map URL — served as a static file from Vite's public/ folder
  const mapUrl = `${import.meta.env.BASE_URL}map.html`.replace("//", "/");

  return (
    <div
      ref={containerRef}
      className="flex overflow-hidden bg-[#0D2B45]"
      style={{ height: "calc(100vh - 112px)" }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="flex flex-col bg-white border-r border-slate-200 shadow-xl shrink-0 overflow-hidden"
        style={{ width: sidebarWidth }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b bg-slate-50 shrink-0 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#0D2B45] tracking-tight">Mapa Satélite</h2>
            {solarParams.locationName && (
              <p className="text-[10px] text-[#1E88E5] flex items-center gap-1 mt-0.5 truncate">
                <Navigation size={9} className="shrink-0" /> {solarParams.locationName}
              </p>
            )}
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500 transition-colors shrink-0 ml-2"
            title="Ecrã inteiro"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

          {/* Location pin */}
          {solarParams.latitude && solarParams.longitude && (
            <button
              type="button"
              className="w-full flex items-center gap-2 bg-[#EBF5FF] border border-[#1E88E5]/30 rounded-lg px-3 py-2 text-left hover:bg-[#DBEAFE] transition-colors"
              onClick={() => post({
                type: "flyTo",
                lat: parseFloat(solarParams.latitude),
                lng: parseFloat(solarParams.longitude),
                zoom: 18,
                name: solarParams.locationName,
              })}
              title="Centrar mapa nesta localização"
            >
              <Navigation size={13} className="text-[#1E88E5] shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[#0D2B45] truncate">
                  {solarParams.locationName || "Localização do projeto"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {solarParams.latitude}°, {solarParams.longitude}°
                </div>
              </div>
            </button>
          )}

          {/* Mount badge */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg border px-3 py-2 shrink-0">
            <span>{isCoplanar ? "▬" : "▲"}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#0D2B45]">
                {isCoplanar ? "Telhado Coplanar" : "Estrutura Triângulos"}
              </div>
              {!isCoplanar && (
                <div className="text-[10px] text-muted-foreground truncate">
                  d = {solarResults.rowSpacing.toFixed(3)} m · gap = {solarResults.gap.toFixed(3)} m
                </div>
              )}
            </div>
            <span className="text-[9px] text-muted-foreground italic shrink-0">Espaçamento</span>
          </div>

          {/* Modes guide */}
          <div className="bg-[#F8FAFC] border rounded-lg px-3 py-2.5 space-y-1.5">
            <div className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider flex items-center gap-1 mb-1">
              <Info size={10} className="text-[#1E88E5]" /> Modos no mapa
            </div>
            {[
              { icon: <Grid2x2 size={10} />, name: "Auto", desc: "Preenche a área" },
              { icon: <PencilLine size={10} />, name: "Manual", desc: "Clique para colocar" },
              { icon: <MousePointer2 size={10} />, name: "Seleção", desc: "Mover / apagar" },
            ].map(m => (
              <div key={m.name} className="flex items-start gap-1.5">
                <span className="text-[#1E88E5] mt-0.5 shrink-0">{m.icon}</span>
                <span className="text-[10px] text-[#0D2B45]"><strong>{m.name}:</strong> {m.desc}</span>
              </div>
            ))}
          </div>

          {/* Panel dimensions */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Painel</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Largura (m)</Label>
                <Input type="number" step="0.01"
                  value={panel.panelWidth}
                  onChange={e => handlePanelChange("panelWidth", e.target.value)}
                  className="h-8 text-sm mt-0.5" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Altura (m)</Label>
                <Input type="number" step="0.01"
                  value={panel.panelHeight}
                  onChange={e => handlePanelChange("panelHeight", e.target.value)}
                  className="h-8 text-sm mt-0.5" />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] text-muted-foreground">Potência (Wp)</Label>
                <Input type="number"
                  value={panel.panelPower}
                  onChange={e => handlePanelChange("panelPower", e.target.value)}
                  className="h-8 text-sm mt-0.5" />
              </div>
            </div>
          </div>

          {/* Auto-fill limit */}
          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Limite Auto</Label>
            <div className="grid grid-cols-3 rounded-lg border border-slate-200 overflow-hidden text-[10px] font-semibold">
              {(["auto", "calculator", "manual"] as PanelMode[]).map(m => (
                <button key={m} type="button" onClick={() => setPanelMode(m)}
                  className={cn(
                    "py-2 text-center border-r last:border-r-0 border-slate-200 transition-colors",
                    panelMode === m ? "bg-[#0D2B45] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  )}>
                  {m === "auto" ? "∞" : m === "calculator" ? "Calc." : "Manual"}
                </button>
              ))}
            </div>
            {panelMode === "calculator" && (
              <div className="text-xs bg-[#EBF5FF] border border-[#1E88E5]/30 rounded px-2 py-1.5">
                <span className="font-bold text-[#1E88E5]">{calcPanels}</span>
                <span className="text-muted-foreground ml-1">({solarParams.rows}×{solarParams.cols})</span>
              </div>
            )}
            {panelMode === "manual" && (
              <Input type="number" min="1" value={manualPanels}
                onChange={e => setManualPanels(e.target.value)}
                className="h-8 text-sm" />
            )}
          </div>

          {/* Azimuth */}
          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">
              Azimute (Sul = 180°)
            </Label>
            <Input type="number"
              value={panel.azimuth}
              onChange={e => handlePanelChange("azimuth", e.target.value)}
              className="h-8 text-sm" />
          </div>

          {/* Results */}
          {mapData && (
            <div className="border-t pt-3 space-y-2">
              <Label className="text-[10px] font-bold text-[#0D2B45] uppercase tracking-wider">Resultados</Label>
              <Card className="bg-[#F0F6FB] border-[#1E88E5]/20">
                <CardContent className="p-3 space-y-1.5">
                  {([
                    { label: "Painéis",  value: mapData.panelCount,                      cls: "text-lg font-bold text-[#0D2B45]" },
                    { label: "Potência", value: `${mapData.totalKwp?.toFixed?.(2)} kWp`, cls: "text-base font-bold text-[#1E88E5]" },
                    { label: "Área",     value: `${mapData.roofArea} m²`,                cls: "text-sm font-semibold text-[#0D2B45]" },
                    { label: "Tipo",     value: mapData.mountType === "coplanar" ? "Coplanar" : "Triângulos", cls: "text-sm font-semibold text-[#0D2B45]" },
                    { label: "Orient.",  value: mapData.orientationLabel,                cls: "text-xs font-semibold text-[#F5A623]" },
                  ] as const).map((row, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">{row.label}</span>
                      <span className={row.cls}>{String(row.value ?? "—")}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Actions */}
          <div className="border-t pt-3 space-y-2">
            <button type="button"
              onClick={() => post({ type: "clearManual" })}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors"
            >
              <Trash2 size={11} /> Limpar Painéis Manuais
            </button>
            <button type="button"
              onClick={() => { post({ type: "invalidateSize" }); post({ type: "setConfig", ...buildConfig() }); }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              <RotateCcw size={11} /> Recarregar Mapa
            </button>
          </div>
        </div>
      </aside>

      {/* ── Resizable divider ── */}
      <div
        onMouseDown={onDividerMouseDown}
        className={cn(
          "w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-[#1E88E5]",
          isDragging ? "bg-[#1E88E5]" : "bg-slate-300/40"
        )}
      />

      {/* ── Map iframe — src="/map.html" (static file, no srcDoc) ── */}
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
