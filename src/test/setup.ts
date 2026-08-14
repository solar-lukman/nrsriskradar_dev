import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Radix Select/Popover rely on pointer-capture APIs jsdom does not implement.
(Element.prototype as any).hasPointerCapture ??= () => false;
(Element.prototype as any).setPointerCapture ??= () => {};
(Element.prototype as any).releasePointerCapture ??= () => {};
(Element.prototype as any).scrollIntoView ??= () => {};

// Radix ScrollArea / Select measure with ResizeObserver, absent in jsdom.
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
