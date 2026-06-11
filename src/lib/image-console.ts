export const STORAGE_KEY = "gpt-image-2-console-settings";
export const REQUEST_CACHE_KEY = "gpt-image-2-console-requests";
export const LAST_PROMPT_KEY = "gpt-image-2-console-last-prompt";
export const PROMPT_HISTORY_KEY = "gpt-image-2-console-prompt-history";
export const PINNED_PROMPT_HISTORY_KEY = "gpt-image-2-console-pinned-prompts";
export const REQUEST_DETAIL_DB_NAME = "gpt-image-2-console";
export const REQUEST_DETAIL_DB_VERSION = 1;
export const REQUEST_DETAIL_STORE_NAME = "request-details";

export const MIN_REQUEST_CONCURRENCY = 1;
export const MAX_REQUEST_CONCURRENCY = 100;
export const MIN_REQUEST_INTERVAL_SECONDS = 0;
export const MAX_REQUEST_INTERVAL_SECONDS = 3600;
export const MAX_IMAGE_COUNT = 100;
export const MAX_PROMPT_HISTORY = 20;

export const SIZE_OPTIONS = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
] as const;

export const QUALITY_OPTIONS = ["auto", "low", "medium", "high"] as const;
export const BACKGROUND_OPTIONS = ["auto", "opaque", "transparent"] as const;
export const OUTPUT_FORMAT_OPTIONS = ["png", "webp", "jpeg"] as const;

export type ImageSize = (typeof SIZE_OPTIONS)[number];
export type ImageQuality = (typeof QUALITY_OPTIONS)[number];
export type ImageBackground = (typeof BACKGROUND_OPTIONS)[number];
export type ImageOutputFormat = (typeof OUTPUT_FORMAT_OPTIONS)[number];
export type GenerationMethod = "gpt-image-2" | "image_generation" | "completions";
export type RequestStatus = "queued" | "running" | "done" | "error" | "canceled" | string;
export type RequestFilter = "all" | "active" | "done" | "failed";

export interface AppSettings {
  baseUrl: string;
  apiKey: string;
  rememberKey: boolean;
  model: string;
  llmModel: string;
  strictPrompt: boolean;
  requestConcurrency: number | string;
  requestIntervalSeconds: number | string;
  size: ImageSize;
  quality: ImageQuality;
  n: number | string;
  background: ImageBackground;
  outputFormat: ImageOutputFormat;
}

export interface GenerationValues extends AppSettings {
  prompt: string;
}

export interface ImageToolPayload {
  type: "image_generation";
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant" | string;
  content:
    | string
    | Array<{
        type?: string;
        text?: string;
        [key: string]: unknown;
      }>;
  [key: string]: unknown;
}

export interface PromptHistoryEntry {
  prompt: string;
  pinned: boolean;
}

export interface RequestPayload {
  model?: string;
  prompt?: string;
  input?: string;
  messages?: ChatCompletionMessage[];
  n?: number | string;
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
  response_format?: string;
  tools?: ImageToolPayload[];
  tool_choice?: {
    type: "image_generation";
  };
  [key: string]: unknown;
}

export interface GeneratedImage {
  src: string;
  kind: "base64" | "url";
  path: string;
  mimeType?: string;
  blob?: Blob;
  objectUrl?: string;
}

export interface ImageRequestRecord {
  id: string;
  title: string;
  index: number;
  total: number;
  method: GenerationMethod | "";
  endpoint: string;
  payload: RequestPayload;
  sourcePrompt: string;
  imageCount?: number;
  hasCachedDetails?: boolean;
  detailsMissing?: boolean;
  thumbnail?: GeneratedImage | null;
  status: RequestStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  completedAt?: number | null;
  images: GeneratedImage[];
  response: unknown;
  error: string;
  controller?: AbortController | null;
  cancelRequested?: boolean;
  apiKey?: string;
}

export interface CachedRequestRecord
  extends Omit<ImageRequestRecord, "images" | "response" | "controller" | "cancelRequested" | "apiKey"> {
  imageCount: number;
  hasCachedDetails: boolean;
  thumbnail?: GeneratedImage | null;
}

export const DEFAULTS: AppSettings = {
  baseUrl: "http://localhost:8317/v1",
  apiKey: "",
  rememberKey: false,
  model: "gpt-image-2",
  llmModel: "gpt-5.5",
  strictPrompt: true,
  requestConcurrency: 2,
  requestIntervalSeconds: 60,
  size: "auto",
  quality: "auto",
  n: 1,
  background: "auto",
  outputFormat: "png",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  queued: "排队中",
  running: "生成中",
  done: "完成",
  error: "失败",
  canceled: "已取消",
};

export const REQUEST_FILTER_LABELS: Record<RequestFilter, string> = {
  all: "全部",
  active: "进行中",
  done: "已完成",
  failed: "已失败",
};

export const REQUEST_FILTER_EMPTY_TEXT: Record<RequestFilter, string> = {
  all: "暂无请求",
  active: "暂无进行中请求",
  done: "暂无已完成请求",
  failed: "暂无失败或取消请求",
};

export function generationMethodDisplayName(method: GenerationMethod | "" | null | undefined) {
  if (method === "image_generation") return "responses";
  if (method === "completions") return "completions";
  return "generations";
}

function normalizePromptList(value: unknown, limit = MAX_PROMPT_HISTORY) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const prompt = String(item || "").trim();
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    normalized.push(prompt);

    if (normalized.length >= limit) break;
  }

  return normalized;
}

export function normalizePromptHistory(value: unknown) {
  return normalizePromptList(value, MAX_PROMPT_HISTORY);
}

export function normalizePinnedPromptHistory(value: unknown) {
  return normalizePromptList(value, Number.POSITIVE_INFINITY);
}

export function addPromptToHistory(history: unknown, prompt: unknown) {
  return normalizePromptHistory([String(prompt || "").trim(), ...normalizePromptHistory(history)]);
}

export function removePromptFromHistory(history: unknown, prompt: unknown) {
  const target = String(prompt || "").trim();
  return normalizePromptHistory(history).filter((item) => item !== target);
}

export function pinPromptHistory(history: unknown, prompt: unknown) {
  const target = String(prompt || "").trim();
  if (!target) return normalizePinnedPromptHistory(history);
  return normalizePinnedPromptHistory([target, ...normalizePinnedPromptHistory(history)]);
}

export function unpinPromptHistory(history: unknown, prompt: unknown) {
  const target = String(prompt || "").trim();
  return normalizePinnedPromptHistory(history).filter((item) => item !== target);
}

export function mergePromptHistoryForDisplay(pinnedHistory: unknown, history: unknown) {
  const pinned = normalizePinnedPromptHistory(pinnedHistory);
  const pinnedSet = new Set(pinned);
  const recent = normalizePromptHistory(history).filter((item) => !pinnedSet.has(item));

  return [...pinned.map((prompt) => ({ prompt, pinned: true })), ...recent.map((prompt) => ({ prompt, pinned: false }))];
}

const STRICT_PROMPT_PREFIX = [
  "请把下面的原始 Prompt 当作最终图像指令执行。",
  "不要改写、扩写、翻译、润色、补充主体、改变构图、改变风格、添加未出现的元素。",
  "保留原文的风格强度、氛围、姿态、镜头语言、材质和光影，不要把它改得更保守或更中性。",
  "不要删减关键词，不要替换成含糊说法，不要添加原文没有的内容。",
  "必须逐字保持原始 Prompt 的语义、语言和细节不变。",
  "",
  "原始 Prompt:",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function trimTrailingSlash(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function routeFromBaseUrl(baseUrl: string, route: string) {
  const input = trimTrailingSlash(baseUrl || DEFAULTS.baseUrl);
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

export function normalizeImageEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/images/generations");
}

export function normalizeResponsesEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/responses");
}

export function normalizeChatCompletionsEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/chat/completions");
}

export function normalizeModelsEndpoint(baseUrl: string) {
  return routeFromBaseUrl(baseUrl, "/v1/models");
}

export function applyPromptPolicy(prompt: string, strictPrompt = DEFAULTS.strictPrompt) {
  if (!strictPrompt) return prompt;
  return `${STRICT_PROMPT_PREFIX}\n${prompt}`;
}

export function stripPromptPolicy(prompt: unknown) {
  const text = String(prompt || "");
  const strictPrefix = `${STRICT_PROMPT_PREFIX}\n`;
  if (text.startsWith(strictPrefix)) {
    return text.slice(strictPrefix.length);
  }

  const marker = "原始 Prompt:\n";
  const markerIndex = text.indexOf(marker);
  if (markerIndex >= 0 && text.slice(0, markerIndex).includes("不要改写")) {
    return text.slice(markerIndex + marker.length);
  }

  return text;
}

export function payloadImageTool(payload: RequestPayload | undefined | null) {
  return Array.isArray(payload?.tools)
    ? payload.tools.find((tool) => tool?.type === "image_generation") || null
    : null;
}

export function payloadPrompt(payload: RequestPayload | undefined | null) {
  if (typeof payload?.prompt === "string") return payload.prompt;
  if (typeof payload?.input === "string") return payload.input;
  if (Array.isArray(payload?.messages)) {
    const message = [...payload.messages].reverse().find((item) => item?.role === "user") || payload.messages[0];
    if (typeof message?.content === "string") return message.content;
    if (Array.isArray(message?.content)) {
      return message.content
        .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
    }
  }
  return "";
}

export function payloadOutputFormat(payload: RequestPayload | undefined | null) {
  const tool = payloadImageTool(payload);
  return payload?.output_format || tool?.output_format || DEFAULTS.outputFormat;
}

export function payloadSize(payload: RequestPayload | undefined | null) {
  const tool = payloadImageTool(payload);
  return payload?.size || tool?.size || DEFAULTS.size;
}

export function reusablePromptForRequest(request: Pick<ImageRequestRecord, "payload" | "sourcePrompt">) {
  return String(request.sourcePrompt || stripPromptPolicy(payloadPrompt(request.payload))).trim();
}

export function revisedPromptForResponse(value: unknown) {
  const seenObjects = new WeakSet<object>();

  function walk(node: unknown): string {
    if (!node || typeof node !== "object") return "";
    if (seenObjects.has(node)) return "";
    seenObjects.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return "";
    }

    const record = node as Record<string, unknown>;
    for (const key of ["revised_prompt", "revisedPrompt"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    for (const child of Object.values(record)) {
      const found = walk(child);
      if (found) return found;
    }

    return "";
  }

  return walk(value);
}

export function imageCountFromValue(value: unknown) {
  const imageCount = Number.parseInt(String(value), 10);
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > MAX_IMAGE_COUNT) {
    throw new Error(`数量必须是 1 到 ${MAX_IMAGE_COUNT} 之间的整数。`);
  }
  return imageCount;
}

export function validatePromptAndOutput(values: Pick<GenerationValues, "prompt" | "background" | "outputFormat">) {
  const prompt = String(values.prompt || "").trim();

  if (!prompt) {
    throw new Error("Prompt 不能为空。");
  }

  if (values.background === "transparent" && values.outputFormat === "jpeg") {
    throw new Error("透明背景需要 png 或 webp 格式。");
  }

  return prompt;
}

export function buildPayload(values: Partial<GenerationValues> & Pick<GenerationValues, "prompt">): RequestPayload {
  const prompt = validatePromptAndOutput({
    prompt: values.prompt,
    background: values.background || DEFAULTS.background,
    outputFormat: values.outputFormat || DEFAULTS.outputFormat,
  });
  const imageCount = imageCountFromValue(values.n || DEFAULTS.n);
  const model = String(values.model || DEFAULTS.model).trim();

  if (!model) {
    throw new Error("生图模型不能为空。");
  }

  return {
    model,
    prompt: applyPromptPolicy(prompt, values.strictPrompt ?? DEFAULTS.strictPrompt),
    n: imageCount,
    size: values.size || DEFAULTS.size,
    quality: values.quality || DEFAULTS.quality,
    background: values.background || DEFAULTS.background,
    output_format: values.outputFormat || DEFAULTS.outputFormat,
    response_format: "b64_json",
  };
}

export function buildResponsesImagePayload(
  values: Partial<GenerationValues> & Pick<GenerationValues, "prompt">,
): RequestPayload {
  const prompt = validatePromptAndOutput({
    prompt: values.prompt,
    background: values.background || DEFAULTS.background,
    outputFormat: values.outputFormat || DEFAULTS.outputFormat,
  });
  const model = String(values.llmModel || DEFAULTS.llmModel).trim();
  imageCountFromValue(values.n || DEFAULTS.n);

  if (!model) {
    throw new Error("LLM 模型不能为空。");
  }

  return {
    model,
    input: applyPromptPolicy(prompt, values.strictPrompt ?? DEFAULTS.strictPrompt),
    tools: [
      {
        type: "image_generation",
        size: values.size || DEFAULTS.size,
        quality: values.quality || DEFAULTS.quality,
        background: values.background || DEFAULTS.background,
        output_format: values.outputFormat || DEFAULTS.outputFormat,
      },
    ],
    tool_choice: {
      type: "image_generation",
    },
  };
}

export function buildChatCompletionsImagePayload(
  values: Partial<GenerationValues> & Pick<GenerationValues, "prompt">,
): RequestPayload {
  const prompt = validatePromptAndOutput({
    prompt: values.prompt,
    background: values.background || DEFAULTS.background,
    outputFormat: values.outputFormat || DEFAULTS.outputFormat,
  });
  const model = String(values.llmModel || DEFAULTS.llmModel).trim();
  imageCountFromValue(values.n || DEFAULTS.n);

  if (!model) {
    throw new Error("LLM 模型不能为空。");
  }

  return {
    model,
    messages: [
      {
        role: "user",
        content: applyPromptPolicy(prompt, values.strictPrompt ?? DEFAULTS.strictPrompt),
      },
    ],
    tools: [
      {
        type: "image_generation",
        size: values.size || DEFAULTS.size,
        quality: values.quality || DEFAULTS.quality,
        background: values.background || DEFAULTS.background,
        output_format: values.outputFormat || DEFAULTS.outputFormat,
      },
    ],
    tool_choice: {
      type: "image_generation",
    },
  };
}

export function buildGenerationRequests(payload: RequestPayload) {
  const requestedCount = Number.parseInt(String(payload.n), 10);

  return Array.from({ length: requestedCount }, () => ({
    ...payload,
    n: 1,
  }));
}

export function buildResponsesImageRequests(payload: RequestPayload, count: unknown) {
  const requestedCount = imageCountFromValue(count);

  return Array.from({ length: requestedCount }, () => ({
    ...payload,
    tools: payload.tools?.map((tool) => ({ ...tool })) || [],
  }));
}

export function buildChatCompletionsImageRequests(payload: RequestPayload, count: unknown) {
  const requestedCount = imageCountFromValue(count);

  return Array.from({ length: requestedCount }, () => ({
    ...payload,
    messages: payload.messages?.map((message) => ({ ...message })) || [],
    tools: payload.tools?.map((tool) => ({ ...tool })) || [],
  }));
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeRequestConcurrency(value: unknown) {
  return normalizeInteger(value, Number(DEFAULTS.requestConcurrency), MIN_REQUEST_CONCURRENCY, MAX_REQUEST_CONCURRENCY);
}

export function normalizeRequestIntervalSeconds(value: unknown) {
  return normalizeInteger(
    value,
    Number(DEFAULTS.requestIntervalSeconds),
    MIN_REQUEST_INTERVAL_SECONDS,
    MAX_REQUEST_INTERVAL_SECONDS,
  );
}

export function requestControlSummary(settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">) {
  return `并发 ${normalizeRequestConcurrency(settings.requestConcurrency)} · 间隔 ${normalizeRequestIntervalSeconds(
    settings.requestIntervalSeconds,
  )}s`;
}

export function formatBatchPrefix(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}${day}-${hour}${minute}`;
}

export function nextRequestIndexForPrefix(batchPrefix: string, records: Array<Pick<ImageRequestRecord, "title">> = []) {
  const escapedPrefix = batchPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titlePattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);

  return records.reduce((nextIndex, request) => {
    const match = titlePattern.exec(String(request.title || ""));
    if (!match) return nextIndex;

    const index = Number.parseInt(match[1], 10);
    return Number.isInteger(index) ? Math.max(nextIndex, index + 1) : nextIndex;
  }, 1);
}

export function createRequestRecords(
  requestPayloads: RequestPayload[],
  endpoint: string,
  now = performance.now(),
  date = new Date(),
  existingRecords: Array<Pick<ImageRequestRecord, "title">> = [],
  method: GenerationMethod | "" = "",
): ImageRequestRecord[] {
  const batchPrefix = formatBatchPrefix(date);
  const startIndex = nextRequestIndexForPrefix(batchPrefix, existingRecords);

  return requestPayloads.map((payload, index) => ({
    id: `request-${Math.round(now)}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index + 1}`}`,
    title: `${batchPrefix}-${startIndex + index}`,
    index: startIndex + index,
    total: requestPayloads.length,
    method,
    endpoint,
    payload,
    sourcePrompt: stripPromptPolicy(payloadPrompt(payload)),
    status: "queued",
    createdAt: now,
    startedAt: null,
    endedAt: null,
    completedAt: null,
    images: [],
    response: null,
    error: "",
    controller: null,
    cancelRequested: false,
  }));
}

export function requestImageCount(request: Pick<ImageRequestRecord, "images" | "imageCount">) {
  return request.images?.length || request.imageCount || 0;
}

export function prepareRequestForCache(request: ImageRequestRecord): CachedRequestRecord {
  const status = request.status === "running" || request.status === "queued" ? "canceled" : request.status;
  const endedAt = request.endedAt ?? (status === "canceled" ? performance.now() : null);
  const error =
    request.status === "running" || request.status === "queued" ? "页面刷新，请求已中断。" : request.error || "";

  return {
    id: request.id,
    title: request.title,
    index: request.index,
    total: request.total,
    method: request.method || "",
    endpoint: request.endpoint,
    payload: request.payload,
    sourcePrompt: request.sourcePrompt || stripPromptPolicy(payloadPrompt(request.payload)),
    imageCount: requestImageCount(request),
    hasCachedDetails: Boolean(
      request.hasCachedDetails ||
        (request.images?.length || 0) > 0 ||
        request.response != null ||
        request.thumbnail,
    ),
    thumbnail: request.thumbnail ? serializeGeneratedImage(request.thumbnail) : null,
    status,
    createdAt: request.createdAt,
    startedAt: request.startedAt,
    endedAt,
    completedAt: request.completedAt ?? null,
    error,
  };
}

export function restoreCachedRequest(request: Partial<ImageRequestRecord & CachedRequestRecord>): ImageRequestRecord {
  const status = request.status === "running" || request.status === "queued" ? "canceled" : request.status || "canceled";

  return {
    id: String(request.id || `cached-${Date.now()}`),
    title: String(request.title || "cached-request"),
    index: Number.parseInt(String(request.index), 10) || 1,
    total: Number.parseInt(String(request.total), 10) || 1,
    method: request.method || "",
    endpoint: String(request.endpoint || ""),
    payload: request.payload || {},
    sourcePrompt: String(request.sourcePrompt || stripPromptPolicy(payloadPrompt(request.payload))),
    imageCount: Number.parseInt(String(request.imageCount), 10) || (Array.isArray(request.images) ? request.images.length : 0),
    hasCachedDetails: Boolean(request.hasCachedDetails || request.response != null || request.images?.length || request.thumbnail),
    detailsMissing: Boolean(request.detailsMissing),
    thumbnail: serializeGeneratedImage(request.thumbnail),
    status,
    createdAt: Number(request.createdAt) || 0,
    startedAt: Number(request.startedAt) || null,
    endedAt: Number(request.endedAt) || (status === "canceled" ? performance.now() : null),
    completedAt: Number(request.completedAt) || null,
    images: [],
    response: null,
    error:
      request.status === "running" || request.status === "queued" ? "页面刷新，请求已中断。" : request.error || "",
    controller: null,
    cancelRequested: false,
  };
}

export function cachedRequestRecords(records: ImageRequestRecord[] = []) {
  return records.map(prepareRequestForCache);
}

function serializeGeneratedImage(image: unknown): GeneratedImage | null {
  if (!image || typeof image !== "object") return null;

  const candidate = image as Partial<GeneratedImage>;
  const src = String(candidate.src || "").trim();
  const kind = candidate.kind === "url" ? "url" : candidate.kind === "base64" ? "base64" : "";
  const path = String(candidate.path || "").trim();

  if (!src || !kind || !path) return null;

  return {
    src,
    kind,
    path,
    mimeType: candidate.mimeType || undefined,
  };
}

export function requestMatchesFilter(request: Pick<ImageRequestRecord, "status">, filter: RequestFilter = "all") {
  const status = request?.status;
  const isActive = status === "queued" || status === "running";
  const isDone = status === "done";

  if (filter === "active") return isActive;
  if (filter === "done") return isDone;
  if (filter === "failed") return !isActive && !isDone;
  return true;
}

export function filteredRequestRecords(records: ImageRequestRecord[] = [], filter: RequestFilter = "all") {
  return records.filter((request) => requestMatchesFilter(request, filter));
}

export function sortedRequestRecordsForFilter(records: ImageRequestRecord[] = [], filter: RequestFilter = "all") {
  const filtered = filteredRequestRecords(records, filter);

  if (filter === "done") {
    return [...filtered].sort((a, b) => {
      const completedDiff =
        (b.completedAt ?? b.endedAt ?? Number.NEGATIVE_INFINITY) -
        (a.completedAt ?? a.endedAt ?? Number.NEGATIVE_INFINITY);
      if (completedDiff) return completedDiff;
      return b.createdAt - a.createdAt;
    });
  }

  return [...filtered].reverse();
}

export function requestFilterCounts(records: ImageRequestRecord[] = []) {
  return Object.fromEntries(
    Object.keys(REQUEST_FILTER_LABELS).map((filter) => [
      filter,
      filteredRequestRecords(records, filter as RequestFilter).length,
    ]),
  ) as Record<RequestFilter, number>;
}

function formatSeconds(milliseconds: number) {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

export function formatRequestTiming(
  request: Pick<ImageRequestRecord, "status" | "createdAt" | "startedAt" | "endedAt">,
  now = performance.now(),
) {
  const waitEnd = request.startedAt ?? request.endedAt ?? now;
  const waitText = `等待 ${formatSeconds(waitEnd - request.createdAt)}`;

  if (request.status === "queued") {
    return waitText;
  }

  const runStart = request.startedAt ?? request.createdAt;
  const runEnd = request.endedAt ?? now;
  const runLabel = request.status === "running" ? "已用" : "用时";
  return `${waitText} · ${runLabel} ${formatSeconds(runEnd - runStart)}`;
}

export function formatCompletionTime(completedAt: unknown) {
  const timestamp = Number(completedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "完成时间未记录";

  const date = new Date(timestamp);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `完成于 ${hour}:${minute}:${second}`;
}

export function detectMimeFromBase64(base64: unknown, fallbackFormat = "png") {
  const sample = String(base64 || "").slice(0, 16);
  if (sample.startsWith("iVBOR")) return "image/png";
  if (sample.startsWith("/9j/")) return "image/jpeg";
  if (sample.startsWith("UklG")) return "image/webp";
  if (sample.startsWith("R0lG")) return "image/gif";
  return `image/${fallbackFormat || "png"}`;
}

function imageDimensionsToThumbnail(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function dataUrlFromBlobThumbnail(blob: Blob, maxEdge = 160) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(blob);
    const { width, height } = imageDimensionsToThumbnail(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/webp", 0.82);
  } catch {
    return null;
  } finally {
    try {
      bitmap?.close?.();
    } catch {
      // Ignore bitmap cleanup failures.
    }
  }
}

export async function prepareImageForThumbnailCache(
  image: GeneratedImage,
  maxEdge = 160,
): Promise<GeneratedImage | null> {
  if (image.kind === "url") {
    return {
      src: image.src,
      kind: "url",
      path: image.path,
      mimeType: image.mimeType || "image/webp",
    };
  }

  const blob = imageBlobFromImage(image);
  if (!blob) {
    return null;
  }

  const thumbnailSrc = await dataUrlFromBlobThumbnail(blob, maxEdge);
  if (!thumbnailSrc) {
    return null;
  }

  return {
    src: thumbnailSrc,
    kind: "base64",
    path: image.path,
    mimeType: "image/webp",
  };
}

function base64ToDataUrl(value: unknown, fallbackFormat = "png") {
  const text = String(value || "").trim();
  if (text.startsWith("data:image/")) return text;
  const mime = detectMimeFromBase64(text, fallbackFormat);
  return `data:${mime};base64,${text}`;
}

function dataUrlMimeType(value: unknown, fallbackFormat = "png") {
  const text = String(value || "").trim();
  const match = /^data:(image\/[^;,]+);base64,/i.exec(text);
  return match?.[1] || detectMimeFromBase64(text, fallbackFormat);
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function imageFormatFromMimeType(mimeType: unknown) {
  return String(mimeType || "png").replace(/^image\//, "") || "png";
}

export function imageBlobFromDataUrl(value: unknown, fallbackFormat = "png") {
  const dataUrl = base64ToDataUrl(value, fallbackFormat);
  const match = /^data:(image\/[^;,]+);base64,(.*)$/is.exec(dataUrl);
  if (!match || typeof globalThis.atob !== "function" || typeof Blob === "undefined") return null;

  try {
    const binary = globalThis.atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: match[1] });
  } catch {
    return null;
  }
}

function imageBlobFromImage(image: GeneratedImage) {
  if (isBlob(image.blob)) return image.blob;
  if (image.kind !== "base64") return null;
  return imageBlobFromDataUrl(image.src, imageFormatFromMimeType(image.mimeType));
}

export function prepareImageForDetailCache(image: GeneratedImage): GeneratedImage | null {
  if (image.kind === "url") {
    return {
      src: image.src,
      kind: "url",
      path: image.path,
      mimeType: image.mimeType,
    };
  }

  const blob = imageBlobFromImage(image);
  if (blob) {
    return {
      src: "",
      kind: "base64",
      path: image.path,
      mimeType: blob.type || image.mimeType,
      blob,
    };
  }

  if (String(image.src || "").startsWith("data:image/")) {
    return {
      src: image.src,
      kind: "base64",
      path: image.path,
      mimeType: image.mimeType || dataUrlMimeType(image.src),
    };
  }

  return null;
}

export function prepareImageForRuntime(image: GeneratedImage): GeneratedImage {
  if (image.kind === "url") {
    return {
      src: image.src,
      kind: "url",
      path: image.path,
      mimeType: image.mimeType,
    };
  }

  const blob = imageBlobFromImage(image);
  if (blob && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    try {
      const objectUrl = URL.createObjectURL(blob);
      return {
        src: objectUrl,
        kind: "base64",
        path: image.path,
        mimeType: blob.type || image.mimeType,
        objectUrl,
      };
    } catch {
      // 预览 URL 创建失败时回退到原始 src，避免生成流程被中断。
    }
  }

  return {
    src: image.src,
    kind: "base64",
    path: image.path,
    mimeType: image.mimeType || dataUrlMimeType(image.src),
  };
}

function looksLikeBase64Image(value: unknown) {
  const text = String(value || "").trim();
  if (text.startsWith("data:image/")) return true;
  return text.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(text);
}

export function extractImages(response: unknown, fallbackFormat = "png") {
  const found: GeneratedImage[] = [];
  const seenObjects = new WeakSet<object>();
  const base64Keys = new Set(["b64_json", "image_base64", "base64", "image", "result"]);
  const urlKeys = new Set(["url", "image_url", "output_url"]);

  function addImage(item: GeneratedImage) {
    if (!item.src || found.some((existing) => existing.src === item.src)) return;
    found.push(item);
  }

  function walk(value: unknown, path = "$") {
    if (value == null) return;

    if (typeof value === "string") {
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/")) {
        addImage({
          src: value.startsWith("data:image/") ? value : value.trim(),
          kind: value.startsWith("data:image/") ? "base64" : "url",
          path,
          mimeType: value.startsWith("data:image/") ? dataUrlMimeType(value, fallbackFormat) : undefined,
        });
      }
      return;
    }

    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (typeof child === "string") {
        const text = child.trim();
        const outputFormat = isRecord(value) && typeof value.output_format === "string" ? value.output_format : fallbackFormat;

        if (base64Keys.has(key) && looksLikeBase64Image(text)) {
          const src = base64ToDataUrl(text, outputFormat);
          addImage({
            src,
            kind: "base64",
            path: childPath,
            mimeType: dataUrlMimeType(src, outputFormat),
          });
          continue;
        }

        if (urlKeys.has(key) && (text.startsWith("http://") || text.startsWith("https://"))) {
          addImage({
            src: text,
            kind: "url",
            path: childPath,
          });
          continue;
        }
      }

      walk(child, childPath);
    }
  }

  walk(response);
  return found;
}

function responseContainsKey(value: unknown, targetKey: string) {
  const seenObjects = new WeakSet<object>();

  function walk(node: unknown): boolean {
    if (!node || typeof node !== "object") return false;
    if (seenObjects.has(node)) return false;
    seenObjects.add(node);

    if (Array.isArray(node)) {
      return node.some((item) => walk(item));
    }

    return Object.entries(node).some(([key, child]) => key === targetKey || walk(child));
  }

  return walk(value);
}

export function missingImageOutputMessage(body: unknown) {
  if (responseContainsKey(body, "encrypted_content")) {
    return "响应中只有 encrypted_content，没有 image_generation_call.result；encrypted_content 是加密内容，不能解析为图片。";
  }

  return "响应中没有找到图片输出。";
}

export function sanitizeResponseForDisplay(value: unknown): unknown {
  const seenObjects = new WeakSet<object>();
  const largeImageKeys = new Set(["b64_json", "image_base64", "base64", "image", "result"]);

  function scrub(node: unknown, key = ""): unknown {
    if (typeof node === "string") {
      if ((largeImageKeys.has(key) || node.startsWith("data:image/")) && node.length > 240) {
        return `[image data omitted, ${node.length} chars]`;
      }
      return node;
    }

    if (!node || typeof node !== "object") return node;
    if (seenObjects.has(node)) return "[Circular]";
    seenObjects.add(node);

    if (Array.isArray(node)) {
      return node.map((item) => scrub(item));
    }

    return Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, scrub(child, childKey)]));
  }

  return scrub(value);
}

function errorDetailFromBody(body: unknown) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (!isRecord(body)) return String(body);

  const error = body.error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof error === "string") return error;
  if (typeof body.message === "string") return body.message;
  return JSON.stringify(sanitizeResponseForDisplay(body));
}

export function responseBodyHasError(body: unknown) {
  return Boolean(isRecord(body) && body.error);
}

export function responseErrorMessage(status: number, body: unknown) {
  const detail = errorDetailFromBody(body);
  const searchable = `${status} ${detail} ${JSON.stringify(sanitizeResponseForDisplay(body))}`.toLowerCase();

  if (status === 503 && searchable.includes("auth_unavailable")) {
    return [
      "HTTP 503 auth_unavailable：CLIProxyAPI 没有可用认证。",
      "请确认本页面 API Key 是 config.yaml 的 api-keys 中的一项；",
      "并确认代理端 auth-dir 中已有可用上游登录/导入凭据，且图片生成未被禁用。",
    ].join("");
  }

  if (status === 401 || searchable.includes("invalid api key")) {
    return "HTTP 401：API Key 未被 CLIProxyAPI 接受。请填写 config.yaml 的 api-keys 中配置的代理 key。";
  }

  if (status >= 200 && status < 300 && responseBodyHasError(body)) {
    const code = isRecord(body) && isRecord(body.error) && typeof body.error.code === "string" ? ` (${body.error.code})` : "";
    return `响应错误：${detail || "上游返回 error。"}${code}`;
  }

  return `HTTP ${status} ${detail}`;
}

export function imageDownloadName(request: Pick<ImageRequestRecord, "payload" | "title" | "method">, index = 0) {
  const format = payloadOutputFormat(request?.payload);
  const title = String(request?.title || "image").replace(/[^\w.-]+/g, "-");
  const prefix =
    request?.method === "image_generation"
      ? "image-generation"
      : request?.method === "completions"
        ? "completions"
        : "generations";
  return `${prefix}-${title}-${index + 1}.${format}`;
}
