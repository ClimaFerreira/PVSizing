const DRAFT_KEY    = "solardim:wizard-draft:v1";
const SESSION_KEY  = "solardim:session-id";

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
  numPaineisStep5?: number | null;
  inverterUnits?: Record<string, unknown>[];
  tipoProjeto?: string;
  investimentoManual?: number | null;
}

// ── Session ID ────────────────────────────────────────────────────────────────
/** Returns a stable device/browser identifier, creating one if absent. */
export function getOrCreateSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// ── localStorage ──────────────────────────────────────────────────────────────
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

// ── Remote DB sync ────────────────────────────────────────────────────────────
/** Push current draft to the server (fire-and-forget, never throws). */
export async function syncDraftToDb(draft: WizardDraftData, sessionId: string): Promise<void> {
  try {
    await fetch("/api/wizard/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, step: draft.step, data: draft }),
    });
  } catch {
    // network error — silently ignore
  }
}

/** Load the latest draft from the server for this session. */
export async function loadDraftFromDb(sessionId: string): Promise<WizardDraftData | null> {
  try {
    const res = await fetch(`/api/wizard/draft?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    const remote = (await res.json()) as { step: number; data: WizardDraftData };
    const draft = remote.data;
    if (!draft || draft.version !== 1) return null;
    return draft;
  } catch {
    return null;
  }
}

/** Delete the server-side draft for this session (fire-and-forget). */
export async function clearDraftFromDb(sessionId: string): Promise<void> {
  try {
    await fetch(`/api/wizard/draft?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  } catch {
    // ignore
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
export function draftAge(draft: WizardDraftData): string {
  const ms = Date.now() - new Date(draft.savedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)} dia(s)`;
}
