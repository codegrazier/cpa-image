import {
  normalizeRequestConcurrency,
  normalizeRequestIntervalSeconds,
  requestMatchesFilter,
  sortedRequestRecordsForFilter,
  type AppSettings,
  type ImageRequestRecord,
  type RequestFilter,
} from "@/lib/image-console";

export type QueueRunPlan =
  | { type: "idle" }
  | { type: "delay"; delayMs: number }
  | { type: "run"; requestId: string; startedAt: number };

export function isActiveRequest(request: Pick<ImageRequestRecord, "status">) {
  return request.status === "queued" || request.status === "running";
}

export function adjacentVisibleRequestId(records: ImageRequestRecord[], requestId: string, filter: RequestFilter) {
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

export function nextQueueRunPlan({
  records,
  settings,
  lastStartedAt,
  now,
}: {
  records: ImageRequestRecord[];
  settings: Pick<AppSettings, "requestConcurrency" | "requestIntervalSeconds">;
  lastStartedAt: number;
  now: number;
}): QueueRunPlan {
  const runningCount = records.filter((request) => request.status === "running").length;
  const openSlots = Math.max(0, normalizeRequestConcurrency(settings.requestConcurrency) - runningCount);
  const [nextRequest] = records.filter((request) => request.status === "queued").slice(0, openSlots);

  if (!nextRequest) return { type: "idle" };

  const intervalMs = normalizeRequestIntervalSeconds(settings.requestIntervalSeconds) * 1000;
  const elapsedSinceLastStart = lastStartedAt ? now - lastStartedAt : intervalMs;
  const delayMs = Math.max(0, intervalMs - elapsedSinceLastStart);

  if (delayMs > 0) return { type: "delay", delayMs };
  return { type: "run", requestId: nextRequest.id, startedAt: now };
}
