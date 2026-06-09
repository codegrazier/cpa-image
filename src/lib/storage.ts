import {
  cachedRequestRecords,
  DEFAULTS,
  LAST_PROMPT_KEY,
  normalizePromptHistory,
  prepareImageForDetailCache,
  PROMPT_HISTORY_KEY,
  REQUEST_CACHE_KEY,
  REQUEST_DETAIL_DB_NAME,
  REQUEST_DETAIL_DB_VERSION,
  REQUEST_DETAIL_STORE_NAME,
  restoreCachedRequest,
  STORAGE_KEY,
  type AppSettings,
  type GeneratedImage,
  type ImageRequestRecord,
} from "@/lib/image-console";

interface RequestDetailEntry {
  id: string;
  images: GeneratedImage[];
  response: unknown;
  savedAt: number;
}

interface SaveRequestDetailsOptions {
  prune?: boolean;
}

export function loadSettings(): AppSettings {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { ...DEFAULTS };

  try {
    return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(values: AppSettings) {
  const persisted: Partial<AppSettings> = {
    baseUrl: values.baseUrl,
    model: DEFAULTS.model,
    imageGenerationModel: values.imageGenerationModel || DEFAULTS.imageGenerationModel,
    rememberKey: Boolean(values.rememberKey),
    strictPrompt: Boolean(values.strictPrompt),
    requestConcurrency: values.requestConcurrency,
    requestIntervalSeconds: values.requestIntervalSeconds,
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

export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadLastPrompt() {
  try {
    return localStorage.getItem(LAST_PROMPT_KEY) || "";
  } catch {
    return "";
  }
}

export function saveLastPrompt(prompt: string) {
  try {
    localStorage.setItem(LAST_PROMPT_KEY, String(prompt || ""));
  } catch {
    // 忽略草稿保存失败，避免影响用户继续编辑。
  }
}

export function loadPromptHistory() {
  try {
    const stored = localStorage.getItem(PROMPT_HISTORY_KEY);
    return normalizePromptHistory(stored ? JSON.parse(stored) : []);
  } catch {
    return [];
  }
}

export function savePromptHistory(history: string[]) {
  try {
    localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(normalizePromptHistory(history)));
  } catch {
    // 历史 Prompt 只是辅助信息，写入失败时不影响生成。
  }
}

function openRequestDetailDb(): Promise<IDBDatabase | null> {
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

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 操作失败。"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 事务失败。"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 事务已中止。"));
  });
}

function closeDb(db: IDBDatabase | null) {
  try {
    db?.close();
  } catch {
    // Ignore close failures.
  }
}

function requestDetailEntryFromRecord(request: ImageRequestRecord): RequestDetailEntry | null {
  const images: GeneratedImage[] = [];
  let hasRuntimeOnlyImage = false;

  for (const image of request.images || []) {
    const cacheableImage = prepareImageForDetailCache(image);
    if (cacheableImage) {
      images.push(cacheableImage);
      continue;
    }

    if (image.kind === "base64" && String(image.src || "").startsWith("blob:")) {
      hasRuntimeOnlyImage = true;
    }
  }

  if (hasRuntimeOnlyImage) return null;
  if (!images.length && request.response == null) return null;

  return {
    id: request.id,
    images,
    response: request.response ?? null,
    savedAt: Date.now(),
  };
}

export async function saveRequestDetails(records: ImageRequestRecord[], options: SaveRequestDetailsOptions = {}) {
  let db: IDBDatabase | null = null;

  try {
    db = await openRequestDetailDb();
    if (!db) return;

    const prune = options.prune ?? true;
    const keepIds = new Set(records.map((request) => request.id));
    const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);

    for (const request of records) {
      const entry = requestDetailEntryFromRecord(request);
      if (entry) store.put(entry);
    }

    if (prune) {
      const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());
      for (const key of keys) {
        if (!keepIds.has(String(key))) {
          store.delete(key);
        }
      }
    }

    await done;
  } catch {
    // localStorage 仍保留请求元数据，即使大响应详情无法写入 IndexedDB。
  } finally {
    closeDb(db);
  }
}

async function hydrateRequestDetails(records: ImageRequestRecord[]) {
  let db: IDBDatabase | null = null;

  try {
    db = await openRequestDetailDb();
    if (!db) return records;

    const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);
    const hydrated = await Promise.all(
      records.map(async (request) => {
        if (!request.hasCachedDetails) return request;

        const detail = await requestToPromise<RequestDetailEntry | undefined>(store.get(request.id));
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

export async function clearRequestDetails() {
  let db: IDBDatabase | null = null;

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

export async function loadCachedRequests() {
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

export function saveCachedRequests(records: ImageRequestRecord[]) {
  const cached = cachedRequestRecords(records);
  const serialized = JSON.stringify(cached);

  try {
    localStorage.setItem(REQUEST_CACHE_KEY, serialized);
  } catch {
    try {
      localStorage.removeItem(REQUEST_CACHE_KEY);
    } catch {
      // Ignore quota failures.
    }
  }

  void saveRequestDetails(records);
}

export function clearCachedRequests() {
  localStorage.removeItem(REQUEST_CACHE_KEY);
  void clearRequestDetails();
}
