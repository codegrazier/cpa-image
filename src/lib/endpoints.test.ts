import { describe, expect, test } from "vitest";

import {
  CROSS_ORIGIN_PROXY_PREFIX,
  normalizeChatCompletionsEndpoint,
  normalizeImageEditsEndpoint,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeResponsesEndpoint,
} from "@/lib/endpoints";

describe("endpoint normalization", () => {
  test("normalizes base URLs into image endpoints", () => {
    expect(normalizeImageEndpoint("http://localhost:8317")).toBe("http://localhost:8317/v1/images/generations");
    expect(normalizeImageEndpoint("http://localhost:8317/v1")).toBe("http://localhost:8317/v1/images/generations");
    expect(normalizeImageEndpoint("https://proxy.example.com/openai/v1/")).toBe(
      "https://proxy.example.com/openai/v1/images/generations",
    );
    expect(normalizeImageEndpoint("https://proxy.example.com/v1/images/generations")).toBe(
      "https://proxy.example.com/v1/images/generations",
    );
  });

  test("normalizes base URLs into image edit endpoints", () => {
    expect(normalizeImageEditsEndpoint("http://localhost:8317")).toBe("http://localhost:8317/v1/images/edits");
    expect(normalizeImageEditsEndpoint("http://localhost:8317/v1")).toBe("http://localhost:8317/v1/images/edits");
  });

  test("normalizes base URLs into models endpoints", () => {
    expect(normalizeModelsEndpoint("http://localhost:8317")).toBe("http://localhost:8317/v1/models");
    expect(normalizeModelsEndpoint("http://localhost:8317/v1")).toBe("http://localhost:8317/v1/models");
  });

  test("normalizes base URLs into responses endpoints", () => {
    expect(normalizeResponsesEndpoint("http://localhost:8317")).toBe("http://localhost:8317/v1/responses");
    expect(normalizeResponsesEndpoint("http://localhost:8317/v1")).toBe("http://localhost:8317/v1/responses");
    expect(normalizeResponsesEndpoint("https://proxy.example.com/openai/v1/")).toBe(
      "https://proxy.example.com/openai/v1/responses",
    );
  });

  test("normalizes base URLs into chat completions endpoints", () => {
    expect(normalizeChatCompletionsEndpoint("http://localhost:8317")).toBe(
      "http://localhost:8317/v1/chat/completions",
    );
    expect(normalizeChatCompletionsEndpoint("http://localhost:8317/v1")).toBe(
      "http://localhost:8317/v1/chat/completions",
    );
    expect(normalizeChatCompletionsEndpoint("https://proxy.example.com/openai/v1/")).toBe(
      "https://proxy.example.com/openai/v1/chat/completions",
    );
  });

  test("wraps endpoints with the cross-origin proxy when enabled", () => {
    expect(normalizeImageEndpoint("http://localhost:8317", true)).toBe(
      `${CROSS_ORIGIN_PROXY_PREFIX}${encodeURIComponent("http://localhost:8317/v1/images/generations")}`,
    );
    expect(normalizeImageEditsEndpoint("http://localhost:8317/v1", true)).toBe(
      `${CROSS_ORIGIN_PROXY_PREFIX}${encodeURIComponent("http://localhost:8317/v1/images/edits")}`,
    );
    expect(normalizeResponsesEndpoint("http://localhost:8317", true)).toBe(
      `${CROSS_ORIGIN_PROXY_PREFIX}${encodeURIComponent("http://localhost:8317/v1/responses")}`,
    );
    expect(normalizeChatCompletionsEndpoint("http://localhost:8317/v1", true)).toBe(
      `${CROSS_ORIGIN_PROXY_PREFIX}${encodeURIComponent("http://localhost:8317/v1/chat/completions")}`,
    );
    expect(normalizeModelsEndpoint("http://localhost:8317", true)).toBe(
      `${CROSS_ORIGIN_PROXY_PREFIX}${encodeURIComponent("http://localhost:8317/v1/models")}`,
    );
  });
});
