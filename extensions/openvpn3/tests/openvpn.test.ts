import assert from "node:assert/strict";
import test from "node:test";
import { connectProfile, disconnectProfile, listSessions, type Run, validateProfile } from "../src/openvpn.ts";

const profile = "/home/test/VPN profiles/office.ovpn";
const path = "/net/openvpn/v3/sessions/office";
const otherPath = "/net/openvpn/v3/sessions/other";
const connected = "Connection, Client connected";
const pending = "Web authentication required to connect";
const empty = "No sessions available";
const started = `Using configuration profile from file: ${profile}\nSession path: ${path}`;

function session(id: string, name: string, status: string, suffix = "") {
  return `        Path: ${id}\n Config name: ${name}${suffix}\n      Status: ${status}\n`;
}

function mock(...steps: [string[], string | Error][]): Run {
  let count = 0;
  return async (args) => {
    assert.ok(count < steps.length, `Unexpected command: ${args.join(" ")}`);
    const [expected, result] = steps[count++];
    assert.deepEqual(args, expected);
    if (result instanceof Error) throw result;
    return result;
  };
}

const list = ["sessions-list"];
const start = ["session-start", "--config", profile];
const disconnect = ["session-manage", "--disconnect", "--session-path", path];
const noWait = async () => {};

test("status preserves the full output and parses session fields", async () => {
  const output = session(path, profile, pending, "  (Config not available)") + session(otherPath, "other", connected);
  assert.deepEqual(await listSessions(mock([list, output])), {
    output,
    sessions: [
      { path, profile, status: pending },
      { path: otherPath, profile: "other", status: connected },
    ],
  });
  await assert.rejects(listSessions(mock([list, "unexpected output"])), /Unrecognized/);
});

test("connect waits for its own session, not an unrelated connected VPN", async () => {
  const other = session(otherPath, "other", connected);
  let waits = 0;
  const run = mock([list, other], [start, started],
    [list, other + session(path, profile, pending)],
    [list, other + session(path, profile, `${connected}: VPN session established`)]);
  assert.equal(await connectProfile(profile, run, async () => { waits++; }, 2), "connected");
  assert.equal(waits, 1);
});

test("connect does not duplicate active sessions or report pending SSO as connected", async () => {
  assert.equal(await connectProfile(profile, mock([list, session(path, profile, connected)])), "already-connected");
  assert.equal(await connectProfile(profile, mock([list, session(path, profile, pending)])), "already-active");
  assert.equal(await connectProfile(profile, mock([list, empty], [start, started],
    [list, session(path, profile, pending)]), noWait, 1), "pending");
});

test("connect surfaces CLI failure, browser launch failure, and vanished sessions", async () => {
  await assert.rejects(connectProfile(profile, mock([list, empty], [start, new Error("CLI failed")])), /CLI failed/);
  await assert.rejects(connectProfile(profile, mock([list, empty],
    [start, `${started}\nCould not open the URL automatically.`])), /could not open browser/i);
  await assert.rejects(connectProfile(profile, mock([list, empty], [start, started], [list, empty])), /ended before connecting/);
});

test("disconnect uses only the configured session path and refuses ambiguous matches", async () => {
  const own = session(path, profile, connected);
  const other = session(otherPath, "other", connected);
  let waits = 0;
  const run = mock([list, other + own], [disconnect, "Initiated session shutdown."],
    [list, other + own], [list, other]);
  assert.equal(await disconnectProfile(profile, run, async () => { waits++; }, 2), "disconnected");
  assert.equal(waits, 1);
  assert.equal(await disconnectProfile(profile, mock([list, other])), "already-disconnected");
  await assert.rejects(disconnectProfile(profile, mock([list, own + session(otherPath, profile, connected)])), /Multiple sessions/);
});

test("disconnect does not report success if the target session is still present or cannot be checked", async () => {
  const own = session(path, profile, connected);
  assert.equal(await disconnectProfile(profile, mock([list, own], [disconnect, ""], [list, own]),
    noWait, 1), "pending");
  await assert.rejects(disconnectProfile(profile, mock([list, own], [disconnect, ""],
    [list, new Error("status unavailable")])), /status unavailable/);
});

test("profile validation rejects relative paths, directories, and missing files", async () => {
  await assert.rejects(validateProfile("office.ovpn"), /absolute path/);
  await assert.rejects(validateProfile(process.cwd()), /readable/);
  await assert.rejects(validateProfile(`${process.cwd()}/missing.ovpn`), /readable/);
  assert.equal(await validateProfile(`${process.cwd()}/./README.md`), `${process.cwd()}/README.md`);
});
