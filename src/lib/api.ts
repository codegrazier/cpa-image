import { normalizeModelsEndpoint, responseBodyHasError, responseErrorMessage } from "@/lib/image-console";

export function authHeaders(apiKey: string, contentType: string | null = "application/json") {
  const headers: Record<string, string> = {
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function postImageGeneration(
  endpoint: string,
  apiKey: string,
  payload: unknown,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
    signal,
  });

  const body = await parseResponseBody(response);
  if (!response.ok || responseBodyHasError(body)) {
    const error = new Error(responseErrorMessage(response.status, body, language)) as Error & {
      responseBody?: unknown;
      status?: number;
    };
    error.responseBody = body;
    error.status = response.status;
    throw error;
  }

  return body;
}

export async function postImageEdit(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  images: Array<{ file?: File; blob?: Blob; name: string; mimeType?: string }>,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    if (key === "images") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item == null) continue;
        formData.append(key, typeof item === "string" ? item : JSON.stringify(item));
      }
      continue;
    }

    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
      continue;
    }

    formData.append(key, String(value));
  }

  for (const image of images) {
    const file = image.file || image.blob;
    if (!file) {
      throw new Error(language === "en" ? "Edit request is missing an uploadable image." : "编辑请求缺少可上传的图片。");
    }

    formData.append("image[]", file, image.name);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey, null),
    body: formData,
    signal,
  });

  const body = await parseResponseBody(response);
  if (!response.ok || responseBodyHasError(body)) {
    const error = new Error(responseErrorMessage(response.status, body, language)) as Error & {
      responseBody?: unknown;
      status?: number;
    };
    error.responseBody = body;
    error.status = response.status;
    throw error;
  }

  return body;
}

export async function fetchModels(baseUrl: string, apiKey: string, language: "zh" | "en" = "zh") {
  const endpoint = normalizeModelsEndpoint(baseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  const body = await parseResponseBody(response);

  if (!response.ok || responseBodyHasError(body)) {
    throw new Error(responseErrorMessage(response.status, body, language));
  }

  return { endpoint, body };
}
