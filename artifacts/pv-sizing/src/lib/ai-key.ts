const AI_KEY_STORAGE = "solardim.anthropicApiKey";

export function getStoredAnthropicKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AI_KEY_STORAGE) ??"";
}

export function setStoredAnthropicKey(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (trimmed) {
    window.localStorage.setItem(AI_KEY_STORAGE, trimmed);
  } else {
    window.localStorage.removeItem(AI_KEY_STORAGE);
  }
}

export function getAiHeaders(): HeadersInit {
  const key = getStoredAnthropicKey();
  return key ?{ "x-anthropic-api-key": key } : {};
}
