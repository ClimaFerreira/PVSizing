import React, { createContext, useContext, useState } from "react";

export interface PanelParams {
  panelHeight: string;
  panelWidth: string;
  panelPower: string;
  inclination: string;
  azimuth: string;
  orientation: string;
}

interface PanelContextType {
  panel: PanelParams;
  setPanel: React.Dispatch<React.SetStateAction<PanelParams>>;
}

const defaultPanel: PanelParams = {
  panelHeight: "2.28",
  panelWidth: "1.13",
  panelPower: "400",
  inclination: "30",
  azimuth: "180",
  orientation: "S",
};

const PanelContext = createContext<PanelContextType | undefined>(undefined);

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<PanelParams>(defaultPanel);
  return (
    <PanelContext.Provider value={{ panel, setPanel }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanelCtx() {
  const context = useContext(PanelContext);
  if (!context) throw new Error("usePanelCtx must be used within a PanelProvider");
  return context;
}
