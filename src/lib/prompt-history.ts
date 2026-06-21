export const MAX_PROMPT_HISTORY = 100;

export interface PromptHistoryEntry {
  prompt: string;
  pinned: boolean;
}

function normalizePromptList(value: unknown, limit = MAX_PROMPT_HISTORY) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const prompt = String(item || "").trim();
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    normalized.push(prompt);

    if (normalized.length >= limit) break;
  }

  return normalized;
}

export function normalizePromptHistory(value: unknown) {
  return normalizePromptList(value, MAX_PROMPT_HISTORY);
}

export function normalizePinnedPromptHistory(value: unknown) {
  return normalizePromptList(value, Number.POSITIVE_INFINITY);
}

export function addPromptToHistory(history: unknown, prompt: unknown) {
  return normalizePromptHistory([String(prompt || "").trim(), ...normalizePromptHistory(history)]);
}

export function removePromptFromHistory(history: unknown, prompt: unknown) {
  const target = String(prompt || "").trim();
  return normalizePromptHistory(history).filter((item) => item !== target);
}

export function pinPromptHistory(history: unknown, prompt: unknown) {
  const target = String(prompt || "").trim();
  if (!target) return normalizePinnedPromptHistory(history);
  return normalizePinnedPromptHistory([target, ...normalizePinnedPromptHistory(history)]);
}

export function unpinPromptHistory(history: unknown, prompt: unknown) {
  const target = String(prompt || "").trim();
  return normalizePinnedPromptHistory(history).filter((item) => item !== target);
}

export function mergePromptHistoryForDisplay(pinnedHistory: unknown, history: unknown): PromptHistoryEntry[] {
  const pinned = normalizePinnedPromptHistory(pinnedHistory);
  const pinnedSet = new Set(pinned);
  const recent = normalizePromptHistory(history).filter((item) => !pinnedSet.has(item));

  return [...pinned.map((prompt) => ({ prompt, pinned: true })), ...recent.map((prompt) => ({ prompt, pinned: false }))];
}
