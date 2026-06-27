import { describe, expect, test } from "vitest";

import {
  applyPromptPolicy,
  buildChatCompletionsImagePayload,
  buildChatCompletionsImageRequests,
  buildEditImagePayload,
  buildEditImageRequests,
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
  generationMethodDisplayName,
  imageBlobFromDataUrl,
  missingImageOutputMessage,
  imageDownloadName,
  normalizeModeSettings,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  prepareImageForDetailCache,
  prepareImageForRuntime,
  prepareImageForThumbnailCache,
  requestFilterCounts,
  responseBodyHasError,
  responseErrorMessage,
  revisedPromptForResponse,
  restoreCachedRequest,
  reusablePromptForRequest,
  sanitizeResponseForDisplay,
  sortedRequestRecordsForFilter,
  STRICT_PROMPT_FOOTER,
  STRICT_PROMPT_HEADER,
  stripPromptPolicy,
  type ImageRequestRecord,
} from "@/lib/image-console";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function requestRecordFixture(overrides: Partial<ImageRequestRecord>): ImageRequestRecord {
  return {
    id: "request",
    title: "260617-1801-1",
    index: 1,
    total: 1,
    method: "gpt-image-2",
    endpoint: "http://localhost:8317/v1/images/generations",
    payload: {},
    sourcePrompt: "",
    status: "queued",
    createdAt: 0,
    startedAt: null,
    endedAt: null,
    images: [],
    response: null,
    error: "",
    ...overrides,
  };
}

describe("image console logic", () => {
  test("normalizes invalid mode settings back to defaults", () => {
    expect(
      normalizeModeSettings({
        size: "9999x9999",
        quality: "ultra",
        background: "glass",
        outputFormat: "tiff",
        n: 3,
        strictPrompt: "yes",
      }),
    ).toMatchObject({
      size: "auto",
      quality: "auto",
      background: "auto",
      outputFormat: "png",
      n: 3,
      strictPrompt: true,
    });
  });

  test("uses configurable image model for base64 payloads", () => {
    expect(
      buildPayload({
        generationsModel: "custom-image-model",
        prompt: "glass jellyfish",
        strictPrompt: false,
        n: 2,
        size: "1024x1024",
        quality: "high",
        background: "opaque",
        outputFormat: "webp",
      }),
    ).toEqual({
      model: "custom-image-model",
      prompt: "glass jellyfish",
      n: 2,
      size: "1024x1024",
      quality: "high",
      background: "opaque",
      output_format: "webp",
      moderation: "low",
    });
  });

  test("uses configurable responses image_generation model", () => {
    const payload = buildResponsesImagePayload({
      responsesModel: "gpt-5.6",
      prompt: "glass jellyfish",
      strictPrompt: false,
      n: 1,
    });

    expect(payload.model).toBe("gpt-5.6");
    expect(payload.tools?.[0].type).toBe("image_generation");
    expect(payload.tools?.[0].moderation).toBe("low");
  });

  test("builds edit payload with uploaded images", () => {
    const file = new File(["image-bytes"], "input.png", { type: "image/png" });
    const payload = buildEditImagePayload(
      {
        editsModel: "gpt-image-3",
        prompt: "glass jellyfish",
        strictPrompt: false,
        n: 2,
        size: "1024x1536",
        quality: "high",
        background: "opaque",
        outputFormat: "webp",
      },
      [{ src: "blob:preview", name: "input.png", mimeType: "image/png", file }],
    );

    expect(payload.model).toBe("gpt-image-3");
    expect(payload.prompt).toBe("glass jellyfish");
    expect(payload.images).toBeUndefined();
    expect(payload.n).toBe(2);
    expect(payload.output_format).toBe("webp");
    expect(payload.moderation).toBe("low");
  });

  test("rejects edit payloads with more than five input images", () => {
    const file = new File(["image-bytes"], "input.png", { type: "image/png" });

    expect(() =>
      buildEditImagePayload(
        {
          prompt: "glass jellyfish",
          strictPrompt: false,
          n: 1,
        },
        Array.from({ length: 6 }, (_, index) => ({
          src: `blob:preview-${index}`,
          name: `input-${index + 1}.png`,
          mimeType: "image/png",
          file,
        })),
      ),
    ).toThrow(/最多选择 5 张图片/);
  });

  test("builds responses image_generation payload with gpt-5.4-mini", () => {
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
      model: "gpt-5.4-mini",
      input: "glass jellyfish",
      tools: [
        {
          type: "image_generation",
          size: "1024x1536",
          quality: "high",
          background: "opaque",
          output_format: "webp",
          moderation: "low",
        },
      ],
      tool_choice: {
        type: "image_generation",
      },
    });
  });

  test("builds chat completions image payload with messages and image tool options", () => {
    expect(
      buildChatCompletionsImagePayload({
        completionsModel: "gpt-5.6",
        prompt: "glass jellyfish",
        strictPrompt: false,
        n: 2,
        size: "1024x1536",
        quality: "high",
        background: "opaque",
        outputFormat: "webp",
      }),
    ).toEqual({
      model: "gpt-5.6",
      messages: [
        {
          role: "user",
          content: "glass jellyfish",
        },
      ],
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
      generationsModel: "gpt-image-2",
      prompt: "glass jellyfish",
      n: 1,
    });

    expect(payload.prompt).toMatch(/不要改写、扩写、翻译、润色/);
    expect(payload.prompt).toMatch(/必须逐字保持原始 Prompt/);
    expect(payload.prompt).not.toMatch(/除非安全策略明确要求/);
    expect(payload.prompt).toMatch(/原始 Prompt:\nglass jellyfish/);
  });

  test("uses a custom strict prompt body between fixed header and footer", () => {
    const wrappedPrompt = applyPromptPolicy("glass jellyfish", true, "第一行\n第二行");

    expect(wrappedPrompt).toBe(
      `${STRICT_PROMPT_HEADER}\n第一行\n第二行\n\n${STRICT_PROMPT_FOOTER}\nglass jellyfish`,
    );
    expect(stripPromptPolicy(wrappedPrompt)).toBe("glass jellyfish");
  });

  test("can keep raw prompt when strict prompt policy is disabled", () => {
    expect(applyPromptPolicy("glass jellyfish", false)).toBe("glass jellyfish");
  });

  test("strips strict prompt policy for reused prompts", () => {
    const wrappedPrompt = applyPromptPolicy("glass jellyfish", true);

    expect(stripPromptPolicy(wrappedPrompt)).toBe("glass jellyfish");
    expect(reusablePromptForRequest({ payload: { prompt: wrappedPrompt }, sourcePrompt: "" })).toBe("glass jellyfish");
    expect(
      reusablePromptForRequest({
        payload: { messages: [{ role: "user", content: wrappedPrompt }] },
        sourcePrompt: "",
      }),
    ).toBe("glass jellyfish");
  });

  test("extracts revised prompt from nested responses", () => {
    expect(
      revisedPromptForResponse({
        output: [
          {
            message: {
              revised_prompt: "glass jellyfish, soft rim light",
            },
          },
        ],
      }),
    ).toBe("glass jellyfish, soft rim light");
    expect(revisedPromptForResponse({ data: [{ revisedPrompt: "alt" }] })).toBe("alt");
    expect(revisedPromptForResponse({})).toBe("");
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
    expect(requests[0].model).toBe("gpt-5.4-mini");
    expect(requests[0].tools?.[0].type).toBe("image_generation");
    expect(requests[0].tools?.[0]).not.toBe(requests[1].tools?.[0]);
  });

  test("splits chat completions image requests by count", () => {
    const payload = buildChatCompletionsImagePayload({
      prompt: "glass jellyfish",
      strictPrompt: false,
      n: 3,
      size: "1024x1024",
      outputFormat: "png",
    });

    const requests = buildChatCompletionsImageRequests(payload, 3);

    expect(requests).toHaveLength(3);
    expect(requests[0].model).toBe("gpt-5.4-mini");
    expect(requests[0].messages?.[0].content).toBe("glass jellyfish");
    expect(requests[0].tools?.[0].type).toBe("image_generation");
    expect(requests[0].messages?.[0]).not.toBe(requests[1].messages?.[0]);
    expect(requests[0].tools?.[0]).not.toBe(requests[1].tools?.[0]);
  });

  test("splits edit image requests by count", () => {
    const payload = buildEditImagePayload(
      {
        prompt: "glass jellyfish",
        strictPrompt: false,
        n: 3,
        size: "1024x1024",
        outputFormat: "png",
      },
      [{ src: "blob:preview", name: "input.png", mimeType: "image/png", file: new File(["x"], "input.png") }],
    );

    const requests = buildEditImageRequests(payload, 3);

    expect(requests).toHaveLength(3);
    expect(requests[0].model).toBe("gpt-image-2");
    expect(requests[0].n).toBe(1);
    expect(requests[0].moderation).toBe("low");
    expect(requests[0]).not.toBe(requests[1]);
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
    expect(records[0].title).toBe("260617-1801-1");
    expect(records[1].title).toBe("260617-1801-2");
    expect(records[0].status).toBe("queued");
    expect(records[0].index).toBe(1);
    expect(records[1].index).toBe(2);
    expect(records[0].id).not.toBe(records[1].id);
  });

  test("continues request title indexes for repeated requests in the same minute", () => {
    const existingRecords = [{ title: "260617-1801-1" }, { title: "260617-1801-2" }, { title: "260617-1800-9" }];

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

    expect(records[0].title).toBe("260617-1801-3");
    expect(records[1].title).toBe("260617-1801-4");
    expect(records[0].index).toBe(3);
    expect(records[1].index).toBe(4);
  });

  test("filters request list by queue state groups", () => {
    const records = [
      requestRecordFixture({ id: "queued", status: "queued" }),
      requestRecordFixture({ id: "running", status: "running" }),
      requestRecordFixture({ id: "done", status: "done" }),
      requestRecordFixture({ id: "error", status: "error" }),
      requestRecordFixture({ id: "canceled", status: "canceled" }),
      requestRecordFixture({ id: "unknown", status: "timeout" }),
    ];

    expect(requestFilterCounts(records)).toEqual({
      all: 6,
      active: 2,
      done: 1,
      failed: 3,
    });
    expect(filteredRequestRecords(records, "active").map((request) => request.id)).toEqual(["queued", "running"]);
    expect(filteredRequestRecords(records, "done").map((request) => request.id)).toEqual(["done"]);
    expect(filteredRequestRecords(records, "failed").map((request) => request.id)).toEqual([
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

  test("maps internal generation methods to user-facing labels", () => {
    expect(generationMethodDisplayName("gpt-image-2")).toBe("generations");
    expect(generationMethodDisplayName("image_generation")).toBe("responses");
    expect(generationMethodDisplayName("completions")).toBe("completions");
    expect(generationMethodDisplayName("edit")).toBe("edit");
    expect(generationMethodDisplayName("")).toBe("generations");
  });

  test("uses CPA-Image as the download filename prefix for image generation", () => {
    expect(
      imageDownloadName({
        method: "gpt-image-2",
        title: "260617-1801-1",
        payload: { model: "gpt-image-2" },
        imageCount: 1,
      }),
    ).toBe("CPA-Image-260617-1801-1.png");
  });

  test("uses CPA-Image as the download filename prefix for edit requests", () => {
    expect(
      imageDownloadName({
        method: "edit",
        title: "260617-1801-1",
        payload: { model: "gpt-image-2" },
        imageCount: 1,
      }),
    ).toBe("CPA-Image-260617-1801-1.png");
  });

  test("sorts request lists by title, completion, and failure time descending", () => {
    const records = [
      requestRecordFixture({
        id: "running-2",
        title: "260613-1838-2",
        status: "running",
        createdAt: 5000,
        index: 2,
        endedAt: null,
      }),
      requestRecordFixture({
        id: "running-10",
        title: "260613-1838-10",
        status: "queued",
        createdAt: 5000,
        index: 10,
        endedAt: null,
      }),
      requestRecordFixture({
        id: "created-last",
        title: "260613-1838-8",
        status: "done",
        createdAt: 3000,
        index: 8,
        endedAt: 4000,
        completedAt: 4000,
      }),
      requestRecordFixture({
        id: "finished-last",
        title: "260613-1839-1",
        status: "done",
        createdAt: 1000,
        index: 1,
        endedAt: 9000,
        completedAt: 9000,
      }),
      requestRecordFixture({
        id: "finished-middle",
        title: "260613-1837-5",
        status: "done",
        createdAt: 2000,
        index: 5,
        endedAt: 6000,
        completedAt: 6000,
      }),
      requestRecordFixture({
        id: "failed-new",
        title: "260613-1838-11",
        status: "error",
        createdAt: 4500,
        index: 11,
        endedAt: 9500,
      }),
      requestRecordFixture({
        id: "canceled-old",
        title: "260613-1836-7",
        status: "canceled",
        createdAt: 2500,
        index: 7,
        endedAt: 7000,
      }),
    ];

    expect(sortedRequestRecordsForFilter(records, "done").map((request) => request.id)).toEqual([
      "finished-last",
      "finished-middle",
      "created-last",
    ]);
    expect(sortedRequestRecordsForFilter(records, "all").map((request) => request.id)).toEqual([
      "finished-last",
      "failed-new",
      "running-10",
      "created-last",
      "running-2",
      "finished-middle",
      "canceled-old",
    ]);
    expect(sortedRequestRecordsForFilter(records, "active").map((request) => request.id)).toEqual([
      "running-10",
      "running-2",
    ]);
    expect(sortedRequestRecordsForFilter(records, "failed").map((request) => request.id)).toEqual([
      "failed-new",
      "canceled-old",
    ]);
  });

  test("sorts title-based active lists with numeric suffixes in descending order", () => {
    const records = [
      requestRecordFixture({
        id: "queued-2",
        title: "260613-1838-2",
        status: "queued",
        createdAt: 1000,
        index: 2,
        endedAt: null,
      }),
      requestRecordFixture({
        id: "queued-10",
        title: "260613-1838-10",
        status: "queued",
        createdAt: 1000,
        index: 10,
        endedAt: null,
      }),
      requestRecordFixture({
        id: "queued-1",
        title: "260612-2359-1",
        status: "queued",
        createdAt: 1000,
        index: 1,
        endedAt: null,
      }),
    ];

    expect(sortedRequestRecordsForFilter(records, "active").map((request) => request.id)).toEqual([
      "queued-10",
      "queued-2",
      "queued-1",
    ]);
    expect(sortedRequestRecordsForFilter(records, "all").map((request) => request.id)).toEqual([
      "queued-10",
      "queued-2",
      "queued-1",
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
    record.thumbnail = {
      src: "data:image/webp;base64," + "B".repeat(120),
      kind: "base64",
      path: "$.preview",
      blob: new Blob(["thumbnail"], { type: "image/webp" }),
      objectUrl: "blob:thumbnail",
    };

    const [cached] = cachedRequestRecords([record]);
    const serialized = JSON.stringify(cached);
    const restored = restoreCachedRequest(cached);

    expect("images" in cached).toBe(false);
    expect("response" in cached).toBe(false);
    expect(cached.imageCount).toBe(1);
    expect(cached.hasCachedDetails).toBe(true);
    expect(cached.thumbnail?.src.startsWith("data:image/webp;base64,")).toBe(true);
    expect(cached.thumbnail).not.toHaveProperty("blob");
    expect(cached.thumbnail).not.toHaveProperty("objectUrl");
    expect(serialized.includes("data:image/png;base64")).toBe(false);
    expect(serialized.includes("blob:thumbnail")).toBe(false);
    expect(restored.imageCount).toBe(1);
  });

  test("treats cached thumbnails as detail-backed requests on restore", () => {
    const [record] = createRequestRecords(
      [{ model: "gpt-image-2", prompt: "one glass jellyfish", n: 1 }],
      "http://localhost:8317/v1/images/generations",
      1000,
      new Date("2026-06-17T18:01:00"),
    );

    record.status = "done";
    record.images = [];
    record.response = null;
    record.hasCachedDetails = false;
    record.thumbnail = {
      src: "data:image/webp;base64," + "B".repeat(120),
      kind: "base64",
      path: "$.preview",
    };

    const [cached] = cachedRequestRecords([record]);
    const restored = restoreCachedRequest(cached);

    expect(cached.hasCachedDetails).toBe(true);
    expect(restored.hasCachedDetails).toBe(true);
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
          status: "queued",
          createdAt: 1000,
          startedAt: null,
          endedAt: null,
        },
        2500,
        "en",
      ),
    ).toBe("Waiting 1.5s");

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

    expect(
      formatRequestTiming(
        {
          status: "done",
          createdAt: 1000,
          startedAt: 1000,
          endedAt: 66500,
        },
        70000,
      ),
    ).toBe("等待 0.0s · 用时 1m5.5s");

    expect(
      formatRequestTiming(
        {
          status: "done",
          createdAt: 1000,
          startedAt: 2200,
          endedAt: 5200,
        },
        6000,
        "en",
      ),
    ).toBe("Waiting 1.2s · Duration 3.0s");

    expect(
      formatRequestTiming(
        {
          status: "done",
          createdAt: 1000,
          startedAt: 1000,
          endedAt: 66500,
        },
        70000,
        "en",
      ),
    ).toBe("Waiting 0.0s · Duration 1m5.5s");
  });

  test("formats completion clock time", () => {
    const completedAt = new Date(2026, 5, 9, 19, 52, 3).getTime();

    expect(formatCompletionTime(completedAt)).toBe("完成于 19:52:03");
    expect(formatCompletionTime(null)).toBe("完成时间未记录");
    expect(formatCompletionTime(completedAt, "en")).toBe("Completed at 19:52:03");
    expect(formatCompletionTime(null, "en")).toBe("Completion time not recorded");
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
      title: "260617-1801-1",
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
        generationsModel: "gpt-image-2",
        prompt: "logo",
        background: "transparent",
        outputFormat: "jpeg",
      }),
    ).toThrow(/透明背景/);
  });

  test("extracts base64 and URL images from common response shapes", () => {
    const response = {
      data: [
        { b64_json: PNG_BASE64, url: "https://cdn.example.com/ignored.png" },
        { url: "https://cdn.example.com/image.png" },
      ],
      output: [{ type: "image_generation.completed", result: "UklGR" + "A".repeat(100), output_format: "webp" }],
    };

    const images = extractImages(response, "png");

    expect(images).toHaveLength(3);
    expect(images[0].src.startsWith("data:image/png;base64,")).toBe(true);
    expect(images[0].path).toBe("$.data[0].b64_json");
    expect(images[1].src).toBe("https://cdn.example.com/image.png");
    expect(images[2].src.startsWith("data:image/webp;base64,")).toBe(true);
    expect(images.some((image) => image.path === "$.data[0].url")).toBe(false);
  });

  test("extracts markdown image URLs from streamed chat completion text", () => {
    const response = [
      'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"delta":{"reasoning_content":"图片正在生成 100% (1/1)\\n"}}]}',
      'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"delta":{"content":"![image](https://grok.example.com/v1/files/image?id=a45788dd-23fb-4bd2-8012-e1f9991fcffa)"}}]}',
      "data: [DONE]",
    ].join("\n\n");

    const images = extractImages(response, "png");

    expect(images).toEqual([
      {
        src: "https://grok.example.com/v1/files/image?id=a45788dd-23fb-4bd2-8012-e1f9991fcffa",
        kind: "url",
        path: "$.markdownImage[0]",
        mimeType: undefined,
      },
    ]);
  });

  test("extracts markdown image URLs from parsed chat completion content", () => {
    const images = extractImages({
      choices: [
        {
          message: {
            content: "已生成：![image](https://grok.example.com/v1/files/image?id=parsed)",
          },
        },
      ],
    });

    expect(images[0]?.src).toBe("https://grok.example.com/v1/files/image?id=parsed");
    expect(images[0]?.path).toBe("$.choices[0].message.content.markdownImage[0]");
  });

  test("extracts data URI images from message.images array in completions response", () => {
    const response = {
      id: "resp_test",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            images: [
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64," + PNG_BASE64,
                },
                index: 0,
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
    };

    const images = extractImages(response, "png");

    expect(images).toHaveLength(1);
    expect(images[0].kind).toBe("base64");
    expect(images[0].src.startsWith("data:image/png;base64,")).toBe(true);
    expect(images[0].path).toBe("$.choices[0].message.images[0].image_url.url");
    expect(images[0].mimeType).toBe("image/png");
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

  test("prepares compact thumbnail images for list previews", async () => {
    const [image] = extractImages({ data: [{ b64_json: PNG_BASE64 }] }, "png");
    const thumbnail = await prepareImageForThumbnailCache(image);

    expect(thumbnail?.src).toMatch(/^data:image\/webp;base64,/);
    expect(thumbnail?.kind).toBe("base64");
    expect(thumbnail).not.toHaveProperty("blob");
    expect(thumbnail).not.toHaveProperty("objectUrl");
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
