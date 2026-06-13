import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fetchModels, postImageEdit, postImageGeneration } from "@/lib/api";
import {
  addPromptToHistory,
  buildEditImagePayload,
  buildEditImageRequests,
  buildChatCompletionsImagePayload,
  buildChatCompletionsImageRequests,
  buildGenerationRequests,
  buildPayload,
  buildResponsesImagePayload,
  buildResponsesImageRequests,
  createRequestRecords,
  DEFAULTS,
  extractImages,
  formatRequestTiming,
  generationMethodDisplayName,
  imageCountFromValue,
  imageDownloadName,
  missingImageOutputMessage,
  mergePromptHistoryForDisplay,
  prepareImageForDetailCacheWithDimensions,
  type ConsoleMode,
  normalizeChatCompletionsEndpoint,
  normalizeImageEditsEndpoint,
  normalizeImageEndpoint,
  normalizeModelsEndpoint,
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  normalizeResponsesEndpoint,
  payloadOutputFormat,
  payloadSize,
  prepareImageForDetailCache,
  prepareEditInputImage,
  prepareImageForRuntime,
  prepareImageForThumbnailCache,
  DEFAULT_STORED_SETTINGS,
  normalizeModeSettings,
  normalizeSharedSettings,
  normalizeStrictPromptText,
  MAX_EDIT_INPUT_IMAGES,
  requestControlSummary,
  requestFilterCounts,
  requestImageCount,
  requestMatchesFilter,
  removePromptFromHistory,
  pinPromptHistory,
  reusablePromptForRequest,
  sanitizeResponseForDisplay,
  sortedRequestRecordsForFilter,
  type EditInputImage,
  type AppSettings,
  type GeneratedImage,
  type GenerationMethod,
  type ImageRequestRecord,
  type ModeSettings,
  type SharedSettings,
  type StoredConsoleSettings,
  type RequestFilter,
  mergeSettingsForMode,
  isDefaultStrictPromptText,
  unpinPromptHistory,
} from "@/lib/image-console";
import {
  clearCachedRequests,
  loadCachedRequests,
  loadLastPromptForMode,
  loadPromptHistoryForMode,
  loadPinnedPromptHistoryForMode,
  loadRequestDetails,
  loadSettings,
  resetSettings as resetStoredSettings,
  deleteRequestDetails,
  saveCachedRequests,
  saveLastPrompt,
  savePromptHistory,
  savePinnedPromptHistory,
  saveRequestDetails,
  saveSettings,
} from "@/lib/storage";
import { getCopy, useI18n } from "@/lib/i18n";

type ConnectionTone = "default" | "busy" | "ok" | "error";
type ConnectionStatus = { label: string; tone: ConnectionTone };

interface StatusMessage {
  state: string;
  detail: string;
}

function normalizeSettings(values: AppSettings, defaultStrictPromptText: string): AppSettings {
  const strictPromptText = normalizeStrictPromptText(values.strictPromptText);
  const normalizedStrictPromptText = isDefaultStrictPromptText(strictPromptText)
    ? defaultStrictPromptText
    : strictPromptText;

  return {
    ...DEFAULTS,
    ...values,
    model: String(values.model || DEFAULTS.model).trim(),
    llmModel: String(values.llmModel || DEFAULTS.llmModel).trim(),
    rememberKey: Boolean(values.rememberKey),
    strictPromptText: normalizedStrictPromptText,
    strictPrompt: values.strictPrompt ?? DEFAULTS.strictPrompt,
    requestConcurrency: normalizeRequestConcurrency(values.requestConcurrency),
    requestIntervalSeconds: normalizeRequestIntervalSeconds(values.requestIntervalSeconds),
    n: imageCountFromValue(values.n || DEFAULTS.n),
    background: DEFAULTS.background,
    outputFormat: DEFAULTS.outputFormat,
  };
}

function queueStatusMessage(
  records: ImageRequestRecord[],
  settings: AppSettings,
  copy: ReturnType<typeof getCopy>,
): StatusMessage {
  const runningCount = records.filter((request) => request.status === "running").length;
  const queuedCount = records.filter((request) => request.status === "queued").length;
  const doneCount = records.filter((request) => request.status === "done").length;
  const failedCount = records.filter((request) => request.status === "error").length;
  const canceledCount = records.filter((request) => request.status === "canceled").length;
  const imageCount = records.reduce((sum, request) => sum + requestImageCount(request), 0);

  if (runningCount + queuedCount > 0) {
    return copy.queueRunning(settings, { running: runningCount, queued: queuedCount, done: doneCount, failed: failedCount });
  }

  if (!records.length) {
    return copy.waitingGeneration;
  }

  return copy.queueComplete(settings, { done: doneCount, failed: failedCount, canceled: canceledCount, imageCount });
}

function missingConnectionMessage(settings: Pick<AppSettings, "baseUrl" | "apiKey">, copy: ReturnType<typeof getCopy>) {
  const baseUrl = String(settings.baseUrl || "").trim();
  const apiKey = String(settings.apiKey || "").trim();
  if (baseUrl && apiKey) return "";
  return copy.generator.connectionRequired;
}

function adjacentVisibleRequestId(records: ImageRequestRecord[], requestId: string, filter: RequestFilter) {
  const visibleRequests = sortedRequestRecordsForFilter(records, filter);
  const index = visibleRequests.findIndex((request) => request.id === requestId);
  if (index < 0) return null;

  for (let cursor = index + 1; cursor < visibleRequests.length; cursor += 1) {
    if (requestMatchesFilter(visibleRequests[cursor], filter)) return visibleRequests[cursor].id;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (requestMatchesFilter(visibleRequests[cursor], filter)) return visibleRequests[cursor].id;
  }

  return null;
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
    for (const image of request.editImages || []) {
      if (image.src.startsWith("blob:")) urls.add(image.src);
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

function stripRequestRuntimeDetails(request: ImageRequestRecord): ImageRequestRecord {
  if (request.status === "queued" || request.status === "running") {
    return request;
  }

  if (!request.images.length && request.response == null && !request.editImages?.length) {
    return request;
  }

  return {
    ...request,
    images: [],
    response: null,
    editImages: [],
  };
}

const REQUEST_DETAIL_RETENTION_LIMIT = 8;

function keepOnlySelectedRequestDetails(
  records: ImageRequestRecord[],
  selectedRequestId: string | null,
  retainedRequestDetailIds: string[] = [],
) {
  const retainedIds = new Set(retainedRequestDetailIds);

  return records.map((request) => {
    if (request.id === selectedRequestId || retainedIds.has(request.id)) return request;
    return stripRequestRuntimeDetails(request);
  });
}

async function prepareThumbnailFromImage(image: GeneratedImage): Promise<GeneratedImage | null> {
  try {
    return await prepareImageForThumbnailCache(image);
  } catch {
    return image.kind === "url"
      ? ({
          src: image.src,
          kind: "url",
          path: image.path,
          mimeType: image.mimeType,
        } as GeneratedImage)
      : null;
  }
}

function initialStoredSettings(): StoredConsoleSettings {
  try {
    return loadSettings();
  } catch {
    return { ...DEFAULT_STORED_SETTINGS };
  }
}

function updateStoredSettingsForCurrentMode(
  current: StoredConsoleSettings,
  currentMode: ConsoleMode,
  values: AppSettings,
): StoredConsoleSettings {
  return {
    shared: normalizeSharedSettings(values),
    modeSettingsByMode: {
      ...current.modeSettingsByMode,
      [currentMode]: normalizeModeSettings(values),
    },
  };
}

function initialPrompt(mode: ConsoleMode) {
  try {
    return loadLastPromptForMode(mode);
  } catch {
    return "";
  }
}

function initialPromptHistory(mode: ConsoleMode) {
  try {
    return loadPromptHistoryForMode(mode);
  } catch {
    return [];
  }
}

function initialPinnedPromptHistory(mode: ConsoleMode) {
  try {
    return loadPinnedPromptHistoryForMode(mode);
  } catch {
    return [];
  }
}

function syncStrictPromptDefaults(settings: StoredConsoleSettings, defaultStrictPromptText: string) {
  if (!isDefaultStrictPromptText(settings.shared.strictPromptText)) return settings;
  if (settings.shared.strictPromptText === defaultStrictPromptText) return settings;

  return {
    ...settings,
    shared: {
      ...settings.shared,
      strictPromptText: defaultStrictPromptText,
    },
  };
}

export function useImageConsole() {
  const { copy, language } = useI18n();
  const strictPromptDefaultText = copy.promptEditor.defaultText;
  const [storedSettings, setStoredSettings] = useState<StoredConsoleSettings>(() =>
    syncStrictPromptDefaults(initialStoredSettings(), strictPromptDefaultText),
  );
  const [mode, setMode] = useState<ConsoleMode>("generate");
  const [promptByMode, setPromptByMode] = useState<Record<ConsoleMode, string>>(() => ({
    generate: initialPrompt("generate"),
    edit: initialPrompt("edit"),
  }));
  const [promptHistoryByMode, setPromptHistoryByMode] = useState<Record<ConsoleMode, string[]>>(() => ({
    generate: initialPromptHistory("generate"),
    edit: initialPromptHistory("edit"),
  }));
  const [pinnedPromptHistoryByMode, setPinnedPromptHistoryByMode] = useState<Record<ConsoleMode, string[]>>(() => ({
    generate: initialPinnedPromptHistory("generate"),
    edit: initialPinnedPromptHistory("edit"),
  }));
  const [editImages, setEditImages] = useState<EditInputImage[]>([]);
  const [historicalEditImageValue, setHistoricalEditImageValue] = useState("");
  const [requestRecords, setRequestRecords] = useState<ImageRequestRecord[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequestFilter, setSelectedRequestFilter] = useState<RequestFilter>("all");
  const [statusMessage, setStatusMessage] = useState<StatusMessage>({
    state: copy.waitingGeneration.state,
    detail: copy.waitingGeneration.detail,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    label: copy.tests.connectionReset,
    tone: "default",
  });
  const [testConnectionStatus, setTestConnectionStatus] = useState<ConnectionStatus>(() => ({
    label: copy.tests.test,
    tone: "default",
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [selectedRequestDetailLoadingId, setSelectedRequestDetailLoadingId] = useState<string | null>(null);

  const settings = useMemo(
    () => mergeSettingsForMode(storedSettings.shared, storedSettings.modeSettingsByMode[mode]),
    [mode, storedSettings],
  );
  const settingsRef = useRef(settings);
  const storedSettingsRef = useRef(storedSettings);
  const requestRecordsRef = useRef(requestRecords);
  const selectedRequestIdRef = useRef<string | null>(selectedRequestId);
  const retainedRequestDetailIdsRef = useRef<string[]>([]);
  const modeRef = useRef<ConsoleMode>("generate");
  const editImagesRef = useRef<EditInputImage[]>(editImages);
  const thumbnailBackfillRef = useRef(new Set<string>());
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
    storedSettingsRef.current = storedSettings;
  }, [storedSettings]);

  useEffect(() => {
    const nextStoredSettings = syncStrictPromptDefaults(storedSettingsRef.current, strictPromptDefaultText);
    if (nextStoredSettings === storedSettingsRef.current) return;

    setStoredSettings(nextStoredSettings);
    storedSettingsRef.current = nextStoredSettings;
    settingsRef.current = mergeSettingsForMode(
      nextStoredSettings.shared,
      nextStoredSettings.modeSettingsByMode[modeRef.current],
    );
    saveSettings(nextStoredSettings);
  }, [strictPromptDefaultText]);

  useEffect(() => {
    requestRecordsRef.current = requestRecords;
  }, [requestRecords]);

  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId;
  }, [selectedRequestId]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    setConnectionStatus((current) => ({
      label: current.tone === "ok" ? copy.tests.connectionSaved : copy.tests.connectionReset,
      tone: current.tone,
    }));
    setTestConnectionStatus((current) => {
      if (current.tone === "busy") {
        return { label: copy.tests.connectionTesting, tone: "busy" };
      }
      if (current.tone === "ok") {
        return { label: copy.tests.connectionNormal, tone: "ok" };
      }
      if (current.tone === "error") {
        return { label: copy.tests.connectionFailed, tone: "error" };
      }
      return { label: copy.tests.test, tone: "default" };
    });
    if (!requestRecordsRef.current.length) {
      setStatusMessage(copy.waitingGeneration);
    }
  }, [copy]);

  useEffect(() => {
    const previousImages = editImagesRef.current;
    const previousUrls = new Set(previousImages.map((image) => image.src).filter((src) => src.startsWith("blob:")));
    const nextUrls = new Set(editImages.map((image) => image.src).filter((src) => src.startsWith("blob:")));
    const removedUrls = [...previousUrls].filter((url) => !nextUrls.has(url));

    if (removedUrls.length) {
      revokeObjectUrls(removedUrls);
    }

    editImagesRef.current = editImages;
  }, [editImages]);

  useEffect(() => {
    return () => {
      revokeObjectUrls(editImagesRef.current.map((image) => image.src).filter((src) => src.startsWith("blob:")));
    };
  }, [copy]);

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
    void saveCachedRequests(next, language);
    setRequestRecords(next);
  }, []);

  const retainRequestDetail = useCallback((requestId: string | null | undefined) => {
    if (!requestId) return;

    const current = retainedRequestDetailIdsRef.current;
    retainedRequestDetailIdsRef.current = [requestId, ...current.filter((id) => id !== requestId)].slice(
      0,
      REQUEST_DETAIL_RETENTION_LIMIT,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadCachedRequests(language).then((records) => {
      if (cancelled) return;
      requestRecordsRef.current = records;
      setRequestRecords(records);
      setSelectedRequestId(records[records.length - 1]?.id || null);
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedRequestId) {
      setSelectedRequestDetailLoadingId(null);
      if (requestRecordsRef.current.some((request) => request.images.length || request.response != null)) {
        commitRecords((records) =>
          keepOnlySelectedRequestDetails(records, null, retainedRequestDetailIdsRef.current),
        );
      }
      return () => {
        cancelled = true;
      };
    }

    const selectedRequest = requestRecordsRef.current.find((request) => request.id === selectedRequestId);
    if (!selectedRequest) {
      setSelectedRequestDetailLoadingId(null);
      return () => {
        cancelled = true;
      };
    }

    const currentSelected = requestRecordsRef.current.find((request) => request.id === selectedRequestId);
    if (currentSelected && (currentSelected.images.length || currentSelected.response != null)) {
      retainRequestDetail(selectedRequestId);
    }

    commitRecords((records) =>
      keepOnlySelectedRequestDetails(records, selectedRequestId, retainedRequestDetailIdsRef.current),
    );

    const latestSelected = requestRecordsRef.current.find((request) => request.id === selectedRequestId);
    if (
      !latestSelected ||
      latestSelected.status !== "done" ||
      !latestSelected.hasCachedDetails ||
      latestSelected.detailsMissing ||
      latestSelected.images.length ||
      latestSelected.response != null
    ) {
      setSelectedRequestDetailLoadingId(null);
      return () => {
        cancelled = true;
      };
    }

    setSelectedRequestDetailLoadingId(selectedRequestId);

    void loadRequestDetails(selectedRequestId)
      .then(async (detail) => {
        if (cancelled) return;

        const detailImages = await Promise.all(
          (detail?.images || []).map((image) => prepareImageForDetailCacheWithDimensions(image)),
        );
        const normalizedDetailImages = detailImages.filter(isGeneratedImage);
        const thumbnail =
          detail?.thumbnail ||
          (normalizedDetailImages[0] ? await prepareImageForThumbnailCache(normalizedDetailImages[0]) : selectedRequest.thumbnail || null);
        const imageSizeBytes = normalizedDetailImages.reduce((sum, image) => sum + (image.blob?.size || 0), 0);

        if (detail && !cancelled) {
          void saveRequestDetails(
            [
              {
                ...selectedRequest,
                images: normalizedDetailImages,
                response: detail.response,
                thumbnail,
              },
            ],
            { prune: false },
          );
        }

        retainRequestDetail(selectedRequestId);

        commitRecords((records) =>
          records.map((request) =>
            request.id === selectedRequestId
                ? {
                  ...request,
                  images: normalizedDetailImages.map(prepareImageForRuntime),
                  response: detail?.response ?? null,
                  thumbnail: request.thumbnail || thumbnail || null,
                  imageCount: detailImages.length || request.imageCount || normalizedDetailImages.length || 0,
                  imageSizeBytes: request.imageSizeBytes || imageSizeBytes,
                  imageResolution:
                    request.imageResolution ||
                    (normalizedDetailImages[0]?.width && normalizedDetailImages[0]?.height
                      ? `${normalizedDetailImages[0].width}x${normalizedDetailImages[0].height}`
                      : ""),
                  hasCachedDetails: Boolean(detail || request.hasCachedDetails),
                  detailsMissing: !detail,
                }
              : request,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedRequestDetailLoadingId((current) => (current === selectedRequestId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commitRecords, retainRequestDetail, selectedRequestId]);

  useEffect(() => {
    let cancelled = false;

    const pendingRecords = requestRecordsRef.current.filter(
      (request) =>
        request.status === "done" &&
        !request.thumbnail &&
        request.hasCachedDetails &&
        !request.detailsMissing &&
        request.id !== selectedRequestId &&
        !thumbnailBackfillRef.current.has(request.id),
    );

    if (!pendingRecords.length) return () => {
      cancelled = true;
    };

    void (async () => {
      for (const request of pendingRecords) {
        if (cancelled) return;
        thumbnailBackfillRef.current.add(request.id);

        const detail = await loadRequestDetails(request.id);
        if (cancelled || !detail) continue;

        const thumbnail = detail.thumbnail || (detail.images[0] ? await prepareImageForThumbnailCache(detail.images[0]) : null);
        if (cancelled || !thumbnail) continue;

        commitRecords((records) =>
          records.map((item) =>
            item.id === request.id
              ? {
                  ...item,
                  thumbnail,
                  hasCachedDetails: true,
                }
              : item,
          ),
        );
        retainRequestDetail(request.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [commitRecords, retainRequestDetail, requestRecords, selectedRequestId]);

  useEffect(() => {
    return () => {
      clearQueueTimer();
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
      revokeObjectUrls(collectObjectUrls(requestRecordsRef.current));
    };
  }, [clearQueueTimer, copy]);

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

        if (request.method === "edit" && !request.editImages?.length) {
          throw new Error(copy.runtime.editRequestMissingImages);
        }

        const body =
          request.method === "edit"
            ? await postImageEdit(
                request.endpoint,
                request.apiKey || "",
                request.payload,
                request.editImages || [],
                controller.signal,
                language,
              )
            : await postImageGeneration(
                request.endpoint,
                request.apiKey || "",
                request.payload,
                controller.signal,
                language,
              );

        if (cancelRequestedRef.current.has(requestId)) {
          commitRecords((records) =>
            records.map((item) =>
              item.id === requestId
                ? {
                    ...item,
                    status: "canceled",
                    error: copy.runtime.requestCanceled,
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
        const detailImages = (
          await Promise.all(extractedImages.map((image) => prepareImageForDetailCacheWithDimensions(image)))
        ).filter(isGeneratedImage);
        const imageSizeBytes = detailImages.reduce((sum, image) => sum + (image.blob?.size || 0), 0);
        const shouldKeepRuntimeDetails = selectedRequestIdRef.current === requestId;
        const runtimeSourceImages =
          detailImages.length === extractedImages.length && detailImages.length > 0 ? detailImages : extractedImages;
        const images = shouldKeepRuntimeDetails ? runtimeSourceImages.map(prepareImageForRuntime) : [];
        const thumbnail = extractedImages[0] ? await prepareThumbnailFromImage(extractedImages[0]) : null;
        const displayResponse = sanitizeResponseForDisplay(body);
        const missingImageMessage = extractedImages.length ? "" : missingImageOutputMessage(body, language);

        void saveRequestDetails(
          [
            {
              ...request,
              images: detailImages,
              response: displayResponse,
              thumbnail,
            },
          ],
          { prune: false },
        );

        commitRecords((records) =>
          records.map((item) =>
            item.id === requestId
                ? {
                  ...item,
                  thumbnail: thumbnail || item.thumbnail || null,
                  response: shouldKeepRuntimeDetails ? displayResponse : null,
                  images,
                  imageCount: extractedImages.length,
                  imageSizeBytes: item.imageSizeBytes || imageSizeBytes,
                  imageResolution:
                    item.imageResolution ||
                    (detailImages[0]?.width && detailImages[0]?.height
                      ? `${detailImages[0].width}x${detailImages[0].height}`
                      : ""),
                  hasCachedDetails: true,
                  status: extractedImages.length ? "done" : "error",
                  error: missingImageMessage,
                  endedAt: performance.now(),
                  completedAt: extractedImages.length ? Date.now() : item.completedAt ?? null,
                  editImages: [],
                }
              : item,
          ),
        );
        retainRequestDetail(requestId);
      } catch (error) {
        const typedError = error as Error & { responseBody?: unknown };
        commitRecords((records) =>
          records.map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  status: typedError.name === "AbortError" ? "canceled" : "error",
                  error: typedError.name === "AbortError" ? copy.runtime.requestCanceled : typedError.message,
                  response:
                    typedError.name === "AbortError"
                      ? item.response
                      : typedError.responseBody == null
                        ? null
                        : sanitizeResponseForDisplay(typedError.responseBody),
                  endedAt: performance.now(),
                  editImages: [],
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
    [commitRecords, retainRequestDetail],
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
  }, [copy]);

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
      setStatusMessage(queueStatusMessage(requestRecords, settings, copy));
      return;
    }

    if (wasQueueActiveRef.current) {
      wasQueueActiveRef.current = false;
      lastRequestStartedAtRef.current = 0;
      clearQueueTimer();
      setStatusMessage(queueStatusMessage(requestRecords, settings, copy));
    }
  }, [clearQueueTimer, copy, requestRecords, settings]);

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
  const historicalEditImageOptions = useMemo(() => {
    return sortedRequestRecordsForFilter(requestRecords, "done")
      .filter((request) => !request.detailsMissing && requestImageCount(request) > 0)
      .flatMap((request) => {
        const count = requestImageCount(request);
        return Array.from({ length: count }, (_, imageIndex) => ({
          value: `${request.id}:${imageIndex}`,
          label: request.title,
          thumbnail: request.thumbnail || null,
          requestId: request.id,
          requestTitle: request.title,
          imageIndex,
        }));
      });
  }, [requestRecords]);

  const endpointPreview = useMemo(() => {
    const baseUrl = settings.baseUrl || DEFAULTS.baseUrl;
    const imageModel = String(settings.model || DEFAULTS.model).trim();
    const llmModel = String(settings.llmModel || DEFAULTS.llmModel).trim();
    return [
      `generations (${imageModel})\n${normalizeImageEndpoint(baseUrl)}`,
      `edits (${imageModel})\n${normalizeImageEditsEndpoint(baseUrl)}`,
      `responses (${llmModel})\n${normalizeResponsesEndpoint(baseUrl)}`,
      `completions (${llmModel})\n${normalizeChatCompletionsEndpoint(baseUrl)}`,
    ].join("\n\n");
  }, [settings.baseUrl, settings.llmModel, settings.model]);

  const selectedRequestJson = useMemo(() => {
    if (!selectedRequest) return "";

    const responseForDisplay =
      selectedRequest.response != null
        ? selectedRequest.response
        : selectedRequest.status === "error"
          ? {
              error: selectedRequest.error || copy.runtime.requestFailed,
              status: selectedRequest.status,
            }
          : null;

    if (responseForDisplay == null) return "";
    return JSON.stringify(sanitizeResponseForDisplay(responseForDisplay), null, 2);
  }, [selectedRequest]);
  const prompt = promptByMode[mode];

  const setPrompt = useCallback((value: string) => {
    const currentMode = modeRef.current;
    setPromptByMode((current) => ({
      ...current,
      [currentMode]: value,
    }));
    saveLastPrompt(value, currentMode);
  }, []);

  const updatePromptHistory = useCallback((updater: (history: string[]) => string[]) => {
    const currentMode = modeRef.current;
    setPromptHistoryByMode((current) => {
      const nextHistory = updater(current[currentMode]);
      savePromptHistory(nextHistory, currentMode);
      return {
        ...current,
        [currentMode]: nextHistory,
      };
    });
  }, []);

  const updatePinnedPromptHistory = useCallback((updater: (history: string[]) => string[]) => {
    const currentMode = modeRef.current;
    setPinnedPromptHistoryByMode((current) => {
      const nextHistory = updater(current[currentMode]);
      savePinnedPromptHistory(nextHistory, currentMode);
      return {
        ...current,
        [currentMode]: nextHistory,
      };
    });
  }, []);

  const selectPromptHistory = useCallback(
    (value: string) => {
      setPrompt(value);
      setStatusMessage({ state: copy.promptHistory.refilled, detail: value });
    },
    [copy, setPrompt],
  );

  const togglePromptHistoryPin = useCallback(
    (value: string) => {
      updatePinnedPromptHistory((history) => {
        const target = String(value || "").trim();
        if (!target) return history;
        const normalized = history.map((item) => item.trim()).filter(Boolean);
        return normalized.includes(target) ? unpinPromptHistory(normalized, target) : pinPromptHistory(normalized, target);
      });
    },
    [updatePinnedPromptHistory],
  );

  const deletePromptHistory = useCallback(
    (value: string) => {
      updatePromptHistory((history) => removePromptFromHistory(history, value));
      updatePinnedPromptHistory((history) => unpinPromptHistory(history, value));
    },
    [updatePinnedPromptHistory, updatePromptHistory],
  );

  const addHistoricalEditImage = useCallback(
    async (value: string) => {
      const [requestId, imageIndexText] = String(value || "").split(":");
      const imageIndex = Number.parseInt(imageIndexText, 10);
      if (!requestId || !Number.isInteger(imageIndex) || imageIndex < 0) return;

      setHistoricalEditImageValue("");
      const sourceKey = `${requestId}:${imageIndex}`;
      const request = requestRecordsRef.current.find((item) => item.id === requestId);

      if (!request) {
        toast.error(copy.runtime.missingHistoricalRequest);
        return;
      }

      if (editImagesRef.current.some((item) => item.sourceKey === sourceKey)) {
        setStatusMessage({
          state: copy.runtime.historicalImageExists(request.title, imageIndex),
          detail: copy.runtime.historicalImageExists(request.title, imageIndex),
        });
        return;
      }

      if (editImagesRef.current.length >= MAX_EDIT_INPUT_IMAGES) {
        const message = copy.generator.maxEditImages(MAX_EDIT_INPUT_IMAGES);
        toast.error(message);
        setStatusMessage({ state: copy.runtime.historicalImageFull, detail: message });
        return;
      }

      if (request.status !== "done" || request.detailsMissing) {
        toast.error(copy.runtime.historicalRequestHasNoImage);
        return;
      }

      try {
        const detail = await loadRequestDetails(requestId);
        const sourceImage = detail?.images?.[imageIndex];
        if (!sourceImage) {
          toast.error(copy.runtime.historicalImageNotFound);
          return;
        }

        const mimeType = sourceImage.mimeType || "image/png";
        const extension = mimeType.replace(/^image\//, "") || "png";
        const image = prepareEditInputImage(sourceImage, `${request.title}-image-${imageIndex + 1}.${extension}`);

        if (!image) {
          toast.error(copy.runtime.historicalImageNotEditable);
          return;
        }

        setEditImages((current) => {
          if (current.some((item) => item.sourceKey === sourceKey)) return current;
          return [...current, { ...image, sourceKey }];
        });
        setStatusMessage({
          state: copy.runtime.historicalImageAddedToEdit(request.title, imageIndex),
          detail: copy.runtime.historicalImageAddedToEdit(request.title, imageIndex),
        });
      } catch (error) {
        const message = (error as Error).message || copy.runtime.historicalImageLoadFailed;
        toast.error(message);
        setStatusMessage({ state: copy.runtime.historicalImageLoadFailed, detail: message });
      }
    },
    [copy],
  );

  const updateSettings = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setStoredSettings((current) => {
      if (
        key === "baseUrl" ||
        key === "apiKey" ||
        key === "rememberKey" ||
        key === "model" ||
        key === "llmModel" ||
        key === "strictPromptText" ||
        key === "requestConcurrency" ||
        key === "requestIntervalSeconds"
      ) {
        return {
          ...current,
          shared: {
            ...current.shared,
            [key]: value,
          } as SharedSettings,
        };
      }

      const currentMode = modeRef.current;
      return {
        ...current,
        modeSettingsByMode: {
          ...current.modeSettingsByMode,
          [currentMode]: {
            ...current.modeSettingsByMode[currentMode],
            [key]: value,
          } as ModeSettings,
        },
      };
    });
    if (key === "baseUrl" || key === "apiKey") {
      setTestConnectionStatus({ label: copy.tests.test, tone: "default" });
    }
  }, [copy]);

  const saveCurrentSettings = useCallback(() => {
    const normalized = normalizeSettings(settingsRef.current, strictPromptDefaultText);
    const nextStoredSettings = updateStoredSettingsForCurrentMode(storedSettingsRef.current, modeRef.current, normalized);
    setStoredSettings(nextStoredSettings);
    storedSettingsRef.current = nextStoredSettings;
    settingsRef.current = normalized;
    saveSettings(nextStoredSettings);
    setConnectionStatus({ label: copy.tests.connectionSaved, tone: "ok" });
    setStatusMessage({
      state: copy.tests.connectionSaved,
      detail: `${copy.requestSummary(normalized)} · ${copy.settings.generationModel} ${normalized.model} · ${copy.settings.llmModel} ${normalized.llmModel}`,
    });
    clearQueueTimer();
    setSettingsOpen(false);
    scheduleQueueRef.current();
  }, [clearQueueTimer, copy, strictPromptDefaultText]);

  const resetSettings = useCallback(() => {
    resetStoredSettings();
    const defaults = { ...DEFAULT_STORED_SETTINGS };
    setStoredSettings(defaults);
    storedSettingsRef.current = defaults;
    settingsRef.current = mergeSettingsForMode(defaults.shared, defaults.modeSettingsByMode[modeRef.current]);
    setConnectionStatus({ label: copy.tests.connectionReset, tone: "default" });
    setTestConnectionStatus({ label: copy.tests.test, tone: "default" });
    setStatusMessage({ state: copy.tests.connectionReset, detail: copy.tests.connectionResetDetail });
  }, [copy]);

  const testConnection = useCallback(async () => {
    const currentSettings = settingsRef.current;
    const endpoint = normalizeModelsEndpoint(currentSettings.baseUrl);
    setTestConnectionStatus({ label: copy.tests.connectionTesting, tone: "busy" });
    setStatusMessage({ state: copy.tests.connectionTesting, detail: endpoint });

    try {
      await fetchModels(currentSettings.baseUrl, currentSettings.apiKey, language);
      setTestConnectionStatus({ label: copy.tests.connectionNormal, tone: "ok" });
      setStatusMessage({ state: copy.tests.connectionNormal, detail: copy.tests.connectionNormalDetail });
    } catch (error) {
      setTestConnectionStatus({ label: copy.tests.connectionFailed, tone: "error" });
      setStatusMessage({ state: copy.tests.connectionFailed, detail: (error as Error).message });
    }
  }, [copy]);

  const enqueueGeneration = useCallback(
    (generationMode: "images" | "responses" | "completions") => {
      if (!String(prompt || "").trim()) {
        toast.error(copy.generator.promptRequired);
        return false;
      }

      const requestConfigMessage = missingConnectionMessage(settingsRef.current, copy);
      if (requestConfigMessage) {
        setStatusMessage({ state: copy.generator.requestNotCreated, detail: requestConfigMessage });
        toast.error(requestConfigMessage);
        return false;
      }

      const currentSettings = normalizeSettings(settingsRef.current, strictPromptDefaultText);
      const values = { ...currentSettings, prompt };
      saveLastPrompt(prompt, modeRef.current);

      let requestPayloads;
      let endpoint: string;
      let method: GenerationMethod;

      try {
        if (generationMode === "completions") {
          const payload = buildChatCompletionsImagePayload(values, language);
          requestPayloads = buildChatCompletionsImageRequests(payload, values.n);
          endpoint = normalizeChatCompletionsEndpoint(values.baseUrl);
          method = "completions";
        } else if (generationMode === "responses") {
          const payload = buildResponsesImagePayload(values, language);
          requestPayloads = buildResponsesImageRequests(payload, values.n);
          endpoint = normalizeResponsesEndpoint(values.baseUrl);
          method = "image_generation";
        } else {
          const payload = buildPayload(values, language);
          requestPayloads = buildGenerationRequests(payload);
          endpoint = normalizeImageEndpoint(values.baseUrl);
          method = "gpt-image-2";
        }
      } catch (error) {
        const message = (error as Error).message;
        setStatusMessage({ state: copy.generator.requestNotCreated, detail: message });
        toast.error(message);
        return false;
      }

      const nextStoredSettings = updateStoredSettingsForCurrentMode(
        storedSettingsRef.current,
        modeRef.current,
        currentSettings,
      );
      setStoredSettings(nextStoredSettings);
      storedSettingsRef.current = nextStoredSettings;
      saveSettings(nextStoredSettings);
      updatePromptHistory((history) => addPromptToHistory(history, prompt));

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
      setSelectedRequestId((currentId) => currentId || newRequests[0]?.id || null);
      setStatusMessage({
        state: copy.generator.requestQueued,
        detail: copy.runtime.queuedRequestDetail(
          generationMethodDisplayName(method),
          newRequests.length,
          requestControlSummary(currentSettings, language),
          endpoint,
        ),
      });
      toast.success(copy.generator.submissionSuccess(newRequests.length));
      scheduleQueueRef.current();
      return true;
    },
    [commitRecords, copy, prompt, strictPromptDefaultText, updatePromptHistory],
  );

  const enqueueEditGeneration = useCallback(() => {
    if (!String(prompt || "").trim()) {
      toast.error(copy.generator.promptRequired);
      return false;
    }

    const requestConfigMessage = missingConnectionMessage(settingsRef.current, copy);
    if (requestConfigMessage) {
      setStatusMessage({ state: copy.generator.requestNotCreated, detail: requestConfigMessage });
      toast.error(requestConfigMessage);
      return false;
    }

    if (!editImages.length) {
      const message = copy.generator.selectAtLeastOneImage;
      setStatusMessage({ state: copy.generator.requestNotCreated, detail: message });
      toast.error(message);
      return false;
    }

    const currentSettings = normalizeSettings(settingsRef.current, strictPromptDefaultText);
    const values = { ...currentSettings, prompt };
    saveLastPrompt(prompt, modeRef.current);

    let requestPayloads;
    let endpoint: string;
    let method: GenerationMethod;
    const runtimeImages = editImages.map((image) => ({ ...image }));

    try {
      const payload = buildEditImagePayload(values, runtimeImages, language);
      requestPayloads = buildEditImageRequests(payload, values.n);
      endpoint = normalizeImageEditsEndpoint(values.baseUrl);
      method = "edit";
    } catch (error) {
      const message = (error as Error).message;
      setStatusMessage({ state: copy.generator.requestNotCreated, detail: message });
      toast.error(message);
      return false;
    }

    const nextStoredSettings = updateStoredSettingsForCurrentMode(
      storedSettingsRef.current,
      modeRef.current,
      currentSettings,
    );
    setStoredSettings(nextStoredSettings);
    storedSettingsRef.current = nextStoredSettings;
    saveSettings(nextStoredSettings);
    updatePromptHistory((history) => addPromptToHistory(history, prompt));

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
      editImages: runtimeImages,
    }));

    commitRecords((records) => [...records, ...newRequests]);
    setSelectedRequestId((currentId) => currentId || newRequests[0]?.id || null);
    setStatusMessage({
      state: copy.generator.requestQueued,
      detail: copy.runtime.queuedRequestDetail(
        generationMethodDisplayName(method),
        newRequests.length,
        requestControlSummary(currentSettings, language),
        endpoint,
      ),
    });
    toast.success(copy.generator.submissionSuccess(newRequests.length));
    scheduleQueueRef.current();
    return true;
  }, [commitRecords, copy, editImages, prompt, strictPromptDefaultText, updatePromptHistory]);

  const cancelRequest = useCallback(
    (requestId: string) => {
      const request = requestRecordsRef.current.find((item) => item.id === requestId);
      if (!request || (request.status !== "queued" && request.status !== "running")) return;

      const now = performance.now();
      const wasQueued = request.status === "queued";
      const nextSelectedRequestId = adjacentVisibleRequestId(requestRecordsRef.current, requestId, selectedRequestFilter);
      cancelRequestedRef.current.add(requestId);
      controllersRef.current.get(requestId)?.abort();

      commitRecords((records) =>
        records.map((item) =>
          item.id === requestId
            ? {
                ...item,
                status: "canceled",
                endedAt: now,
                error: wasQueued ? copy.runtime.requestCanceledBeforeSend : copy.runtime.requestCanceled,
                cancelRequested: true,
                editImages: [],
              }
            : item,
        ),
      );
      setSelectedRequestId(nextSelectedRequestId);
      setStatusMessage({ state: copy.runtime.requestCanceled, detail: request.title });
      scheduleQueueRef.current();
    },
    [commitRecords, copy, selectedRequestFilter],
  );

  const cancelAllRequests = useCallback(() => {
    const activeRequests = requestRecordsRef.current.filter(isActiveRequest);
    if (!activeRequests.length) return;

    const now = performance.now();
    const runningRequests = activeRequests.filter((request) => request.status === "running");

    for (const request of runningRequests) {
      cancelRequestedRef.current.add(request.id);
      controllersRef.current.get(request.id)?.abort();
    }

    clearQueueTimer();
    wasQueueActiveRef.current = false;
    lastRequestStartedAtRef.current = 0;
    setSelectedRequestDetailLoadingId(null);

      commitRecords((records) =>
        records.map((item) =>
          isActiveRequest(item)
            ? {
                ...item,
                status: "canceled",
                endedAt: now,
                error: item.status === "queued" ? copy.runtime.requestCanceledBeforeSend : copy.runtime.requestCanceled,
                cancelRequested: true,
                editImages: [],
              }
            : item,
        ),
      );
    setStatusMessage({ state: copy.runtime.requestCanceled, detail: copy.runtime.requestsCanceled(activeRequests.length) });
  }, [clearQueueTimer, commitRecords, copy]);

  const clearAllRequests = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
    cancelRequestedRef.current.clear();
    clearQueueTimer();
    wasQueueActiveRef.current = false;
    lastRequestStartedAtRef.current = 0;
    setSelectedRequestDetailLoadingId(null);
    thumbnailBackfillRef.current.clear();
    retainedRequestDetailIdsRef.current = [];
    revokeObjectUrls(collectObjectUrls(requestRecordsRef.current));
    requestRecordsRef.current = [];
    setRequestRecords([]);
    setSelectedRequestId(null);
    void clearCachedRequests();
      setStatusMessage({ state: copy.runtime.allRequestsCleared, detail: copy.runtime.allRequestsCleared });
  }, [clearQueueTimer, copy]);

  const clearCompletedRequests = useCallback(() => {
    const removedIds = requestRecordsRef.current
      .filter((request) => requestMatchesFilter(request, "done"))
      .map((request) => request.id);

    if (!removedIds.length) return;

    setSelectedRequestDetailLoadingId(null);
    commitRecords((records) => records.filter((request) => !requestMatchesFilter(request, "done")));
    void deleteRequestDetails(removedIds);
    setStatusMessage({ state: copy.runtime.completedRequestsCleared, detail: copy.runtime.completedRequestsCleared });
  }, [commitRecords, copy]);

  const clearFailedRequests = useCallback(() => {
    const removedIds = requestRecordsRef.current
      .filter((request) => requestMatchesFilter(request, "failed"))
      .map((request) => request.id);
    setSelectedRequestDetailLoadingId(null);
    commitRecords((records) => records.filter((request) => !requestMatchesFilter(request, "failed")));
    void deleteRequestDetails(removedIds);
    setStatusMessage({ state: copy.runtime.failedRequestsCleared, detail: copy.runtime.failedRequestsCleared });
  }, [commitRecords, copy]);

  const deleteRequest = useCallback(
    (requestId: string) => {
      const request = requestRecordsRef.current.find((item) => item.id === requestId);
      if (!request || isActiveRequest(request)) return;

      const nextSelectedRequestId = adjacentVisibleRequestId(requestRecordsRef.current, requestId, selectedRequestFilter);

      retainedRequestDetailIdsRef.current = retainedRequestDetailIdsRef.current.filter((id) => id !== requestId);
      thumbnailBackfillRef.current.delete(requestId);
      setSelectedRequestDetailLoadingId((current) => (current === requestId ? null : current));

      commitRecords((records) => records.filter((item) => item.id !== requestId));
      void deleteRequestDetails([requestId]);

      setSelectedRequestId((current) => (current === requestId ? nextSelectedRequestId : current));
      setStatusMessage({ state: copy.requestCardStatus.deletedRequest, detail: request.title });
    },
    [commitRecords, copy, selectedRequestFilter],
  );

  const reusePrompt = useCallback(
    (request: ImageRequestRecord) => {
      const reusablePrompt = reusablePromptForRequest(request);
      if (!reusablePrompt) return;
      setPrompt(reusablePrompt);
      setStatusMessage({ state: copy.promptHistory.refilled, detail: request.title });
    },
    [copy, setPrompt],
  );

  const selectedRequestDownload = selectedRequest?.images?.[0]?.src
    ? {
        href: selectedRequest.images[0].src,
        download: imageDownloadName(selectedRequest, 0),
      }
    : null;

  const selectedRequestTiming = selectedRequest ? formatRequestTiming(selectedRequest, now, language === "en" ? "en" : "zh") : "-";
  const currentPromptHistory = promptHistoryByMode[mode];
  const currentPinnedPromptHistory = pinnedPromptHistoryByMode[mode];
  const promptHistoryEntries = useMemo(
    () => mergePromptHistoryForDisplay(currentPinnedPromptHistory, currentPromptHistory),
    [currentPinnedPromptHistory, currentPromptHistory],
  );

  return {
    settings,
    prompt,
    mode,
    editImages,
    promptHistory: promptHistoryEntries,
    promptHistoryCount: currentPromptHistory.length,
    promptHistoryPinnedCount: currentPinnedPromptHistory.length,
    requestRecords,
    filteredRequests,
    selectedRequest,
    selectedRequestId,
    selectedRequestFilter,
    requestCounts,
    statusMessage,
    connectionStatus,
    testConnectionStatus,
    selectedRequestDetailLoadingId,
    endpointPreview,
    settingsOpen,
    clearDialogOpen,
    jsonDialogOpen,
    selectedRequestJson,
    selectedRequestDownload,
    selectedRequestTiming,
    now,
    historicalEditImageValue,
    historicalEditImageOptions,
    setPrompt,
    setMode,
    setEditImages,
    setHistoricalEditImageValue,
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
    enqueueEditGeneration,
    cancelRequest,
    deleteRequest,
    cancelAllRequests,
    clearAllRequests,
    clearCompletedRequests,
    clearFailedRequests,
    reusePrompt,
    selectPromptHistory,
    deletePromptHistory,
    togglePromptHistoryPin,
    addHistoricalEditImage,
    payloadSize,
    requestImageCount,
    formatRequestTiming,
  };
}
