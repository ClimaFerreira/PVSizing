export type SectionId =
  | "cover"
  | "page1Client"
  | "page2Consumption"
  | "page3Profile"
  | "page4Sizing"
  | "page5Equipment"
  | "page6Technical"
  | "page7Savings"
  | "page8Shading"
  | "page9Map"
  | "budget"
  | "notes";

export interface ReportSection {
  id: SectionId;
  label: string;
  enabled: boolean;
}

export const DEFAULT_SECTIONS: ReportSection[] = [
  { id: "cover", label: "Capa", enabled: true },
  { id: "page1Client", label: "1. Cliente e localização", enabled: true },
  { id: "page2Consumption", label: "2. Consumos", enabled: true },
  { id: "page3Profile", label: "3. Perfil", enabled: true },
  { id: "page4Sizing", label: "4. Pré-dimensionamento", enabled: true },
  { id: "page5Equipment", label: "5. Equipamentos", enabled: true },
  { id: "page6Technical", label: "6. Técnica / strings", enabled: true },
  { id: "page7Savings", label: "7. Poupança", enabled: true },
  { id: "page8Shading", label: "8. Sombras", enabled: true },
  { id: "page9Map", label: "9. Mapa", enabled: true },
  { id: "budget", label: "Orçamento", enabled: true },
  { id: "notes", label: "Notas", enabled: true },
];

export const TEMPLATE_SETS: Record<string, SectionId[]> = {
  completo: DEFAULT_SECTIONS.map((section) => section.id),
  tecnico: [
    "cover",
    "page1Client",
    "page4Sizing",
    "page5Equipment",
    "page6Technical",
    "page8Shading",
    "page9Map",
    "notes",
  ],
  comercial: [
    "cover",
    "page1Client",
    "page2Consumption",
    "page4Sizing",
    "page7Savings",
    "budget",
    "notes",
  ],
  mapa: ["cover", "page8Shading", "page9Map", "notes"],
};
