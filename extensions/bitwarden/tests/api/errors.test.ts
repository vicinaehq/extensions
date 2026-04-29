import { describe, it, expect } from "vitest";
import { classifyRbwStderr, AuthFailed, Locked, NotLoggedIn, ItemNotFound, CliInvocationError } from "../../src/api/errors";

describe("classifyRbwStderr", () => {
  it("locks when agent reports locked", () => {
    expect(classifyRbwStderr("Error: agent is not running", 1)).toBeInstanceOf(Locked);
    expect(classifyRbwStderr("Error: failed to communicate with rbw-agent", 1)).toBeInstanceOf(Locked);
  });

  it("auth-failed on bad password / login error", () => {
    expect(classifyRbwStderr("Error: failed to authenticate", 1)).toBeInstanceOf(AuthFailed);
    expect(classifyRbwStderr("Error: invalid email or password", 1)).toBeInstanceOf(AuthFailed);
  });

  it("not-logged-in when config has no email", () => {
    expect(classifyRbwStderr("Error: account is not configured", 1)).toBeInstanceOf(NotLoggedIn);
    expect(classifyRbwStderr("Error: failed to load db: No such file or directory", 1)).toBeInstanceOf(NotLoggedIn);
  });

  it("item-not-found on missing entry", () => {
    expect(classifyRbwStderr("Error: failed to find entry: foo", 1)).toBeInstanceOf(ItemNotFound);
  });

  it("falls through to CliInvocationError", () => {
    const e = classifyRbwStderr("Error: something else weird", 7);
    expect(e).toBeInstanceOf(CliInvocationError);
    expect((e as CliInvocationError).exitCode).toBe(7);
  });
});
