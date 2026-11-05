import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export type PiImage = { type: "image"; data: string; mimeType: string };
export type PiEvent = Record<string, unknown> & { type?: string };

export function assistantError(event: PiEvent, current = "") {
  if (event.type !== "message_end") return current;
  const message = event.message as PiEvent | undefined;
  if (message?.role !== "assistant") return current;
  return message.stopReason === "error" ? String(message.errorMessage || "Pi failed") : "";
}

type Pending = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

export function takeJsonLines(buffer: string, chunk: string) {
  const lines = (buffer + chunk).split("\n");
  return {
    buffer: lines.pop() ?? "",
    values: lines.filter(Boolean).map((line) => JSON.parse(line.endsWith("\r") ? line.slice(0, -1) : line)),
  };
}

export function toolSummary(name: string, args: Record<string, unknown> = {}) {
  const oneLine = (value: unknown) => String(value ?? "").split("\n", 1)[0].trim();
  let detail = "";

  if (name === "grep") {
    detail = [oneLine(args.pattern), oneLine(args.path)].filter(Boolean).join(" · ");
  } else if (name === "bash") {
    detail = oneLine(args.command);
  } else {
    detail = oneLine(args.path ?? args.file_path ?? args.pattern ?? args.query);
  }

  return detail ? `${name} · ${detail.slice(0, 90)}` : name;
}

function execBuffer(command: string, args: string[], maxBuffer: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "buffer", maxBuffer }, (error, stdout) => {
      if (error) reject(error);
      else resolve(Buffer.from(stdout));
    });
  });
}

export async function readWaylandImage(): Promise<PiImage | undefined> {
  let advertised: string;

  try {
    advertised = (await execBuffer("wl-paste", ["--list-types"], 64 * 1024)).toString("utf8");
  } catch {
    return undefined;
  }

  const mimeType = ["image/png", "image/jpeg", "image/webp", "image/gif"].find((mime) =>
    advertised.split(/\r?\n/).includes(mime),
  );
  if (!mimeType) return undefined;

  const data = await execBuffer("wl-paste", ["--no-newline", "--type", mimeType], 25 * 1024 * 1024);
  return { type: "image", data: data.toString("base64"), mimeType };
}

export class PiRpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, Pending>();
  private readonly decoder = new StringDecoder("utf8");
  private buffer = "";
  private sequence = 0;
  private settled?: Pending;
  private stderr = "";
  private agentError = "";
  private closed = false;
  private readonly onEvent: (event: PiEvent) => void;

  constructor(onEvent: (event: PiEvent) => void) {
    this.onEvent = onEvent;
    this.child = spawn("pi", ["--mode", "rpc"], {
      cwd: process.env.HOME || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.read(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-4000);
    });
    this.child.on("error", (error) =>
      this.fail(
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error("Pi is not installed or is not available on PATH.")
          : error,
      ),
    );
    this.child.on("close", (code) => {
      if (!this.closed) this.fail(new Error(this.stderr.trim() || `Pi exited with code ${code}`));
    });
  }

  async state() {
    const response = await this.request({ type: "get_state" });
    return response.data as { sessionFile?: string };
  }

  async prompt(message: string, images?: PiImage[]) {
    if (this.settled) throw new Error("Pi is already running");
    this.agentError = "";

    const settled = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.settled = { resolve, reject };
    });

    try {
      await this.request({ type: "prompt", message, ...(images?.length ? { images } : {}) });
      await settled;
      const response = await this.request({ type: "get_last_assistant_text" });
      return ((response.data as { text?: string | null })?.text ?? "").trim();
    } catch (error) {
      this.settled = undefined;
      throw error;
    }
  }

  abort() {
    return this.request({ type: "abort" });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new Error("Pi session closed"));
    this.child.stdin.end();

    await new Promise<void>((resolve) => {
      if (this.child.exitCode !== null) return resolve();
      const timer = setTimeout(() => {
        this.child.kill();
        resolve();
      }, 1000);
      this.child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private request(command: Record<string, unknown>) {
    if (this.closed) return Promise.reject(new Error("Pi session is closed"));
    const id = `vicinae-${++this.sequence}`;

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ id, ...command })}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private read(chunk: Buffer) {
    let parsed: ReturnType<typeof takeJsonLines>;
    try {
      parsed = takeJsonLines(this.buffer, this.decoder.write(chunk));
    } catch (cause) {
      this.fail(new Error(`Invalid response from Pi: ${cause instanceof Error ? cause.message : String(cause)}`));
      this.child.kill();
      return;
    }
    this.buffer = parsed.buffer;

    for (const event of parsed.values as PiEvent[]) {
      this.agentError = assistantError(event, this.agentError);

      if (event.type === "response" && typeof event.id === "string") {
        const pending = this.pending.get(event.id);
        if (!pending) continue;
        this.pending.delete(event.id);
        if (event.success === false) pending.reject(new Error(String(event.error || "Pi command failed")));
        else pending.resolve(event);
      } else if (event.type === "agent_settled") {
        if (this.agentError) this.settled?.reject(new Error(this.agentError));
        else this.settled?.resolve(event);
        this.settled = undefined;
      } else if (
        event.type === "extension_ui_request" &&
        typeof event.id === "string" &&
        ["select", "confirm", "input", "editor"].includes(String(event.method))
      ) {
        this.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: event.id, cancelled: true })}\n`);
      } else {
        this.onEvent(event);
      }
    }
  }

  private fail(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.settled?.reject(error);
    this.settled = undefined;
  }
}
