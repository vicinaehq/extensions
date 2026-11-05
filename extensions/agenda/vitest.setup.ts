import { vi } from "vitest";

vi.mock("@vicinae/api", () => ({
  Cache: class MockCache {
    get() {
      return undefined;
    }
    set() {}
  },
  environment: { supportPath: `/tmp/agenda-test-${process.pid}` },
  Color: {
    Red: "red",
    Orange: "orange",
    Yellow: "yellow",
    Green: "green",
    Blue: "blue",
    Purple: "purple",
    Magenta: "magenta",
  },
  LocalStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
