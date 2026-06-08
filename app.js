const STORAGE_KEY = "gpt-image-2-console-settings";
const REQUEST_CACHE_KEY = "gpt-image-2-console-requests";
const LAST_PROMPT_KEY = "gpt-image-2-console-last-prompt";
const REQUEST_DETAIL_DB_NAME = "gpt-image-2-console";
const REQUEST_DETAIL_DB_VERSION = 1;
const REQUEST_DETAIL_STORE_NAME = "request-details";

const DEFAULTS = {
  baseUrl: "http://localhost:8317/v1",
  apiKey: "",
  rememberKey: false,
  model: "gpt-image-2",
  imageGenerationModel: "gpt-5.5",
  strictPrompt: true,
  requestConcurrency: 2,
  requestIntervalSeconds: 60,
  size: "auto",
  quality: "auto",
  n: 1,
  background: "auto",
  outputFormat: "png",
};

let requestRecords = [];
let selectedRequestId = null;
let requestTimer = null;
let queueTimer = null;
let lastRequestStartedAt = 0;
let selectedRequestFilter = "all";

const MIN_REQUEST_CONCURRENCY = 1;
const MAX_REQUEST_CONCURRENCY = 10;
const MIN_REQUEST_INTERVAL_SECONDS = 0;
const MAX_REQUEST_INTERVAL_SECONDS = 3600;
const MAX_IMAGE_COUNT = 100;

const STRICT_PROMPT_PREFIX = [
  "请把下面的原始 Prompt 当作最终图像指令执行。",
  "不要改写、扩写、翻译、润色、补充主体、改变构图、改变风格、添加未出现的元素。",
  "必须逐字保持原始 Prompt 的语义、语言和细节不变。",
  "",
  "原始 Prompt:",
].join("\n");

const REQUEST_STATUS_LABELS = {
  queued: "排队中",
  running: "生成中",
  done: "完成",
  error: "失败",
  canceled: "已取消",
};

const REQUEST_FILTER_LABELS = {
  all: "全部",
  active: "进行中",
  done: "已完成",
  failed: "已失败",
};

const REQUEST_FILTER_EMPTY_TEXT = {
  all: "暂无请求",
  active: "暂无进行中请求",
  done: "暂无已完成请求",
  failed: "暂无失败或取消请求",
};

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function routeFromBaseUrl(baseUrl, route) {
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

function normalizeImageEndpoint(baseUrl) {
  return routeFromBaseUrl(baseUrl, "/v1/images/generations");
}

function normalizeResponsesEndpoint(baseUrl) {
  return routeFromBaseUrl(baseUrl, "/v1/responses");
}

function normalizeModelsEndpoint(baseUrl) {
  return routeFromBaseUrl(baseUrl, "/v1/models");
}

function tryParseJson(value, label = "JSON") {
  const text = String(value || "").trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(`${label} 必须是对象。`);
    }
    return parsed;
  } catch (error) {
    if (error.message.includes("必须是对象")) throw error;
    throw new Error(`${label} 解析失败：${error.message}`);
  }
}

function applyPromptPolicy(prompt, strictPrompt = DEFAULTS.strictPrompt) {
  if (!strictPrompt) return prompt;
  return `${STRICT_PROMPT_PREFIX}\n${prompt}`;
}

function stripPromptPolicy(prompt) {
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

function reusablePromptForRequest(request) {
  return String(request.sourcePrompt || stripPromptPolicy(payloadPrompt(request.payload))).trim();
}

function loadLastPrompt() {
  try {
    return localStorage.getItem(LAST_PROMPT_KEY) || "";
  } catch {
    return "";
  }
}

function saveLastPrompt(prompt) {
  try {
    localStorage.setItem(LAST_PROMPT_KEY, String(prompt || ""));
  } catch {
    // Ignore prompt persistence failures; editing should continue normally.
  }
}

function fillPrompt(elements, prompt) {
  elements.prompt.value = String(prompt || "");
  saveLastPrompt(elements.prompt.value);
  elements.prompt.focus();
}

function imageCountFromValue(value) {
  const imageCount = Number.parseInt(value, 10);
  if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > MAX_IMAGE_COUNT) {
    throw new Error(`数量必须是 1 到 ${MAX_IMAGE_COUNT} 之间的整数。`);
  }
  return imageCount;
}

function validatePromptAndOutput(values) {
  const prompt = String(values.prompt || "").trim();

  if (!prompt) {
    throw new Error("Prompt 不能为空。");
  }

  if (values.background === "transparent" && values.outputFormat === "jpeg") {
    throw new Error("透明背景需要 png 或 webp 格式。");
  }

  return prompt;
}

function buildPayload(values) {
  const prompt = validatePromptAndOutput(values);
  const imageCount = imageCountFromValue(values.n);

  const payload = {
    model: DEFAULTS.model,
    prompt: applyPromptPolicy(prompt, values.strictPrompt ?? DEFAULTS.strictPrompt),
    n: imageCount,
    size: values.size || DEFAULTS.size,
    quality: values.quality || DEFAULTS.quality,
    background: values.background || DEFAULTS.background,
    output_format: values.outputFormat || DEFAULTS.outputFormat,
    response_format: "b64_json",
  };

  return payload;
}

function buildResponsesImagePayload(values) {
  const prompt = validatePromptAndOutput(values);
  const model = String(values.imageGenerationModel || DEFAULTS.imageGenerationModel).trim();
  imageCountFromValue(values.n);

  if (!model) {
    throw new Error("image_generation 模型不能为空。");
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

function buildGenerationRequests(payload) {
  const requestedCount = Number.parseInt(payload.n, 10);

  return Array.from({ length: requestedCount }, () => ({
    ...payload,
    n: 1,
  }));
}

function buildResponsesImageRequests(payload, count) {
  const requestedCount = imageCountFromValue(count);

  return Array.from({ length: requestedCount }, () => ({
    ...payload,
    tools: payload.tools.map((tool) => ({ ...tool })),
  }));
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRequestConcurrency(value) {
  return normalizeInteger(value, DEFAULTS.requestConcurrency, MIN_REQUEST_CONCURRENCY, MAX_REQUEST_CONCURRENCY);
}

function normalizeRequestIntervalSeconds(value) {
  return normalizeInteger(
    value,
    DEFAULTS.requestIntervalSeconds,
    MIN_REQUEST_INTERVAL_SECONDS,
    MAX_REQUEST_INTERVAL_SECONDS,
  );
}

function requestConcurrencyForElements(elements) {
  return normalizeRequestConcurrency(elements.requestConcurrency?.value);
}

function requestIntervalSecondsForElements(elements) {
  return normalizeRequestIntervalSeconds(elements.requestIntervalSeconds?.value);
}

function requestControlSummary(elements) {
  return `并发 ${requestConcurrencyForElements(elements)} · 间隔 ${requestIntervalSecondsForElements(elements)}s`;
}

function formatBatchPrefix(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}${day}-${hour}${minute}`;
}

function nextRequestIndexForPrefix(batchPrefix, records = []) {
  const escapedPrefix = batchPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titlePattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);

  return records.reduce((nextIndex, request) => {
    const match = titlePattern.exec(String(request.title || ""));
    if (!match) return nextIndex;

    const index = Number.parseInt(match[1], 10);
    return Number.isInteger(index) ? Math.max(nextIndex, index + 1) : nextIndex;
  }, 1);
}

function requestMatchesFilter(request, filter = "all") {
  const status = request?.status;
  const isActive = status === "queued" || status === "running";
  const isDone = status === "done";

  if (filter === "active") return isActive;
  if (filter === "done") return isDone;
  if (filter === "failed") return !isActive && !isDone;
  return true;
}

function filteredRequestRecords(records = [], filter = "all") {
  return records.filter((request) => requestMatchesFilter(request, filter));
}

function requestFilterCounts(records = []) {
  return Object.fromEntries(
    Object.keys(REQUEST_FILTER_LABELS).map((filter) => [
      filter,
      filteredRequestRecords(records, filter).length,
    ]),
  );
}

function createRequestRecords(
  requestPayloads,
  endpoint,
  now = performance.now(),
  date = new Date(),
  existingRecords = [],
  method = "",
) {
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
    images: [],
    response: null,
    error: "",
    controller: null,
    cancelRequested: false,
  }));
}

function requestImageCount(request) {
  return request.images?.length || request.imageCount || 0;
}

function prepareRequestForCache(request) {
  const status =
    request.status === "running" || request.status === "queued"
      ? "canceled"
      : request.status;
  const endedAt =
    request.endedAt ??
    (status === "canceled" ? performance.now() : null);
  const error =
    request.status === "running" || request.status === "queued"
      ? "页面刷新，请求已中断。"
      : request.error || "";

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
    hasCachedDetails: Boolean((request.images?.length || 0) > 0 || request.response != null),
    status,
    createdAt: request.createdAt,
    startedAt: request.startedAt,
    endedAt,
    error,
  };
}

function restoreCachedRequest(request) {
  const status =
    request.status === "running" || request.status === "queued"
      ? "canceled"
      : request.status;

  return {
    id: String(request.id || `cached-${Date.now()}`),
    title: String(request.title || "cached-request"),
    index: Number.parseInt(request.index, 10) || 1,
    total: Number.parseInt(request.total, 10) || 1,
    method: String(request.method || ""),
    endpoint: String(request.endpoint || ""),
    payload: request.payload || {},
    sourcePrompt: String(request.sourcePrompt || stripPromptPolicy(payloadPrompt(request.payload))),
    imageCount: Number.parseInt(request.imageCount, 10) || (Array.isArray(request.images) ? request.images.length : 0),
    hasCachedDetails: Boolean(request.hasCachedDetails || request.response != null || request.images?.length),
    detailsMissing: Boolean(request.detailsMissing),
    status,
    createdAt: Number(request.createdAt) || 0,
    startedAt: Number(request.startedAt) || null,
    endedAt: Number(request.endedAt) || (status === "canceled" ? performance.now() : null),
    images: Array.isArray(request.images) ? request.images : [],
    response: request.response ?? null,
    error:
      request.status === "running" || request.status === "queued"
        ? "页面刷新，请求已中断。"
        : request.error || "",
    controller: null,
    cancelRequested: false,
  };
}

function cachedRequestRecords(records = requestRecords) {
  return records.map(prepareRequestForCache);
}

function openRequestDetailDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REQUEST_DETAIL_DB_NAME, REQUEST_DETAIL_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REQUEST_DETAIL_STORE_NAME)) {
        db.createObjectStore(REQUEST_DETAIL_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败。"));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 操作失败。"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 事务失败。"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 事务已中止。"));
  });
}

function closeDb(db) {
  try {
    db?.close();
  } catch {
    // Ignore close failures.
  }
}

async function saveRequestDetails(records) {
  let db = null;

  try {
    db = await openRequestDetailDb();
    if (!db) return;

    const keepIds = new Set(records.map((request) => request.id));
    const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);

    for (const request of records) {
      if ((request.images?.length || 0) > 0 || request.response != null) {
        store.put({
          id: request.id,
          images: request.images || [],
          response: request.response ?? null,
          savedAt: Date.now(),
        });
      }
    }

    const keys = await requestToPromise(store.getAllKeys());
    for (const key of keys) {
      if (!keepIds.has(String(key))) {
        store.delete(key);
      }
    }

    await done;
  } catch {
    // The request list is still cached in localStorage even if large details cannot be stored.
  } finally {
    closeDb(db);
  }
}

async function hydrateRequestDetails(records) {
  let db = null;

  try {
    db = await openRequestDetailDb();
    if (!db) return records;

    const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);
    const hydrated = await Promise.all(
      records.map(async (request) => {
        if (!request.hasCachedDetails) return request;

        const detail = await requestToPromise(store.get(request.id));
        if (!detail) {
          return {
            ...request,
            detailsMissing: request.images.length === 0 && request.response == null,
          };
        }

        return {
          ...request,
          images: Array.isArray(detail.images) ? detail.images : request.images,
          response: detail.response ?? request.response,
          detailsMissing: false,
        };
      }),
    );

    await done;
    return hydrated;
  } catch {
    return records.map((request) => ({
      ...request,
      detailsMissing: request.hasCachedDetails && request.images.length === 0 && request.response == null,
    }));
  } finally {
    closeDb(db);
  }
}

function formatSeconds(milliseconds) {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function formatRequestTiming(request, now = performance.now()) {
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

function authHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function detectMimeFromBase64(base64, fallbackFormat = "png") {
  const sample = String(base64 || "").slice(0, 16);
  if (sample.startsWith("iVBOR")) return "image/png";
  if (sample.startsWith("/9j/")) return "image/jpeg";
  if (sample.startsWith("UklG")) return "image/webp";
  if (sample.startsWith("R0lG")) return "image/gif";
  return `image/${fallbackFormat || "png"}`;
}

function base64ToDataUrl(value, fallbackFormat = "png") {
  const text = String(value || "").trim();
  if (text.startsWith("data:image/")) return text;
  const mime = detectMimeFromBase64(text, fallbackFormat);
  return `data:${mime};base64,${text}`;
}

function looksLikeBase64Image(value) {
  const text = String(value || "").trim();
  if (text.startsWith("data:image/")) return true;
  return text.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(text);
}

function extractImages(response, fallbackFormat = "png") {
  const found = [];
  const seenObjects = new WeakSet();
  const base64Keys = new Set(["b64_json", "image_base64", "base64", "image", "result"]);
  const urlKeys = new Set(["url", "image_url", "output_url"]);

  function addImage(item) {
    if (!item.src || found.some((existing) => existing.src === item.src)) return;
    found.push(item);
  }

  function walk(value, path = "$") {
    if (value == null) return;

    if (typeof value === "string") {
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/")) {
        addImage({
          src: value.startsWith("data:image/") ? value : value.trim(),
          kind: value.startsWith("data:image/") ? "base64" : "url",
          path,
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

        if (base64Keys.has(key) && looksLikeBase64Image(text)) {
          addImage({
            src: base64ToDataUrl(text, value.output_format || fallbackFormat),
            kind: "base64",
            path: childPath,
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

function responseContainsKey(value, targetKey) {
  const seenObjects = new WeakSet();

  function walk(node) {
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

function missingImageOutputMessage(body) {
  if (responseContainsKey(body, "encrypted_content")) {
    return "响应中只有 encrypted_content，没有 image_generation_call.result；encrypted_content 是加密内容，不能解析为图片。";
  }

  return "响应中没有找到图片输出。";
}

function payloadImageTool(payload) {
  return Array.isArray(payload?.tools)
    ? payload.tools.find((tool) => tool?.type === "image_generation") || null
    : null;
}

function payloadPrompt(payload) {
  if (typeof payload?.prompt === "string") return payload.prompt;
  if (typeof payload?.input === "string") return payload.input;
  return "";
}

function payloadOutputFormat(payload) {
  const tool = payloadImageTool(payload);
  return payload?.output_format || tool?.output_format || DEFAULTS.outputFormat;
}

function payloadSize(payload) {
  const tool = payloadImageTool(payload);
  return payload?.size || tool?.size || DEFAULTS.size;
}

function sanitizeResponseForDisplay(value) {
  const seenObjects = new WeakSet();
  const largeImageKeys = new Set(["b64_json", "image_base64", "base64", "image", "result"]);

  function scrub(node, key = "") {
    if (typeof node === "string") {
      if ((largeImageKeys.has(key) || node.startsWith("data:image/")) && node.length > 240) {
        return `${node.slice(0, 120)}... [${node.length} chars]`;
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

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { ...DEFAULTS };

  try {
    return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(values) {
  const persisted = {
    baseUrl: values.baseUrl,
    model: DEFAULTS.model,
    imageGenerationModel: values.imageGenerationModel || DEFAULTS.imageGenerationModel,
    rememberKey: Boolean(values.rememberKey),
    strictPrompt: Boolean(values.strictPrompt),
    requestConcurrency: normalizeRequestConcurrency(values.requestConcurrency),
    requestIntervalSeconds: normalizeRequestIntervalSeconds(values.requestIntervalSeconds),
    size: values.size,
    quality: values.quality,
    n: values.n,
    background: values.background,
    outputFormat: values.outputFormat,
  };

  if (values.rememberKey) {
    persisted.apiKey = values.apiKey;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

async function clearRequestDetails() {
  let db = null;

  try {
    db = await openRequestDetailDb();
    if (!db) return;

    const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(REQUEST_DETAIL_STORE_NAME).clear();
    await done;
  } catch {
    // Ignore cache cleanup failures.
  } finally {
    closeDb(db);
  }
}

async function loadCachedRequests() {
  const stored = localStorage.getItem(REQUEST_CACHE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const restored = parsed.map(restoreCachedRequest);
    return hydrateRequestDetails(restored);
  } catch {
    return [];
  }
}

function saveCachedRequests(records = requestRecords) {
  const cached = cachedRequestRecords(records);
  const serialized = JSON.stringify(cached);

  try {
    localStorage.setItem(REQUEST_CACHE_KEY, serialized);
  } catch {
    try {
      localStorage.removeItem(REQUEST_CACHE_KEY);
    } catch {
      // Ignore quota failures; generation should continue even if history cannot persist.
    }
  }

  saveRequestDetails(records);
}

function clearCachedRequests() {
  localStorage.removeItem(REQUEST_CACHE_KEY);
  clearRequestDetails();
}

function formValues(elements) {
  return {
    baseUrl: elements.baseUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    rememberKey: elements.rememberKey.checked,
    model: DEFAULTS.model,
    imageGenerationModel: elements.imageGenerationModel.value.trim(),
    strictPrompt: elements.strictPrompt.checked,
    requestConcurrency: normalizeRequestConcurrency(elements.requestConcurrency.value),
    requestIntervalSeconds: normalizeRequestIntervalSeconds(elements.requestIntervalSeconds.value),
    prompt: elements.prompt.value,
    size: elements.size.value,
    quality: elements.quality.value,
    n: elements.n.value,
    background: elements.background.value,
    outputFormat: elements.outputFormat.value,
  };
}

function setStatus(elements) {
  elements.connectionStatus.textContent = "配置";
  elements.connectionStatus.removeAttribute("data-tone");
}

function setRequestState(elements, state, detail) {
  elements.requestState.textContent = state;
  elements.requestDetail.textContent = detail;
}

function updateEndpointPreview(elements) {
  const baseUrl = elements.baseUrl.value || DEFAULTS.baseUrl;
  const imageGenerationModel = elements.imageGenerationModel?.value.trim() || DEFAULTS.imageGenerationModel;
  elements.endpointPreview.textContent = [
    `gpt-image-2: ${normalizeImageEndpoint(baseUrl)}`,
    `image_generation (${imageGenerationModel}): ${normalizeResponsesEndpoint(baseUrl)}`,
  ].join("\n");
}

function applySettings(elements, settings) {
  elements.baseUrl.value = settings.baseUrl;
  elements.apiKey.value = settings.rememberKey ? settings.apiKey || "" : "";
  elements.rememberKey.checked = Boolean(settings.rememberKey);
  elements.model.value = DEFAULTS.model;
  elements.imageGenerationModel.value = settings.imageGenerationModel || DEFAULTS.imageGenerationModel;
  elements.strictPrompt.checked = settings.strictPrompt ?? DEFAULTS.strictPrompt;
  elements.requestConcurrency.value = normalizeRequestConcurrency(settings.requestConcurrency);
  elements.requestIntervalSeconds.value = normalizeRequestIntervalSeconds(settings.requestIntervalSeconds);
  elements.size.value = settings.size;
  elements.quality.value = settings.quality;
  elements.n.value = settings.n || DEFAULTS.n;
  elements.background.value = settings.background;
  elements.outputFormat.value = settings.outputFormat;
  updateEndpointPreview(elements);
  setStatus(elements);
}

function renderEmpty(elements, text = "暂无图片") {
  elements.gallery.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const span = document.createElement("span");
  span.textContent = text;
  empty.append(span);
  elements.gallery.append(empty);
}

function imageDownloadName(request, index = 0) {
  const format = payloadOutputFormat(request?.payload);
  const title = String(request?.title || "image").replace(/[^\w.-]+/g, "-");
  const prefix = request?.method === "image_generation" ? "image-generation" : "gpt-image-2";
  return `${prefix}-${title}-${index + 1}.${format}`;
}

function syncImageOrientation(img, card) {
  const setOrientation = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;

    if (img.naturalWidth > img.naturalHeight) {
      card.dataset.orientation = "landscape";
    } else if (img.naturalHeight > img.naturalWidth) {
      card.dataset.orientation = "portrait";
    } else {
      card.dataset.orientation = "square";
    }
  };

  if (img.complete) {
    setOrientation();
  } else {
    img.addEventListener("load", setOrientation, { once: true });
  }
}

function renderImages(elements, images, payload) {
  elements.gallery.innerHTML = "";

  if (!images.length) {
    renderEmpty(elements, "响应中没有找到图片");
    return;
  }

  images.forEach((image, index) => {
    const card = document.createElement("article");
    card.className = "image-card";

    const img = document.createElement("img");
    img.src = image.src;
    img.alt = `Generated image ${index + 1}`;
    img.loading = "lazy";

    syncImageOrientation(img, card);
    card.append(img);
    elements.gallery.append(card);
  });
}

function renderRawResponse(elements, response) {
  if (response == null) {
    elements.selectedRequestJson.hidden = true;
    elements.selectedRequestJson.disabled = true;
    elements.responseJsonContent.textContent = "";
    return;
  }

  elements.selectedRequestJson.hidden = false;
  elements.selectedRequestJson.disabled = false;
  elements.responseJsonContent.textContent = JSON.stringify(sanitizeResponseForDisplay(response), null, 2);
}

function selectedRequest() {
  return requestRecords.find((request) => request.id === selectedRequestId) || null;
}

function syncSelectedRequestWithFilter(filteredRequests) {
  if (!filteredRequests.length) {
    selectedRequestId = null;
    return;
  }

  if (!filteredRequests.some((request) => request.id === selectedRequestId)) {
    selectedRequestId = filteredRequests[filteredRequests.length - 1].id;
  }
}

function renderRequestFilterTabs(elements) {
  const counts = requestFilterCounts(requestRecords);

  for (const button of elements.requestFilterTabs.querySelectorAll("[data-request-filter]")) {
    const filter = button.dataset.requestFilter;
    const selected = filter === selectedRequestFilter;
    button.dataset.selected = selected ? "true" : "false";
    button.setAttribute("aria-selected", selected ? "true" : "false");

    const count = button.querySelector("small");
    if (count) {
      count.textContent = counts[filter] ?? 0;
    }
  }
}

function renderRequestList(elements) {
  elements.requestList.innerHTML = "";
  renderRequestFilterTabs(elements);
  elements.clearRequests.disabled = requestRecords.length === 0;

  const filteredRequests = filteredRequestRecords(requestRecords, selectedRequestFilter);
  syncSelectedRequestWithFilter(filteredRequests);
  const countText =
    selectedRequestFilter === "all" || requestRecords.length === 0
      ? `${requestRecords.length} 个`
      : `${filteredRequests.length}/${requestRecords.length} 个`;
  elements.requestListCount.textContent = `${countText} · ${requestControlSummary(elements)}`;

  if (!requestRecords.length) {
    const empty = document.createElement("div");
    empty.className = "request-list-empty";
    empty.textContent = "暂无请求";
    elements.requestList.append(empty);
    return;
  }

  if (!filteredRequests.length) {
    const empty = document.createElement("div");
    empty.className = "request-list-empty";
    empty.textContent = REQUEST_FILTER_EMPTY_TEXT[selectedRequestFilter] || "暂无请求";
    elements.requestList.append(empty);
    return;
  }

  [...filteredRequests].reverse().forEach((request) => {
    const selectRequest = () => {
      selectedRequestId = request.id;
      renderRequestList(elements);
      renderSelectedRequest(elements);
    };

    const row = document.createElement("article");
    row.className = "request-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `查看 ${request.title} 的生成结果`);
    row.dataset.requestId = request.id;
    row.dataset.status = request.status;
    row.dataset.selected = request.id === selectedRequestId ? "true" : "false";
    row.addEventListener("click", selectRequest);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectRequest();
    });

    const main = document.createElement("span");
    main.className = "request-row-main";

    const title = document.createElement("strong");
    title.textContent = request.title;

    const status = document.createElement("span");
    status.className = "request-status";
    status.textContent = REQUEST_STATUS_LABELS[request.status] || request.status;

    const timing = document.createElement("span");
    timing.className = "request-timing";
    timing.textContent = formatRequestTiming(request);

    const note = document.createElement("small");
    note.textContent =
      request.status === "done"
        ? `${requestImageCount(request)} 张图片`
        : request.error || `${request.method || "gpt-image-2"} · ${payloadSize(request.payload)} · n=1`;

    const side = document.createElement("span");
    side.className = "request-row-side";

    main.append(title, timing, note);
    side.append(status);
    row.append(main, side);
    elements.requestList.append(row);
  });
}

function renderSelectedRequestActions(elements, request) {
  if (!request) {
    elements.selectedRequestCancel.hidden = true;
    elements.selectedRequestCancel.disabled = true;
    elements.selectedRequestReuse.hidden = true;
    elements.selectedRequestReuse.disabled = true;
    elements.selectedRequestDownload.hidden = true;
    elements.selectedRequestDownload.removeAttribute("href");
    elements.selectedRequestDownload.removeAttribute("download");
    elements.selectedRequestJson.hidden = true;
    elements.selectedRequestJson.disabled = true;
    return;
  }

  const canCancel = request.status === "queued" || request.status === "running";
  elements.selectedRequestCancel.hidden = !canCancel;
  elements.selectedRequestCancel.disabled = !canCancel;
  elements.selectedRequestCancel.setAttribute("aria-label", `取消 ${request.title}`);

  elements.selectedRequestReuse.hidden = false;
  elements.selectedRequestReuse.disabled = !reusablePromptForRequest(request);
  elements.selectedRequestReuse.setAttribute("aria-label", `复用 ${request.title} 的 Prompt`);

  const firstImage = request.images?.[0];
  const canDownload = request.status === "done" && !request.detailsMissing && Boolean(firstImage?.src);
  elements.selectedRequestDownload.hidden = !canDownload;
  elements.selectedRequestDownload.setAttribute("aria-label", `下载 ${request.title}`);

  if (canDownload) {
    elements.selectedRequestDownload.href = firstImage.src;
    elements.selectedRequestDownload.download = imageDownloadName(request, 0);
  } else {
    elements.selectedRequestDownload.removeAttribute("href");
    elements.selectedRequestDownload.removeAttribute("download");
  }
}

function renderSelectedRequest(elements) {
  const request = selectedRequest();
  renderSelectedRequestActions(elements, request);

  if (!request) {
    elements.selectedRequestTitle.textContent = "未选择请求";
    elements.selectedRequestMeta.textContent = "生成后点击请求查看结果。";
    elements.selectedRequestElapsed.textContent = "-";
    renderEmpty(elements, "暂无图片");
    renderRawResponse(elements, null);
    return;
  }

  const statusText = REQUEST_STATUS_LABELS[request.status] || request.status;
  elements.selectedRequestTitle.textContent = request.title;
  elements.selectedRequestMeta.textContent = `${statusText} · ${request.endpoint}`;
  elements.selectedRequestElapsed.textContent = formatRequestTiming(request);

  if (request.status === "queued") {
    renderEmpty(elements, "该请求正在排队");
    renderRawResponse(elements, null);
    return;
  }

  if (request.status === "running") {
    renderEmpty(elements, "该请求正在等待响应");
    renderRawResponse(elements, null);
    return;
  }

  if (request.status === "canceled") {
    renderEmpty(elements, request.error || "该请求已取消");
    renderRawResponse(elements, request.response);
    return;
  }

  if (request.status === "error") {
    renderEmpty(elements, request.error || "该请求失败");
    renderRawResponse(elements, request.response);
    return;
  }

  if (request.detailsMissing) {
    renderEmpty(elements, "历史已恢复，图片详情未能从本地缓存读取。");
    renderRawResponse(elements, null);
    return;
  }

  renderImages(elements, request.images, request.payload);
  renderRawResponse(elements, request.response);
}

function renderRequestUi(elements) {
  renderRequestList(elements);
  renderSelectedRequest(elements);
}

function updateRequestTimingDisplays(elements) {
  for (const row of elements.requestList.querySelectorAll(".request-row")) {
    const request = requestRecords.find((item) => item.id === row.dataset.requestId);
    const timing = row.querySelector(".request-timing");
    if (request && timing) {
      timing.textContent = formatRequestTiming(request);
    }
  }

  const request = selectedRequest();
  if (request) {
    elements.selectedRequestElapsed.textContent = formatRequestTiming(request);
  }
}

function startRequestTimer(elements) {
  if (requestTimer) return;
  requestTimer = window.setInterval(() => {
    updateRequestTimingDisplays(elements);
  }, 300);
}

function stopRequestTimer() {
  window.clearInterval(requestTimer);
  requestTimer = null;
}

function stopQueueTimer() {
  window.clearTimeout(queueTimer);
  queueTimer = null;
}

function resetRequestUi(elements, detailText = "等待下一次生成。") {
  for (const request of requestRecords) {
    request.controller?.abort();
  }
  stopRequestTimer();
  stopQueueTimer();
  requestRecords = [];
  selectedRequestId = null;
  clearCachedRequests();
  renderRequestUi(elements);
  setRequestState(elements, "已清空", detailText);
}

function activeRequests() {
  return requestRecords.filter((request) => request.status === "queued" || request.status === "running");
}

function cancelRequestRecord(request, elements) {
  if (!request || (request.status !== "queued" && request.status !== "running")) return;

  const now = performance.now();
  const wasQueued = request.status === "queued";

  request.cancelRequested = true;
  if (request.status === "running") {
    request.controller?.abort();
  }

  request.status = "canceled";
  request.endedAt = now;
  request.error = wasQueued ? "请求已取消，未发送。" : "请求已取消";

  saveCachedRequests();
  renderRequestUi(elements);
  updateQueueState(elements);
  setRequestState(elements, "已取消请求", request.title);

  if (wasQueued) {
    scheduleQueue(elements);
  }
}

function updateQueueState(elements) {
  const runningCount = requestRecords.filter((request) => request.status === "running").length;
  const queuedCount = requestRecords.filter((request) => request.status === "queued").length;
  const doneCount = requestRecords.filter((request) => request.status === "done").length;
  const failedCount = requestRecords.filter((request) => request.status === "error").length;
  const canceledCount = requestRecords.filter((request) => request.status === "canceled").length;
  const imageCount = requestRecords.reduce((sum, request) => sum + requestImageCount(request), 0);

  if (runningCount + queuedCount > 0) {
    setRequestState(
      elements,
      "队列运行中",
      `${requestControlSummary(elements)} · 运行 ${runningCount} · 排队 ${queuedCount} · 完成 ${doneCount} · 失败 ${failedCount}`,
    );
    startRequestTimer(elements);
    return;
  }

  stopRequestTimer();
  stopQueueTimer();
  lastRequestStartedAt = 0;
  if (!requestRecords.length) {
    setRequestState(elements, "等待生成", "配置 URL 和 API Key 后即可开始。");
    return;
  }

  setRequestState(
    elements,
    `队列完成 ${imageCount} 张`,
    `${requestControlSummary(elements)} · 完成 ${doneCount} · 失败 ${failedCount} · 取消 ${canceledCount}`,
  );
}

function cancelActiveRequests(elements) {
  const now = performance.now();

  for (const request of requestRecords) {
    if (request.status === "running") {
      request.cancelRequested = true;
      request.controller?.abort();
      request.status = "canceled";
      request.endedAt = now;
      request.error = "请求已取消";
    } else if (request.status === "queued") {
      request.cancelRequested = true;
      request.status = "canceled";
      request.endedAt = now;
      request.error = "请求已取消，未发送。";
    }
  }

  saveCachedRequests();
  renderRequestUi(elements);
  updateQueueState(elements);
  scheduleQueue(elements);
}

function openSettingsDialog(elements) {
  if (elements.settingsDialog.open) return;
  elements.settingsDialog.showModal();
}

function closeSettingsDialog(elements) {
  if (!elements.settingsDialog.open) return;
  elements.settingsDialog.close();
}

function openClearRequestsDialog(elements) {
  if (!requestRecords.length || elements.clearRequestsDialog.open) return;
  elements.clearRequestsDialog.showModal();
}

function closeClearRequestsDialog(elements) {
  if (!elements.clearRequestsDialog.open) return;
  elements.clearRequestsDialog.close();
}

function openResponseJsonDialog(elements) {
  if (!elements.responseJsonContent.textContent || elements.responseJsonDialog.open) return;
  elements.responseJsonDialog.showModal();
}

function closeResponseJsonDialog(elements) {
  if (!elements.responseJsonDialog.open) return;
  elements.responseJsonDialog.close();
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorDetailFromBody(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body.error?.message) return body.error.message;
  if (typeof body.error === "string") return body.error;
  if (body.message) return body.message;
  return JSON.stringify(sanitizeResponseForDisplay(body));
}

function responseBodyHasError(body) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) && body.error);
}

function responseErrorMessage(status, body) {
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
    const code = body?.error?.code ? ` (${body.error.code})` : "";
    return `响应错误：${detail || "上游返回 error。"}${code}`;
  }

  return `HTTP ${status} ${detail}`;
}

async function testConnection(elements) {
  const values = formValues(elements);
  const endpoint = normalizeModelsEndpoint(values.baseUrl);

  setStatus(elements, "测试中", "busy");
  setRequestState(elements, "测试连接", endpoint);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: authHeaders(values.apiKey),
    });
    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw new Error(responseErrorMessage(response.status, body));
    }

    if (responseBodyHasError(body)) {
      throw new Error(responseErrorMessage(response.status, body));
    }

    setStatus(elements, "连接正常", "ok");
    setRequestState(elements, "连接正常", "模型列表接口已返回。");
    renderRawResponse(elements, body);
  } catch (error) {
    setStatus(elements, "连接失败", "error");
    setRequestState(elements, "连接失败", error.message);
  }
}

async function postImageGeneration(endpoint, apiKey, payload, signal) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(payload),
    signal,
  });

  const body = await parseResponseBody(response);
  if (!response.ok) {
    const error = new Error(responseErrorMessage(response.status, body));
    error.responseBody = body;
    error.status = response.status;
    throw error;
  }

  if (responseBodyHasError(body)) {
    const error = new Error(responseErrorMessage(response.status, body));
    error.responseBody = body;
    error.status = response.status;
    throw error;
  }

  return body;
}

async function runRequest(request, elements) {
  request.status = "running";
  request.startedAt = performance.now();
  request.controller = new AbortController();
  renderRequestUi(elements);
  updateQueueState(elements);

  try {
    const body = await postImageGeneration(
      request.endpoint,
      request.apiKey,
      request.payload,
      request.controller.signal,
    );

    if (request.cancelRequested) {
      request.status = "canceled";
      request.error = "请求已取消";
      request.endedAt = request.endedAt ?? performance.now();
      return;
    }

    const images = extractImages(body, payloadOutputFormat(request.payload)).map((image) => ({
      ...image,
      path: `${request.title} · ${image.path}`,
    }));

    request.response = body;
    request.images = images;
    request.status = images.length ? "done" : "error";
    request.error = images.length ? "" : missingImageOutputMessage(body);
    request.endedAt = performance.now();
  } catch (error) {
    if (error.name === "AbortError") {
      request.status = "canceled";
      request.error = "请求已取消";
    } else {
      request.status = "error";
      request.error = error.message;
      request.response = error.responseBody ?? null;
    }

    request.endedAt = performance.now();
  } finally {
    request.controller = null;
    saveCachedRequests();
    renderRequestUi(elements);
    updateQueueState(elements);
    scheduleQueue(elements);
  }
}

function scheduleQueue(elements) {
  if (queueTimer) return;

  const runningCount = requestRecords.filter((request) => request.status === "running").length;
  const openSlots = Math.max(0, requestConcurrencyForElements(elements) - runningCount);
  const [nextRequest] = requestRecords.filter((request) => request.status === "queued").slice(0, openSlots);

  if (!nextRequest) {
    updateQueueState(elements);
    return;
  }

  const intervalMs = requestIntervalSecondsForElements(elements) * 1000;
  const elapsedSinceLastStart = lastRequestStartedAt ? performance.now() - lastRequestStartedAt : intervalMs;
  const delayMs = Math.max(0, intervalMs - elapsedSinceLastStart);

  if (delayMs > 0) {
    queueTimer = window.setTimeout(() => {
      queueTimer = null;
      scheduleQueue(elements);
    }, delayMs);
    updateQueueState(elements);
    return;
  }

  lastRequestStartedAt = performance.now();
  runRequest(nextRequest, elements);
  scheduleQueue(elements);
  updateQueueState(elements);
}

function enqueueGeneration(elements, mode = "images") {
  if (!elements.generateForm.reportValidity()) return;

  const values = formValues(elements);
  saveLastPrompt(values.prompt);
  const isResponsesMode = mode === "responses";
  let payload;
  let requestPayloads;

  try {
    if (isResponsesMode) {
      payload = buildResponsesImagePayload(values);
      requestPayloads = buildResponsesImageRequests(payload, values.n);
    } else {
      payload = buildPayload(values);
      requestPayloads = buildGenerationRequests(payload);
    }
  } catch (error) {
    setRequestState(elements, "请求未创建", error.message);
    return;
  }

  const endpoint = isResponsesMode ? normalizeResponsesEndpoint(values.baseUrl) : normalizeImageEndpoint(values.baseUrl);
  const method = isResponsesMode ? "image_generation" : "gpt-image-2";
  const now = performance.now();
  const date = new Date();

  saveSettings(values);
  const newRequests = createRequestRecords(requestPayloads, endpoint, now, date, requestRecords, method).map(
    (request) => ({
      ...request,
      apiKey: values.apiKey,
    }),
  );

  requestRecords = [...requestRecords, ...newRequests];
  selectedRequestId = newRequests[0]?.id || selectedRequestId;
  saveCachedRequests();
  renderRequestUi(elements);
  setRequestState(
    elements,
    "请求已加入队列",
    `${method} · ${newRequests.length} 个新请求 · ${requestControlSummary(elements)} · ${endpoint}`,
  );
  scheduleQueue(elements);
}

function generateImage(elements) {
  enqueueGeneration(elements, "images");
}

function generateResponsesImage(elements) {
  enqueueGeneration(elements, "responses");
}

function collectElements() {
  return {
    settingsForm: document.querySelector("#settingsForm"),
    settingsDialog: document.querySelector("#settingsDialog"),
    generateForm: document.querySelector("#generateForm"),
    connectionStatus: document.querySelector("#connectionStatus"),
    baseUrl: document.querySelector("#baseUrl"),
    apiKey: document.querySelector("#apiKey"),
    rememberKey: document.querySelector("#rememberKey"),
    model: document.querySelector("#model"),
    imageGenerationModel: document.querySelector("#imageGenerationModel"),
    requestConcurrency: document.querySelector("#requestConcurrency"),
    requestIntervalSeconds: document.querySelector("#requestIntervalSeconds"),
    strictPrompt: document.querySelector("#strictPrompt"),
    prompt: document.querySelector("#prompt"),
    size: document.querySelector("#size"),
    quality: document.querySelector("#quality"),
    n: document.querySelector("#n"),
    background: document.querySelector("#background"),
    outputFormat: document.querySelector("#outputFormat"),
    endpointPreview: document.querySelector("#endpointPreview"),
    saveSettings: document.querySelector("#saveSettings"),
    resetSettings: document.querySelector("#resetSettings"),
    closeSettings: document.querySelector("#closeSettings"),
    testConnection: document.querySelector("#testConnection"),
    generateButton: document.querySelector("#generateButton"),
    imageGenerationButton: document.querySelector("#imageGenerationButton"),
    clearRequests: document.querySelector("#clearRequests"),
    clearRequestsDialog: document.querySelector("#clearRequestsDialog"),
    closeClearRequests: document.querySelector("#closeClearRequests"),
    cancelClearRequests: document.querySelector("#cancelClearRequests"),
    confirmClearRequests: document.querySelector("#confirmClearRequests"),
    requestState: document.querySelector("#requestState"),
    requestDetail: document.querySelector("#requestDetail"),
    requestListCount: document.querySelector("#requestListCount"),
    requestFilterTabs: document.querySelector("#requestFilterTabs"),
    requestList: document.querySelector("#requestList"),
    selectedRequestTitle: document.querySelector("#selectedRequestTitle"),
    selectedRequestMeta: document.querySelector("#selectedRequestMeta"),
    selectedRequestCancel: document.querySelector("#selectedRequestCancel"),
    selectedRequestReuse: document.querySelector("#selectedRequestReuse"),
    selectedRequestDownload: document.querySelector("#selectedRequestDownload"),
    selectedRequestJson: document.querySelector("#selectedRequestJson"),
    selectedRequestElapsed: document.querySelector("#selectedRequestElapsed"),
    gallery: document.querySelector("#gallery"),
    responseJsonDialog: document.querySelector("#responseJsonDialog"),
    closeResponseJson: document.querySelector("#closeResponseJson"),
    responseJsonContent: document.querySelector("#responseJsonContent"),
  };
}

async function initApp() {
  const elements = collectElements();
  applySettings(elements, loadSettings());
  elements.prompt.value = loadLastPrompt();
  requestRecords = await loadCachedRequests();
  selectedRequestId = requestRecords[requestRecords.length - 1]?.id || null;
  renderRequestUi(elements);
  updateQueueState(elements);

  elements.connectionStatus.addEventListener("click", () => {
    openSettingsDialog(elements);
  });

  elements.closeSettings.addEventListener("click", () => {
    closeSettingsDialog(elements);
  });

  elements.settingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.settingsDialog) {
      closeSettingsDialog(elements);
    }
  });

  elements.clearRequestsDialog.addEventListener("click", (event) => {
    if (event.target === elements.clearRequestsDialog) {
      closeClearRequestsDialog(elements);
    }
  });

  elements.responseJsonDialog.addEventListener("click", (event) => {
    if (event.target === elements.responseJsonDialog) {
      closeResponseJsonDialog(elements);
    }
  });

  elements.baseUrl.addEventListener("input", () => updateEndpointPreview(elements));
  elements.imageGenerationModel.addEventListener("input", () => updateEndpointPreview(elements));
  elements.requestConcurrency.addEventListener("input", () => renderRequestUi(elements));
  elements.requestIntervalSeconds.addEventListener("input", () => renderRequestUi(elements));
  elements.prompt.addEventListener("input", () => {
    saveLastPrompt(elements.prompt.value);
  });
  elements.requestFilterTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-request-filter]");
    if (!button || !elements.requestFilterTabs.contains(button)) return;

    const filter = button.dataset.requestFilter;
    if (!REQUEST_FILTER_LABELS[filter] || filter === selectedRequestFilter) return;

    selectedRequestFilter = filter;
    renderRequestUi(elements);
  });
  elements.clearRequests.addEventListener("click", () => {
    openClearRequestsDialog(elements);
  });
  elements.closeClearRequests.addEventListener("click", () => {
    closeClearRequestsDialog(elements);
  });
  elements.cancelClearRequests.addEventListener("click", () => {
    closeClearRequestsDialog(elements);
  });
  elements.confirmClearRequests.addEventListener("click", () => {
    closeClearRequestsDialog(elements);
    resetRequestUi(elements, "所有请求缓存已清空。");
  });
  elements.saveSettings.addEventListener("click", () => {
    const values = formValues(elements);
    saveSettings(values);
    elements.requestConcurrency.value = values.requestConcurrency;
    elements.requestIntervalSeconds.value = values.requestIntervalSeconds;
    elements.imageGenerationModel.value = values.imageGenerationModel || DEFAULTS.imageGenerationModel;
    setStatus(elements, "已保存", "ok");
    updateEndpointPreview(elements);
    setRequestState(
      elements,
      "设置已保存",
      `${requestControlSummary(elements)} · image_generation ${elements.imageGenerationModel.value}`,
    );
    stopQueueTimer();
    scheduleQueue(elements);
    closeSettingsDialog(elements);
  });

  elements.resetSettings.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    applySettings(elements, { ...DEFAULTS });
    setRequestState(elements, "已重置", "默认 URL 已恢复。");
  });

  elements.testConnection.addEventListener("click", () => {
    testConnection(elements);
  });

  elements.selectedRequestCancel.addEventListener("click", () => {
    cancelRequestRecord(selectedRequest(), elements);
  });

  elements.selectedRequestReuse.addEventListener("click", () => {
    const request = selectedRequest();
    if (!request) return;

    fillPrompt(elements, reusablePromptForRequest(request));
    setRequestState(elements, "Prompt 已回填", request.title);
  });

  elements.selectedRequestJson.addEventListener("click", () => {
    openResponseJsonDialog(elements);
  });

  elements.closeResponseJson.addEventListener("click", () => {
    closeResponseJsonDialog(elements);
  });

  elements.generateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    generateImage(elements);
  });

  elements.imageGenerationButton.addEventListener("click", () => {
    generateResponsesImage(elements);
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", initApp);
}

export {
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
  formatRequestTiming,
  missingImageOutputMessage,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  reusablePromptForRequest,
  requestFilterCounts,
  restoreCachedRequest,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeResponsesEndpoint,
  responseErrorMessage,
  responseBodyHasError,
  sanitizeResponseForDisplay,
  stripPromptPolicy,
};
