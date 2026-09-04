import { normalizeModelsEndpoint } from "@/lib/endpoints";
import { responseBodyHasError, responseErrorMessage } from "@/lib/image-console";

export function authHeaders(apiKey: string, contentType: string | null = "application/json") {
  const headers: Record<string, string> = {};

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

async function validatedResponseBody(response: Response, language: "zh" | "en") {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorSearchText(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "").toLowerCase();
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const body = "responseBody" in error ? error.responseBody : null;
  const bodyText = typeof body === "string" ? body : isRecord(body) ? JSON.stringify(body) : "";
  return `${message}\n${bodyText}`.toLowerCase();
}

export function shouldRetryEditAsMultipart(error: unknown) {
  const searchable = errorSearchText(error);
  if (!searchable.trim()) return false;
  if (searchable.includes("application/json") && /only supports|仅支持/.test(searchable)) {
    return false;
  }
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  if (status === 415) return true;
  return /multipart|form-data|image\[\]/.test(searchable);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

async function editImageDataUrl(
  image: { src?: string; file?: File; blob?: Blob; mimeType?: string },
  language: "zh" | "en",
) {
  const src = String(image.src || "").trim();
  if (src.startsWith("data:image/")) return src;
  if (/^https?:\/\//i.test(src)) return src;

  const file = image.file || image.blob;
  if (!file) {
    throw new Error(language === "en" ? "Edit request is missing an uploadable image." : "编辑请求缺少可上传的图片。");
  }

  return blobToDataUrl(file);
}

async function jsonEditPayload(
  payload: Record<string, unknown>,
  images: Array<{ src?: string; file?: File; blob?: Blob; name: string; mimeType?: string }>,
  language: "zh" | "en",
) {
  const imageRefs = await Promise.all(
    images.map(async (image) => {
      const url = await editImageDataUrl(image, language);
      return { image_url: url, url };
    }),
  );

  return {
    ...payload,
    images: imageRefs,
  };
}

function editFormData(
  payload: Record<string, unknown>,
  images: Array<{ file?: File; blob?: Blob; name: string; mimeType?: string }>,
  language: "zh" | "en",
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

  return formData;
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

  return validatedResponseBody(response, language);
}

export async function postImageEdit(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  images: Array<{ src?: string; file?: File; blob?: Blob; name: string; mimeType?: string }>,
  signal: AbortSignal,
  language: "zh" | "en" = "zh",
) {
  const jsonPayload = await jsonEditPayload(payload, images, language);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(jsonPayload),
      signal,
    });
    return await validatedResponseBody(response, language);
  } catch (error) {
    if (signal.aborted || !shouldRetryEditAsMultipart(error)) {
      throw error;
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey, null),
    body: editFormData(payload, images, language),
    signal,
  });

  return validatedResponseBody(response, language);
}

export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  language: "zh" | "en" = "zh",
  enableCrossOriginProxy = false,
) {
  const endpoint = normalizeModelsEndpoint(baseUrl, enableCrossOriginProxy);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  return { endpoint, body: await validatedResponseBody(response, language) };
}
