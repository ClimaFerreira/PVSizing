const DRAFT_KEY = "solardim:wizard-draft:v1";

export interface WizardDraftData {
  version: 1;
  savedAt: string;
  step: number;
  consumoData: Record<string, unknown>;
  locData: Record<string, unknown> | null;
  sizing: Record<string, unknown> | null;
  selectedCenarioTipo: string;
  manual: Record<string, unknown> | null;
  showManualAdjust: boolean;
  equipFormValues: { panelId?: number; inverterId?: number; batteryId?: number };
}

export function saveDraft(data: Omit<WizardDraftData, "version" | "savedAt">): void {
  try {
    const draft: WizardDraftData = { ...data, version: 1, savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}

export function loadDraft(): WizardDraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraftData;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function draftAge(draft: WizardDraftData): string {
  const ms = Date.now() - new Date(draft.savedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)} dia(s)`;
}
