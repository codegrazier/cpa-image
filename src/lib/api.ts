import { normalizeModelsEndpoint, responseBodyHasError, responseErrorMessage } from "@/lib/image-console";

export function authHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

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

export async function postImageGeneration(endpoint: string, apiKey: string, payload: unknown, signal: AbortSignal) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
    signal,
  });

  const body = await parseResponseBody(response);
  if (!response.ok || responseBodyHasError(body)) {
    const error = new Error(responseErrorMessage(response.status, body)) as Error & {
      responseBody?: unknown;
      status?: number;
    };
    error.responseBody = body;
    error.status = response.status;
    throw error;
  }

  return body;
}

export async function fetchModels(baseUrl: string, apiKey: string) {
  const endpoint = normalizeModelsEndpoint(baseUrl);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  const body = await parseResponseBody(response);

  if (!response.ok || responseBodyHasError(body)) {
    throw new Error(responseErrorMessage(response.status, body));
  }

  return { endpoint, body };
}
