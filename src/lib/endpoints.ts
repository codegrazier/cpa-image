export const DEFAULT_BASE_URL = "http://localhost:8317/v1";
export const CROSS_ORIGIN_PROXY_PREFIX = "https://proxy.cpa-image.site/?targetOrigin=";

function trimTrailingSlash(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function applyCrossOriginProxy(endpoint: string, enabled: boolean) {
  if (!enabled) return endpoint;
  return `${CROSS_ORIGIN_PROXY_PREFIX}${encodeURIComponent(endpoint)}`;
}

function routeFromBaseUrl(baseUrl: string, route: string) {
  const input = trimTrailingSlash(baseUrl || DEFAULT_BASE_URL);
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const routeWithoutV1 = normalizedRoute.replace(/^\/v1\//, "/");

  if (input.endsWith(normalizedRoute) || input.endsWith(routeWithoutV1)) {
    return input;
  }

  if (input.endsWith("/v1")) {
    return `${input}${routeWithoutV1}`;
  }

  return `${input}/v1${routeWithoutV1}`;
}

export function normalizeImageEndpoint(baseUrl: string, enableCrossOriginProxy = false) {
  return applyCrossOriginProxy(routeFromBaseUrl(baseUrl, "/v1/images/generations"), enableCrossOriginProxy);
}

export function normalizeResponsesEndpoint(baseUrl: string, enableCrossOriginProxy = false) {
  return applyCrossOriginProxy(routeFromBaseUrl(baseUrl, "/v1/responses"), enableCrossOriginProxy);
}

export function normalizeImageEditsEndpoint(baseUrl: string, enableCrossOriginProxy = false) {
  return applyCrossOriginProxy(routeFromBaseUrl(baseUrl, "/v1/images/edits"), enableCrossOriginProxy);
}

export function normalizeChatCompletionsEndpoint(baseUrl: string, enableCrossOriginProxy = false) {
  return applyCrossOriginProxy(routeFromBaseUrl(baseUrl, "/v1/chat/completions"), enableCrossOriginProxy);
}

export function normalizeModelsEndpoint(baseUrl: string, enableCrossOriginProxy = false) {
  return applyCrossOriginProxy(routeFromBaseUrl(baseUrl, "/v1/models"), enableCrossOriginProxy);
}
