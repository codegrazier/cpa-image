import {
  cachedRequestRecords,
  DEFAULTS,
  DEFAULT_MODE_SETTINGS,
  DEFAULT_SHARED_SETTINGS,
  LAST_PROMPT_KEY_BY_MODE,
  LAST_PROMPT_KEY,
  PINNED_PROMPT_HISTORY_KEY_BY_MODE,
  PINNED_PROMPT_HISTORY_KEY,
  PROMPT_HISTORY_KEY_BY_MODE,
  prepareImageForDetailCache,
  PROMPT_HISTORY_KEY,
  REQUEST_CACHE_KEY,
  REQUEST_DETAIL_DB_NAME,
  REQUEST_DETAIL_DB_VERSION,
  REQUEST_DETAIL_STORE_NAME,
  REQUEST_RECORDS_STORE_NAME,
  restoreCachedRequest,
  STORAGE_KEY,
  type ConsoleMode,
  type CachedRequestRecord,
  type ModeSettings,
  type StoredConsoleSettings,
  type GeneratedImage,
  type ImageRequestRecord,
  normalizeModeSettings,
  normalizeSharedSettings,
} from "@/lib/image-console";
import { normalizePinnedPromptHistory, normalizePromptHistory } from "@/lib/prompt-history";

interface RequestDetailEntry {
  id: string;
  images: GeneratedImage[];
  response: unknown;
  rawResponse?: unknown;
  thumbnail?: GeneratedImage | null;
  savedAt: number;
}

interface SaveRequestDetailsOptions {
  prune?: boolean;
}

interface DeleteRequestDetailsOptions {
  retainTombstones?: boolean;
}

let cachedRequestWriteChain: Promise<void> = Promise.resolve();
let requestDetailWriteChain: Promise<void> = Promise.resolve();
let requestDetailClearVersion = 0;
const deletedRequestDetailIds = new Set<string>();
const latestClearedRequestDetailIds = new Set<string>();
const blockedRequestDetailIds = new Set<string>();
const blockedRequestDetailIdQueue: string[] = [];
const pendingRequestDetailWrites = new Map<string, Promise<void>>();
const BLOCKED_REQUEST_DETAIL_LIMIT = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localStorageStore() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function enqueueCachedRequestWrite<T>(task: () => Promise<T>) {
  const run = cachedRequestWriteChain.then(task, task);
  cachedRequestWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

function enqueueRequestDetailWrite<T>(task: () => Promise<T>) {
  const run = requestDetailWriteChain.then(task, task);
  requestDetailWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

function trackRequestDetailWrite<T>(ids: string[], write: Promise<T>): Promise<T> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const tracked = write.then(() => undefined, () => undefined);

  for (const id of uniqueIds) {
    pendingRequestDetailWrites.set(id, tracked);
  }

  tracked.finally(() => {
    for (const id of uniqueIds) {
      if (pendingRequestDetailWrites.get(id) === tracked) {
        pendingRequestDetailWrites.delete(id);
      }
    }
    cleanupDeletedRequestDetailIds(uniqueIds);
  });

  return write;
}

function cleanupDeletedRequestDetailIds(ids: string[]) {
  for (const id of ids) {
    if (!pendingRequestDetailWrites.has(id)) {
      deletedRequestDetailIds.delete(id);
    }
  }
}

function isRequestDetailWriteBlocked(id: string) {
  return deletedRequestDetailIds.has(id) || latestClearedRequestDetailIds.has(id) || blockedRequestDetailIds.has(id);
}

function blockRequestDetailWrites(ids: string[], latestClear = false) {
  if (latestClear) {
    // 最近一次全量清空需要完整阻断，防止清空后仍在运行的旧请求迟到写回详情。
    // 更早的清空批次进入有限窗口，避免长期运行时只因 tombstone 持续增长。
    for (const id of latestClearedRequestDetailIds) {
      if (!blockedRequestDetailIds.has(id)) {
        blockedRequestDetailIds.add(id);
        blockedRequestDetailIdQueue.push(id);
      }
    }

    latestClearedRequestDetailIds.clear();
    for (const id of ids) {
      if (id) latestClearedRequestDetailIds.add(id);
    }
  }

  for (const id of ids) {
    if (latestClear) continue;
    if (!id || blockedRequestDetailIds.has(id)) continue;
    blockedRequestDetailIds.add(id);
    blockedRequestDetailIdQueue.push(id);
  }

  while (blockedRequestDetailIdQueue.length > BLOCKED_REQUEST_DETAIL_LIMIT) {
    const expiredId = blockedRequestDetailIdQueue.shift();
    if (expiredId) {
      blockedRequestDetailIds.delete(expiredId);
    }
  }
}

function cloneDefaultStoredSettings(): StoredConsoleSettings {
  return {
    shared: { ...DEFAULT_SHARED_SETTINGS },
    modeSettingsByMode: {
      generate: { ...DEFAULT_MODE_SETTINGS },
      edit: { ...DEFAULT_MODE_SETTINGS },
    },
  };
}

function normalizeStoredSettings(raw: unknown): StoredConsoleSettings {
  const defaults = cloneDefaultStoredSettings();

  if (!isRecord(raw)) return defaults;

  const nestedShared = isRecord(raw.shared) ? raw.shared : null;
  const nestedModeSettings = isRecord(raw.modeSettingsByMode)
    ? raw.modeSettingsByMode
    : isRecord(raw.modes)
      ? raw.modes
      : null;

  const legacySharedSource = {
    ...raw,
    generationsModel: raw.generationsModel || raw.model,
    editsModel: raw.editsModel || raw.model,
    responsesModel: raw.responsesModel || raw.llmModel || raw.imageGenerationModel,
    completionsModel: raw.completionsModel || raw.llmModel || raw.imageGenerationModel,
  };

  const shared = normalizeSharedSettings(nestedShared || legacySharedSource);

  if (!nestedModeSettings) {
    const legacyModeSettings = normalizeModeSettings(raw as Partial<ModeSettings>);
    return {
      shared,
      modeSettingsByMode: {
        generate: { ...legacyModeSettings },
        edit: { ...legacyModeSettings },
      },
    };
  }

  const generateSource = isRecord(nestedModeSettings.generate) ? nestedModeSettings.generate : raw;
  const editSource = isRecord(nestedModeSettings.edit) ? nestedModeSettings.edit : raw;

  return {
    shared,
    modeSettingsByMode: {
      generate: normalizeModeSettings(generateSource as Partial<ModeSettings>),
      edit: normalizeModeSettings(editSource as Partial<ModeSettings>),
    },
  };
}

function sortCachedRequestRecords(records: CachedRequestRecord[]) {
  return [...records].sort((a, b) => {
    const createdDiff = Number(a.createdAt || 0) - Number(b.createdAt || 0);
    if (createdDiff) return createdDiff;

    const indexDiff = Number(a.index || 0) - Number(b.index || 0);
    if (indexDiff) return indexDiff;

    const titleDiff = String(a.title || "").localeCompare(String(b.title || ""));
    if (titleDiff) return titleDiff;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export function loadSettings(): StoredConsoleSettings {
  const stored = localStorageStore()?.getItem(STORAGE_KEY);
  if (!stored) return cloneDefaultStoredSettings();

  try {
    return normalizeStoredSettings(JSON.parse(stored));
  } catch {
    return cloneDefaultStoredSettings();
  }
}

export function saveSettings(values: StoredConsoleSettings) {
  const normalized = normalizeStoredSettings(values);
  const persisted: Record<string, unknown> = {
    shared: normalized.shared,
    modeSettingsByMode: normalized.modeSettingsByMode,
    baseUrl: normalized.shared.baseUrl,
    generationsModel: normalized.shared.generationsModel,
    editsModel: normalized.shared.editsModel,
    responsesModel: normalized.shared.responsesModel,
    completionsModel: normalized.shared.completionsModel,
    rememberKey: normalized.shared.rememberKey,
    enableCrossOriginProxy: normalized.shared.enableCrossOriginProxy,
    requestConcurrency: normalized.shared.requestConcurrency,
    requestIntervalSeconds: normalized.shared.requestIntervalSeconds,
    strictPromptText: normalized.shared.strictPromptText,
    size: normalized.modeSettingsByMode.generate.size,
    quality: normalized.modeSettingsByMode.generate.quality,
    n: normalized.modeSettingsByMode.generate.n,
    background: normalized.modeSettingsByMode.generate.background,
    outputFormat: normalized.modeSettingsByMode.generate.outputFormat,
    strictPrompt: normalized.modeSettingsByMode.generate.strictPrompt,
  };

  if (normalized.shared.rememberKey) {
    persisted.apiKey = normalized.shared.apiKey;
  }

  localStorageStore()?.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function resetSettings() {
  localStorageStore()?.removeItem(STORAGE_KEY);
}

export function loadLastPrompt() {
  return loadLastPromptForMode("generate");
}

export function loadLastPromptForMode(mode: ConsoleMode = "generate") {
  try {
    const key = LAST_PROMPT_KEY_BY_MODE[mode] || LAST_PROMPT_KEY;
    return localStorageStore()?.getItem(key) || "";
  } catch {
    return "";
  }
}

export function saveLastPrompt(prompt: string, mode: ConsoleMode = "generate") {
  try {
    const key = LAST_PROMPT_KEY_BY_MODE[mode] || LAST_PROMPT_KEY;
    localStorageStore()?.setItem(key, String(prompt || ""));
  } catch {
    // 忽略草稿保存失败，避免影响用户继续编辑。
  }
}

export function loadPromptHistory() {
  return loadPromptHistoryForMode("generate");
}

export function loadPromptHistoryForMode(mode: ConsoleMode = "generate") {
  try {
    const key = PROMPT_HISTORY_KEY_BY_MODE[mode] || PROMPT_HISTORY_KEY;
    const stored = localStorageStore()?.getItem(key);
    return normalizePromptHistory(stored ? JSON.parse(stored) : []);
  } catch {
    return [];
  }
}

export function savePromptHistory(history: string[], mode: ConsoleMode = "generate") {
  try {
    const key = PROMPT_HISTORY_KEY_BY_MODE[mode] || PROMPT_HISTORY_KEY;
    localStorageStore()?.setItem(key, JSON.stringify(normalizePromptHistory(history)));
  } catch {
    // 历史 Prompt 只是辅助信息，写入失败时不影响生成。
  }
}

export function loadPinnedPromptHistory() {
  return loadPinnedPromptHistoryForMode("generate");
}

export function loadPinnedPromptHistoryForMode(mode: ConsoleMode = "generate") {
  try {
    const key = PINNED_PROMPT_HISTORY_KEY_BY_MODE[mode] || PINNED_PROMPT_HISTORY_KEY;
    const stored = localStorageStore()?.getItem(key);
    return normalizePinnedPromptHistory(stored ? JSON.parse(stored) : []);
  } catch {
    return [];
  }
}

export function savePinnedPromptHistory(history: string[], mode: ConsoleMode = "generate") {
  try {
    const key = PINNED_PROMPT_HISTORY_KEY_BY_MODE[mode] || PINNED_PROMPT_HISTORY_KEY;
    localStorageStore()?.setItem(key, JSON.stringify(normalizePinnedPromptHistory(history)));
  } catch {
    // 置顶 Prompt 只是辅助信息，写入失败时不影响生成。
  }
}

function openConsoleDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REQUEST_DETAIL_DB_NAME, REQUEST_DETAIL_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REQUEST_RECORDS_STORE_NAME)) {
        db.createObjectStore(REQUEST_RECORDS_STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(REQUEST_DETAIL_STORE_NAME)) {
        db.createObjectStore(REQUEST_DETAIL_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败。"));
  });
}

async function readStoreValues<T>(storeName: string) {
  let db: IDBDatabase | null = null;

  try {
    db = await openConsoleDb();
    if (!db) return null;

    const transaction = db.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const values = await requestToPromise<T[]>(store.getAll());

    await done;
    return Array.isArray(values) ? values : [];
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}

async function replaceStoreValues<T extends { id: string }>(storeName: string, values: T[]) {
  let db: IDBDatabase | null = null;

  try {
    db = await openConsoleDb();
    if (!db) return false;

    const transaction = db.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);

    await requestToPromise(store.clear());
    for (const value of values) {
      store.put(value);
    }

    await done;
    return true;
  } catch {
    return false;
  } finally {
    closeDb(db);
  }
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
  if (isRequestDetailWriteBlocked(request.id)) return null;

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
  if (!images.length && request.response == null && request.rawResponse == null) return null;

  return {
    id: request.id,
    images,
    response: request.response ?? null,
    rawResponse: request.rawResponse ?? request.response ?? null,
    thumbnail: request.thumbnail ? prepareImageForDetailCache(request.thumbnail) : null,
    savedAt: Date.now(),
  };
}

export function saveRequestDetails(records: ImageRequestRecord[], options: SaveRequestDetailsOptions = {}) {
  const writeClearVersion = requestDetailClearVersion;
  const write = enqueueRequestDetailWrite(async () => {
    if (writeClearVersion !== requestDetailClearVersion) return;

    const writableRecords = records.filter((request) => !isRequestDetailWriteBlocked(request.id));
    if (!writableRecords.length) return;

    let db: IDBDatabase | null = null;

    try {
      db = await openConsoleDb();
      if (!db) return;

      const prune = options.prune ?? true;
      const keepIds = new Set(writableRecords.map((request) => request.id));
      const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);

      for (const request of writableRecords) {
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
  });

  const ids = records.map((request) => request.id);
  return trackRequestDetailWrite(ids, write);
}

export async function loadRequestDetails(id: string) {
  await pendingRequestDetailWrites.get(id)?.catch(() => undefined);

  let db: IDBDatabase | null = null;

  try {
    db = await openConsoleDb();
    if (!db) return null;

    const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);
    const detail = await requestToPromise<RequestDetailEntry | undefined>(store.get(id));

    await done;
    if (!detail) return null;

    return {
      images: Array.isArray(detail.images) ? detail.images : [],
      response: detail.response ?? null,
      rawResponse: detail.rawResponse ?? detail.response ?? null,
      thumbnail: detail.thumbnail ?? null,
      savedAt: detail.savedAt,
    };
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}

export function deleteRequestDetails(ids: string[], options: DeleteRequestDetailsOptions = {}): Promise<void> {
  if (!ids.length) return Promise.resolve();

  if (options.retainTombstones) {
    blockRequestDetailWrites(ids, true);
  } else {
    for (const id of ids) {
      deletedRequestDetailIds.add(id);
    }
  }

  const write = enqueueRequestDetailWrite(async () => {
    let db: IDBDatabase | null = null;

    try {
      db = await openConsoleDb();
      if (!db) return;

      const transaction = db.transaction(REQUEST_DETAIL_STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(REQUEST_DETAIL_STORE_NAME);

      for (const id of ids) {
        store.delete(id);
      }

      await done;
    } catch {
      // Ignore cache cleanup failures.
    } finally {
      closeDb(db);
    }
  });

  const trackedWrite = trackRequestDetailWrite(ids, write);
  if (!options.retainTombstones) {
    void trackedWrite.finally(() => cleanupDeletedRequestDetailIds(ids));
  }
  return trackedWrite;
}

export function clearRequestDetails(): Promise<void> {
  // clearVersion 取消已排队的详情写入；clear all 的 tombstone 另行阻断清空后才完成的旧请求。
  requestDetailClearVersion += 1;

  const write = enqueueRequestDetailWrite(async () => {
    let db: IDBDatabase | null = null;

    try {
      db = await openConsoleDb();
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
  });

  return write;
}

async function persistCachedRequestRecords(records: CachedRequestRecord[], fallbackToLocalStorage = true) {
  const normalized = sortCachedRequestRecords(records);
  const persisted = await enqueueCachedRequestWrite(() => replaceStoreValues(REQUEST_RECORDS_STORE_NAME, normalized));

  if (persisted) {
    try {
      localStorageStore()?.removeItem(REQUEST_CACHE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return true;
  }

  if (fallbackToLocalStorage) {
    try {
      localStorageStore()?.setItem(REQUEST_CACHE_KEY, JSON.stringify(normalized));
      return true;
    } catch {
      // Ignore quota failures.
    }
  }

  return false;
}

export async function loadCachedRequests(language: "zh" | "en" = "zh") {
  const storedRecords = await readStoreValues<CachedRequestRecord>(REQUEST_RECORDS_STORE_NAME);
  if (storedRecords?.length) {
    try {
      localStorageStore()?.removeItem(REQUEST_CACHE_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return sortCachedRequestRecords(storedRecords).map((record) => restoreCachedRequest(record, language));
  }

  const stored = localStorageStore()?.getItem(REQUEST_CACHE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    await persistCachedRequestRecords(parsed as CachedRequestRecord[], false);
    return sortCachedRequestRecords(parsed as CachedRequestRecord[]).map((record) => restoreCachedRequest(record, language));
  } catch {
    return [];
  }
}

export function saveCachedRequests(records: ImageRequestRecord[], language: "zh" | "en" = "zh") {
  void persistCachedRequestRecords(cachedRequestRecords(records, language));
}

export function clearCachedRequests() {
  void enqueueCachedRequestWrite(() => replaceStoreValues(REQUEST_RECORDS_STORE_NAME, []));
  try {
    localStorageStore()?.removeItem(REQUEST_CACHE_KEY);
  } catch {
    // Ignore cleanup failures.
  }
  void clearRequestDetails();
}
