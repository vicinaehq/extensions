import { describe, test, expect } from "bun:test";
import { modelValue, parseModelRef } from "../src/lib/models";

describe("model dropdown value contract", () => {
  test("dropdown values round-trip, and malformed values never produce a model ref", () => {
    // The dropdown value travels to the send path and becomes a switchModel
    // call, so the two directions must agree and garbage must not reach the API.
    const ref = { providerID: "anthropic", id: "claude-sonnet-4" };
    expect(parseModelRef(modelValue(ref))).toEqual(ref);

    for (const malformed of ["no-slash", "/missing-provider", "missing-id/", ""]) {
      expect(parseModelRef(malformed)).toBeUndefined();
    }
  });
});
