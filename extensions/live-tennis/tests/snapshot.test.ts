import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { API_URL, INTERVAL_MS, loadSnapshot, Store } from "../src/snapshot";
import { payload } from "./fixtures";
import { fileStore } from "./worker";

const directories: string[] = [];
async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tennis-snapshot-"));
  directories.push(directory);
  const data = new Map<string, string>();
  const store: Store = {
    get: async (key) => data.get(key),
    set: async (key, value) => {
      data.set(key, value);
    },
  };
  return { directory, store, data };
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("an unset native LocalStorage key may return null", async () => {
  const options = await setup();
  const store: Store = { ...options.store, get: async () => null };
  const result = await loadSnapshot("test-key", {
    ...options,
    store,
    request: async () => Response.json(payload),
  });
  assert.equal(result.snapshot?.matches[0].id, 1);
});

test("header authentication, fixed free endpoint and persistent 900-second floor", async () => {
  const options = await setup();
  let now = 1_000_000;
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, API_URL);
    assert.equal(new Headers(init?.headers).get("X-API-Key"), "test-key");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.equal(
      JSON.parse([...options.data.values()][0]).retryAt,
      now + INTERVAL_MS,
    );
    return Response.json(payload);
  };
  const first = await loadSnapshot(" test-key ", {
    ...options,
    request,
    now: () => now,
  });
  assert.equal(first.snapshot?.matches[0].id, 1);
  for (const elapsed of [0, 1, INTERVAL_MS - 1]) {
    now = 1_000_000 + elapsed;
    assert.deepEqual(
      await loadSnapshot("test-key", { ...options, request, now: () => now }),
      first,
    );
  }
  assert.equal(calls, 1);
  now = 1_000_000 + INTERVAL_MS;
  await loadSnapshot("test-key", { ...options, request, now: () => now });
  assert.equal(calls, 2);
  assert.ok(
    [...options.data.keys(), ...options.data.values()].every(
      (value) => !value.includes("test-key"),
    ),
  );
});

for (const status of [401, 403, 429, 500]) {
  test(`HTTP ${status} is budgeted and never exposes a response body`, async () => {
    const options = await setup();
    let calls = 0;
    const request: typeof fetch = async () => {
      calls++;
      return new Response("secret-key", { status });
    };
    const a = await loadSnapshot("secret-key", {
      ...options,
      request,
      now: () => 1_000_000,
    });
    const b = await loadSnapshot("secret-key", {
      ...options,
      request,
      now: () => 1_000_001,
    });
    assert.ok(a.error);
    assert.ok(!a.error.includes("secret-key"));
    assert.deepEqual(a, b);
    assert.equal(calls, 1);
  });
}

for (const header of [
  "3600",
  new Date(4_600_000).toUTCString(),
  "1",
  "garbage",
]) {
  test(`Retry-After extends but cannot shorten the minimum interval: ${header}`, async () => {
    const options = await setup();
    const request: typeof fetch = async () =>
      new Response(null, { status: 429, headers: { "Retry-After": header } });
    const result = await loadSnapshot("test-key", {
      ...options,
      request,
      now: () => 1_000_000,
    });
    assert.equal(
      result.retryAt,
      header === "1" || header === "garbage" ? 1_900_000 : 4_600_000,
    );
  });
}

for (const failure of ["network", "malformed"]) {
  test(`a ${failure} failure retains the saved snapshot and consumes one attempt`, async () => {
    const options = await setup();
    const first = await loadSnapshot("test-key", {
      ...options,
      request: async () => Response.json(payload),
      now: () => 1_000_000,
    });
    const request: typeof fetch = async () => {
      if (failure === "network") throw new Error("secret-key");
      return Response.json({ data: "broken" });
    };
    const result = await loadSnapshot("test-key", {
      ...options,
      request,
      now: () => 1_900_000,
    });
    assert.deepEqual(result.snapshot, first.snapshot);
    assert.ok(result.error);
    assert.equal(result.retryAt, 2_800_000);
    assert.ok(!result.error.includes("secret-key"));
  });
}

test("does not paginate, including when the server reports more matches", async () => {
  const options = await setup();
  let calls = 0;
  const result = await loadSnapshot("test-key", {
    ...options,
    request: async () => {
      calls++;
      return Response.json({ ...payload, meta: { has_more: true } });
    },
  });
  assert.equal(result.snapshot?.hasMore, true);
  assert.equal(calls, 1);
});

test("separates different keys and handles clock rollback without an early request", async () => {
  const options = await setup();
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return Response.json(payload);
  };
  await loadSnapshot("first", { ...options, request, now: () => 1_000_000 });
  await loadSnapshot("first", { ...options, request, now: () => 900_000 });
  await loadSnapshot("second", { ...options, request, now: () => 1_000_001 });
  assert.equal(calls, 2);
});

test("makes at most 96 attempts across a full day of repeated openings", async () => {
  const options = await setup();
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return Response.json(payload);
  };
  for (let minute = 0; minute < 1440; minute++) {
    await loadSnapshot("test-key", {
      ...options,
      request,
      now: () => 1_000_000 + minute * 60_000,
    });
  }
  assert.equal(calls, 96);
});

for (const mode of ["read", "reserve", "corrupt"] as const) {
  test(`fails closed before fetching on a ${mode} storage failure`, async () => {
    const options = await setup();
    const store: Store = {
      get: async () => {
        if (mode === "read") throw new Error("disk");
        return mode === "corrupt" ? "invalid json" : undefined;
      },
      set: async () => {
        throw new Error("disk");
      },
    };
    await assert.rejects(
      loadSnapshot("test-key", {
        ...options,
        store,
        request: async () => {
          assert.fail("Must not fetch");
        },
      }),
    );
  });
}

function worker(
  directory: string,
  crash = false,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import",
      "tsx",
      "tests/worker.ts",
      directory,
      ...(crash ? ["crash"] : []),
    ]);
    let output = "";
    let errors = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      errors += data;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      errors ? reject(new Error(errors)) : resolve({ code, output }),
    );
  });
}

test("six independent command processes share one attempt and survive a restart", async () => {
  const { directory } = await setup();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => worker(directory)),
  );
  assert.ok(results.every((result) => result.code === 0));
  assert.equal(
    await readFile(path.join(directory, "requests"), "utf8"),
    "request\n",
  );
  const reopened = await worker(directory);
  assert.equal(JSON.parse(reopened.output).snapshot.matches[0].id, 1);
  assert.equal(
    await readFile(path.join(directory, "requests"), "utf8"),
    "request\n",
  );
});

test("a crash after reservation cannot reset the request budget", async () => {
  const { directory } = await setup();
  assert.equal((await worker(directory, true)).code, 37);
  const locks = (await readdir(directory)).filter((file) =>
    file.endsWith(".lock"),
  );
  const old = new Date(Date.now() - 60_000);
  for (const file of locks) await utimes(path.join(directory, file), old, old);
  const result = await loadSnapshot("test-key", {
    directory,
    store: fileStore(directory),
    now: () => 1_000_001,
    request: async () => {
      assert.fail("Crash reservation must remain in force");
    },
  });
  assert.equal(result.retryAt, 1_900_000);
  assert.equal(
    await readFile(path.join(directory, "requests"), "utf8"),
    "request\n",
  );
});
