import { describe, expect, test } from "vitest";

import {
  applyPromptPolicy,
  buildGenerationRequests,
  buildPayload,
  buildResponsesImagePayload,
  buildResponsesImageRequests,
  cachedRequestRecords,
  createRequestRecords,
  detectMimeFromBase64,
  extractImages,
  filteredRequestRecords,
  formatCompletionTime,
  formatRequestTiming,
  imageBlobFromDataUrl,
  missingImageOutputMessage,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  normalizeResponsesEndpoint,
  prepareImageForDetailCache,
  prepareImageForRuntime,
  requestFilterCounts,
  responseBodyHasError,
  responseErrorMessage,
  restoreCachedRequest,
  reusablePromptForRequest,
  sanitizeResponseForDisplay,
  sortedRequestRecordsForFilter,
  stripPromptPolicy,
} from "@/lib/image-console";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("image console logic", () => {
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

  test("builds payload with base64 responses", () => {
    expect(
      buildPayload({
        model: "custom-ignored-model",
        prompt: "glass jellyfish",
        strictPrompt: false,
        n: 2,
        size: "1024x1024",
        quality: "high",
        background: "opaque",
        outputFormat: "webp",
      }),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "glass jellyfish",
      n: 2,
      size: "1024x1024",
      quality: "high",
      background: "opaque",
      output_format: "webp",
      response_format: "b64_json",
    });
  });

  test("uses configurable responses image_generation model", () => {
    const payload = buildResponsesImagePayload({
      imageGenerationModel: "gpt-5.6",
      prompt: "glass jellyfish",
      strictPrompt: false,
      n: 1,
    });

    expect(payload.model).toBe("gpt-5.6");
    expect(payload.tools?.[0].type).toBe("image_generation");
  });

  test("builds responses image_generation payload with gpt-5.5", () => {
    expect(
      buildResponsesImagePayload({
        prompt: "glass jellyfish",
        strictPrompt: false,
        n: 2,
        size: "1024x1536",
        quality: "high",
        background: "opaque",
        outputFormat: "webp",
      }),
    ).toEqual({
      model: "gpt-5.5",
      input: "glass jellyfish",
      tools: [
        {
          type: "image_generation",
          size: "1024x1536",
          quality: "high",
          background: "opaque",
          output_format: "webp",
        },
      ],
      tool_choice: {
        type: "image_generation",
      },
    });
  });

  test("adds strict prompt policy by default", () => {
    const payload = buildPayload({
      model: "gpt-image-2",
      prompt: "glass jellyfish",
      n: 1,
    });

    expect(payload.prompt).toMatch(/不要改写、扩写、翻译、润色/);
    expect(payload.prompt).toMatch(/必须逐字保持原始 Prompt/);
    expect(payload.prompt).not.toMatch(/除非安全策略明确要求/);
    expect(payload.prompt).toMatch(/原始 Prompt:\nglass jellyfish/);
  });

  test("can keep raw prompt when strict prompt policy is disabled", () => {
    expect(applyPromptPolicy("glass jellyfish", false)).toBe("glass jellyfish");
  });

  test("strips strict prompt policy for reused prompts", () => {
    const wrappedPrompt = applyPromptPolicy("glass jellyfish", true);

    expect(stripPromptPolicy(wrappedPrompt)).toBe("glass jellyfish");
    expect(reusablePromptForRequest({ payload: { prompt: wrappedPrompt }, sourcePrompt: "" })).toBe("glass jellyfish");
  });

  test("splits multi-image requests into one-image requests by default", () => {
    const payload = {
      model: "gpt-image-2",
      prompt: "glass jellyfish",
      n: 3,
      size: "1024x1024",
    };

    expect(buildGenerationRequests(payload)).toEqual([
      { model: "gpt-image-2", prompt: "glass jellyfish", n: 1, size: "1024x1024" },
      { model: "gpt-image-2", prompt: "glass jellyfish", n: 1, size: "1024x1024" },
      { model: "gpt-image-2", prompt: "glass jellyfish", n: 1, size: "1024x1024" },
    ]);
  });

  test("allows up to 100 generated images per batch", () => {
    const payload = buildPayload({
      prompt: "glass jellyfish",
      strictPrompt: false,
      n: 100,
    });

    expect(payload.n).toBe(100);
    expect(buildGenerationRequests(payload)).toHaveLength(100);
    expect(() => buildPayload({ prompt: "glass jellyfish", n: 101 })).toThrow(/1 到 100/);
  });

  test("splits responses image_generation requests by count", () => {
    const payload = buildResponsesImagePayload({
      prompt: "glass jellyfish",
      strictPrompt: false,
      n: 3,
      size: "1024x1024",
      outputFormat: "png",
    });

    const requests = buildResponsesImageRequests(payload, 3);

    expect(requests).toHaveLength(3);
    expect(requests[0].model).toBe("gpt-5.5");
    expect(requests[0].tools?.[0].type).toBe("image_generation");
    expect(requests[0].tools?.[0]).not.toBe(requests[1].tools?.[0]);
  });

  test("creates independent request records", () => {
    const records = createRequestRecords(
      [
        { model: "gpt-image-2", prompt: "one", n: 1 },
        { model: "gpt-image-2", prompt: "two", n: 1 },
      ],
      "http://localhost:8317/v1/images/generations",
      1000,
      new Date("2026-06-17T18:01:00"),
    );

    expect(records).toHaveLength(2);
    expect(records[0].title).toBe("0617-1801-1");
    expect(records[1].title).toBe("0617-1801-2");
    expect(records[0].status).toBe("queued");
    expect(records[0].index).toBe(1);
    expect(records[1].index).toBe(2);
    expect(records[0].id).not.toBe(records[1].id);
  });

  test("continues request title indexes for repeated requests in the same minute", () => {
    const existingRecords = [{ title: "0617-1801-1" }, { title: "0617-1801-2" }, { title: "0617-1800-9" }];

    const records = createRequestRecords(
      [
        { model: "gpt-image-2", prompt: "three", n: 1 },
        { model: "gpt-image-2", prompt: "four", n: 1 },
      ],
      "http://localhost:8317/v1/images/generations",
      2000,
      new Date("2026-06-17T18:01:45"),
      existingRecords,
    );

    expect(records[0].title).toBe("0617-1801-3");
    expect(records[1].title).toBe("0617-1801-4");
    expect(records[0].index).toBe(3);
    expect(records[1].index).toBe(4);
  });

  test("filters request list by queue state groups", () => {
    const records = [
      { id: "queued", status: "queued" },
      { id: "running", status: "running" },
      { id: "done", status: "done" },
      { id: "error", status: "error" },
      { id: "canceled", status: "canceled" },
      { id: "unknown", status: "timeout" },
    ];

    expect(requestFilterCounts(records as never)).toEqual({
      all: 6,
      active: 2,
      done: 1,
      failed: 3,
    });
    expect(filteredRequestRecords(records as never, "active").map((request) => request.id)).toEqual(["queued", "running"]);
    expect(filteredRequestRecords(records as never, "done").map((request) => request.id)).toEqual(["done"]);
    expect(filteredRequestRecords(records as never, "failed").map((request) => request.id)).toEqual([
      "error",
      "canceled",
      "unknown",
    ]);
  });

  test("normalizes request queue controls", () => {
    expect(normalizeRequestConcurrency("2")).toBe(2);
    expect(normalizeRequestConcurrency("0")).toBe(1);
    expect(normalizeRequestConcurrency("99")).toBe(99);
    expect(normalizeRequestConcurrency("101")).toBe(100);
    expect(normalizeRequestConcurrency("bad")).toBe(2);

    expect(normalizeRequestIntervalSeconds("60")).toBe(60);
    expect(normalizeRequestIntervalSeconds("-1")).toBe(0);
    expect(normalizeRequestIntervalSeconds("9999")).toBe(3600);
    expect(normalizeRequestIntervalSeconds("bad")).toBe(60);
  });

  test("sorts done request lists by completion time descending", () => {
    const records = [
      { id: "created-last", status: "done", createdAt: 3000, endedAt: 4000 },
      { id: "finished-last", status: "done", createdAt: 1000, endedAt: 9000 },
      { id: "finished-middle", status: "done", createdAt: 2000, endedAt: 6000 },
      { id: "queued", status: "queued", createdAt: 5000, endedAt: null },
    ] as never;

    expect(sortedRequestRecordsForFilter(records, "done").map((request) => request.id)).toEqual([
      "finished-last",
      "finished-middle",
      "created-last",
    ]);
    expect(sortedRequestRecordsForFilter(records, "all").map((request) => request.id)).toEqual([
      "queued",
      "finished-middle",
      "finished-last",
      "created-last",
    ]);
  });

  test("caches and restores source prompts for request reuse", () => {
    const [record] = createRequestRecords(
      [{ model: "gpt-image-2", prompt: applyPromptPolicy("one glass jellyfish", true), n: 1 }],
      "http://localhost:8317/v1/images/generations",
      1000,
      new Date("2026-06-17T18:01:00"),
    );

    const [cached] = cachedRequestRecords([record]);
    const restored = restoreCachedRequest({
      ...cached,
      sourcePrompt: "",
    });

    expect(cached.sourcePrompt).toBe("one glass jellyfish");
    expect(restored.sourcePrompt).toBe("one glass jellyfish");
    expect(reusablePromptForRequest(restored)).toBe("one glass jellyfish");
  });

  test("keeps localStorage request cache compact when responses contain base64 images", () => {
    const [record] = createRequestRecords(
      [{ model: "gpt-image-2", prompt: "one glass jellyfish", n: 1 }],
      "http://localhost:8317/v1/images/generations",
      1000,
      new Date("2026-06-17T18:01:00"),
    );

    record.status = "done";
    record.images = [{ src: "data:image/png;base64," + "A".repeat(5000), kind: "base64", path: "$.data[0].b64_json" }];
    record.response = { data: [{ b64_json: "A".repeat(5000) }] };

    const [cached] = cachedRequestRecords([record]);
    const serialized = JSON.stringify(cached);
    const restored = restoreCachedRequest(cached);

    expect("images" in cached).toBe(false);
    expect("response" in cached).toBe(false);
    expect(cached.imageCount).toBe(1);
    expect(cached.hasCachedDetails).toBe(true);
    expect(serialized.includes("data:image/png;base64")).toBe(false);
    expect(serialized.includes("b64_json")).toBe(false);
    expect(restored.imageCount).toBe(1);
  });

  test("formats request waiting and running time", () => {
    expect(
      formatRequestTiming(
        {
          status: "queued",
          createdAt: 1000,
          startedAt: null,
          endedAt: null,
        },
        2500,
      ),
    ).toBe("等待 1.5s");

    expect(
      formatRequestTiming(
        {
          status: "done",
          createdAt: 1000,
          startedAt: 2200,
          endedAt: 5200,
        },
        6000,
      ),
    ).toBe("等待 1.2s · 用时 3.0s");
  });

  test("formats completion clock time", () => {
    const completedAt = new Date(2026, 5, 9, 19, 52, 3).getTime();

    expect(formatCompletionTime(completedAt)).toBe("完成于 19:52:03");
    expect(formatCompletionTime(null)).toBe("完成时间未记录");
  });

  test("keeps all request records in cache metadata", () => {
    const records = Array.from({ length: 105 }, (_, index) => ({
      id: `request-${index}`,
      title: `request-${index}`,
      index: 1,
      total: 1,
      method: "" as const,
      endpoint: "http://localhost:8317/v1/images/generations",
      payload: { model: "gpt-image-2", n: 1 },
      sourcePrompt: "",
      status: "done" as const,
      createdAt: index,
      startedAt: index,
      endedAt: index,
      completedAt: 1781000000000 + index,
      images: [],
      response: null,
      error: "",
    }));

    const cached = cachedRequestRecords(records);

    expect(cached).toHaveLength(105);
    expect(cached[0].id).toBe("request-0");
    expect(cached[0].completedAt).toBe(1781000000000);
    expect(cached[104].id).toBe("request-104");
  });

  test("restores interrupted cached requests as canceled", () => {
    const restored = restoreCachedRequest({
      id: "request-1",
      title: "0617-1801-1",
      index: 1,
      total: 1,
      endpoint: "http://localhost:8317/v1/images/generations",
      payload: { model: "gpt-image-2", n: 1 },
      status: "running",
      createdAt: 1000,
      startedAt: 1200,
      images: [],
    });

    expect(restored.status).toBe("canceled");
    expect(restored.error).toBe("页面刷新，请求已中断。");
    expect(restored.controller).toBeNull();
  });

  test("rejects transparent jpeg payloads", () => {
    expect(() =>
      buildPayload({
        model: "gpt-image-2",
        prompt: "logo",
        background: "transparent",
        outputFormat: "jpeg",
      }),
    ).toThrow(/透明背景/);
  });

  test("extracts base64 and URL images from common response shapes", () => {
    const response = {
      data: [
        { b64_json: PNG_BASE64 },
        { url: "https://cdn.example.com/image.png" },
      ],
      output: [{ type: "image_generation.completed", result: "UklGR" + "A".repeat(100), output_format: "webp" }],
    };

    const images = extractImages(response, "png");

    expect(images).toHaveLength(3);
    expect(images[0].src.startsWith("data:image/png;base64,")).toBe(true);
    expect(images[1].src).toBe("https://cdn.example.com/image.png");
    expect(images[2].src.startsWith("data:image/webp;base64,")).toBe(true);
  });

  test("prepares base64 images as blobs for cache and object URLs for runtime", () => {
    const [image] = extractImages({ data: [{ b64_json: PNG_BASE64 }] }, "png");
    const blob = imageBlobFromDataUrl(image.src, "png");
    const cachedImage = prepareImageForDetailCache(image);
    const runtimeImage = prepareImageForRuntime(cachedImage!);

    expect(blob).toBeInstanceOf(Blob);
    expect(cachedImage?.src).toBe("");
    expect(cachedImage?.blob).toBeInstanceOf(Blob);
    expect(runtimeImage.src).toMatch(/^blob:/);
    expect(runtimeImage.objectUrl).toBe(runtimeImage.src);
    expect(runtimeImage).not.toHaveProperty("blob");
  });

  test("explains encrypted response content without image output", () => {
    expect(missingImageOutputMessage({ output: [{ encrypted_content: "gAAAAABfake" }] })).toBe(
      "响应中只有 encrypted_content，没有 image_generation_call.result；encrypted_content 是加密内容，不能解析为图片。",
    );
  });

  test("detects common image MIME types", () => {
    expect(detectMimeFromBase64("iVBORw0KGgo=")).toBe("image/png");
    expect(detectMimeFromBase64("/9j/4AAQSkZJRgABAQAAAQABAAD")).toBe("image/jpeg");
    expect(detectMimeFromBase64("UklGRiIAAABXRUJQVlA4")).toBe("image/webp");
  });

  test("redacts long base64 fields in displayed JSON", () => {
    const sanitized = sanitizeResponseForDisplay({
      data: [{ b64_json: "iVBOR" + "A".repeat(300) }],
    }) as { data: Array<{ b64_json: string }> };

    expect(sanitized.data[0].b64_json).toBe("[image data omitted, 305 chars]");
  });

  test("explains CLIProxyAPI auth_unavailable errors", () => {
    expect(responseErrorMessage(503, { error: "auth_unavailable" })).toMatch(/CLIProxyAPI 没有可用认证/);
  });

  test("treats successful HTTP responses with error bodies as failures", () => {
    const body = {
      error: {
        message: "upstream did not return image output",
        type: "server_error",
        code: "internal_server_error",
      },
    };

    expect(responseBodyHasError(body)).toBe(true);
    expect(responseBodyHasError({ data: [] })).toBe(false);
    expect(responseErrorMessage(200, body)).toBe("响应错误：upstream did not return image output (internal_server_error)");
  });
});
