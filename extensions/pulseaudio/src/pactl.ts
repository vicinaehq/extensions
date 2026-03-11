import z from "zod";
import { execFileAsync } from "./utils/execFileAsync";
import { isAudioSource } from "./utils/isAudioSource";
import { displayNameForCard } from "./utils/displayNameForCard";

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
  readonly kind:
    | "not_found"
    | "timeout"
    | "connection"
    | "command_failed"
    | "parse";
  readonly hint?: string;

  constructor(args: {
    kind: PactlError["kind"];
    message: string;
    hint?: string;
  }) {
    super(args.message);
    this.name = "PactlError";
    this.kind = args.kind;
    this.hint = args.hint;
  }
}

export function isPactlError(e: unknown): e is PactlError {
  return e instanceof PactlError;
}

export type AudioState = {
  info: PactlInfo;
  sinks: PactlDevice[];
  sources: PactlDevice[];
  sinkInputs: PactlStream[];
  sourceOutputs: PactlStream[];
  defaultSink?: PactlDevice;
  defaultSource?: PactlDevice;
  cards: PactlCard[];
};

export type PactlCard = {
  index: number;
  name: string;
  displayName: string;
  profiles: PactlCardProfile[];
  activeProfile: string;
};

export type PactlCardProfile = {
  name: string;
  description: string;
  available: boolean;
};

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

    const info = pactlInfoSchema.parse(infoRaw);
    const sinksRaw = await this.runPactlJson<unknown>(["list", "sinks"]);
    const sourcesRaw = await this.runPactlJson<unknown>(["list", "sources"]);
    const sinkInputsRaw = await this.runPactlJson<unknown>([
      "list",
      "sink-inputs",
    ]);
    const sourceOutputsRaw = await this.runPactlJson<unknown>([
      "list",
      "source-outputs",
    ]);
    const cardsRaw = await this.runPactlJson<unknown>(["list", "cards"]);

    const sources = z
      .array(pactlDeviceSchema)
      .parse(sourcesRaw)
      .filter(isAudioSource);
    const sinks = z.array(pactlDeviceSchema).parse(sinksRaw);
    const sourceOutputs = z.array(pactlStreamSchema).parse(sourceOutputsRaw);
    const sinkInputs = z.array(pactlStreamSchema).parse(sinkInputsRaw);
    const parsedCards = z.array(pactlCardSchema).parse(cardsRaw);
    const cards: PactlCard[] = parsedCards.map((card) => ({
      index: card.index,
      name: card.name,
      displayName: displayNameForCard(card),
      activeProfile: card.active_profile,
      profiles: Object.entries(card.profiles).map(([name, profile]) => ({
        name,
        description: profile.description,
        available: profile.available,
      })),
    }));

    const defaultSink = sinks.find((s) => s.name === info.default_sink_name);
    const defaultSource = sources.find(
      (s) => s.name === info.default_source_name,
    );

    return {
      info,
      sinks,
      sources,
      sinkInputs,
      sourceOutputs,
      defaultSink,
      defaultSource,
      cards,
    };
  }

  async setDefaultDevice(
    deviceName: string,
    type: "sink" | "source",
  ): Promise<void> {
    await this.runPactl([`set-default-${type}`, deviceName]);
  }

  async setDeviceMute(
    deviceName: string,
    type: "sink" | "source",
    mute: boolean | "toggle",
  ): Promise<void> {
    await this.runPactl([
      `set-${type}-mute`,
      deviceName,
      mute === "toggle" ? "toggle" : mute ? "1" : "0",
    ]);
  }

  async setDeviceVolume(
    deviceName: string,
    percent: number,
    kind: "sink" | "source",
  ): Promise<void> {
    await this.runPactl([`set-${kind}-volume`, deviceName, `${percent}%`]);
  }

  async setStreamMute(
    index: number,
    mute: boolean | "toggle",
    kind: "sink" | "source",
  ): Promise<void> {
    await this.runPactl([
      kind === "sink" ? "set-sink-input-mute" : "set-source-output-mute",
      String(index),
      mute === "toggle" ? "toggle" : mute ? "1" : "0",
    ]);
  }

  async setStreamVolume(
    index: number,
    percent: number,
    kind: "sink" | "source",
  ): Promise<void> {
    await this.runPactl([
      kind === "sink" ? "set-sink-input-volume" : "set-source-output-volume",
      String(index),
      `${percent}%`,
    ]);
  }

  async setDeviceForStream(
    index: number,
    device: string,
    type: "sink" | "source",
  ): Promise<void> {
    await this.runPactl([`move-${type}-input`, String(index), device]);
  }

  async setCardProfile(
    card: string | number,
    profileName: string,
  ): Promise<void> {
    await this.runPactl(["set-card-profile", String(card), profileName]);
  }

  // ---- private ----

  private classifyExecError(
    e: unknown,
    args: string[],
    json: boolean,
  ): PactlError {
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
    if (
      /connection failure|connection refused|access denied|no such file or directory/i.test(
        combined,
      )
    ) {
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
      const { stdout } = await execFileAsync(
        this.pactlPath,
        ["-f", "json", ...args],
        {
          timeout: this.timeoutMs,
          maxBuffer: this.jsonMaxBufferBytes,
        },
      );
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
      await execFileAsync(this.pactlPath, args, {
        timeout: this.timeoutMs,
        maxBuffer: this.maxBufferBytes,
      });
    } catch (e) {
      throw this.classifyExecError(e, args, false);
    }
  }
}

/**
 * Default pactl client instance.
 */
export const pactl = new PactlClient();

const pactlVolumneChannelSchema = z.object({
  value: z.number(),
  value_percent: z.string(),
  db: z.string().optional(),
});

const pactlStreamSchema = z.object({
  index: z.number(),
  sink: z.number().optional(),
  driver: z.string().optional(),
  source: z.number().optional(),
  volume: z.record(z.string(), pactlVolumneChannelSchema),
  description: z.string().optional(),
  mute: z.boolean(),
  properties: z.object({
    "application.name": z.string(),
    "media.name": z.string().optional(),
    "application.process.binary": z.string().optional(),
    "node.name": z.string().optional(),
  }),
});

const pactlDeviceSchema = z.object({
  index: z.number(),
  name: z.string(),
  description: z.string().optional(),
  mute: z.boolean(),
  volume: z.record(z.string(), pactlVolumneChannelSchema).optional(),
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

const pactlInfoSchema = z.object({
  default_sink_name: z.string(),
  default_source_name: z.string(),
  server_name: z.string().optional(),
  server_version: z.string().optional(),
});

const pactlCardProfileSchema = z.object({
  description: z.string(),
  available: z.boolean(),
});

const pactlCardSchema = z.object({
  index: z.number(),
  name: z.string(),
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  profiles: z.record(z.string(), pactlCardProfileSchema),
  active_profile: z.string(),
});

export type PactlInfo = z.infer<typeof pactlInfoSchema>;
export type PactlDevice = z.infer<typeof pactlDeviceSchema>;
export type PactlVolumeChannel = z.infer<typeof pactlVolumneChannelSchema>;
export type PactlStream = z.infer<typeof pactlStreamSchema>;
export type PactlCardRaw = z.infer<typeof pactlCardSchema>;
