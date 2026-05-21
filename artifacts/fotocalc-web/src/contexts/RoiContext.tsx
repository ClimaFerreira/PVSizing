import React, { createContext, useContext, useState } from "react";
import { usePanelCtx } from "@/contexts/PanelContext";

export interface RoiParams {
  investmentCost: string;
  panelPower: string;
  numPanels: string;
  inclination: string;
  inverterPower: string;
  annualConsumption: string;
  batteryCapacity: string;
  hasBattery: boolean;
  electricityPrice: string;
  feedInTariff: string;
  orientation: string;
}

export interface RoiResult {
  totalPowerKwp: number;
  annualProductionKwh: number;
  monthlyKwh: number[];
  annualSavingsEur: number;
  selfKwh: number;
  selfRate: number;
  exportKwh: number;
  consumptionCoveredPct: number | null;
  paybackYears: number;
  netAfter20: number;
  netAfter25: number;
  cumulativeNet: number[];
}

interface RoiContextType {
  params: RoiParams;
  setParams: React.Dispatch<React.SetStateAction<RoiParams>>;
  results: RoiResult | null;
  calculate: () => void;
}

const ORIENTATIONS = [
  { label: "S", factor: 1.00 },
  { label: "SW", factor: 0.95 },
  { label: "SE", factor: 0.95 },
  { label: "W", factor: 0.82 },
  { label: "E", factor: 0.82 },
  { label: "NW", factor: 0.68 },
  { label: "NE", factor: 0.68 },
  { label: "N", factor: 0.55 },
];

function getInclinationFactor(deg: number): number {
  const table = [
    [0, 0.78], [10, 0.88], [20, 0.95], [30, 0.99], [35, 1.00],
    [40, 0.99], [45, 0.97], [60, 0.89], [75, 0.78], [90, 0.65],
  ];
  if (deg <= 0) return 0.78;
  if (deg >= 90) return 0.65;
  for (let i = 0; i < table.length - 1; i++) {
    const [d0, f0] = table[i];
    const [d1, f1] = table[i + 1];
    if (deg >= d0 && deg <= d1) return f0 + (f1 - f0) * ((deg - d0) / (d1 - d0));
  }
  return 1.0;
}

function calcSelfConsumption(productionKwh: number, consumptionKwh: number, hasBattery: boolean, batteryCapacityKwh: number) {
  if (productionKwh <= 0) return { selfKwh: 0, selfRate: 0 };
  if (consumptionKwh <= 0) {
    const r = hasBattery
      ? Math.min(0.85, 0.30 + (batteryCapacityKwh * 365 * 0.9) / Math.max(1, productionKwh))
      : 0.30;
    return { selfKwh: productionKwh * r, selfRate: r };
  }
  const directKwh = Math.min(productionKwh * 0.42, consumptionKwh);
  if (!hasBattery || batteryCapacityKwh <= 0) return { selfKwh: directKwh, selfRate: directKwh / productionKwh };
  const batteryThroughput = batteryCapacityKwh * 365 * 0.90;
  const excess = Math.max(0, productionKwh - directKwh);
  const unmet = Math.max(0, consumptionKwh - directKwh);
  const battKwh = Math.min(batteryThroughput, excess, unmet);
  const selfKwh = directKwh + battKwh;
  return { selfKwh, selfRate: Math.min(1, selfKwh / productionKwh) };
}

const MONTHLY_FACTORS = [0.050, 0.063, 0.087, 0.095, 0.109, 0.114, 0.119, 0.110, 0.091, 0.068, 0.050, 0.044];

function computeRoi(params: RoiParams): RoiResult | null {
  const cost = parseFloat(params.investmentCost);
  const panelW = parseFloat(params.panelPower);
  const n = parseFloat(params.numPanels);
  const inclDeg = parseFloat(params.inclination) || 30;
  const price = parseFloat(params.electricityPrice) || 0.22;
  const feedIn = parseFloat(params.feedInTariff) || 0.05;
  const consKwh = parseFloat(params.annualConsumption) || 0;
  const battCap = parseFloat(params.batteryCapacity) || 0;

  if (!cost || !panelW || !n || cost <= 0 || panelW <= 0 || n <= 0) return null;

  const orientFactor = ORIENTATIONS.find(o => o.label === params.orientation)?.factor ?? 1.0;
  const inclFactor = getInclinationFactor(inclDeg);

  const totalPowerKwp = (panelW * n) / 1000;
  const annualProductionKwh = totalPowerKwp * 1550 * orientFactor * inclFactor;

  const { selfKwh, selfRate } = calcSelfConsumption(annualProductionKwh, consKwh, params.hasBattery, battCap);
  const exportKwh = Math.max(0, annualProductionKwh - selfKwh);

  const annualSavingsEur = (selfKwh * price) + (exportKwh * feedIn);
  const monthlyKwh = MONTHLY_FACTORS.map(f => annualProductionKwh * f);

  const paybackYears = annualSavingsEur > 0 ? cost / annualSavingsEur : Infinity;
  const consumptionCoveredPct = consKwh > 0 ? Math.min(100, (selfKwh / consKwh) * 100) : null;

  const cumulativeNet: number[] = [];
  let cum = 0;
  for (let y = 1; y <= 25; y++) {
    cum += annualSavingsEur * Math.pow(0.995, y - 1) * Math.pow(1.03, y - 1);
    cumulativeNet.push(cum - cost);
  }

  return {
    totalPowerKwp,
    annualProductionKwh,
    monthlyKwh,
    annualSavingsEur,
    selfKwh,
    selfRate,
    exportKwh,
    consumptionCoveredPct,
    paybackYears,
    netAfter20: cumulativeNet[19],
    netAfter25: cumulativeNet[24],
    cumulativeNet,
  };
}

const RoiContext = createContext<RoiContextType | undefined>(undefined);

export function RoiProvider({ children }: { children: React.ReactNode }) {
  const { panel, setPanel } = usePanelCtx();
  const [localParams, setLocalParams] = useState({
    investmentCost: "",
    numPanels: "10",
    inverterPower: "",
    annualConsumption: "",
    batteryCapacity: "",
    hasBattery: false,
    electricityPrice: "0.22",
    feedInTariff: "0.05",
  });
  const [results, setResults] = useState<RoiResult | null>(null);

  const params: RoiParams = {
    panelPower: panel.panelPower,
    inclination: panel.inclination,
    orientation: panel.orientation,
    ...localParams,
  };

  const setParams: React.Dispatch<React.SetStateAction<RoiParams>> = (updater) => {
    const current: RoiParams = {
      panelPower: panel.panelPower,
      inclination: panel.inclination,
      orientation: panel.orientation,
      ...localParams,
    };
    const next = typeof updater === "function" ? updater(current) : updater;
    setPanel(p => ({
      ...p,
      panelPower: next.panelPower,
      inclination: next.inclination,
      orientation: next.orientation,
    }));
    setLocalParams({
      investmentCost: next.investmentCost,
      numPanels: next.numPanels,
      inverterPower: next.inverterPower,
      annualConsumption: next.annualConsumption,
      batteryCapacity: next.batteryCapacity,
      hasBattery: next.hasBattery,
      electricityPrice: next.electricityPrice,
      feedInTariff: next.feedInTariff,
    });
  };

  const calculate = () => setResults(computeRoi(params));

  return (
    <RoiContext.Provider value={{ params, setParams, results, calculate }}>
      {children}
    </RoiContext.Provider>
  );
}

export function useRoi() {
  const context = useContext(RoiContext);
  if (context === undefined) {
    throw new Error("useRoi must be used within a RoiProvider");
  }
  return context;
}
