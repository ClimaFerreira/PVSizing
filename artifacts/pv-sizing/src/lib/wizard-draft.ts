const DRAFT_KEY_PREFIX   = "solardim:wizard-draft:v1";
const SESSION_KEY_PREFIX = "solardim:session-id";

function draftKey(companyId: number | null | undefined): string {
  return companyId == null ? `${DRAFT_KEY_PREFIX}:anon` : `${DRAFT_KEY_PREFIX}:c${companyId}`;
}
function sessionKey(companyId: number | null | undefined): string {
  return companyId == null ? `${SESSION_KEY_PREFIX}:anon` : `${SESSION_KEY_PREFIX}:c${companyId}`;
}

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
  batteryUnits?: Record<string, unknown>[];
  tipoProjeto?: string;
  investimentoManual?: number | null;
  panelRefId?: number | null;
}

// ── Session ID (per-tenant) ──────────────────────────────────────────────────
export function getOrCreateSessionId(companyId: number | null | undefined): string {
  try {
    const key = sessionKey(companyId);
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// ── localStorage per-project cache ──────────────────────────────────────────
function projectDraftKey(companyId: number | null | undefined, projectId: number): string {
  const cid = companyId ?? "anon";
  return `${DRAFT_KEY_PREFIX}:c${cid}:p${projectId}`;
}

export function saveDraftForProject(
  companyId: number | null | undefined,
  projectId: number,
  data: Omit<WizardDraftData, "version" | "savedAt">,
): void {
  try {
    const draft: WizardDraftData = { ...data, version: 1, savedAt: new Date().toISOString() };
    localStorage.setItem(projectDraftKey(companyId, projectId), JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function loadDraftForProject(
  companyId: number | null | undefined,
  projectId: number,
): WizardDraftData | null {
  try {
    const raw = localStorage.getItem(projectDraftKey(companyId, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraftData;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraftForProject(
  companyId: number | null | undefined,
  projectId: number,
): void {
  try {
    localStorage.removeItem(projectDraftKey(companyId, projectId));
  } catch {
    // ignore
  }
}

// ── Legacy localStorage (per-tenant; kept for backwards compat) ─────────────
export function saveDraft(
  companyId: number | null | undefined,
  data: Omit<WizardDraftData, "version" | "savedAt">,
): void {
  try {
    const draft: WizardDraftData = { ...data, version: 1, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey(companyId), JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function loadDraft(companyId: number | null | undefined): WizardDraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraftData;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(companyId: number | null | undefined): void {
  try {
    localStorage.removeItem(draftKey(companyId));
  } catch {
    // ignore
  }
}

// ── Remote DB sync ────────────────────────────────────────────────────────────
export async function syncDraftToDb(draft: WizardDraftData, sessionId: string): Promise<void> {
  try {
    await fetch("/api/wizard/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, step: draft.step, data: draft }),
    });
  } catch {
    // ignore
  }
}

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

export async function clearDraftFromDb(sessionId: string): Promise<void> {
  try {
    await fetch(`/api/wizard/draft?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
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
