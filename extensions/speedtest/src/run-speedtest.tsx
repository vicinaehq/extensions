import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { spawn } from "node:child_process";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "starting" | "ping" | "download" | "upload" | "done" | "error";

interface SpeedState {
  phase: Phase;
  ping: number | null;
  jitter: number | null;
  pingProgress: number;
  downloadBandwidth: number | null;
  downloadProgress: number;
  downloadLatencyIqm: number | null;
  uploadBandwidth: number | null;
  uploadProgress: number;
  uploadLatencyIqm: number | null;
  finalDownload: number | null;
  finalUpload: number | null;
  packetLoss: number | null;
  isp: string;
  server: string;
  serverLocation: string;
  shareUrl: string;
  errorMessage: string;
}

function bwToMbps(bytesPerSec: number): number {
  return (bytesPerSec * 8) / 1_000_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatMetric(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function getRatingEmoji(mbps: number, type: "download" | "upload"): string {
  const t = type === "download" ? [10, 25, 100, 500] : [5, 10, 50, 200];
  if (mbps >= t[3]!) return "🚀";
  if (mbps >= t[2]!) return "⚡";
  if (mbps >= t[1]!) return "✅";
  if (mbps >= t[0]!) return "🐢";
  return "🔴";
}

function getPingEmoji(ms: number): string {
  if (ms <= 2) return "WOhooow";
  if (ms < 10) return "🚀";
  if (ms < 30) return "✅";
  if (ms < 60) return "🟡";
  if (ms < 100) return "🟠";
  return "🔴";
}

function pickScale(value: number): number {
  const steps = [25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000];
  return steps.find((s) => value <= s * 0.92) ?? 2500;
}

// ─── Bar Chart SVG ────────────────────────────────────────────────────────────

function buildBarChartSvg(state: SpeedState): string {
  const W = 220;
  const H = 255;

  // Bar geometry
  const bW = 72;
  const b1x = 14;   // download bar left edge
  const b2x = 110;  // upload bar left edge
  const bTop = 22;
  const bBot = 205;
  const bH = bBot - bTop; // 183 px

  // Values to display (live during test, final when done)
  const dlVal = state.finalDownload ?? state.downloadBandwidth;
  const ulVal = state.finalUpload ?? state.uploadBandwidth;

  // Shared Y-scale: pick based on the largest seen value
  const maxSeen = Math.max(dlVal ?? 0, ulVal ?? 0, 1);
  const scale = pickScale(maxSeen);

  // Fill heights (clamped)
  const dlH = dlVal !== null ? clamp((dlVal / scale) * bH, 0, bH) : 0;
  const ulH = ulVal !== null ? clamp((ulVal / scale) * bH, 0, bH) : 0;
  const dlY = bBot - dlH;
  const ulY = bBot - ulH;

  // Phase label
  const phaseMap: Record<Phase, string> = {
    starting: "Starting...",
    ping: "Measuring ping...",
    download: "Testing download...",
    upload: "Testing upload...",
    done: "Test complete",
    error: "Test failed",
  };

  const DL = "#3b82f6";       // blue-500
  const DL_DIM = "#1d4ed8";   // blue-700 (darker shade for gradient bottom)
  const UL = "#e879f9";       // fuchsia-400
  const UL_DIM = "#a21caf";   // fuchsia-700
  const TRACK = "#1e293b";
  const cx1 = b1x + bW / 2;
  const cx2 = b2x + bW / 2;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs>`,
    `  <linearGradient id="dlg" x1="0" y1="0" x2="0" y2="1">`,
    `    <stop offset="0%" stop-color="${DL}"/>`,
    `    <stop offset="100%" stop-color="${DL_DIM}"/>`,
    `  </linearGradient>`,
    `  <linearGradient id="ulg" x1="0" y1="0" x2="0" y2="1">`,
    `    <stop offset="0%" stop-color="${UL}"/>`,
    `    <stop offset="100%" stop-color="${UL_DIM}"/>`,
    `  </linearGradient>`,
    `  <clipPath id="dlclip">`,
    `    <rect x="${b1x}" y="${bTop}" width="${bW}" height="${bH}" rx="5"/>`,
    `  </clipPath>`,
    `  <clipPath id="ulclip">`,
    `    <rect x="${b2x}" y="${bTop}" width="${bW}" height="${bH}" rx="5"/>`,
    `  </clipPath>`,
    `</defs>`,

    // Phase label
    `<text x="${W / 2}" y="16" text-anchor="middle" fill="#64748b" font-size="11" font-family="ui-sans-serif,sans-serif">${phaseMap[state.phase]}</text>`,


    // ── Download bar ──
    // Track
    `<rect x="${b1x}" y="${bTop}" width="${bW}" height="${bH}" rx="5" fill="${TRACK}"/>`,
    // Fill (clipped so it stays within rounded track)
    dlH > 0
      ? `<rect x="${b1x}" y="${dlY.toFixed(1)}" width="${bW}" height="${(dlH + 6).toFixed(1)}" fill="url(#dlg)" clip-path="url(#dlclip)"/>`
      : "",
    // Value text (always shown at top of track)
    `<text x="${cx1}" y="${bTop + 20}" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="700" font-family="ui-monospace,monospace">${formatMetric(dlVal, 1)}</text>`,
    `<text x="${cx1}" y="${bTop + 33}" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="ui-sans-serif,sans-serif">Mbps</text>`,
    // Label below
    `<text x="${cx1}" y="${bBot + 16}" text-anchor="middle" fill="${DL}" font-size="12" font-weight="600" font-family="ui-sans-serif,sans-serif">⬇ Download</text>`,

    // ── Upload bar ──
    // Track
    `<rect x="${b2x}" y="${bTop}" width="${bW}" height="${bH}" rx="5" fill="${TRACK}"/>`,
    // Fill
    ulH > 0
      ? `<rect x="${b2x}" y="${ulY.toFixed(1)}" width="${bW}" height="${(ulH + 6).toFixed(1)}" fill="url(#ulg)" clip-path="url(#ulclip)"/>`
      : "",
    // Value text
    `<text x="${cx2}" y="${bTop + 20}" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="700" font-family="ui-monospace,monospace">${formatMetric(ulVal, 1)}</text>`,
    `<text x="${cx2}" y="${bTop + 33}" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="ui-sans-serif,sans-serif">Mbps</text>`,
    // Label below
    `<text x="${cx2}" y="${bBot + 16}" text-anchor="middle" fill="${UL}" font-size="12" font-weight="600" font-family="ui-sans-serif,sans-serif">⬆ Upload</text>`,

    `</svg>`,
  ];

  return parts.filter(Boolean).join("\n");
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

function buildMarkdown(state: SpeedState): string {
  if (state.phase === "error") {
    const notFound =
      state.errorMessage.includes("not found") ||
      state.errorMessage.includes("ENOENT") ||
      state.errorMessage.includes("command not found");
    if (notFound) {
      return `# Speedtest CLI Not Found\n\nInstall it with:\n\`\`\`\nparu -S ookla-speedtest-bin\n\`\`\``;
    }
    return `# Speedtest Failed\n\n\`\`\`\n${state.errorMessage}\n\`\`\`\n\nPress **⌘R** to run it again.`;
  }

  const chartImg = `data:image/svg+xml;utf8,${encodeURIComponent(buildBarChartSvg(state))}`;
  const title = state.phase === "done" ? "# Speedtest Results" : "# Speedtest Running";

  const connParts: string[] = [];
  if (state.isp) connParts.push(`**ISP:** ${state.isp}`);
  if (state.server) connParts.push(`**Server:** ${state.server}${state.serverLocation ? ` (${state.serverLocation})` : ""}`);
  const connLine = connParts.join(" · ");

  const pingLine =
    state.ping !== null
      ? `Ping **${formatMetric(state.ping, 1, " ms")}** ${getPingEmoji(state.ping)} · Jitter **${formatMetric(state.jitter, 1, " ms")}**`
      : state.phase === "ping"
        ? `Measuring ping...`
        : "";

  const shareLine = state.shareUrl ? `\n[Open Result on Speedtest.net](${state.shareUrl})` : "";

  return [
    title,
    "",
    `![Speed Chart](${chartImg})`,
    "",
    pingLine,
    connLine,
    shareLine,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ─── Metadata panel ───────────────────────────────────────────────────────────

function buildMetadata(state: SpeedState) {
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label
        title="Ping"
        text={formatMetric(state.ping, 1, " ms")}
        icon={Icon.Signal3}
      />
      <Detail.Metadata.Label
        title="Jitter"
        text={formatMetric(state.jitter, 1, " ms")}
        icon={Icon.Dot}
      />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="Download"
        text={formatMetric(
          state.phase === "done" ? state.finalDownload : state.downloadBandwidth,
          2,
          " Mbps",
        )}
        icon={Icon.ArrowDown}
      />
      <Detail.Metadata.Label
        title="Upload"
        text={formatMetric(
          state.phase === "done" ? state.finalUpload : state.uploadBandwidth,
          2,
          " Mbps",
        )}
        icon={Icon.ArrowUp}
      />
      {state.packetLoss !== null ? (
        <Detail.Metadata.Label title="Packet Loss" text={`${state.packetLoss}%`} icon={Icon.Minus} />
      ) : null}
      {(state.downloadLatencyIqm !== null || state.uploadLatencyIqm !== null) ? (
        <Detail.Metadata.TagList title="Latency IQM">
          {state.downloadLatencyIqm !== null ? (
            <Detail.Metadata.TagList.Item text={`DL ${state.downloadLatencyIqm.toFixed(1)} ms`} />
          ) : null}
          {state.uploadLatencyIqm !== null ? (
            <Detail.Metadata.TagList.Item text={`UL ${state.uploadLatencyIqm.toFixed(1)} ms`} />
          ) : null}
        </Detail.Metadata.TagList>
      ) : null}
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="ISP" text={state.isp || "—"} icon={Icon.Network} />
      <Detail.Metadata.Label
        title="Server"
        text={state.server ? `${state.server}${state.serverLocation ? ` (${state.serverLocation})` : ""}` : "—"}
        icon={Icon.Globe}
      />
      {state.shareUrl ? (
        <Detail.Metadata.Link title="Result" text="Open Speedtest Result" target={state.shareUrl} />
      ) : null}
    </Detail.Metadata>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const INITIAL: SpeedState = {
  phase: "starting",
  ping: null,
  jitter: null,
  pingProgress: 0,
  downloadBandwidth: null,
  downloadProgress: 0,
  downloadLatencyIqm: null,
  uploadBandwidth: null,
  uploadProgress: 0,
  uploadLatencyIqm: null,
  finalDownload: null,
  finalUpload: null,
  packetLoss: null,
  isp: "",
  server: "",
  serverLocation: "",
  shareUrl: "",
  errorMessage: "",
};

export default function RunSpeedtest() {
  const [state, setState] = useState<SpeedState>(INITIAL);
  const procRef = useRef<ReturnType<typeof spawn> | null>(null);

  const runTest = useCallback(() => {
    procRef.current?.kill();

    let cur: SpeedState = { ...INITIAL };
    setState(cur);

    let lineBuffer = "";
    let stderrBuffer = "";

    const proc = spawn("speedtest", ["--format=jsonl", "--accept-license", "--accept-gdpr"]);
    procRef.current = proc;

    proc.stdout.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString();

      while (lineBuffer.includes("\n")) {
        const nl = lineBuffer.indexOf("\n");
        const raw = lineBuffer.substring(0, nl).trim();
        lineBuffer = lineBuffer.substring(nl + 1);
        if (!raw) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }

        const type = event.type as string;

        if (type === "testStart") {
          const srv = event.server as Record<string, unknown> | undefined;
          cur = {
            ...cur,
            phase: "ping",
            isp: (event.isp as string) ?? "",
            server: (srv?.["name"] as string) ?? "",
            serverLocation: (srv?.["location"] as string) ?? "",
          };
        } else if (type === "ping") {
          const p = event.ping as Record<string, unknown>;
          cur = {
            ...cur,
            phase: "ping",
            ping: p.latency as number,
            jitter: p.jitter as number,
            pingProgress: p.progress as number,
          };
        } else if (type === "download") {
          const d = event.download as Record<string, unknown>;
          const latency = d.latency as Record<string, unknown> | undefined;
          cur = {
            ...cur,
            phase: "download",
            downloadBandwidth: bwToMbps(d.bandwidth as number),
            downloadProgress: d.progress as number,
            downloadLatencyIqm: (latency?.["iqm"] as number) ?? cur.downloadLatencyIqm,
          };
        } else if (type === "upload") {
          const u = event.upload as Record<string, unknown>;
          const latency = u.latency as Record<string, unknown> | undefined;
          cur = {
            ...cur,
            phase: "upload",
            uploadBandwidth: bwToMbps(u.bandwidth as number),
            uploadProgress: u.progress as number,
            uploadLatencyIqm: (latency?.["iqm"] as number) ?? cur.uploadLatencyIqm,
          };
        } else if (type === "result") {
          const d = event.download as Record<string, unknown>;
          const u = event.upload as Record<string, unknown>;
          const p = event.ping as Record<string, unknown>;
          const res = event.result as Record<string, unknown> | undefined;
          const srv = event.server as Record<string, unknown> | undefined;
          const dLatency = d.latency as Record<string, unknown> | undefined;
          const uLatency = u.latency as Record<string, unknown> | undefined;
          cur = {
            ...cur,
            phase: "done",
            finalDownload: bwToMbps(d.bandwidth as number),
            finalUpload: bwToMbps(u.bandwidth as number),
            ping: p.latency as number,
            jitter: p.jitter as number,
            packetLoss: (event.packetLoss as number) ?? null,
            isp: (event.isp as string) ?? cur.isp,
            server: (srv?.["name"] as string) ?? cur.server,
            serverLocation: (srv?.["location"] as string) ?? cur.serverLocation,
            shareUrl: (res?.["url"] as string) ?? "",
            downloadLatencyIqm: (dLatency?.["iqm"] as number) ?? cur.downloadLatencyIqm,
            uploadLatencyIqm: (uLatency?.["iqm"] as number) ?? cur.uploadLatencyIqm,
          };
        }

        setState({ ...cur });
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    proc.on("error", (err) => {
      cur = { ...cur, phase: "error", errorMessage: err.message };
      setState({ ...cur });
    });

    proc.on("close", (code) => {
      if (code !== 0 && cur.phase !== "done") {
        cur = {
          ...cur,
          phase: "error",
          errorMessage: stderrBuffer || `Process exited with code ${code}`,
        };
        setState({ ...cur });
      }
    });
  }, []);

  useEffect(() => {
    runTest();
    return () => {
      procRef.current?.kill();
    };
  }, [runTest]);

  return (
    <Detail
      markdown={buildMarkdown(state)}
      metadata={buildMetadata(state)}
      actions={
        <ActionPanel>
          <Action
            title="Run Again"
            icon={Icon.ArrowClockwise}
            onAction={runTest}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
          {state.finalDownload !== null && (
            <Action.CopyToClipboard
              title="Copy Download Speed"
              content={`${state.finalDownload.toFixed(2)} Mbps`}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
            />
          )}
          {state.finalUpload !== null && (
            <Action.CopyToClipboard
              title="Copy Upload Speed"
              content={`${state.finalUpload.toFixed(2)} Mbps`}
              shortcut={{ modifiers: ["cmd"], key: "u" }}
            />
          )}
          {state.shareUrl && (
            <Action.OpenInBrowser
              title="Open Result in Browser"
              url={state.shareUrl}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
