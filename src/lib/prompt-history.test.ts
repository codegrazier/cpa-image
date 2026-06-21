import { describe, expect, test } from "vitest";

import {
  addPromptToHistory,
  mergePromptHistoryForDisplay,
  normalizePinnedPromptHistory,
  normalizePromptHistory,
  pinPromptHistory,
  removePromptFromHistory,
  unpinPromptHistory,
} from "@/lib/prompt-history";

describe("prompt history", () => {
  test("deduplicates prompt history and keeps the newest 100 prompts", () => {
    const prompts = Array.from({ length: 25 }, (_, index) => `prompt ${index}`);
    const normalized = normalizePromptHistory(["prompt 1", "", "prompt 1", ...prompts]);
    const updated = addPromptToHistory(normalized, "prompt 8");
    const removed = removePromptFromHistory(updated, "prompt 8");

    expect(normalized).toHaveLength(25);
    expect(normalized[0]).toBe("prompt 1");
    expect(normalized[1]).toBe("prompt 0");
    expect(new Set(normalized).size).toBe(25);
    expect(updated[0]).toBe("prompt 8");
    expect(updated).toHaveLength(25);
    expect(removed).not.toContain("prompt 8");
  });

  test("pins prompts above recent history without dropping them", () => {
    const pinned = normalizePinnedPromptHistory(["pinned", "pinned", "older"]);
    const repinned = pinPromptHistory(pinned, "fresh");
    const unpinned = unpinPromptHistory(repinned, "pinned");
    const merged = mergePromptHistoryForDisplay(repinned, ["recent 1", "pinned", "recent 2"]);

    expect(pinned).toEqual(["pinned", "older"]);
    expect(repinned[0]).toBe("fresh");
    expect(repinned).toContain("pinned");
    expect(unpinned).not.toContain("pinned");
    expect(merged.map((item) => item.prompt)).toEqual(["fresh", "pinned", "older", "recent 1", "recent 2"]);
    expect(merged[0].pinned).toBe(true);
    expect(merged[3].pinned).toBe(false);
  });
});
