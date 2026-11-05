import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { exec, spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import util from "node:util";
import { useCallback, useEffect, useRef, useState } from "react";

const execp = util.promisify(exec);

/** Search PATH for an executable by name, verifying it exists and is executable via fs.access. */
async function findExecutable(name: string): Promise<string | null> {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(":");
  for (const dir of dirs) {
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not found or not executable in this directory, continue
    }
  }
  return null;
}

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
  installHint: string;
}

function bwToMbps(bytesPerSec: number): number {
  return (bytesPerSec * 8) / 1_000_000;
}

function formatMetric(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

function formatServer(server: string, location: string): string {
  return server ? `${server}${location ? ` (${location})` : ""}` : "—";
}

// ─── Package manager detection ────────────────────────────────────────────────

const PACKAGE_MANAGERS: Array<{ cmd: string; install: string }> = [
  { cmd: "paru", install: "paru -S ookla-speedtest-bin" },
  { cmd: "yay", install: "yay -S ookla-speedtest-bin" },
  { cmd: "brew", install: "brew tap teamookla/speedtest && brew install speedtest" },
  {
    cmd: "apt",
    install: "sudo apt-get install curl\ncurl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | sudo bash\nsudo apt-get install speedtest",
  },
  {
    cmd: "yum",
    install: "curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.rpm.sh | sudo bash\nsudo yum install speedtest",
  },
  {
    cmd: "dnf",
    install: "curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.rpm.sh | sudo bash\nsudo yum install speedtest",
  },
];

async function detectInstallCmd(): Promise<string> {
  const results = await Promise.allSettled(
    PACKAGE_MANAGERS.map(async ({ cmd, install }) => {
      const { stdout } = await execp(`bash -lc "command -v ${cmd} 2>/dev/null"`);
      if (!stdout.trim()) throw new Error("not found");
      return install;
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled") return r.value;
  }
  return "# See install guide: https://www.speedtest.net/apps/cli";
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

const CLI_LINK = "https://www.speedtest.net/apps/cli";

function installBlock(hint: string): string {
  return `\`\`\`\n${hint || `# See: ${CLI_LINK}`}\n\`\`\`\n\n[Other platforms / manual install](${CLI_LINK})`;
}

function buildMarkdown(state: SpeedState): string {
  if (state.phase === "error") {
    const notFound =
      state.errorMessage.includes("not found") ||
      state.errorMessage.includes("ENOENT") ||
      state.errorMessage.includes("command not found");
    if (notFound) {
      return `# Speedtest CLI Not Found\n\nInstall Ookla's speedtest CLI:\n\n${installBlock(state.installHint)}`;
    }
    if (state.errorMessage.includes("Wrong speedtest binary")) {
      return `# Wrong Speedtest Binary\n\nA \`speedtest\` command was found but it's not Ookla's CLI.\n\nInstall the correct one:\n\n${installBlock(state.installHint)}`;
    }
    return `# Speedtest Failed\n\n\`\`\`\n${state.errorMessage}\n\`\`\`\n\nPress **⌘R** to run it again.`;
  }

  const title = state.phase === "done" ? "# Speedtest Results" : "# Speedtest Running";

  const dlVal = state.finalDownload ?? state.downloadBandwidth;
  const ulVal = state.finalUpload ?? state.uploadBandwidth;

  const cell = (value: string | null, activePhase: Phase): string => {
    if (value !== null) return value;
    return state.phase === activePhase ? "_measuring..._" : "—";
  };

  const latencyIqm = [
    state.downloadLatencyIqm !== null ? `DL ${state.downloadLatencyIqm.toFixed(1)} ms` : null,
    state.uploadLatencyIqm !== null ? `UL ${state.uploadLatencyIqm.toFixed(1)} ms` : null,
  ].filter((v): v is string => v !== null).join(" / ") || "—";

  const rows = [
    `| Metric | Value |`,
    `| --- | --- |`,
    `| ISP | ${state.isp || "—"} |`,
    `| Server | ${formatServer(state.server, state.serverLocation)} |`,
    `| Ping | ${cell(state.ping !== null ? formatMetric(state.ping, 1, " ms") : null, "ping")} |`,
    `| Download | ${cell(dlVal !== null ? formatMetric(dlVal, 2, " Mbps") : null, "download")} |`,
    `| Upload | ${cell(ulVal !== null ? formatMetric(ulVal, 2, " Mbps") : null, "upload")} |`,
    `| Jitter | ${formatMetric(state.jitter, 1, " ms")} |`,
    `| Latency IQM | ${latencyIqm} |`,
    state.packetLoss !== null ? `| Packet Loss | ${state.packetLoss}% |` : null,
  ].filter((r): r is string => r !== null);

  const shareLine = state.shareUrl ? `\n[View Result on Speedtest.net](${state.shareUrl})` : "";

  return [title, "", ...rows, shareLine].filter(Boolean).join("\n");
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
  installHint: "",
};

export default function RunSpeedtest() {
  const [state, setState] = useState<SpeedState>(INITIAL);
  const procRef = useRef<ReturnType<typeof spawn> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runTest = useCallback(async () => {
    procRef.current?.kill();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    let cur: SpeedState = { ...INITIAL };
    setState(cur);

    // Step 1: Check if the speedtest binary exists in PATH (without executing it)
    const speedtestPath = await findExecutable("speedtest");
    if (!speedtestPath) {
      const installHint = await detectInstallCmd();
      setState({ ...cur, phase: "error", errorMessage: "speedtest command not found in PATH", installHint });
      return;
    }

    // Step 2: Verify it's Ookla's speedtest (not the python-based one)
    try {
      const { stdout: version } = await execp(`"${speedtestPath}" --version 2>&1`);
      if (!version.toLowerCase().includes("ookla")) {
        const installHint = await detectInstallCmd();
        setState({ ...cur, phase: "error", errorMessage: "Wrong speedtest binary found.", installHint });
        return;
      }
    } catch {
      const installHint = await detectInstallCmd();
      setState({ ...cur, phase: "error", errorMessage: "Wrong speedtest binary found.", installHint });
      return;
    }

    let lineBuffer = "";
    let stderrBuffer = "";

    const proc = spawn(speedtestPath, ["--format=jsonl", "--accept-license", "--accept-gdpr"]);
    procRef.current = proc;

    timeoutRef.current = setTimeout(() => {
      if (cur.phase !== "done" && cur.phase !== "error") {
        proc.kill();
        cur = { ...cur, phase: "error", errorMessage: "Speedtest timed out after 30 seconds." };
        setState({ ...cur });
      }
    }, 30_000);

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
      if (stderrBuffer.length < 8192) stderrBuffer += chunk.toString();
    });

    proc.on("error", (err) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      cur = { ...cur, phase: "error", errorMessage: err.message };
      setState({ ...cur });
    });

    proc.on("close", (code) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (cur.phase !== "done" && cur.phase !== "error") {
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [runTest]);

  return (
    <Detail
      markdown={buildMarkdown(state)}
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
