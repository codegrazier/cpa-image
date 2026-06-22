import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { clearRequestDetails, deleteRequestDetails, loadRequestDetails, saveRequestDetails } from "@/lib/storage";
import { type ImageRequestRecord } from "@/lib/image-console";

type FakeRequest<T = unknown> = IDBRequest<T> & {
  result: T;
  error: DOMException | null;
  onsuccess: ((this: IDBRequest<T>, event: Event) => unknown) | null;
  onerror: ((this: IDBRequest<T>, event: Event) => unknown) | null;
  onupgradeneeded?: ((event: IDBVersionChangeEvent) => unknown) | null;
};

function requestRecordFixture(overrides: Partial<ImageRequestRecord> = {}): ImageRequestRecord {
  return {
    id: "request",
    title: "260617-1801-1",
    index: 1,
    total: 1,
    method: "gpt-image-2",
    endpoint: "http://localhost:8317/v1/images/generations",
    payload: {},
    sourcePrompt: "",
    status: "done",
    createdAt: 0,
    startedAt: 1,
    endedAt: 2,
    completedAt: 3,
    images: [],
    response: null,
    rawResponse: null,
    error: "",
    ...overrides,
  };
}

function makeRequest<T>(): FakeRequest<T> {
  return {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null,
  } as FakeRequest<T>;
}

function createFakeIndexedDB(): IDBFactory {
  class FakeTransaction {
    oncomplete: ((this: IDBTransaction, event: Event) => unknown) | null = null;
    onerror: ((this: IDBTransaction, event: Event) => unknown) | null = null;
    onabort: ((this: IDBTransaction, event: Event) => unknown) | null = null;
    private pending = 0;
    private completed = false;

    constructor(private stores: Map<string, Map<IDBValidKey, unknown>>) {}

    objectStore(name: string) {
      let store = this.stores.get(name);
      if (!store) {
        store = new Map<IDBValidKey, unknown>();
        this.stores.set(name, store);
      }
      return new FakeObjectStore(store, this) as unknown as IDBObjectStore;
    }

    run<T>(operation: () => T) {
      const request = makeRequest<T>();
      this.pending += 1;

      window.setTimeout(() => {
        try {
          request.result = operation();
          request.onsuccess?.call(request, new Event("success"));
        } catch (error) {
          request.error = error instanceof DOMException ? error : new DOMException(String(error));
          request.onerror?.call(request, new Event("error"));
        } finally {
          this.pending -= 1;
          this.completeWhenIdle();
        }
      }, 0);

      return request as IDBRequest<T>;
    }

    private completeWhenIdle() {
      if (this.completed || this.pending > 0) return;
      this.completed = true;
      window.setTimeout(() => {
        this.oncomplete?.call(this as unknown as IDBTransaction, new Event("complete"));
      }, 0);
    }
  }

  class FakeObjectStore {
    constructor(
      private store: Map<IDBValidKey, unknown>,
      private transaction: FakeTransaction,
    ) {}

    put(value: { id: IDBValidKey }) {
      return this.transaction.run(() => {
        this.store.set(value.id, structuredClone(value));
        return value.id;
      });
    }

    delete(key: IDBValidKey) {
      return this.transaction.run(() => {
        this.store.delete(key);
        return undefined;
      });
    }

    clear() {
      return this.transaction.run(() => {
        this.store.clear();
        return undefined;
      });
    }

    get(key: IDBValidKey) {
      return this.transaction.run(() => structuredClone(this.store.get(key)));
    }

    getAll() {
      return this.transaction.run(() => Array.from(this.store.values()).map((value) => structuredClone(value)));
    }

    getAllKeys() {
      return this.transaction.run(() => Array.from(this.store.keys()));
    }
  }

  class FakeDatabase {
    private stores = new Map<string, Map<IDBValidKey, unknown>>();

    objectStoreNames = {
      contains: (name: string) => this.stores.has(name),
    } as DOMStringList;

    createObjectStore(name: string) {
      if (!this.stores.has(name)) {
        this.stores.set(name, new Map<IDBValidKey, unknown>());
      }
      return {} as IDBObjectStore;
    }

    transaction(name: string) {
      if (!this.stores.has(name)) {
        this.stores.set(name, new Map<IDBValidKey, unknown>());
      }
      return new FakeTransaction(this.stores) as unknown as IDBTransaction;
    }

    close() {
      return undefined;
    }
  }

  const database = new FakeDatabase();

  return {
    open: () => {
      const request = makeRequest<IDBDatabase>();
      window.setTimeout(() => {
        request.result = database as unknown as IDBDatabase;
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
        request.onsuccess?.call(request, new Event("success"));
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
}

describe("storage", () => {
  const originalIndexedDB = globalThis.indexedDB;

  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: createFakeIndexedDB(),
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDB,
    });
  });

  test("allows saving request details again after a prior delete completes", async () => {
    await saveRequestDetails([requestRecordFixture({ id: "same-request", rawResponse: { marker: "first" } })]);
    expect(await loadRequestDetails("same-request")).toMatchObject({ rawResponse: { marker: "first" } });

    await deleteRequestDetails(["same-request"]);
    expect(await loadRequestDetails("same-request")).toBeNull();

    await saveRequestDetails([requestRecordFixture({ id: "same-request", rawResponse: { marker: "second" } })]);

    expect(await loadRequestDetails("same-request")).toMatchObject({ rawResponse: { marker: "second" } });
  });

  test("does not restore details when a pending save is deleted before it runs", async () => {
    const save = saveRequestDetails([requestRecordFixture({ id: "deleted-request", rawResponse: { marker: "late" } })]);
    const deletion = deleteRequestDetails(["deleted-request"]);

    await Promise.all([save, deletion]);

    expect(await loadRequestDetails("deleted-request")).toBeNull();
  });

  test("does not restore details when a pending save is cleared before it runs", async () => {
    const save = saveRequestDetails([requestRecordFixture({ id: "cleared-request", rawResponse: { marker: "late" } })]);
    const clear = clearRequestDetails();

    await Promise.all([save, clear]);

    expect(await loadRequestDetails("cleared-request")).toBeNull();
  });

  test("does not restore details when an old request saves after clear all completes", async () => {
    await deleteRequestDetails(["late-cleared-request"], { retainTombstones: true });
    await clearRequestDetails();

    await saveRequestDetails([requestRecordFixture({ id: "late-cleared-request", rawResponse: { marker: "late" } })]);

    expect(await loadRequestDetails("late-cleared-request")).toBeNull();
  });

  test("keeps the latest cleared request batch fully blocked and bounds older batches", async () => {
    const firstBatchIds = Array.from({ length: 2001 }, (_, index) => `first-blocked-${index}`);
    await deleteRequestDetails(firstBatchIds, { retainTombstones: true });

    await saveRequestDetails([requestRecordFixture({ id: "first-blocked-0", rawResponse: { marker: "still-blocked" } })]);
    expect(await loadRequestDetails("first-blocked-0")).toBeNull();

    const secondBatchIds = Array.from({ length: 2001 }, (_, index) => `second-blocked-${index}`);
    await deleteRequestDetails(secondBatchIds, { retainTombstones: true });

    await saveRequestDetails([requestRecordFixture({ id: "first-blocked-0", rawResponse: { marker: "expired" } })]);
    await saveRequestDetails([requestRecordFixture({ id: "first-blocked-2000", rawResponse: { marker: "history" } })]);
    await saveRequestDetails([requestRecordFixture({ id: "second-blocked-0", rawResponse: { marker: "latest" } })]);

    expect(await loadRequestDetails("first-blocked-0")).toMatchObject({ rawResponse: { marker: "expired" } });
    expect(await loadRequestDetails("first-blocked-2000")).toBeNull();
    expect(await loadRequestDetails("second-blocked-0")).toBeNull();
  });
});
