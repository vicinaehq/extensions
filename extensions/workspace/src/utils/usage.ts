import { ProjectUsage, UsageStore } from "@/types";

export type UsagePeriod = "all" | "year" | "month" | "week" | "day";

export interface RankedProject {
  count: number;
  lastOpened: number;
  path: string;
}

export interface UsageSnapshot {
  installedAt: number;
  mostOpened: Record<UsagePeriod, RankedProject | null>;
  opensInPeriod: Record<UsagePeriod, number>;
  projectsTracked: number;
  topProjects: Record<UsagePeriod, RankedProject[]>;
  totalOpens: number;
}

export function createEmptyUsageStore(now = Date.now()): UsageStore {
  return { installedAt: now, projects: {} };
}

export function normalizeUsageStore(value: unknown, now = Date.now()): UsageStore {
  if (!value || typeof value !== "object") {
    return createEmptyUsageStore(now);
  }

  const record = value as Partial<UsageStore>;
  const installedAt =
    typeof record.installedAt === "number" && Number.isFinite(record.installedAt) ? record.installedAt : now;

  const projects: Record<string, ProjectUsage> = {};
  if (record.projects && typeof record.projects === "object") {
    for (const [pathKey, entry] of Object.entries(record.projects)) {
      const normalized = normalizeProjectUsage(entry);
      if (normalized) {
        projects[pathKey] = normalized;
      }
    }
  }

  return { installedAt, projects };
}

export function recordOpen(store: UsageStore, projectPath: string, at = Date.now()): UsageStore {
  const day = toDayKey(at);
  const existing = store.projects[projectPath];
  const days = { ...(existing?.days ?? {}) };
  days[day] = (days[day] ?? 0) + 1;

  return {
    ...store,
    installedAt: store.installedAt || at,
    projects: {
      ...store.projects,
      [projectPath]: {
        days,
        lastOpened: at,
        total: (existing?.total ?? 0) + 1,
      },
    },
  };
}

export function buildUsageSnapshot(store: UsageStore, now = Date.now(), topN = 25): UsageSnapshot {
  const ranges = periodRanges(now);
  const mostOpened = {} as Record<UsagePeriod, RankedProject | null>;
  const opensInPeriod = {} as Record<UsagePeriod, number>;
  const topProjects = {} as Record<UsagePeriod, RankedProject[]>;

  for (const period of PERIODS) {
    const ranked = rankProjects(store, ranges[period].start, topN);
    topProjects[period] = ranked;
    mostOpened[period] = ranked[0] ?? null;
    opensInPeriod[period] = countOpensInRange(store, ranges[period].start);
  }

  return {
    installedAt: store.installedAt,
    mostOpened,
    opensInPeriod,
    projectsTracked: Object.keys(store.projects).length,
    topProjects,
    totalOpens: Object.values(store.projects).reduce((sum, entry) => sum + entry.total, 0),
  };
}

export function projectDisplayName(projectPath: string): string {
  const parts = projectPath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || projectPath;
}

export function formatInstalledSince(installedAt: number, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - installedAt) / (24 * 60 * 60 * 1000)));
  const date = new Date(installedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (days === 0) {
    return `Today (${date})`;
  }
  if (days === 1) {
    return `1 day (${date})`;
  }
  return `${days} days (${date})`;
}

const PERIODS: UsagePeriod[] = ["all", "year", "month", "week", "day"];

function normalizeProjectUsage(value: unknown): ProjectUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<ProjectUsage>;
  const total = typeof entry.total === "number" && entry.total > 0 ? Math.floor(entry.total) : 0;
  const lastOpened =
    typeof entry.lastOpened === "number" && Number.isFinite(entry.lastOpened) ? entry.lastOpened : 0;

  const days: Record<string, number> = {};
  if (entry.days && typeof entry.days === "object") {
    for (const [day, count] of Object.entries(entry.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof count === "number" && count > 0) {
        days[day] = Math.floor(count);
      }
    }
  }

  if (total === 0 && Object.keys(days).length === 0) {
    return null;
  }

  const summed = Object.values(days).reduce((sum, count) => sum + count, 0);
  return {
    days,
    lastOpened,
    total: Math.max(total, summed),
  };
}

function periodRanges(now: number): Record<UsagePeriod, { start: number | null }> {
  const date = new Date(now);

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const startOfYear = new Date(date.getFullYear(), 0, 1);

  return {
    all: { start: null },
    day: { start: startOfDay.getTime() },
    month: { start: startOfMonth.getTime() },
    week: { start: startOfWeek.getTime() },
    year: { start: startOfYear.getTime() },
  };
}

function rankProjects(store: UsageStore, since: number | null, topN: number): RankedProject[] {
  const ranked: RankedProject[] = [];

  for (const [pathKey, entry] of Object.entries(store.projects)) {
    const count = since == null ? entry.total : countProjectOpensSince(entry, since);
    if (count <= 0) {
      continue;
    }
    ranked.push({ count, lastOpened: entry.lastOpened, path: pathKey });
  }

  ranked.sort((a, b) => b.count - a.count || b.lastOpened - a.lastOpened || a.path.localeCompare(b.path));
  return ranked.slice(0, topN);
}

function countOpensInRange(store: UsageStore, since: number | null): number {
  let total = 0;
  for (const entry of Object.values(store.projects)) {
    total += since == null ? entry.total : countProjectOpensSince(entry, since);
  }
  return total;
}

function countProjectOpensSince(entry: ProjectUsage, since: number): number {
  let total = 0;
  for (const [day, count] of Object.entries(entry.days)) {
    if (dayKeyToTime(day) >= since) {
      total += count;
    }
  }
  return total;
}

function toDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayKeyToTime(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).getTime();
}
