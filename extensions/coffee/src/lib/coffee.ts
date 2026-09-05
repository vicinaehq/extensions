import { Schedule, Session, SessionMode, Status } from "./types";
import { readState, updateState } from "./state";
import { detectBackend, isPidAlive, processIdentityMatches, startInhibit, stopPid } from "./inhibit";
import { ActiveWindow, createScheduleId, activeWindow, sortDays } from "./schedule";
import { formatClock, formatDuration } from "./time";

export interface CaffeinateRequest {
  mode: SessionMode;
  durationMs?: number;
  until?: Date;
  waitPid?: number;
  waitName?: string;
  reason?: string;
}

export interface CoffeeStatsSummary {
  allTime: number;
  thisWeek: number;
  thisMonth: number;
}

export function currentStatus(): Status {
  const state = reconcile();
  return toStatus(state.session);
}

export function caffeinate(request: CaffeinateRequest): Status {
  stopCurrent("replaced");

  const until = request.until?.getTime() ?? (request.durationMs ? Date.now() + request.durationMs : null);
  const durationSec = until ? Math.max(1, Math.ceil((until - Date.now()) / 1000)) : undefined;
  const reason = request.reason ?? reasonFor(request);

  const started = startInhibit({
    durationSec: request.waitPid ? undefined : durationSec,
    waitPid: request.waitPid,
    reason,
  });

  const session: Session = {
    pid: started.pid,
    processIdentity: started.processIdentity,
    mode: request.mode,
    startedAt: Date.now(),
    endsAt: request.waitPid ? null : until,
    waitPid: request.waitPid ?? null,
    waitName: request.waitName ?? null,
    reason,
    backend: started.backend,
  };

  updateState((state) => {
    state.session = session;
    state.stats.totalCoffees += 1;
    state.stats.startedAt.push(session.startedAt);
  });

  return toStatus(session);
}

export function totalCoffees(): number {
  return readState().stats.totalCoffees;
}

export function coffeeStatsSummary(now = new Date()): CoffeeStatsSummary {
  const stats = readState().stats;
  const weekStart = startOfWeek(now).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisWeek = stats.startedAt.filter((entry) => entry >= weekStart).length;
  const thisMonth = stats.startedAt.filter((entry) => entry >= monthStart).length;
  return {
    allTime: stats.totalCoffees,
    thisWeek,
    thisMonth,
  };
}

export function decaffeinate(options?: { skipActiveSchedule?: boolean }): Status {
  const state = readState();
  const windows = options?.skipActiveSchedule
    ? (state.schedules.map((schedule) => activeWindow(schedule)).filter(Boolean) as ActiveWindow[])
    : [];
  const skipUntilById = new Map<string, number>();
  for (const window of windows) {
    skipUntilById.set(window.schedule.id, window.endsAt);
  }

  stopCurrent("manual");

  const next = updateState((current) => {
    current.session = null;
    if (skipUntilById.size > 0) {
      current.schedules = current.schedules.map((schedule) =>
        skipUntilById.has(schedule.id)
          ? { ...schedule, skipUntil: skipUntilById.get(schedule.id) ?? schedule.skipUntil }
          : schedule,
      );
    }
  });

  return toStatus(next.session);
}

export function toggle(): Status {
  const status = currentStatus();
  return status.caffeinated ? decaffeinate({ skipActiveSchedule: true }) : caffeinate({ mode: "indefinite" });
}

export function applySchedules(): Status {
  const state = reconcile();
  const window = state.schedules.map((schedule) => activeWindow(schedule)).find(Boolean);

  if (!window) {
    if (state.session?.mode === "schedule") {
      stopCurrent("schedule-end");
      updateState((current) => {
        current.session = null;
      });
      return toStatus(null);
    }
    return toStatus(state.session);
  }

  if (state.session) {
    if (state.session.mode === "schedule" && state.session.endsAt === window.endsAt) {
      return toStatus(state.session);
    }
    if (state.session.mode !== "schedule") {
      return toStatus(state.session);
    }
  }

  return caffeinate({
    mode: "schedule",
    until: new Date(window.endsAt),
    reason: `Scheduled ${window.schedule.from}–${window.schedule.to}`,
  });
}

export function addSchedules(schedules: Omit<Schedule, "id" | "paused" | "skipUntil">[]): Schedule[] {
  const created: Schedule[] = schedules.map((schedule) => ({
    ...schedule,
    id: createScheduleId(),
    days: sortDays(schedule.days),
    paused: false,
    skipUntil: null,
  }));

  updateState((state) => {
    state.schedules.push(...created);
  });

  applySchedules();
  return created;
}

export function updateSchedule(id: string, patch: Partial<Schedule>): void {
  updateState((state) => {
    state.schedules = state.schedules.map((schedule) =>
      schedule.id === id ? { ...schedule, ...patch, id: schedule.id } : schedule,
    );
  });
}

export function removeSchedule(id: string): Status {
  updateState((current) => {
    current.schedules = current.schedules.filter((schedule) => schedule.id !== id);
  });
  return applySchedules();
}

function reconcile() {
  return updateState((state) => {
    const session = state.session;
    if (!session) return;
    if (!session.processIdentity) {
      state.session = null;
      return;
    }
    if (!isPidAlive(session.pid)) {
      state.session = null;
      return;
    }
    if (!processIdentityMatches(session.pid, session.processIdentity)) {
      state.session = null;
      return;
    }
    if (session.endsAt && Date.now() >= session.endsAt) {
      stopPid(session.pid);
      state.session = null;
    }
  });
}

function stopCurrent(_reason: string): void {
  const session = readState().session;
  if (!session || !session.processIdentity) return;
  if (isPidAlive(session.pid) && processIdentityMatches(session.pid, session.processIdentity)) {
    stopPid(session.pid);
  }
}

function reasonFor(request: CaffeinateRequest): string {
  if (request.waitName) return `While ${request.waitName} is open`;
  if (request.until) return `Until ${formatClock(request.until)}`;
  if (request.durationMs) return `For ${formatDuration(request.durationMs)}`;
  return "Until you decaffeinate";
}

function toStatus(session: Session | null): Status {
  const remainingMs =
    session?.endsAt && session.endsAt > Date.now() ? session.endsAt - Date.now() : session?.endsAt ? 0 : null;

  return {
    caffeinated: Boolean(session),
    session,
    remainingMs,
    summary: session ? summarize(session, remainingMs) : "Decaffeinated",
    backend: session?.backend ?? (() => {
      try {
        return detectBackend();
      } catch {
        return null;
      }
    })(),
  };
}

function summarize(session: Session, remainingMs: number | null): string {
  if (session.waitName) return `While ${session.waitName} is open`;
  if (remainingMs !== null) return `${formatDuration(remainingMs)} left`;
  if (session.mode === "indefinite") return "Until you decaffeinate";
  return session.reason;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - diff);
  next.setHours(0, 0, 0, 0);
  return next;
}
