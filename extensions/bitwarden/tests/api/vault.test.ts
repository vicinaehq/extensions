import { describe, it, expect, vi } from "vitest";

vi.mock("@vicinae/api", () => ({ getPreferenceValues: vi.fn(() => ({})) }));
import { Vault } from "../../src/api/vault";

interface Recorded { args: string[]; runOpts?: unknown; envBefore?: NodeJS.ProcessEnv }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
interface FakeCli {
  text: AnyFn;
  readText: AnyFn;
  json: AnyFn;
  readJson: AnyFn;
  tryReadText: AnyFn;
  withEnv: AnyFn;
}
function fakeRbw(replies: Record<string, string>): { cli: FakeCli; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const cli: FakeCli = {
    text: vi.fn(async (args: string[], runOpts?: unknown) => {
      calls.push({ args, runOpts });
      return replies[args.join(" ")] ?? "";
    }),
    readText: vi.fn(async (args: string[]) => {
      calls.push({ args });
      return replies[args.join(" ")] ?? "";
    }),
    json: vi.fn(async (args: string[]) => {
      calls.push({ args });
      const v = replies[args.join(" ")];
      return v ? JSON.parse(v) : undefined;
    }),
    readJson: vi.fn(async (args: string[]) => {
      calls.push({ args });
      const v = replies[args.join(" ")];
      return v ? JSON.parse(v) : undefined;
    }),
    tryReadText: vi.fn(async (args: string[]) => {
      calls.push({ args });
      const v = replies[args.join(" ")];
      return v !== undefined ? { stdout: v, exitCode: 0 } : { stdout: "", exitCode: 1 };
    }),
    withEnv: vi.fn(() => cli),
  };
  return { cli, calls };
}

describe("Vault.status", () => {
  it("reports unlocked when rbw unlocked exits 0", async () => {
    const { cli } = fakeRbw({
      "config show": '{"email":"a@b.c","base_url":"https://srv/"}',
      "unlocked": "",
    });
    const v = new Vault(cli as unknown as never);
    const s = await v.status();
    expect(s?.status).toBe("unlocked");
    expect(s?.userEmail).toBe("a@b.c");
    expect(s?.serverUrl).toBe("https://srv/");
  });

  it("reports locked when rbw unlocked exits non-zero but config has email", async () => {
    const { cli } = fakeRbw({ "config show": '{"email":"a@b.c","base_url":null}' });
    cli.tryReadText = vi.fn(async (args: string[]) =>
      args.join(" ") === "unlocked" ? { stdout: "", exitCode: 1 } : { stdout: "", exitCode: 0 }
    );
    const v = new Vault(cli as unknown as never);
    expect((await v.status())?.status).toBe("locked");
  });

  it("reports unauthenticated when config has no email", async () => {
    const { cli } = fakeRbw({ "config show": '{"email":null,"base_url":null}' });
    cli.tryReadText = vi.fn(async () => ({ stdout: "", exitCode: 1 }));
    const v = new Vault(cli as unknown as never);
    expect((await v.status())?.status).toBe("unauthenticated");
  });
});

describe("Vault.listItems / listFolders / getItem / getTotp", () => {
  const sampleList = '[{"id":"a","name":"x","user":"u","folder":"F","uris":["https://x"],"type":"Login"}]';
  it("listItems calls `rbw list --raw` and adapts", async () => {
    const { cli, calls } = fakeRbw({ "list --raw": sampleList });
    const v = new Vault(cli as unknown as never);
    const items = await v.listItems();
    expect(calls[0]!.args).toEqual(["list", "--raw"]);
    expect(items?.[0]!.name).toBe("x");
    expect(items?.[0]!.login?.username).toBe("u");
  });

  it("listFolders derives from list", async () => {
    const { cli } = fakeRbw({ "list --raw": sampleList });
    const v = new Vault(cli as unknown as never);
    expect((await v.listFolders())?.[0]!.name).toBe("F");
  });

  it("getItem calls `rbw get --raw <id>` and adapts", async () => {
    const { cli, calls } = fakeRbw({
      "get --raw a": '{"id":"a","name":"x","folder":null,"data":{"username":"u","password":"p","totp":null,"uris":[]},"fields":[],"notes":null,"history":[]}',
    });
    const v = new Vault(cli as unknown as never);
    const item = await v.getItem("a");
    expect(calls[0]!.args).toEqual(["get", "--raw", "a"]);
    expect(item?.login?.password).toBe("p");
  });

  it("getTotp calls `rbw code <id>`", async () => {
    const { cli, calls } = fakeRbw({ "code a": "123456\n" });
    const v = new Vault(cli as unknown as never);
    expect(await v.getTotp("a")).toBe("123456");
    expect(calls[0]!.args).toEqual(["code", "a"]);
  });
});

describe("Vault.generatePassword", () => {
  it("chars mode without symbols", async () => {
    const { cli, calls } = fakeRbw({ "generate 20 --no-symbols": "abcDEF\n" });
    const v = new Vault(cli as unknown as never);
    expect(await v.generatePassword({ mode: "chars", length: 20, symbols: false })).toBe("abcDEF");
    expect(calls[0]!.args).toEqual(["generate", "20", "--no-symbols"]);
  });

  it("chars mode only-numbers + nonconfusables", async () => {
    const { cli, calls } = fakeRbw({ "generate 16 --only-numbers --nonconfusables": "1234\n" });
    const v = new Vault(cli as unknown as never);
    expect(await v.generatePassword({ mode: "chars", length: 16, symbols: true, onlyNumbers: true, nonconfusables: true })).toBe("1234");
    expect(calls[0]!.args).toEqual(["generate", "16", "--only-numbers", "--nonconfusables"]);
  });

  it("diceware mode", async () => {
    const { cli, calls } = fakeRbw({ "generate 5 --diceware": "horse-battery-staple-correct-foo\n" });
    const v = new Vault(cli as unknown as never);
    expect(await v.generatePassword({ mode: "diceware", words: 5 })).toBe("horse-battery-staple-correct-foo");
    expect(calls[0]!.args).toEqual(["generate", "5", "--diceware"]);
  });
});

describe("Vault.unlock", () => {
  it("calls `rbw unlock` and returns the sentinel session", async () => {
    const { cli, calls } = fakeRbw({ "unlock": "" });
    const v = new Vault(cli as unknown as never);
    expect(await v.unlock("hunter2")).toBe("rbw-agent");
    expect(calls[0]!.args).toEqual(["unlock"]);
  });
});

describe("Vault.register", () => {
  it("pipes client id and secret to rbw register stdin", async () => {
    const { cli, calls } = fakeRbw({ "register": "" });
    const v = new Vault(cli as unknown as never);
    await v.register("CID", "CSEC");
    expect(calls[0]!.args).toEqual(["register"]);
    expect((calls[0]!.runOpts as { stdin: string }).stdin).toBe("CID\nCSEC\n");
  });
});

describe("Vault.config*", () => {
  it("configEmail uses `config set email`", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.configEmail("a@b.c");
    expect(calls[0]!.args).toEqual(["config", "set", "email", "a@b.c"]);
  });

  it("configServer uses `config set base_url`", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.configServer("https://srv");
    expect(calls[0]!.args).toEqual(["config", "set", "base_url", "https://srv"]);
  });
});

describe("Vault.lock / logout", () => {
  it("lock calls rbw lock", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.lock();
    expect(calls[0]!.args).toEqual(["lock"]);
  });

  it("logout calls stop-agent and purge", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.logout();
    expect(calls.map((c) => c.args)).toEqual([["stop-agent"], ["purge"]]);
  });
});

describe("Vault.createItem / deleteItem", () => {
  it("createItem builds rbw add args from option fields", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.createItem({ name: "Acme", username: "alice", uri: "https://acme", folderId: "Work" });
    expect(calls[0]!.args).toEqual(["add", "--uri", "https://acme", "--folder", "Work", "Acme", "alice"]);
  });

  it("createItem omits flags when fields absent", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.createItem({ name: "Plain" });
    expect(calls[0]!.args).toEqual(["add", "Plain"]);
  });

  it("deleteItem calls rbw remove", async () => {
    const { cli, calls } = fakeRbw({});
    const v = new Vault(cli as unknown as never);
    await v.deleteItem("xyz");
    expect(calls[0]!.args).toEqual(["remove", "xyz"]);
  });
});
