import { createServer } from "node:net";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ShellName } from "./history";

export type CommandPayload = {
  command: string;
  shellPath: string;
  workingDirectory: string;
  waitForApproval: boolean;
  history?: { path: string; shell: ShellName };
};
export type Handoff = { socketPath: string; dispose: () => Promise<void> };

/**
 * One-use local IPC, not a daemon or TCP listener. No command is written to disk
 * or exposed in Vicinae's logged argv. The socket lives in a mode-0700 directory
 * and expires after 30 seconds if the terminal never connects.
 */
export async function createHandoff(payload: CommandPayload, timeoutMs = 30000): Promise<Handoff> {
  const directory = await mkdtemp(path.join(tmpdir(), "bang-ipc-"));
  const socketPath = path.join(directory, "run.sock");
  let message: string | undefined = JSON.stringify(payload);
  let cleanup: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const server = createServer(socket => {
    socket.on("error", () => { /* No raw errors or command contents in logs. */ });
    if (message === undefined) { socket.destroy(); return; }
    const data = message;
    message = undefined;
    socket.setTimeout(5000, () => socket.destroy());
    socket.end(data);
    socket.on("close", disposeQuietly);
  });
  function dispose(): Promise<void> {
    if (!cleanup) {
      message = undefined;
      if (timer) clearTimeout(timer);
      cleanup = new Promise<void>(resolve => server.close(() => resolve()))
        .then(() => rm(directory, { recursive: true, force: true }));
    }
    return cleanup;
  }
  function disposeQuietly() {
    // Cleanup errors must not surface as unhandled runtime errors or raw logs.
    void dispose().catch(() => {});
  }
  try {
    await chmod(directory, 0o700);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => { server.off("error", reject); resolve(); });
    });
    server.on("error", disposeQuietly);
    timer = setTimeout(disposeQuietly, timeoutMs);
    timer.unref();
    server.unref();
    return { socketPath, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
