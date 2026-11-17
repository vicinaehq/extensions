import { ancestry, run } from "./proc";

type TmuxClient = {
  tty: string;
  pid: number;
  activity: number;
};

async function mostRecentClient(): Promise<TmuxClient | undefined> {
  const output = await run("tmux", ["list-clients", "-F", "#{client_activity}\t#{client_tty}\t#{client_pid}"]);
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [activity, tty, pid] = line.split("\t");
      return { activity: Number(activity), tty, pid: Number(pid) };
    })
    .sort((a, b) => b.activity - a.activity)[0];
}

type I3Node = {
  id: number;
  pid?: number;
  window?: number | null;
  nodes?: I3Node[];
  floating_nodes?: I3Node[];
};

async function focusHyprlandWindowOf(pid: number): Promise<boolean> {
  if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    return false;
  }
  const windows = JSON.parse(await run("hyprctl", ["clients", "-j"])) as { pid: number }[];
  const windowPids = new Set(windows.map((window) => window.pid));
  for await (const ancestor of ancestry(pid)) {
    if (windowPids.has(ancestor)) {
      await run("hyprctl", ["dispatch", `hl.dsp.focus({ window = "pid:${ancestor}" })`]);
      return true;
    }
  }
  return false;
}

async function i3NodePid(node: I3Node): Promise<number | undefined> {
  if (node.pid !== undefined) {
    return node.pid;
  }
  if (node.window === undefined || node.window === null) {
    return undefined;
  }
  try {
    const output = await run("xprop", ["-id", `0x${node.window.toString(16)}`, "_NET_WM_PID"]);
    const match = output.match(/=\s*(\d+)/);
    return match === null ? undefined : Number(match[1]);
  } catch {
    // Windows can disappear while the i3 tree is being inspected.
    return undefined;
  }
}

async function findI3ContainerId(node: I3Node, pids: Set<number>): Promise<number | undefined> {
  const nodePid = await i3NodePid(node);
  if (nodePid !== undefined && pids.has(nodePid)) {
    return node.id;
  }
  for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) {
    const id = await findI3ContainerId(child, pids);
    if (id !== undefined) {
      return id;
    }
  }
  return undefined;
}

async function focusI3WindowOf(pid: number): Promise<void> {
  let tree: I3Node;
  try {
    tree = JSON.parse(await run("i3-msg", ["-t", "get_tree"])) as I3Node;
  } catch {
    // i3-msg also serves as the compositor detection: when no i3 IPC socket is
    // available, switching the tmux client is still useful and should succeed.
    return;
  }

  const ancestorPids = new Set<number>();
  for await (const ancestor of ancestry(pid)) {
    ancestorPids.add(ancestor);
  }
  const containerId = await findI3ContainerId(tree, ancestorPids);
  if (containerId !== undefined) {
    await run("i3-msg", [`[con_id=${containerId}]`, "focus"]);
  }
}

async function focusTerminalWindowOf(pid: number): Promise<void> {
  if (await focusHyprlandWindowOf(pid)) {
    return;
  }
  await focusI3WindowOf(pid);
}

export async function switchToPane(paneId: string): Promise<void> {
  const client = await mostRecentClient();
  if (!client) {
    throw new Error("No tmux client is attached");
  }
  await run("tmux", ["switch-client", "-c", client.tty, "-t", paneId]);
  await focusTerminalWindowOf(client.pid);
}
