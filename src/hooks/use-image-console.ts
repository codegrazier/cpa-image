import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchModels, postImageGeneration } from "@/lib/api";
import {
  buildGenerationRequests,
  buildPayload,
  buildResponsesImagePayload,
  buildResponsesImageRequests,
  createRequestRecords,
  DEFAULTS,
  extractImages,
  formatRequestTiming,
  imageCountFromValue,
  imageDownloadName,
  missingImageOutputMessage,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  normalizeResponsesEndpoint,
  payloadOutputFormat,
  payloadSize,
  prepareImageForDetailCache,
  prepareImageForRuntime,
  requestControlSummary,
  requestFilterCounts,
  requestImageCount,
  reusablePromptForRequest,
  sanitizeResponseForDisplay,
  sortedRequestRecordsForFilter,
  type AppSettings,
  type GeneratedImage,
  type GenerationMethod,
  type ImageRequestRecord,
  type RequestFilter,
} from "@/lib/image-console";
import {
  clearCachedRequests,
  loadCachedRequests,
  loadLastPrompt,
  loadSettings,
  resetSettings as resetStoredSettings,
  saveCachedRequests,
  saveLastPrompt,
  saveRequestDetails,
  saveSettings,
} from "@/lib/storage";

type ConnectionTone = "default" | "busy" | "ok" | "error";

interface StatusMessage {
  state: string;
  detail: string;
}

function normalizeSettings(values: AppSettings): AppSettings {
  return {
    ...DEFAULTS,
    ...values,
    model: DEFAULTS.model,
    imageGenerationModel: String(values.imageGenerationModel || DEFAULTS.imageGenerationModel).trim(),
    rememberKey: Boolean(values.rememberKey),
    strictPrompt: values.strictPrompt ?? DEFAULTS.strictPrompt,
    requestConcurrency: normalizeRequestConcurrency(values.requestConcurrency),
    requestIntervalSeconds: normalizeRequestIntervalSeconds(values.requestIntervalSeconds),
    n: imageCountFromValue(values.n || DEFAULTS.n),
  };
}

function queueStatusMessage(records: ImageRequestRecord[], settings: AppSettings): StatusMessage {
  const runningCount = records.filter((request) => request.status === "running").length;
  const queuedCount = records.filter((request) => request.status === "queued").length;
  const doneCount = records.filter((request) => request.status === "done").length;
  const failedCount = records.filter((request) => request.status === "error").length;
  const canceledCount = records.filter((request) => request.status === "canceled").length;
  const imageCount = records.reduce((sum, request) => sum + requestImageCount(request), 0);

  if (runningCount + queuedCount > 0) {
    return {
      state: "队列运行中",
      detail: `${requestControlSummary(settings)} · 运行 ${runningCount} · 排队 ${queuedCount} · 完成 ${doneCount} · 失败 ${failedCount}`,
    };
  }

  if (!records.length) {
    return {
      state: "等待生成",
      detail: "配置 URL 和 API Key 后即可开始。",
    };
  }

  return {
    state: `队列完成 ${imageCount} 张`,
    detail: `${requestControlSummary(settings)} · 完成 ${doneCount} · 失败 ${failedCount} · 取消 ${canceledCount}`,
  };
}

function isActiveRequest(request: ImageRequestRecord) {
  return request.status === "queued" || request.status === "running";
}

function isGeneratedImage(value: ReturnType<typeof prepareImageForDetailCache>): value is GeneratedImage {
  return Boolean(value);
}

function collectObjectUrls(records: ImageRequestRecord[]) {
  const urls = new Set<string>();

  for (const request of records) {
    for (const image of request.images || []) {
      if (image.objectUrl) urls.add(image.objectUrl);
    }
  }

  return urls;
}

function revokeObjectUrls(urls: Iterable<string>) {
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;

  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

function revokeRemovedObjectUrls(previousRecords: ImageRequestRecord[], nextRecords: ImageRequestRecord[]) {
  const nextUrls = collectObjectUrls(nextRecords);
  const removedUrls = [...collectObjectUrls(previousRecords)].filter((url) => !nextUrls.has(url));
  revokeObjectUrls(removedUrls);
}

function prepareRecordsForRuntime(records: ImageRequestRecord[]) {
  return records.map((request) => ({
    ...request,
    images: (request.images || []).map(prepareImageForRuntime),
  }));
}

function initialSettings() {
  try {
    return normalizeSettings(loadSettings());
  } catch {
    return { ...DEFAULTS };
  }
}

function initialPrompt() {
  try {
    return loadLastPrompt();
  } catch {
    return "";
  }
}

export function useImageConsole() {
  const [settings, setSettings] = useState<AppSettings>(() => initialSettings());
  const [prompt, setPromptState] = useState(() => initialPrompt());
  const [requestRecords, setRequestRecords] = useState<ImageRequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequestFilter, setSelectedRequestFilter] = useState<RequestFilter>("all");
  const [statusMessage, setStatusMessage] = useState<StatusMessage>({
    state: "等待生成",
    detail: "配置 URL 和 API Key 后即可开始。",
  });
  const [connectionStatus, setConnectionStatus] = useState<{ label: string; tone: ConnectionTone }>({
    label: "配置",
    tone: "default",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());

  const settingsRef = useRef(settings);
  const requestRecordsRef = useRef(requestRecords);
  const queueTimerRef = useRef<number | null>(null);
  const lastRequestStartedAtRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const cancelRequestedRef = useRef(new Set<string>());
  const wasQueueActiveRef = useRef(false);
  const scheduleQueueRef = useRef<() => void>(() => undefined);
  const runRequestRef = useRef<(requestId: string) => void>(() => undefined);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    requestRecordsRef.current = requestRecords;
  }, [requestRecords]);

  const clearQueueTimer = useCallback(() => {
    if (queueTimerRef.current == null) return;
    window.clearTimeout(queueTimerRef.current);
    queueTimerRef.current = null;
  }, []);

  const commitRecords = useCallback((updater: (records: ImageRequestRecord[]) => ImageRequestRecord[]) => {
    const previous = requestRecordsRef.current;
    const next = updater(previous);
    revokeRemovedObjectUrls(previous, next);
    requestRecordsRef.current = next;
    saveCachedRequests(next);
    setRequestRecords(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadCachedRequests().then((records) => {
      if (cancelled) return;
      const runtimeRecords = prepareRecordsForRuntime(records);
      requestRecordsRef.current = runtimeRecords;
      setRequestRecords(runtimeRecords);
      setSelectedRequestId(runtimeRecords[runtimeRecords.length - 1]?.id || null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearQueueTimer();
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
      revokeObjectUrls(collectObjectUrls(requestRecordsRef.current));
    };
  }, [clearQueueTimer]);

  const runRequest = useCallback(
    async (requestId: string) => {
      const current = requestRecordsRef.current.find((request) => request.id === requestId);
      if (!current || current.status !== "queued") return;

      const controller = new AbortController();
      controllersRef.current.set(requestId, controller);

      commitRecords((records) =>
        records.map((request) =>
          request.id === requestId
            ? {
                ...request,
                status: "running",
                startedAt: performance.now(),
                endedAt: null,
                error: "",
                cancelRequested: false,
              }
            : request,
        ),
      );

      try {
        const request = requestRecordsRef.current.find((item) => item.id === requestId);
        if (!request) return;

        const body = await postImageGeneration(
          request.endpoint,
          request.apiKey || "",
          request.payload,
          controller.signal,
        );

        if (cancelRequestedRef.current.has(requestId)) {
          commitRecords((records) =>
            records.map((item) =>
              item.id === requestId
                ? {
                    ...item,
                    status: "canceled",
                    error: "请求已取消",
                    endedAt: item.endedAt ?? performance.now(),
                    cancelRequested: true,
                  }
                : item,
            ),
          );
          return;
        }

        const extractedImages = extractImages(body, payloadOutputFormat(request.payload)).map((image) => ({
          ...image,
          path: `${request.title} · ${image.path}`,
        }));
        const detailImages = extractedImages.map(prepareImageForDetailCache).filter(isGeneratedImage);
        const runtimeSourceImages =
          detailImages.length === extractedImages.length && detailImages.length > 0 ? detailImages : extractedImages;
        const images = runtimeSourceImages.map(prepareImageForRuntime);
        const displayResponse = sanitizeResponseForDisplay(body);
        const missingImageMessage = images.length ? "" : missingImageOutputMessage(body);

        void saveRequestDetails(
          [
            {
              ...request,
              images: detailImages,
              response: displayResponse,
            },
          ],
          { prune: false },
        );

        commitRecords((records) =>
          records.map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  response: displayResponse,
                  images,
                  status: images.length ? "done" : "error",
                  error: missingImageMessage,
                  endedAt: performance.now(),
                  completedAt: images.length ? Date.now() : item.completedAt ?? null,
                }
              : item,
          ),
        );
      } catch (error) {
        const typedError = error as Error & { responseBody?: unknown };
        commitRecords((records) =>
          records.map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  status: typedError.name === "AbortError" ? "canceled" : "error",
                  error: typedError.name === "AbortError" ? "请求已取消" : typedError.message,
                  response:
                    typedError.name === "AbortError"
                      ? item.response
                      : typedError.responseBody == null
                        ? null
                        : sanitizeResponseForDisplay(typedError.responseBody),
                  endedAt: performance.now(),
                }
              : item,
          ),
        );
      } finally {
        controllersRef.current.delete(requestId);
        cancelRequestedRef.current.delete(requestId);
        scheduleQueueRef.current();
      }
    },
    [commitRecords],
  );

  useEffect(() => {
    runRequestRef.current = (requestId: string) => {
      void runRequest(requestId);
    };
  }, [runRequest]);

  const scheduleQueue = useCallback(() => {
    if (queueTimerRef.current != null) return;

    const records = requestRecordsRef.current;
    const currentSettings = settingsRef.current;
    const runningCount = records.filter((request) => request.status === "running").length;
    const openSlots = Math.max(0, normalizeRequestConcurrency(currentSettings.requestConcurrency) - runningCount);
    const [nextRequest] = records.filter((request) => request.status === "queued").slice(0, openSlots);

    if (!nextRequest) return;

    const intervalMs = normalizeRequestIntervalSeconds(currentSettings.requestIntervalSeconds) * 1000;
    const elapsedSinceLastStart = lastRequestStartedAtRef.current
      ? performance.now() - lastRequestStartedAtRef.current
      : intervalMs;
    const delayMs = Math.max(0, intervalMs - elapsedSinceLastStart);

    if (delayMs > 0) {
      queueTimerRef.current = window.setTimeout(() => {
        queueTimerRef.current = null;
        scheduleQueueRef.current();
      }, delayMs);
      return;
    }

    lastRequestStartedAtRef.current = performance.now();
    runRequestRef.current(nextRequest.id);

    window.setTimeout(() => {
      scheduleQueueRef.current();
    }, 0);
  }, []);

  useEffect(() => {
    scheduleQueueRef.current = scheduleQueue;
  }, [scheduleQueue]);

  const activeCount = requestRecords.filter(isActiveRequest).length;

  useEffect(() => {
    if (!activeCount) return;
    const timer = window.setInterval(() => {
      setNow(performance.now());
    }, 300);

    return () => window.clearInterval(timer);
  }, [activeCount]);

  useEffect(() => {
    const hasActive = requestRecords.some(isActiveRequest);

    if (hasActive) {
      wasQueueActiveRef.current = true;
      setStatusMessage(queueStatusMessage(requestRecords, settings));
      return;
    }

    if (wasQueueActiveRef.current) {
      wasQueueActiveRef.current = false;
      lastRequestStartedAtRef.current = 0;
      clearQueueTimer();
      setStatusMessage(queueStatusMessage(requestRecords, settings));
    }
  }, [clearQueueTimer, requestRecords, settings]);

  const filteredRequests = useMemo(
    () => sortedRequestRecordsForFilter(requestRecords, selectedRequestFilter),
    [requestRecords, selectedRequestFilter],
  );

  useEffect(() => {
    setSelectedRequestId((currentId) => {
      if (!filteredRequests.length) return null;
      if (currentId && filteredRequests.some((request) => request.id === currentId)) return currentId;
      return filteredRequests[0].id;
    });
  }, [filteredRequests]);

  const selectedRequest = useMemo(
    () => requestRecords.find((request) => request.id === selectedRequestId) || null,
    [requestRecords, selectedRequestId],
  );

  const requestCounts = useMemo(() => requestFilterCounts(requestRecords), [requestRecords]);

  const endpointPreview = useMemo(() => {
    const baseUrl = settings.baseUrl || DEFAULTS.baseUrl;
    const imageGenerationModel = String(settings.imageGenerationModel || DEFAULTS.imageGenerationModel).trim();
    return [
      `gpt-image-2: ${normalizeImageEndpoint(baseUrl)}`,
      `image_generation (${imageGenerationModel}): ${normalizeResponsesEndpoint(baseUrl)}`,
    ].join("\n");
  }, [settings.baseUrl, settings.imageGenerationModel]);

  const selectedRequestJson = useMemo(() => {
    if (selectedRequest?.response == null) return "";
    return JSON.stringify(sanitizeResponseForDisplay(selectedRequest.response), null, 2);
  }, [selectedRequest]);

  const requestListCount = useMemo(() => {
    const countText =
      selectedRequestFilter === "all" || requestRecords.length === 0
        ? `${requestRecords.length} 个`
        : `${filteredRequests.length}/${requestRecords.length} 个`;
    return `${countText} · ${requestControlSummary(settings)}`;
  }, [filteredRequests.length, requestRecords.length, selectedRequestFilter, settings]);

  const setPrompt = useCallback((value: string) => {
    setPromptState(value);
    saveLastPrompt(value);
  }, []);

  const updateSettings = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const saveCurrentSettings = useCallback(() => {
    const normalized = normalizeSettings(settingsRef.current);
    setSettings(normalized);
    settingsRef.current = normalized;
    saveSettings(normalized);
    setConnectionStatus({ label: "已保存", tone: "ok" });
    setStatusMessage({
      state: "设置已保存",
      detail: `${requestControlSummary(normalized)} · image_generation ${normalized.imageGenerationModel}`,
    });
    clearQueueTimer();
    setSettingsOpen(false);
    scheduleQueueRef.current();
  }, [clearQueueTimer]);

  const resetSettings = useCallback(() => {
    resetStoredSettings();
    const defaults = { ...DEFAULTS };
    setSettings(defaults);
    settingsRef.current = defaults;
    setConnectionStatus({ label: "配置", tone: "default" });
    setStatusMessage({ state: "已重置", detail: "默认 URL 已恢复。" });
  }, []);

  const testConnection = useCallback(async () => {
    const currentSettings = settingsRef.current;
    const endpoint = normalizeModelsEndpoint(currentSettings.baseUrl);
    setConnectionStatus({ label: "测试中", tone: "busy" });
    setStatusMessage({ state: "测试连接", detail: endpoint });

    try {
      await fetchModels(currentSettings.baseUrl, currentSettings.apiKey);
      setConnectionStatus({ label: "连接正常", tone: "ok" });
      setStatusMessage({ state: "连接正常", detail: "模型列表接口已返回。" });
    } catch (error) {
      setConnectionStatus({ label: "连接失败", tone: "error" });
      setStatusMessage({ state: "连接失败", detail: (error as Error).message });
    }
  }, []);

  const enqueueGeneration = useCallback(
    (mode: "images" | "responses") => {
      const currentSettings = normalizeSettings(settingsRef.current);
      const values = { ...currentSettings, prompt };
      saveLastPrompt(prompt);

      let requestPayloads;
      let endpoint: string;
      let method: GenerationMethod;

      try {
        if (mode === "responses") {
          const payload = buildResponsesImagePayload(values);
          requestPayloads = buildResponsesImageRequests(payload, values.n);
          endpoint = normalizeResponsesEndpoint(values.baseUrl);
          method = "image_generation";
        } else {
          const payload = buildPayload(values);
          requestPayloads = buildGenerationRequests(payload);
          endpoint = normalizeImageEndpoint(values.baseUrl);
          method = "gpt-image-2";
        }
      } catch (error) {
        const message = (error as Error).message;
        setStatusMessage({ state: "请求未创建", detail: message });
        toast.error(message);
        return false;
      }

      saveSettings(currentSettings);
      setSettings(currentSettings);
      settingsRef.current = currentSettings;

      const now = performance.now();
      const date = new Date();
      const newRequests = createRequestRecords(
        requestPayloads,
        endpoint,
        now,
        date,
        requestRecordsRef.current,
        method,
      ).map((request) => ({
        ...request,
        apiKey: currentSettings.apiKey,
      }));

      commitRecords((records) => [...records, ...newRequests]);
      setSelectedRequestId(newRequests[0]?.id || selectedRequestId);
      setStatusMessage({
        state: "请求已加入队列",
        detail: `${method} · ${newRequests.length} 个新请求 · ${requestControlSummary(currentSettings)} · ${endpoint}`,
      });
      scheduleQueueRef.current();
      return true;
    },
    [commitRecords, prompt, selectedRequestId],
  );

  const cancelRequest = useCallback(
    (requestId: string) => {
      const request = requestRecordsRef.current.find((item) => item.id === requestId);
      if (!request || (request.status !== "queued" && request.status !== "running")) return;

      const now = performance.now();
      const wasQueued = request.status === "queued";
      cancelRequestedRef.current.add(requestId);
      controllersRef.current.get(requestId)?.abort();

      commitRecords((records) =>
        records.map((item) =>
          item.id === requestId
            ? {
                ...item,
                status: "canceled",
                endedAt: now,
                error: wasQueued ? "请求已取消，未发送。" : "请求已取消",
                cancelRequested: true,
              }
            : item,
        ),
      );
      setStatusMessage({ state: "已取消请求", detail: request.title });
      scheduleQueueRef.current();
    },
    [commitRecords],
  );

  const clearAllRequests = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
    cancelRequestedRef.current.clear();
    clearQueueTimer();
    wasQueueActiveRef.current = false;
    lastRequestStartedAtRef.current = 0;
    revokeObjectUrls(collectObjectUrls(requestRecordsRef.current));
    requestRecordsRef.current = [];
    setRequestRecords([]);
    setSelectedRequestId(null);
    clearCachedRequests();
    setStatusMessage({ state: "已清空", detail: "所有请求缓存已清空。" });
  }, [clearQueueTimer]);

  const reusePrompt = useCallback(
    (request: ImageRequestRecord) => {
      const reusablePrompt = reusablePromptForRequest(request);
      if (!reusablePrompt) return;
      setPrompt(reusablePrompt);
      setStatusMessage({ state: "Prompt 已回填", detail: request.title });
    },
    [setPrompt],
  );

  const selectedRequestDownload = selectedRequest?.images?.[0]?.src
    ? {
        href: selectedRequest.images[0].src,
        download: imageDownloadName(selectedRequest, 0),
      }
    : null;

  const selectedRequestTiming = selectedRequest ? formatRequestTiming(selectedRequest, now) : "-";

  return {
    settings,
    prompt,
    requestRecords,
    filteredRequests,
    selectedRequest,
    selectedRequestId,
    selectedRequestFilter,
    requestCounts,
    requestListCount,
    statusMessage,
    connectionStatus,
    endpointPreview,
    settingsOpen,
    clearDialogOpen,
    jsonDialogOpen,
    selectedRequestJson,
    selectedRequestDownload,
    selectedRequestTiming,
    now,
    setPrompt,
    updateSettings,
    setSelectedRequestId,
    setSelectedRequestFilter,
    setSettingsOpen,
    setClearDialogOpen,
    setJsonDialogOpen,
    saveCurrentSettings,
    resetSettings,
    testConnection,
    enqueueGeneration,
    cancelRequest,
    clearAllRequests,
    reusePrompt,
    payloadSize,
    requestImageCount,
    formatRequestTiming,
  };
}
