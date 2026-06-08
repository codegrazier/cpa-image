import assert from "node:assert/strict";
import test from "node:test";

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
  formatRequestTiming,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeResponsesEndpoint,
  missingImageOutputMessage,
  responseErrorMessage,
  filteredRequestRecords,
  requestFilterCounts,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  reusablePromptForRequest,
  responseBodyHasError,
  restoreCachedRequest,
  sanitizeResponseForDisplay,
  stripPromptPolicy,
} from "../app.js";

test("normalizes base URLs into image endpoints", () => {
  assert.equal(normalizeImageEndpoint("http://localhost:8317"), "http://localhost:8317/v1/images/generations");
  assert.equal(normalizeImageEndpoint("http://localhost:8317/v1"), "http://localhost:8317/v1/images/generations");
  assert.equal(
    normalizeImageEndpoint("https://proxy.example.com/openai/v1/"),
    "https://proxy.example.com/openai/v1/images/generations",
  );
  assert.equal(
    normalizeImageEndpoint("https://proxy.example.com/v1/images/generations"),
    "https://proxy.example.com/v1/images/generations",
  );
});

test("normalizes base URLs into models endpoints", () => {
  assert.equal(normalizeModelsEndpoint("http://localhost:8317"), "http://localhost:8317/v1/models");
  assert.equal(normalizeModelsEndpoint("http://localhost:8317/v1"), "http://localhost:8317/v1/models");
});

test("normalizes base URLs into responses endpoints", () => {
  assert.equal(normalizeResponsesEndpoint("http://localhost:8317"), "http://localhost:8317/v1/responses");
  assert.equal(normalizeResponsesEndpoint("http://localhost:8317/v1"), "http://localhost:8317/v1/responses");
  assert.equal(
    normalizeResponsesEndpoint("https://proxy.example.com/openai/v1/"),
    "https://proxy.example.com/openai/v1/responses",
  );
});

test("builds payload with base64 responses", () => {
  const payload = buildPayload({
    model: "custom-ignored-model",
    prompt: "glass jellyfish",
    strictPrompt: false,
    n: 2,
    size: "1024x1024",
    quality: "high",
    background: "opaque",
    outputFormat: "webp",
  });

  assert.deepEqual(payload, {
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

  assert.equal(payload.model, "gpt-5.6");
  assert.equal(payload.tools[0].type, "image_generation");
});

test("builds responses image_generation payload with gpt-5.5", () => {
  const payload = buildResponsesImagePayload({
    prompt: "glass jellyfish",
    strictPrompt: false,
    n: 2,
    size: "1024x1536",
    quality: "high",
    background: "opaque",
    outputFormat: "webp",
  });

  assert.deepEqual(payload, {
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

  assert.match(payload.prompt, /不要改写、扩写、翻译、润色/);
  assert.match(payload.prompt, /必须逐字保持原始 Prompt/);
  assert.doesNotMatch(payload.prompt, /除非安全策略明确要求/);
  assert.match(payload.prompt, /原始 Prompt:\nglass jellyfish/);
});

test("can keep raw prompt when strict prompt policy is disabled", () => {
  assert.equal(applyPromptPolicy("glass jellyfish", false), "glass jellyfish");
});

test("strips strict prompt policy for reused prompts", () => {
  const wrappedPrompt = applyPromptPolicy("glass jellyfish", true);

  assert.equal(stripPromptPolicy(wrappedPrompt), "glass jellyfish");
  assert.equal(
    reusablePromptForRequest({ payload: { prompt: wrappedPrompt } }),
    "glass jellyfish",
  );
});

test("splits multi-image requests into one-image requests by default", () => {
  const payload = {
    model: "gpt-image-2",
    prompt: "glass jellyfish",
    n: 3,
    size: "1024x1024",
  };

  assert.deepEqual(buildGenerationRequests(payload), [
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

  assert.equal(payload.n, 100);
  assert.equal(buildGenerationRequests(payload).length, 100);
  assert.throws(
    () =>
      buildPayload({
        prompt: "glass jellyfish",
        n: 101,
      }),
    /1 到 100/,
  );
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

  assert.equal(requests.length, 3);
  assert.equal(requests[0].model, "gpt-5.5");
  assert.equal(requests[0].tools[0].type, "image_generation");
  assert.notEqual(requests[0].tools[0], requests[1].tools[0]);
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

  assert.equal(records.length, 2);
  assert.equal(records[0].title, "0617-1801-1");
  assert.equal(records[1].title, "0617-1801-2");
  assert.equal(records[0].status, "queued");
  assert.equal(records[0].index, 1);
  assert.equal(records[1].index, 2);
  assert.notEqual(records[0].id, records[1].id);
});

test("continues request title indexes for repeated requests in the same minute", () => {
  const existingRecords = [
    { title: "0617-1801-1" },
    { title: "0617-1801-2" },
    { title: "0617-1800-9" },
  ];

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

  assert.equal(records[0].title, "0617-1801-3");
  assert.equal(records[1].title, "0617-1801-4");
  assert.equal(records[0].index, 3);
  assert.equal(records[1].index, 4);
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

  assert.deepEqual(requestFilterCounts(records), {
    all: 6,
    active: 2,
    done: 1,
    failed: 3,
  });
  assert.deepEqual(filteredRequestRecords(records, "active").map((request) => request.id), ["queued", "running"]);
  assert.deepEqual(filteredRequestRecords(records, "done").map((request) => request.id), ["done"]);
  assert.deepEqual(filteredRequestRecords(records, "failed").map((request) => request.id), [
    "error",
    "canceled",
    "unknown",
  ]);
});

test("normalizes request queue controls", () => {
  assert.equal(normalizeRequestConcurrency("2"), 2);
  assert.equal(normalizeRequestConcurrency("0"), 1);
  assert.equal(normalizeRequestConcurrency("99"), 10);
  assert.equal(normalizeRequestConcurrency("bad"), 2);

  assert.equal(normalizeRequestIntervalSeconds("60"), 60);
  assert.equal(normalizeRequestIntervalSeconds("-1"), 0);
  assert.equal(normalizeRequestIntervalSeconds("9999"), 3600);
  assert.equal(normalizeRequestIntervalSeconds("bad"), 60);
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

  assert.equal(cached.sourcePrompt, "one glass jellyfish");
  assert.equal(restored.sourcePrompt, "one glass jellyfish");
  assert.equal(reusablePromptForRequest(restored), "one glass jellyfish");
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

  assert.equal("images" in cached, false);
  assert.equal("response" in cached, false);
  assert.equal(cached.imageCount, 1);
  assert.equal(cached.hasCachedDetails, true);
  assert.equal(serialized.includes("data:image/png;base64"), false);
  assert.equal(serialized.includes("b64_json"), false);
  assert.equal(restored.imageCount, 1);
});

test("formats request waiting and running time", () => {
  assert.equal(
    formatRequestTiming(
      {
        status: "queued",
        createdAt: 1000,
        startedAt: null,
        endedAt: null,
      },
      2500,
    ),
    "等待 1.5s",
  );

  assert.equal(
    formatRequestTiming(
      {
        status: "done",
        createdAt: 1000,
        startedAt: 2200,
        endedAt: 5200,
      },
      6000,
    ),
    "等待 1.2s · 用时 3.0s",
  );
});

test("keeps all request records in cache metadata", () => {
  const records = Array.from({ length: 105 }, (_, index) => ({
    id: `request-${index}`,
    title: `request-${index}`,
    index: 1,
    total: 1,
    endpoint: "http://localhost:8317/v1/images/generations",
    payload: { model: "gpt-image-2", n: 1 },
    status: "done",
    createdAt: index,
    startedAt: index,
    endedAt: index,
    images: [],
    response: null,
    error: "",
  }));

  const cached = cachedRequestRecords(records);

  assert.equal(cached.length, 105);
  assert.equal(cached[0].id, "request-0");
  assert.equal(cached[104].id, "request-104");
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

  assert.equal(restored.status, "canceled");
  assert.equal(restored.error, "页面刷新，请求已中断。");
  assert.equal(restored.controller, null);
});

test("rejects transparent jpeg payloads", () => {
  assert.throws(
    () =>
      buildPayload({
        model: "gpt-image-2",
        prompt: "logo",
        background: "transparent",
        outputFormat: "jpeg",
      }),
    /透明背景/,
  );
});

test("extracts base64 and URL images from common response shapes", () => {
  const response = {
    data: [
      { b64_json: "iVBORw0KGgoAAAANSUhEUgAA" + "A".repeat(100) },
      { url: "https://cdn.example.com/image.png" },
    ],
    output: [{ type: "image_generation.completed", result: "UklGR" + "A".repeat(100), output_format: "webp" }],
  };

  const images = extractImages(response, "png");

  assert.equal(images.length, 3);
  assert.equal(images[0].src.startsWith("data:image/png;base64,"), true);
  assert.equal(images[1].src, "https://cdn.example.com/image.png");
  assert.equal(images[2].src.startsWith("data:image/webp;base64,"), true);
});

test("explains encrypted response content without image output", () => {
  assert.equal(
    missingImageOutputMessage({ output: [{ encrypted_content: "gAAAAABfake" }] }),
    "响应中只有 encrypted_content，没有 image_generation_call.result；encrypted_content 是加密内容，不能解析为图片。",
  );
});

test("detects common image MIME types", () => {
  assert.equal(detectMimeFromBase64("iVBORw0KGgo="), "image/png");
  assert.equal(detectMimeFromBase64("/9j/4AAQSkZJRgABAQAAAQABAAD"), "image/jpeg");
  assert.equal(detectMimeFromBase64("UklGRiIAAABXRUJQVlA4"), "image/webp");
});

test("redacts long base64 fields in displayed JSON", () => {
  const sanitized = sanitizeResponseForDisplay({
    data: [{ b64_json: "iVBOR" + "A".repeat(300) }],
  });

  assert.match(sanitized.data[0].b64_json, /\[305 chars\]/);
});

test("explains CLIProxyAPI auth_unavailable errors", () => {
  assert.match(
    responseErrorMessage(503, { error: "auth_unavailable" }),
    /CLIProxyAPI 没有可用认证/,
  );
});

test("treats successful HTTP responses with error bodies as failures", () => {
  const body = {
    error: {
      message: "upstream did not return image output",
      type: "server_error",
      code: "internal_server_error",
    },
  };

  assert.equal(responseBodyHasError(body), true);
  assert.equal(responseBodyHasError({ data: [] }), false);
  assert.equal(
    responseErrorMessage(200, body),
    "响应错误：upstream did not return image output (internal_server_error)",
  );
});
