import { describe, expect, test, vi } from "vitest";

import { postImageEdit, shouldRetryEditAsMultipart } from "@/lib/api";

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: "invalid_request", message, type: "invalid_request_error" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("image edit requests", () => {
  test("does not retry JSON-only upstreams as multipart", () => {
    expect(
      shouldRetryEditAsMultipart({
        status: 415,
        message: "图片编辑仅支持 application/json",
        responseBody: { error: { message: "图片编辑仅支持 application/json" } },
      }),
    ).toBe(false);
  });

  test("retries as multipart when the upstream requires form uploads", () => {
    expect(
      shouldRetryEditAsMultipart({
        status: 415,
        message: "This endpoint only accepts multipart/form-data",
      }),
    ).toBe(true);
  });

  test("sends OpenAI JSON image_url and grok-compatible url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postImageEdit(
      "http://localhost:8317/v1/images/edits",
      "test-key",
      { model: "gpt-image-2", prompt: "glass jellyfish", n: 1 },
      [{ src: "", name: "input.png", mimeType: "image/png", file: new File(["image-bytes"], "input.png", { type: "image/png" }) }],
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String((init.headers as Record<string, string>)["Content-Type"])).toContain("application/json");
    const body = JSON.parse(String(init.body));
    expect(body.images[0].image_url).toMatch(/^data:image\/png;base64,/);
    expect(body.images[0].url).toBe(body.images[0].image_url);
  });

  test("falls back to OpenAI multipart image[] when JSON is rejected for form-data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonError(415, "This endpoint only accepts multipart/form-data"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await postImageEdit(
      "http://localhost:8317/v1/images/edits",
      "test-key",
      { model: "gpt-image-2", prompt: "glass jellyfish", n: 1 },
      [{ src: "", name: "input.png", mimeType: "image/png", file: new File(["image-bytes"], "input.png", { type: "image/png" }) }],
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBeInstanceOf(FormData);
    const formData = fetchMock.mock.calls[1][1].body as FormData;
    expect(Array.from(formData.entries()).filter(([key]) => key === "image[]")).toHaveLength(1);
  });

  test("does not fall back to multipart for grok json-only errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonError(415, "图片编辑仅支持 application/json"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postImageEdit(
        "http://localhost:8317/v1/images/edits",
        "test-key",
        { model: "grok-imagine-image-edit", prompt: "glass jellyfish", n: 1 },
        [{ src: "", name: "input.png", mimeType: "image/png", file: new File(["image-bytes"], "input.png", { type: "image/png" }) }],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/application\/json/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
