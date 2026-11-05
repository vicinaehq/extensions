import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { runProcess, spawnHarness } from "../src/harnesses/process";

async function running(pid: number): Promise<boolean> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return !["Z", "X"].includes(
      stat.slice(stat.lastIndexOf(")") + 2, -1).split(" ")[0]!,
    );
  } catch (error) {
    if (
      ["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")
    )
      return false;
    throw error;
  }
}

async function until<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 8000;
  while (true) {
    const value = await read();
    if (matches(value)) return value;
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for fixture processes.");
    await delay(25);
  }
}

for (const mode of ["run", "rpc", "claude", "spawn"]) {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    test(
      `${mode}: host ${signal} stops the CLI and its TERM-resistant descendant`,
      { timeout: 20000 },
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "ai-host-death-"));
        const host = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            join(__dirname, "fixtures/process-host.ts"),
            mode,
            directory,
          ],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        const closed = once(host, "close");
        let stderr = "";
        host.stderr.on("data", (data) => {
          stderr += data;
        });
        let pids: Record<string, number> = {};
        try {
          pids = await until(
            async () => {
              try {
                return JSON.parse(
                  await readFile(join(directory, "pids.json"), "utf8"),
                );
              } catch (error) {
                if (host.exitCode !== null)
                  throw new Error(
                    stderr.slice(-2000) ||
                      "Host exited before fixture startup.",
                  );
                if ((error as NodeJS.ErrnoException).code === "ENOENT")
                  return {};
                throw error;
              }
            },
            (value) => Boolean(value.descendant),
          );
          assert.ok(
            (await Promise.all(Object.values(pids).map(running))).every(
              Boolean,
            ),
          );
          host.kill(signal);
          await closed;
          await until(
            () => Promise.all(Object.values(pids).map(running)),
            (states) => states.every((alive) => !alive),
          );
        } finally {
          host.kill("SIGKILL");
          for (const pid of Object.values(pids)) {
            if (await running(pid)) {
              try {
                process.kill(pid, "SIGKILL");
              } catch {}
            }
          }
          await closed;
          await rm(directory, { recursive: true, force: true });
        }
      },
    );
  }
}

test("supervised transport preserves exit errors and reports missing executables", async () => {
  await assert.rejects(
    runProcess({
      executable: process.execPath,
      args: ["-e", 'process.stderr.write("fixture failure"); process.exit(7)'],
      cwd: tmpdir(),
    }),
    /fixture failure/,
  );
  await assert.rejects(
    runProcess({
      executable: "/missing-ai-command-fixture",
      args: [],
      cwd: tmpdir(),
    }),
    /ENOENT/,
  );
});

test("direct SIGKILL cancellation leaves no supervised CLI running", async () => {
  const child = spawnHarness(
    process.execPath,
    [
      "-e",
      'console.log(process.pid); process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
    ],
    { cwd: tmpdir() },
  );
  const closed = once(child, "close");
  const [chunk] = await once(child.stdout, "data");
  const pid = Number(chunk.toString().trim());
  assert.ok(pid > 0);
  child.kill("SIGKILL");
  await closed;
  assert.equal(await running(pid), false);
});

for (const exitNormally of [false, true]) {
  test(
    `${exitNormally ? "successful CLI exit" : "SIGTERM cancellation"} cleans up resistant descendants`,
    { timeout: 15000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "ai-group-cleanup-"));
      const child = spawnHarness(
        process.execPath,
        [join(__dirname, "fixtures/stubborn-cli.js")],
        {
          cwd: directory,
          env: {
            ...process.env,
            AI_COMMANDS_TEST_PIDS: join(directory, "pids.json"),
            ...(exitNormally ? { AI_COMMANDS_TEST_EXIT: "1" } : {}),
          },
        },
      );
      const closed = once(child, "close");
      let pids: Record<string, number> = {};
      try {
        pids = await until(
          async () => {
            try {
              return JSON.parse(
                await readFile(join(directory, "pids.json"), "utf8"),
              );
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
              throw error;
            }
          },
          (value) => Boolean(value.descendant),
        );
        if (!exitNormally) child.kill("SIGTERM");
        const [code] = await closed;
        assert.equal(code, exitNormally ? 0 : 143);
        await until(
          () => Promise.all(Object.values(pids).map(running)),
          (states) => states.every((alive) => !alive),
        );
      } finally {
        child.kill("SIGKILL");
        await closed;
        for (const pid of Object.values(pids)) {
          if (await running(pid)) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {}
          }
        }
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
