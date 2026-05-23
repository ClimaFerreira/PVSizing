export type SectionId =
  | "capa"
  | "cliente"
  | "consumos"
  | "dimensionamento"
  | "equipamentos"
  | "producao"
  | "espacamento"
  | "mapa"
  | "strings"
  | "financeiro"
  | "notas";

export interface ReportSection {
  id: SectionId;
  label: string;
  enabled: boolean;
}

export const DEFAULT_SECTIONS: ReportSection[] = [
  { id: "capa",            label: "Capa",                  enabled: true },
  { id: "cliente",         label: "Dados Cliente",          enabled: true },
  { id: "consumos",        label: "Consumos",               enabled: true },
  { id: "dimensionamento", label: "Dimensionamento FV",     enabled: true },
  { id: "equipamentos",    label: "Equipamentos",           enabled: true },
  { id: "producao",        label: "Produção Anual",         enabled: true },
  { id: "espacamento",     label: "Espaçamento / Sombras",  enabled: true },
  { id: "mapa",            label: "Mapa Satélite",          enabled: true },
  { id: "strings",         label: "Strings / MPPT",         enabled: true },
  { id: "financeiro",      label: "Financeiro & ROI",       enabled: true },
  { id: "notas",           label: "Notas Técnicas",         enabled: true },
];

export const TEMPLATE_SETS: Record<string, SectionId[]> = {
  completo:    ["capa","cliente","consumos","dimensionamento","equipamentos","producao","espacamento","mapa","strings","financeiro","notas"],
  comercial:   ["capa","cliente","dimensionamento","producao","financeiro"],
  tecnico:     ["capa","dimensionamento","equipamentos","espacamento","strings","producao","notas"],
  executivo:   ["capa","cliente","financeiro"],
  simplificado:["capa","dimensionamento","financeiro"],
};
