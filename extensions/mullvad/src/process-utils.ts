import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";

export interface ProcessInfo {
  pid: string;
  ppid: string;
  command: string;
  fullCommand: string;
  isRunning: boolean;
  cgroup?: string; // Optional: for detecting related processes on Linux
}

export interface GroupedProcess {
	command: string;
	fullCommand: string;
	pids: string[];
	isRunning: boolean;
}

export function getIconForProcess(
	group: GroupedProcess,
	appIconMap: Map<string, string>,
	fallbackIcon: string,
	fallbackStoppedIcon: string,
): string {
	const executableName =
		group.command.split("/").pop()?.toLowerCase() ||
		group.command.toLowerCase();

	const exactMatch = appIconMap.get(executableName);
	if (exactMatch) return exactMatch;

	for (const [appName, icon] of appIconMap) {
		const appNameLower = appName.toLowerCase();
		if (appNameLower.includes(executableName) || executableName.includes(appNameLower)) {
			return icon;
		}
	}

	const appMatch = group.fullCommand.match(/(.+?\.app)\//);
	if (appMatch) return appMatch[1];

	return group.isRunning ? fallbackIcon : fallbackStoppedIcon;
}

export function tokenizeCommand(command: string): string[] {
  return command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isRealApplication(
  command: string,
  installedAppCommands: Set<string>,
): boolean {
  const commandLower = command.toLowerCase();
  if (installedAppCommands.has(commandLower)) return true;
  return tokenizeCommand(commandLower).some((token) =>
    installedAppCommands.has(token),
  );
}

export function findNearestParentApp(
  proc: ProcessInfo,
  processMap: Map<string, ProcessInfo>,
  pidSet: Set<string>,
  installedAppCommands: Set<string>,
): ProcessInfo | null {
  let current = proc;
  const visited = new Set<string>();

  while (pidSet.has(current.ppid) && !visited.has(current.pid)) {
    visited.add(current.pid);
    const parent = processMap.get(current.ppid);
    if (!parent) return null;
    if (isRealApplication(parent.command, installedAppCommands)) return parent;
    current = parent;
  }

  return null;
}

export async function hydrateCgroups(
  processMap: Map<string, ProcessInfo>,
  installedAppCommands: Set<string>,
  limit = 32,
): Promise<void> {
  try {
    await fs.access("/proc/self/cgroup");
  } catch {
    return;
  }

  const pidSet = new Set(processMap.keys());
  const candidatePids: string[] = [];
  let hasRealApp = false;

  for (const proc of processMap.values()) {
    const isApp = isRealApplication(proc.command, installedAppCommands);
    if (isApp) hasRealApp = true;
    const parentApp = isApp
      ? null
      : findNearestParentApp(proc, processMap, pidSet, installedAppCommands);
    if (isApp || !parentApp) {
      candidatePids.push(proc.pid);
    }
  }

  if (!hasRealApp || candidatePids.length === 0) return;

  let index = 0;
  const workerCount = Math.min(limit, candidatePids.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (index < candidatePids.length) {
      const pid = candidatePids[index++];
      const proc = processMap.get(pid);
      if (!proc) continue;
      try {
        const cgroupData = await fs.readFile(`/proc/${pid}/cgroup`, "utf8");
        const match = cgroupData.match(
          /0::.*\/(app-[^\/]+\.scope|session-[^\/]+\.scope)/,
        );
        if (match) {
          proc.cgroup = match[1];
        }
      } catch {
        // Ignore if we can't read cgroup
      }
    }
  });

  await Promise.allSettled(workers);
}

export async function parseProcessesInfo(
  pids: string[],
): Promise<Map<string, ProcessInfo>> {
  const processMap = new Map<string, ProcessInfo>();

  if (pids.length === 0) return processMap;

  const pidList = pids.join(",");

  function parseLine(line: string): void {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return;
    const [pid, ppid, command, ...args] = parts;
    const fullCommand = args.join(" ") || command;
    processMap.set(pid, { pid, ppid, command, fullCommand, isRunning: true });
  }

  try {
    const output = execSync(
      `ps -p ${pidList} -o pid,ppid,comm,args --no-headers`,
    )
      .toString()
      .trim();

    if (!output) return processMap;
    for (const line of output.split("\n")) {
      parseLine(line);
    }
  } catch {
    // Some or all processes may no longer exist, continue with what we have
  }

  for (const pid of pids) {
    if (processMap.has(pid)) continue;
    processMap.set(pid, {
      pid,
      ppid: "0",
      command: "Unknown",
      fullCommand: `Process ${pid} (no longer running)`,
      isRunning: false,
    });
  }

  return processMap;
}

export function buildProcessesByCgroup(
  processMap: Map<string, ProcessInfo>,
): Map<string, ProcessInfo[]> {
  const processesByCgroup = new Map<string, ProcessInfo[]>();
  for (const proc of processMap.values()) {
    if (!proc.cgroup) continue;
    const existing = processesByCgroup.get(proc.cgroup);
    if (existing) {
      existing.push(proc);
    } else {
      processesByCgroup.set(proc.cgroup, [proc]);
    }
  }
  return processesByCgroup;
}

export function findCgroupRoot(
  proc: ProcessInfo,
  processesByCgroup: Map<string, ProcessInfo[]>,
  installedAppCommands: Set<string>,
): ProcessInfo | null {
  if (!proc.cgroup) return null;
  const cgroupProcesses = processesByCgroup.get(proc.cgroup);
  if (!cgroupProcesses) return null;

  let cgroupRoot: ProcessInfo | null = null;
  for (const other of cgroupProcesses) {
    if (!isRealApplication(other.command, installedAppCommands)) continue;
    if (!cgroupRoot || Number(other.pid) < Number(cgroupRoot.pid)) {
      cgroupRoot = other;
    }
  }

  return cgroupRoot;
}

export function resolveRoot(
  proc: ProcessInfo,
  rootByPid: Map<string, ProcessInfo>,
  processMap: Map<string, ProcessInfo>,
  pidSet: Set<string>,
  installedAppCommands: Set<string>,
  processesByCgroup: Map<string, ProcessInfo[]>,
): ProcessInfo {
  const cached = rootByPid.get(proc.pid);
  if (cached) return cached;

  const parentRoot = findNearestParentApp(
    proc,
    processMap,
    pidSet,
    installedAppCommands,
  );
  if (parentRoot) {
    rootByPid.set(proc.pid, parentRoot);
    return parentRoot;
  }

  if (!isRealApplication(proc.command, installedAppCommands)) {
    const cgroupRoot = findCgroupRoot(
      proc,
      processesByCgroup,
      installedAppCommands,
    );
    if (cgroupRoot) {
      rootByPid.set(proc.pid, cgroupRoot);
      return cgroupRoot;
    }
  }

  rootByPid.set(proc.pid, proc);
  return proc;
}

export function countAppRootsByCgroupCommand(
  processMap: Map<string, ProcessInfo>,
  resolve: (proc: ProcessInfo) => ProcessInfo,
  installedAppCommands: Set<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const proc of processMap.values()) {
    const root = resolve(proc);
    if (!isRealApplication(root.command, installedAppCommands) || !root.cgroup)
      continue;
    const key = `${root.cgroup}:${root.command.toLowerCase()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function groupKeyForRoot(
  root: ProcessInfo,
  appRootsByCgroupCommand: Map<string, number>,
  installedAppCommands: Set<string>,
): string {
  if (!isRealApplication(root.command, installedAppCommands))
    return `cmd:${root.command}`;
  const rootCommand = root.command.toLowerCase();
  const rootCgroup = root.cgroup ? `${root.cgroup}:${rootCommand}` : null;
  const similarRoots = rootCgroup
    ? appRootsByCgroupCommand.get(rootCgroup) || 0
    : 0;
  return similarRoots > 1 ? `cmd:${rootCommand}` : `pid:${root.pid}`;
}

export function groupProcessesByCommand(
	processMap: Map<string, ProcessInfo>,
	installedAppCommands: Set<string>,
): GroupedProcess[] {
	const pidSet = new Set(processMap.keys());
	const groups = new Map<string, GroupedProcess>();
	const rootByPid = new Map<string, ProcessInfo>();
	const processesByCgroup = buildProcessesByCgroup(processMap);
	const resolve = (proc: ProcessInfo) =>
		resolveRoot(
			proc,
			rootByPid,
			processMap,
			pidSet,
			installedAppCommands,
			processesByCgroup,
		);
	const appRootsByCgroupCommand = countAppRootsByCgroupCommand(
		processMap,
		resolve,
		installedAppCommands,
	);

	const groupedByKey = new Map<string, ProcessInfo[]>();
	for (const proc of processMap.values()) {
		const root = resolve(proc);
		const groupKey = groupKeyForRoot(
			root,
			appRootsByCgroupCommand,
			installedAppCommands,
		);
		const existing = groupedByKey.get(groupKey);
		if (existing) {
			existing.push(proc);
			continue;
		}
		groupedByKey.set(groupKey, [proc]);
	}

	for (const [groupKey, procs] of groupedByKey.entries()) {
		const root = resolve(procs[0]);
		groups.set(groupKey, {
			command: root.command,
			fullCommand: root.fullCommand,
			pids: procs.map((p) => p.pid),
			isRunning: procs.some((p) => p.isRunning),
		});
	}

	return Array.from(groups.values()).sort((a, b) =>
		a.command.localeCompare(b.command),
	);
}
