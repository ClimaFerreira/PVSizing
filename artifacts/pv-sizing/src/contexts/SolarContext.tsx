import React, { createContext, useContext, useState, useMemo } from "react";
import { usePanelCtx } from "@/contexts/PanelContext";

export interface SolarParams {
  height: string;
  width: string;
  angle: string;
  latitude: string;
  rows: string;
  cols: string;
  panelPower: string;
  mountType: string;
  inverterPower: string;
  inverterPhase: string;
}

export interface SolarResult {
  gap: number;
  rowSpacing: number;
  shadowLength: number;
  declinationAngle: number;
  altitudeAngle: number;
  totalWidth: number;
  totalLength: number;
  panelHeight: number;
  panelWidth: number;
  panelAngle: number;
  panelProjectedDepth: number;
  totalPowerWp: number;
}

interface SolarContextType {
  params: SolarParams;
  setParams: React.Dispatch<React.SetStateAction<SolarParams>>;
  results: SolarResult;
}

const SolarContext = createContext<SolarContextType | undefined>(undefined);

function computeSolar(params: SolarParams): SolarResult {
  const h = parseFloat(params.height) || 1.0;
  const w = parseFloat(params.width) || 1.0;
  const beta = parseFloat(params.angle) || 20;
  const lat = parseFloat(params.latitude) || 38.7;
  const rows = parseInt(params.rows) || 4;
  const cols = parseInt(params.cols) || 5;
  const panelPower = parseFloat(params.panelPower) || 400;

  const toRad = (deg: number) => deg * Math.PI / 180;
  const dec = lat >= 0 ? -23.45 : 23.45;
  const altDeg = 90 - Math.abs(lat) + dec;
  const altRad = toRad(Math.max(altDeg, 1));

  const panelProjectedDepth = h * Math.cos(toRad(beta));
  const panelProjectedHeight = h * Math.sin(toRad(beta));
  const shadowFromTop = panelProjectedHeight / Math.tan(altRad);

  const gap = shadowFromTop;
  const rowSpacing = panelProjectedDepth + gap;
  const shadowLength = panelProjectedDepth + shadowFromTop;
  const totalWidth = cols * w + (cols - 1) * 0.05;
  const totalLength = panelProjectedDepth + (rows - 1) * rowSpacing;
  const totalPowerWp = rows * cols * panelPower;

  return {
    gap,
    rowSpacing,
    shadowLength,
    declinationAngle: dec,
    altitudeAngle: altDeg,
    totalWidth,
    totalLength,
    panelHeight: h,
    panelWidth: w,
    panelAngle: beta,
    panelProjectedDepth,
    totalPowerWp,
  };
}

const DEFAULT_LOCAL = {
  latitude: "38.7",
  rows: "4",
  cols: "5",
  mountType: "triangulos",
  inverterPower: "",
  inverterPhase: "mono",
};

export function SolarProvider({ children }: { children: React.ReactNode }) {
  const { panel, setPanel } = usePanelCtx();
  const [localParams, setLocalParams] = useState(DEFAULT_LOCAL);

  const params: SolarParams = {
    height: panel.panelHeight,
    width: panel.panelWidth,
    angle: panel.inclination,
    panelPower: panel.panelPower,
    ...localParams,
  };

  const setParams: React.Dispatch<React.SetStateAction<SolarParams>> = (updater) => {
    const current: SolarParams = {
      height: panel.panelHeight,
      width: panel.panelWidth,
      angle: panel.inclination,
      panelPower: panel.panelPower,
      ...localParams,
    };
    const next = typeof updater === "function" ? updater(current) : updater;
    setPanel(p => ({
      ...p,
      panelHeight: next.height,
      panelWidth: next.width,
      inclination: next.angle,
      panelPower: next.panelPower,
    }));
    setLocalParams({
      latitude: next.latitude,
      rows: next.rows,
      cols: next.cols,
      mountType: next.mountType,
      inverterPower: next.inverterPower,
      inverterPhase: next.inverterPhase,
    });
  };

  const results = useMemo(
    () => computeSolar(params),
    [panel.panelHeight, panel.panelWidth, panel.inclination, panel.panelPower,
     localParams.latitude, localParams.rows, localParams.cols],
  );

  return (
    <SolarContext.Provider value={{ params, setParams, results }}>
      {children}
    </SolarContext.Provider>
  );
}

export function useSolar() {
  const context = useContext(SolarContext);
  if (context === undefined) throw new Error("useSolar must be used within a SolarProvider");
  return context;
}
