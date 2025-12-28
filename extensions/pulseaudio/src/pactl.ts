import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;

type ExecError = Error & {
  code?: string | number;
  errno?: number;
  syscall?: string;
  path?: string;
  spawnargs?: string[];
  killed?: boolean;
  signal?: string;
  stdout?: unknown;
  stderr?: unknown;
};

function installHintForPactl(): string {
  // Keep this short; it's shown in a toast.
  return [
    "Install a package that provides `pactl`.",
    "Fedora: `sudo dnf install pulseaudio-utils`",
    "Debian/Ubuntu: `sudo apt install pulseaudio-utils`",
    "Arch: `sudo pacman -S libpulse`",
  ].join("\n");
}

export class PactlError extends Error {
  readonly kind: "not_found" | "timeout" | "connection" | "command_failed" | "parse";
  readonly hint?: string;

  constructor(args: { kind: PactlError["kind"]; message: string; hint?: string }) {
    super(args.message);
    this.name = "PactlError";
    this.kind = args.kind;
    this.hint = args.hint;
  }
}

export function isPactlError(e: unknown): e is PactlError {
  return e instanceof PactlError;
}

export type PactlInfo = {
  default_sink_name: string;
  default_source_name: string;
  server_name?: string;
  server_version?: string;
};

export type PactlVolumeChannel = {
  value: number;
  value_percent: string; // "70%"
  db?: string;
};

export type PactlDevice = {
  index: number;
  name: string;
  description?: string;
  mute: boolean;
  volume?: Record<string, PactlVolumeChannel>;
  properties?: Record<string, string>;
};

export type PactlSink = PactlDevice;
export type PactlSource = PactlDevice;

export type PactlSinkInput = PactlDevice & {
  sink?: number;
  driver?: string;
};

export type PactlSourceOutput = PactlDevice & {
  source?: number;
  driver?: string;
};

export type AudioState = {
  info: PactlInfo;
  sinks: PactlSink[];
  sources: PactlSource[];
  sinkInputs: PactlSinkInput[];
  sourceOutputs: PactlSourceOutput[];
  defaultSink?: PactlSink;
  defaultSource?: PactlSource;
};

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toStringRecord(v: unknown): Record<string, string> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function toVolumeRecord(v: unknown): Record<string, PactlVolumeChannel> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, PactlVolumeChannel> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!isObject(val)) continue;
    const value = typeof val.value === "number" ? val.value : undefined;
    const value_percent = typeof val.value_percent === "string" ? val.value_percent : undefined;
    if (value === undefined || value_percent === undefined) continue;
    out[k] = { value, value_percent, db: typeof val.db === "string" ? val.db : undefined };
  }
  return Object.keys(out).length ? out : undefined;
}

function toDevice(v: unknown): PactlDevice | undefined {
  if (!isObject(v)) return undefined;
  const index = typeof v.index === "number" ? v.index : undefined;
  const name = typeof v.name === "string" ? v.name : undefined;
  const mute = typeof v.mute === "boolean" ? v.mute : undefined;
  if (index === undefined || name === undefined || mute === undefined) return undefined;
  return {
    index,
    name,
    mute,
    description: typeof v.description === "string" ? v.description : undefined,
    volume: toVolumeRecord(v.volume),
    properties: toStringRecord(v.properties),
  };
}

function toSinkInput(v: unknown): PactlSinkInput | undefined {
  const base = toDevice(v);
  if (!base || !isObject(v)) return undefined;
  const sink = typeof v.sink === "number" ? v.sink : undefined;
  const driver = typeof v.driver === "string" ? v.driver : undefined;
  return { ...base, sink, driver };
}

function toSourceOutput(v: unknown): PactlSourceOutput | undefined {
  const base = toDevice(v);
  if (!base || !isObject(v)) return undefined;
  const source = typeof v.source === "number" ? v.source : undefined;
  const driver = typeof v.driver === "string" ? v.driver : undefined;
  return { ...base, source, driver };
}

type PactlClientOptions = {
  timeoutMs?: number;
  jsonMaxBufferBytes?: number;
  maxBufferBytes?: number;
  pactlPath?: string;
};

/**
 * Typed client for interacting with `pactl`.
 *
 * Public methods are stable and are the recommended way to access PulseAudio/PipeWire state.
 * Parsing/exec details are intentionally kept private.
 */
export class PactlClient {
  private readonly timeoutMs: number;
  private readonly jsonMaxBufferBytes: number;
  private readonly maxBufferBytes: number;
  private readonly pactlPath: string;

  constructor(opts: PactlClientOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 2500;
    this.jsonMaxBufferBytes = opts.jsonMaxBufferBytes ?? 10 * 1024 * 1024;
    this.maxBufferBytes = opts.maxBufferBytes ?? 1024 * 1024;
    this.pactlPath = opts.pactlPath ?? "pactl";
  }

  async fetchAudioState(): Promise<AudioState> {
    const infoRaw = await this.runPactlJson<unknown>(["info"]);
    if (!isObject(infoRaw)) throw new Error("Unexpected pactl info output");
    const default_sink_name =
      typeof infoRaw.default_sink_name === "string" ? infoRaw.default_sink_name : "";
    const default_source_name =
      typeof infoRaw.default_source_name === "string" ? infoRaw.default_source_name : "";
    if (!default_sink_name) throw new Error("pactl: missing default_sink_name");
    if (!default_source_name) throw new Error("pactl: missing default_source_name");

    const info: PactlInfo = {
      default_sink_name,
      default_source_name,
      server_name: typeof infoRaw.server_name === "string" ? infoRaw.server_name : undefined,
      server_version: typeof infoRaw.server_version === "string" ? infoRaw.server_version : undefined,
    };

    const sinksRaw = await this.runPactlJson<unknown>(["list", "sinks"]);
    const sourcesRaw = await this.runPactlJson<unknown>(["list", "sources"]);
    const sinkInputsRaw = await this.runPactlJson<unknown>(["list", "sink-inputs"]);
    const sourceOutputsRaw = await this.runPactlJson<unknown>(["list", "source-outputs"]);

    const sinks =
      Array.isArray(sinksRaw) ? sinksRaw.map(toDevice).filter((x): x is PactlSink => !!x) : [];
    const sourcesAll =
      Array.isArray(sourcesRaw)
        ? sourcesRaw.map(toDevice).filter((x): x is PactlSource => !!x)
        : [];
    const sources = sourcesAll.filter(isAudioSource);
    const sinkInputs =
      Array.isArray(sinkInputsRaw)
        ? sinkInputsRaw.map(toSinkInput).filter((x): x is PactlSinkInput => !!x)
        : [];
    const sourceOutputs =
      Array.isArray(sourceOutputsRaw)
        ? sourceOutputsRaw.map(toSourceOutput).filter((x): x is PactlSourceOutput => !!x)
        : [];

    const defaultSink = sinks.find((s) => s.name === info.default_sink_name);
    const defaultSource = sources.find((s) => s.name === info.default_source_name);

    return { info, sinks, sources, sinkInputs, sourceOutputs, defaultSink, defaultSource };
  }

  async setDefaultSink(sinkName: string): Promise<void> {
    await this.runPactl(["set-default-sink", sinkName]);
  }

  async setDefaultSource(sourceName: string): Promise<void> {
    await this.runPactl(["set-default-source", sourceName]);
  }

  async setSinkMute(sinkName: string, mute: boolean | "toggle"): Promise<void> {
    await this.runPactl([
      "set-sink-mute",
      sinkName,
      mute === "toggle" ? "toggle" : mute ? "1" : "0",
    ]);
  }

  async setSourceMute(sourceName: string, mute: boolean | "toggle"): Promise<void> {
    await this.runPactl([
      "set-source-mute",
      sourceName,
      mute === "toggle" ? "toggle" : mute ? "1" : "0",
    ]);
  }

  async changeSinkVolume(sinkName: string, deltaPercent: number): Promise<void> {
    const sign = deltaPercent >= 0 ? "+" : "-";
    await this.runPactl(["set-sink-volume", sinkName, `${sign}${Math.abs(deltaPercent)}%`]);
  }

  async setSinkVolume(sinkName: string, percent: number): Promise<void> {
    await this.runPactl(["set-sink-volume", sinkName, `${percent}%`]);
  }

  async changeSourceVolume(sourceName: string, deltaPercent: number): Promise<void> {
    const sign = deltaPercent >= 0 ? "+" : "-";
    await this.runPactl(["set-source-volume", sourceName, `${sign}${Math.abs(deltaPercent)}%`]);
  }

  async setSourceVolume(sourceName: string, percent: number): Promise<void> {
    await this.runPactl(["set-source-volume", sourceName, `${percent}%`]);
  }

  async setSinkInputMute(index: number, mute: boolean | "toggle"): Promise<void> {
    await this.runPactl([
      "set-sink-input-mute",
      String(index),
      mute === "toggle" ? "toggle" : mute ? "1" : "0",
    ]);
  }

  async changeSinkInputVolume(index: number, deltaPercent: number): Promise<void> {
    const sign = deltaPercent >= 0 ? "+" : "-";
    await this.runPactl(["set-sink-input-volume", String(index), `${sign}${Math.abs(deltaPercent)}%`]);
  }

  async setSinkInputVolume(index: number, percent: number): Promise<void> {
    await this.runPactl(["set-sink-input-volume", String(index), `${percent}%`]);
  }

  async moveSinkInputToSink(index: number, sinkName: string): Promise<void> {
    await this.runPactl(["move-sink-input", String(index), sinkName]);
  }

  async setSourceOutputMute(index: number, mute: boolean | "toggle"): Promise<void> {
    await this.runPactl([
      "set-source-output-mute",
      String(index),
      mute === "toggle" ? "toggle" : mute ? "1" : "0",
    ]);
  }

  async changeSourceOutputVolume(index: number, deltaPercent: number): Promise<void> {
    const sign = deltaPercent >= 0 ? "+" : "-";
    await this.runPactl(["set-source-output-volume", String(index), `${sign}${Math.abs(deltaPercent)}%`]);
  }

  async setSourceOutputVolume(index: number, percent: number): Promise<void> {
    await this.runPactl(["set-source-output-volume", String(index), `${percent}%`]);
  }

  // ---- private ----

  private classifyExecError(e: unknown, args: string[], json: boolean): PactlError {
    const err = e as ExecError;
    const argStr = args.join(" ");
    const prefix = json ? `pactl -f json ${argStr}` : `pactl ${argStr}`;

    if (err?.code === "ENOENT") {
      return new PactlError({
        kind: "not_found",
        message: "Required CLI tool `pactl` was not found in PATH.",
        hint: installHintForPactl(),
      });
    }

    const msg = err instanceof Error ? err.message : String(e);
    const isTimeout =
      err?.code === "ETIMEDOUT" ||
      err?.killed === true ||
      /tim(e|ed)\s*out/i.test(msg);
    if (isTimeout) {
      return new PactlError({
        kind: "timeout",
        message: `Timed out while running: ${prefix}`,
        hint: "Make sure your audio server is running (PipeWire/PulseAudio) and try Refresh.",
      });
    }

    const stderr = typeof err?.stderr === "string" ? err.stderr : undefined;
    const combined = `${msg}${stderr ? `\n${stderr}` : ""}`;

    // Common failure when PulseAudio/PipeWire socket isn't reachable.
    if (/connection failure|connection refused|access denied|no such file or directory/i.test(combined)) {
      return new PactlError({
        kind: "connection",
        message: "Cannot connect to the audio server via `pactl`.",
        hint: "If you're on PipeWire, ensure `pipewire-pulse` is running (user service), then try Refresh.",
      });
    }

    return new PactlError({
      kind: "command_failed",
      message: `${prefix} failed.`,
      hint: msg,
    });
  }

  private async runPactlJson<T>(args: string[]): Promise<T> {
    try {
      const { stdout } = await execFileAsync(this.pactlPath, ["-f", "json", ...args], {
        timeout: this.timeoutMs,
        maxBuffer: this.jsonMaxBufferBytes,
      });
      try {
        return JSON.parse(stdout.toString()) as T;
      } catch (e) {
        throw new PactlError({
          kind: "parse",
          message: "Unexpected output from `pactl` (failed to parse JSON).",
          hint: e instanceof Error ? e.message : String(e),
        });
      }
    } catch (e) {
      throw this.classifyExecError(e, args, true);
    }
  }

  private async runPactl(args: string[]): Promise<void> {
    try {
      await execFileAsync(this.pactlPath, args, { timeout: this.timeoutMs, maxBuffer: this.maxBufferBytes });
    } catch (e) {
      throw this.classifyExecError(e, args, false);
    }
  }
}

/**
 * Default pactl client instance.
 */
export const pactl = new PactlClient();

export function percentFromVolume(volume?: Record<string, PactlVolumeChannel>): number | undefined {
  if (!volume) return undefined;
  const percents = Object.values(volume)
    .map((ch) => {
      const m = ch.value_percent.match(/(\d+)%/);
      return m ? Number(m[1]) : undefined;
    })
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!percents.length) return undefined;
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
}

export function displayNameForDevice(d: PactlDevice): string {
  return (
    d.description ||
    d.properties?.["node.nick"] ||
    d.properties?.["device.description"] ||
    d.properties?.["node.name"] ||
    d.name
  );
}

export function appNameForStream(d: PactlDevice): string {
  return (
    d.properties?.["application.name"] ||
    d.properties?.["application.process.binary"] ||
    d.properties?.["media.name"] ||
    d.properties?.["node.name"] ||
    d.description ||
    `Stream ${d.index}`
  );
}

export function isAudioSource(d: PactlDevice): boolean {
  return d.properties?.["media.class"] === "Audio/Source";
}

export function isAudioSink(d: PactlDevice): boolean {
  return d.properties?.["media.class"] === "Audio/Sink";
}

// Backwards-compatible function exports (internal calls go through the singleton client).
// Prefer using `pactl.*` methods from new code.
export const fetchAudioState = (): Promise<AudioState> => pactl.fetchAudioState();
export const setDefaultSink = (sinkName: string): Promise<void> => pactl.setDefaultSink(sinkName);
export const setDefaultSource = (sourceName: string): Promise<void> => pactl.setDefaultSource(sourceName);
export const setSinkMute = (sinkName: string, mute: boolean | "toggle"): Promise<void> => pactl.setSinkMute(sinkName, mute);
export const setSourceMute = (sourceName: string, mute: boolean | "toggle"): Promise<void> => pactl.setSourceMute(sourceName, mute);
export const changeSinkVolume = (sinkName: string, deltaPercent: number): Promise<void> =>
  pactl.changeSinkVolume(sinkName, deltaPercent);
export const setSinkVolume = (sinkName: string, percent: number): Promise<void> => pactl.setSinkVolume(sinkName, percent);
export const changeSourceVolume = (sourceName: string, deltaPercent: number): Promise<void> =>
  pactl.changeSourceVolume(sourceName, deltaPercent);
export const setSourceVolume = (sourceName: string, percent: number): Promise<void> => pactl.setSourceVolume(sourceName, percent);
export const setSinkInputMute = (index: number, mute: boolean | "toggle"): Promise<void> => pactl.setSinkInputMute(index, mute);
export const changeSinkInputVolume = (index: number, deltaPercent: number): Promise<void> =>
  pactl.changeSinkInputVolume(index, deltaPercent);
export const setSinkInputVolume = (index: number, percent: number): Promise<void> => pactl.setSinkInputVolume(index, percent);
export const moveSinkInputToSink = (index: number, sinkName: string): Promise<void> => pactl.moveSinkInputToSink(index, sinkName);
export const setSourceOutputMute = (index: number, mute: boolean | "toggle"): Promise<void> => pactl.setSourceOutputMute(index, mute);
export const changeSourceOutputVolume = (index: number, deltaPercent: number): Promise<void> =>
  pactl.changeSourceOutputVolume(index, deltaPercent);
export const setSourceOutputVolume = (index: number, percent: number): Promise<void> => pactl.setSourceOutputVolume(index, percent);


