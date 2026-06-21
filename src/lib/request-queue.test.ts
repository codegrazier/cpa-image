import { describe, expect, test } from "vitest";

import { adjacentVisibleRequestId, isActiveRequest, nextQueueRunPlan } from "@/lib/request-queue";
import { type ImageRequestRecord, type RequestStatus } from "@/lib/image-console";

function requestFixture(id: string, status: RequestStatus): ImageRequestRecord {
  return {
    id,
    title: id,
    index: 1,
    total: 1,
    method: "gpt-image-2",
    endpoint: "http://localhost:8317/v1/images/generations",
    payload: {},
    sourcePrompt: "",
    status,
    createdAt: 0,
    startedAt: null,
    endedAt: null,
    images: [],
    response: null,
    error: "",
  };
}

describe("request queue", () => {
  test("detects active request statuses", () => {
    expect(isActiveRequest(requestFixture("queued", "queued"))).toBe(true);
    expect(isActiveRequest(requestFixture("running", "running"))).toBe(true);
    expect(isActiveRequest(requestFixture("done", "done"))).toBe(false);
    expect(isActiveRequest(requestFixture("error", "error"))).toBe(false);
  });

  test("selects an adjacent visible request after removal", () => {
    const records = [
      requestFixture("260617-1801-1", "done"),
      requestFixture("260617-1801-2", "done"),
      requestFixture("260617-1801-3", "error"),
    ];

    expect(adjacentVisibleRequestId(records, "260617-1801-2", "done")).toBe("260617-1801-1");
    expect(adjacentVisibleRequestId(records, "260617-1801-1", "done")).toBe("260617-1801-2");
    expect(adjacentVisibleRequestId(records, "missing", "done")).toBeNull();
  });

  test("returns idle when there is no queued request or no concurrency slot", () => {
    expect(
      nextQueueRunPlan({
        records: [requestFixture("done", "done")],
        settings: { requestConcurrency: 2, requestIntervalSeconds: 0 },
        lastStartedAt: 0,
        now: 1000,
      }),
    ).toEqual({ type: "idle" });

    expect(
      nextQueueRunPlan({
        records: [requestFixture("running", "running"), requestFixture("queued", "queued")],
        settings: { requestConcurrency: 1, requestIntervalSeconds: 0 },
        lastStartedAt: 0,
        now: 1000,
      }),
    ).toEqual({ type: "idle" });
  });

  test("delays a queued request until the interval has elapsed", () => {
    expect(
      nextQueueRunPlan({
        records: [requestFixture("queued", "queued")],
        settings: { requestConcurrency: 1, requestIntervalSeconds: 2 },
        lastStartedAt: 1000,
        now: 2500,
      }),
    ).toEqual({ type: "delay", delayMs: 500 });
  });

  test("selects the next queued request when a slot is open", () => {
    expect(
      nextQueueRunPlan({
        records: [requestFixture("running", "running"), requestFixture("queued", "queued")],
        settings: { requestConcurrency: 2, requestIntervalSeconds: 0 },
        lastStartedAt: 0,
        now: 3000,
      }),
    ).toEqual({ type: "run", requestId: "queued", startedAt: 3000 });
  });
});
