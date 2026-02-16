import { describe, it, expect } from "vitest";
import {
  validateConfig,
  fetchEntities,
  toggleEntity,
  turnOnEntity,
  turnOffEntity,
  openCover,
  closeCover,
  stopCover,
} from "./api";

describe("validateConfig", () => {
  it("should validate correct config", () => {
    const config = {
      url: "http://homeassistant.local:8123",
      token: "ABC123DEF456",
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("should throw missing URL error", () => {
    const config = {
      url: "",
      token: "ABC123DEF456",
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it("should throw invalid URL error", () => {
    const config = {
      url: "not-a-url",
      token: "ABC123DEF456",
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it("should throw missing token error", () => {
    const config = {
      url: "http://homeassistant.local:8123",
      token: "",
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it("should throw invalid token error", () => {
    const config = {
      url: "http://homeassistant.local:8123",
      token: "short",
    };
    expect(() => validateConfig(config)).toThrow();
  });
});

describe("api functions", () => {
  it("should export all required functions", () => {
    expect(typeof fetchEntities).toBe("function");
    expect(typeof toggleEntity).toBe("function");
    expect(typeof turnOnEntity).toBe("function");
    expect(typeof turnOffEntity).toBe("function");
    expect(typeof openCover).toBe("function");
    expect(typeof closeCover).toBe("function");
    expect(typeof stopCover).toBe("function");
  });
});
