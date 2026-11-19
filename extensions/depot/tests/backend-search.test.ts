import assert from "node:assert/strict";
import test from "node:test";
import type { SoftwareItem } from "../src/types.ts";
import {
  EMPTY_SEARCH,
  runBackendSearch,
  type BackendSearchResponse,
  type BackendSearchSnapshot,
} from "../src/utils/backend-search.ts";
import { LatestRequest } from "../src/utils/latest-request.ts";

function item(id: string): SoftwareItem {
  return { id, name: id, description: "", source: "apt", installed: false };
}

function harness() {
  let state: BackendSearchSnapshot = EMPTY_SEARCH;
  const pending = new Map<string, {
    resolve(response: BackendSearchResponse): void;
    reject(error: unknown): void;
    signal: AbortSignal;
  }>();
  const latest = new LatestRequest();
  const run = (query: string) => runBackendSearch(
    latest,
    query,
    (value, signal) => new Promise((resolve, reject) => {
      pending.set(value, { resolve, reject, signal });
    }),
    () => "search failed",
    (update) => {
      state = update(state);
    },
  );
  return { run, pending, latest, state: () => state };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("keeps previous results while loading and discards stale responses", async () => {
  const search = harness();
  search.run("vl");
  search.pending.get("vl")!.resolve({ items: [item("vlc-old")] });
  await settle();
  assert.deepEqual(search.state().results.map((pkg) => pkg.id), ["vlc-old"]);

  search.run("vlc");
  assert.equal(search.state().isLoading, true);
  assert.deepEqual(search.state().results.map((pkg) => pkg.id), ["vlc-old"]);

  search.run("vlc media");
  assert.equal(search.pending.get("vlc")!.signal.aborted, true);
  search.pending.get("vlc media")!.resolve({ items: [item("vlc")], warning: "partial" });
  search.pending.get("vlc")!.resolve({ items: [item("stale")] });
  await settle();
  assert.deepEqual(search.state(), {
    results: [item("vlc")],
    warning: "partial",
    isLoading: false,
  });
});

test("ignores failures of replaced requests and reports current ones", async () => {
  const search = harness();
  search.run("first");
  search.run("second");
  search.pending.get("first")!.reject(new Error("old failure"));
  await settle();
  assert.equal(search.state().error, undefined);
  assert.equal(search.state().isLoading, true);

  const originalError = console.error;
  console.error = () => undefined;
  try {
    search.pending.get("second")!.reject(new Error("current failure"));
    await settle();
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(search.state(), {
    results: [],
    error: "search failed",
    isLoading: false,
  });
});

test("short queries clear results and cancel the running search", async () => {
  const search = harness();
  search.run("vlc");
  search.run("v");
  assert.equal(search.pending.get("vlc")!.signal.aborted, true);
  assert.deepEqual(search.state(), EMPTY_SEARCH);
  search.pending.get("vlc")!.resolve({ items: [item("late")] });
  await settle();
  assert.deepEqual(search.state(), EMPTY_SEARCH);
});
