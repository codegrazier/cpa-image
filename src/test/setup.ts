import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

globalThis.ResizeObserver = ResizeObserverMock;

const testStorage = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return testStorage.size;
  },
  clear: () => testStorage.clear(),
  getItem: (key: string) => testStorage.get(key) ?? null,
  key: (index: number) => Array.from(testStorage.keys())[index] ?? null,
  removeItem: (key: string) => testStorage.delete(key),
  setItem: (key: string, value: string) => testStorage.set(key, String(value)),
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

let objectUrlIndex = 0;

Object.defineProperty(globalThis.URL, "createObjectURL", {
  configurable: true,
  value: () => {
    objectUrlIndex += 1;
    return `blob:test-image-${objectUrlIndex}`;
  },
});

Object.defineProperty(globalThis.URL, "revokeObjectURL", {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(globalThis, "createImageBitmap", {
  configurable: true,
  value: async () => ({
    width: 512,
    height: 512,
    close: () => undefined,
  }),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => ({
    drawImage: () => undefined,
  }),
});

Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
  configurable: true,
  value: () => "data:image/webp;base64,dGVzdC10aHVtYm5haWw=",
});
