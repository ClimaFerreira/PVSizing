import React, { createContext, useContext, useState } from "react";

export interface MapData {
  roofArea?: number;
  panelCount?: number;
  capacity?: number;
  totalKwp?: number;
  adjKwp?: number;
  azimuth?: number;
  orientationLabel?: string;
  penaltyPct?: number;
  panelW?: number;
  panelH?: number;
  powerWp?: number;
  mountType?: string;
  roofBoundsW?: number;
  roofBoundsH?: number;
  panelSvg?: string;
  mapImageDataUrl?: string;
}

interface MapaContextType {
  mapData: MapData | null;
  setMapData: React.Dispatch<React.SetStateAction<MapData | null>>;
}

const MapaContext = createContext<MapaContextType | undefined>(undefined);

export function MapaProvider({ children }: { children: React.ReactNode }) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  return (
    <MapaContext.Provider value={{ mapData, setMapData }}>
      {children}
    </MapaContext.Provider>
  );
}

export function useMapa() {
  const context = useContext(MapaContext);
  if (context === undefined) throw new Error("useMapa must be used within a MapaProvider");
  return context;
}
