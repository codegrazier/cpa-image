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
