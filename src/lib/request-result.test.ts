import { describe, expect, test, vi } from "vitest";

import {
  applyCompletedRequestResult,
  applyFailedRequestResult,
  imageResolution,
  imageSizeBytes,
  runtimeImagesForRequest,
} from "@/lib/request-result";
import { type GeneratedImage, type ImageRequestRecord } from "@/lib/image-console";

function imageFixture(overrides: Partial<GeneratedImage> = {}): GeneratedImage {
  return {
    src: "data:image/png;base64,image-data",
    kind: "base64",
    path: "image.png",
    mimeType: "image/png",
    ...overrides,
  };
}

function requestRecordFixture(overrides: Partial<ImageRequestRecord> = {}): ImageRequestRecord {
  return {
    id: "request",
    title: "260617-1801-1",
    index: 1,
    total: 1,
    method: "gpt-image-2",
    endpoint: "http://localhost:8317/v1/images/generations",
    payload: {},
    sourcePrompt: "",
    status: "running",
    createdAt: 0,
    startedAt: 1,
    endedAt: null,
    images: [],
    response: null,
    rawResponse: null,
    error: "",
    ...overrides,
  };
}

describe("request result", () => {
  test("summarizes generated image size and resolution", () => {
    expect(
      imageSizeBytes([
        imageFixture({ blob: new Blob(["first"], { type: "image/png" }) }),
        imageFixture({ blob: new Blob(["second"], { type: "image/png" }) }),
        imageFixture(),
      ]),
    ).toBe(11);

    expect(imageResolution([imageFixture({ width: 1024, height: 1536 })])).toBe("1024x1536");
    expect(imageResolution([imageFixture({ width: 1024 })])).toBe("");
    expect(imageResolution([])).toBe("");
  });

  test("selects runtime images from cached details when available", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:detail-runtime");
    const localImages = [imageFixture({ path: "local.png" })];
    const detailImages = [imageFixture({ path: "detail.png", blob: new Blob(["detail"], { type: "image/png" }) })];

    expect(runtimeImagesForRequest({ localImages, detailImages, keepRuntimeDetails: false })).toEqual([]);
    expect(runtimeImagesForRequest({ localImages, detailImages, keepRuntimeDetails: true })).toMatchObject([
      { src: "blob:detail-runtime", path: "detail.png", objectUrl: "blob:detail-runtime" },
    ]);
    expect(
      runtimeImagesForRequest({
        localImages,
        detailImages: [detailImages[0], imageFixture({ path: "extra.png" })],
        keepRuntimeDetails: true,
      }),
    ).toMatchObject([{ src: "data:image/png;base64,image-data", path: "local.png" }]);

    createObjectURL.mockRestore();
  });

  test("applies a completed request with cached detail metadata", () => {
    const thumbnail = imageFixture({ path: "thumbnail.png" });
    const result = applyCompletedRequestResult(requestRecordFixture(), {
      rawResponse: { data: [{ b64_json: "x".repeat(300) }] },
      displayResponse: { data: [{ b64_json: "[image data omitted, 300 chars]" }] },
      extractedImageCount: 1,
      localImages: [imageFixture({ path: "runtime.png" })],
      detailImages: [imageFixture({ width: 1440, height: 1080, blob: new Blob(["image-bytes"]) })],
      thumbnail,
      missingImageMessage: "",
      keepRuntimeDetails: true,
      endedAt: 20,
      completedAt: 30,
    });

    expect(result).toMatchObject({
      status: "done",
      error: "",
      endedAt: 20,
      completedAt: 30,
      imageCount: 1,
      imageSizeBytes: 11,
      imageResolution: "1440x1080",
      thumbnail,
      response: { data: [{ b64_json: "[image data omitted, 300 chars]" }] },
      rawResponse: { data: [{ b64_json: "x".repeat(300) }] },
      hasCachedDetails: true,
      editImages: [],
    });
    expect(result.images).toHaveLength(1);
  });

  test("keeps existing summary fields and omits runtime details when unselected", () => {
    const result = applyCompletedRequestResult(
      requestRecordFixture({ imageSizeBytes: 5, imageResolution: "512x512", completedAt: 10 }),
      {
        rawResponse: { data: [] },
        displayResponse: { data: [] },
        extractedImageCount: 0,
        localImages: [],
        detailImages: [imageFixture({ width: 1440, height: 1080, blob: new Blob(["image-bytes"]) })],
        thumbnail: null,
        missingImageMessage: "没有图片输出",
        keepRuntimeDetails: false,
        endedAt: 20,
        completedAt: 30,
      },
    );

    expect(result).toMatchObject({
      status: "error",
      error: "没有图片输出",
      response: null,
      rawResponse: null,
      images: [],
      imageCount: 0,
      imageSizeBytes: 5,
      imageResolution: "512x512",
      completedAt: 10,
      hasCachedDetails: true,
      editImages: [],
    });
  });

  test("applies failed request response details and sanitizes image fields", () => {
    const error = new Error("Request failed") as Error & { responseBody?: unknown };
    error.responseBody = { error: { message: "bad" }, image: "x".repeat(300) };

    const result = applyFailedRequestResult(requestRecordFixture(), {
      error,
      requestCanceledMessage: "请求已取消",
      endedAt: 20,
    });

    expect(result).toMatchObject({
      status: "error",
      error: "Request failed",
      response: { error: { message: "bad" }, image: "[image data omitted, 300 chars]" },
      rawResponse: error.responseBody,
      endedAt: 20,
      editImages: [],
    });
  });

  test("omits failed request response details when runtime details are not retained", () => {
    const error = new Error("Request failed") as Error & { responseBody?: unknown };
    error.responseBody = { error: { message: "bad" }, image: "x".repeat(300) };

    const result = applyFailedRequestResult(requestRecordFixture(), {
      error,
      requestCanceledMessage: "请求已取消",
      endedAt: 20,
      keepRuntimeDetails: false,
    });

    expect(result).toMatchObject({
      status: "error",
      error: "Request failed",
      response: null,
      rawResponse: null,
      hasCachedDetails: true,
      endedAt: 20,
      editImages: [],
    });
  });

  test("applies canceled requests without replacing existing response details", () => {
    const error = new Error("The operation was aborted") as Error & { responseBody?: unknown };
    error.name = "AbortError";
    error.responseBody = { error: "should be ignored" };
    const request = requestRecordFixture({ response: { existing: true }, rawResponse: { raw: true } });

    const result = applyFailedRequestResult(request, {
      error,
      requestCanceledMessage: "请求已取消",
      endedAt: 20,
    });

    expect(result).toMatchObject({
      status: "canceled",
      error: "请求已取消",
      response: { existing: true },
      rawResponse: { raw: true },
      endedAt: 20,
      editImages: [],
    });
  });
});
