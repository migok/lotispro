import '@testing-library/jest-dom'

// jsdom has no layout observer; Radix uses it only for floating-element dimensions.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
