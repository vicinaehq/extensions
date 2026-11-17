import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { executeCommand, preflightExecution, terminalRequest } from "../src/lib/execution";
import { createHandoff, type CommandPayload } from "../src/lib/handoff";
import { resolveSettings } from "../src/lib/paths";
import { commandProblem, hasLikelySecret, previewCommand } from "../src/lib/privacy";
import { readHistory } from "../src/lib/reader";

const settings = resolveSettings({ shell: "bash" }, {}, "/home/test");
const runner = { executable: process.execPath, script: fileURLToPath(new URL("../assets/run-command.cjs", import.meta.url)) };
const exec = promisify(execFile);

test("terminal argv contains no command, shell metacharacters, or secret payload", () => {
  const request = terminalRequest("/private/run.sock", runner);
  assert.deepEqual(request.args, [process.execPath, runner.script, "/private/run.sock"]);
  assert.deepEqual(request.options, { hold: false, title: "Bang" });
});

test("explicit confirmation gates staging and launch, including destructive commands", async () => {
  const calls: string[] = [];
  const prepare = async (_payload: CommandPayload) => {
    calls.push("prepare");
    return { socketPath: "/private/run.sock", dispose: async () => { calls.push("dispose"); } };
  };
  const launch = async () => { calls.push("launch"); };
  assert.equal(await executeCommand("rm -rf /synthetic-do-not-run", settings, { confirm: async () => false, prepare, runner, launch }), false);
  assert.equal(calls.length, 0);
  assert.equal(await executeCommand("echo safe", settings, {
    confirm: async () => { calls.push("confirm"); return true; },
    preflight: async () => { calls.push("check"); }, prepare, runner, launch,
  }), true);
  assert.deepEqual(calls, ["confirm", "check", "prepare", "launch"]);
  calls.length = 0;
  await assert.rejects(executeCommand("echo safe", settings, {
    confirm: async () => true, preflight: async () => { throw new Error("missing shell"); }, prepare, runner, launch,
  }));
  assert.equal(calls.length, 0);
  await assert.rejects(executeCommand("echo safe", settings, {
    confirm: async () => true, prepare, runner, launch: async () => { throw new Error("no terminal"); },
  }));
  assert.deepEqual(calls, ["prepare", "dispose"]);
});

test("invalid encoding, controls, empty and huge commands are blocked", async () => {
  for (const command of [" ", "echo \0", "echo \ufffd", "echo \u001b[31m", "echo \u202ereversed", "x".repeat(65537)]) {
    assert.ok(commandProblem(command));
    await assert.rejects(executeCommand(command, settings, {
      confirm: async () => { assert.fail("must validate before confirmation"); },
      prepare: createHandoff, runner, launch: async () => { assert.fail("must not launch"); },
    }));
  }
  assert.equal(commandProblem("echo one\necho\ttwo"), undefined);
});

test("history saving and terminal approval are carried by private IPC and can be disabled", async () => {
  const payloads: CommandPayload[] = [];
  const prepare = async (payload: CommandPayload) => {
    payloads.push(payload);
    return { socketPath: "/private/run.sock", dispose: async () => {} };
  };
  const ports = { confirm: async () => true, prepare, runner, launch: async () => {} };
  await executeCommand("echo new", settings, ports);
  assert.deepEqual(payloads[0].history, { path: settings.historyPath, shell: "bash" });
  assert.equal(payloads[0].waitForApproval, true);
  await executeCommand("echo private", { ...settings, saveHistory: false, hold: false }, ports);
  assert.equal(payloads[1].history, undefined);
  assert.equal(payloads[1].waitForApproval, false);
});

test("secret previews are hidden and terminal escape sequences cannot alter list rendering", () => {
  for (const command of ["TOKEN=synthetic-value echo ok", "curl --token synthetic-value", "curl -H 'Authorization: Bearer synthetic-value'", "curl https://user:synthetic-value@example.invalid", "mysql -psynthetic-value"]) {
    assert.equal(hasLikelySecret(command), true);
    assert.doesNotMatch(previewCommand(command), /synthetic-value/);
  }
  assert.equal(previewCommand("echo one\necho two"), "echo one ↵ echo two");
  assert.doesNotMatch(previewCommand("echo \u001b[31m"), /\u001b/);
});

test("handoff is mode-0700, one-shot, and times out without launching anything", async t => {
  const handoff = await createHandoff({ command: "NEVER_EXECUTED", shellPath: "/bin/bash", workingDirectory: "/", waitForApproval: false }, 20);
  t.after(handoff.dispose);
  assert.equal((await stat(path.dirname(handoff.socketPath))).mode & 0o777, 0o700);
  await new Promise(resolve => setTimeout(resolve, 60));
  await assert.rejects(stat(handoff.socketPath), { code: "ENOENT" });
  const once = await createHandoff({ command: "NEVER_EXECUTED", shellPath: "/bin/bash", workingDirectory: "/", waitForApproval: false });
  t.after(once.dispose);
  const receive = () => new Promise<string>(resolve => {
    const socket = createConnection(once.socketPath);
    const chunks: string[] = [];
    socket.on("data", chunk => chunks.push(chunk.toString()));
    socket.on("error", () => resolve(""));
    socket.on("end", () => resolve(chunks.join("")));
  });
  assert.equal(JSON.parse(await receive()).command, "NEVER_EXECUTED");
  assert.equal(await receive(), "");
});

for (const shell of ["bash", "zsh", "fish"] as const) {
  let executable: string | undefined;
  try { executable = execFileSync("which", [shell], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* reported as skip */ }
  test(`${shell}: real runner IPC, shell syntax, pipes, redirects, quotes and multiline`, { skip: !executable }, async t => {
    const dir = await mkdtemp(path.join(tmpdir(), "bang-execution-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const config = resolveSettings({ shell, shellPath: executable, workingDirectory: dir, historyPath: path.join(dir, "history"), hold: false });
    await preflightExecution(config);
    const command = "printf '%s\\n' 'quoted $HOME; literal' | cat > result && printf '%s\\n' 'next line' >> result\nprintf '%s' 'multiline' >> result";
    await executeCommand(command, config, {
      confirm: async () => true, runner,
      prepare: async payload => {
        const handoff = await createHandoff(payload);
        t.after(handoff.dispose);
        return handoff;
      },
      // Only the terminal emulator is replaced. The shipped runner and shell run.
      launch: async args => {
        assert.ok(!JSON.stringify(args).includes(command));
        await exec(args[0], args.slice(1), { env: { HOME: dir, PATH: process.env.PATH, ZDOTDIR: dir, XDG_CONFIG_HOME: dir } });
      },
    });
    assert.equal(await readFile(path.join(dir, "result"), "utf8"), "quoted $HOME; literal\nnext line\nmultiline");
    assert.equal((await readHistory(config.historyPath, shell, 20)).entries[0].command, command);
  });
}

test("terminal-side runner reports only generic failures, not payloads", async t => {
  const handoff = await createHandoff({ command: "echo synthetic-secret", shellPath: "/missing-bang-shell", workingDirectory: "/", waitForApproval: false });
  t.after(handoff.dispose);
  try {
    await exec(runner.executable, [runner.script, handoff.socketPath]);
    assert.fail("missing shell must fail");
  } catch (error) {
    const result = error as { stderr: string };
    assert.match(result.stderr, /Check shell/);
    assert.doesNotMatch(result.stderr, /synthetic-secret/);
  }
});

test("confirmation can be disabled without bypassing validation or preflight", async () => {
  const calls: string[] = [];
  const config = { ...settings, confirmBeforeRun: false };
  const ports = {
    confirm: async () => { assert.fail("confirmation dialog must not be called"); },
    preflight: async () => { calls.push("check"); },
    prepare: async (_payload: CommandPayload) => {
      calls.push("prepare");
      return { socketPath: "/private/run.sock", dispose: async () => {} };
    },
    runner,
    launch: async () => { calls.push("launch"); },
  };
  assert.equal(await executeCommand("echo direct", config, ports), true);
  assert.deepEqual(calls, ["check", "prepare", "launch"]);
  calls.length = 0;
  await assert.rejects(executeCommand("echo \0", config, ports));
  assert.equal(calls.length, 0);
  await assert.rejects(executeCommand("echo direct", config, {
    ...ports, preflight: async () => { throw new Error("Invalid shell"); },
  }));
  assert.equal(calls.length, 0);
});

for (const status of [0, 7]) {
  test(`fast command (exit ${status}) keeps its terminal open until Enter, and is saved before closing`, async t => {
    try { execFileSync("which", ["python3"], { stdio: "ignore" }); }
    catch { t.skip("Python 3 is required for the isolated PTY test"); return; }
    const directory = await mkdtemp(path.join(tmpdir(), "bang-terminal-approval-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const historyPath = path.join(directory, "history");
    const command = `exit ${status}`;
    const handoff = await createHandoff({
      command, shellPath: "/bin/bash", workingDirectory: directory, waitForApproval: true,
      history: { path: historyPath, shell: "bash" },
    });
    t.after(handoff.dispose);
    const harness = fileURLToPath(new URL("./fixtures/terminal-approval.py", import.meta.url));
    const { stdout } = await exec("python3", [harness, runner.executable, runner.script, handoff.socketPath, String(status)], { timeout: 15000 });
    assert.deepEqual(JSON.parse(stdout), { waited_for_approval: true, exit_status: status });
    assert.equal((await readHistory(historyPath, "bash", 20)).entries[0].command, command);
  });
}

test("history write failure does not rerun the command or change its exit status", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bang-history-error-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const handoff = await createHandoff({
    command: "printf x >> marker", shellPath: "/bin/bash", workingDirectory: directory,
    waitForApproval: false, history: { path: directory, shell: "bash" },
  });
  t.after(handoff.dispose);
  const { stderr } = await exec(runner.executable, [runner.script, handoff.socketPath]);
  assert.match(stderr, /could not save/);
  assert.doesNotMatch(stderr, /printf/);
  assert.equal(await readFile(path.join(directory, "marker"), "utf8"), "x");
});
