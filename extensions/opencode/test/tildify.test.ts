import { describe, expect, test } from "bun:test";
import { installVicinaeStubs } from "./setup";

installVicinaeStubs();

const { tildify } = await import("../src/components/session-list");

describe("tildify", () => {
  test("home prefix becomes ~", () => {
    process.env["HOME"] = "/home/tester";
    expect(tildify("/home/tester/work/project")).toBe("~/work/project");
    expect(tildify("/home/tester")).toBe("~");
    expect(tildify("/opt/elsewhere")).toBe("/opt/elsewhere");
    expect(tildify(undefined)).toBeUndefined();
  });

  test("a shared prefix does not collapse", () => {
    process.env["HOME"] = "/home/test";
    expect(tildify("/home/testing/project")).toBe("/home/testing/project");
  });
});
