export interface Score {
  sets: number[];
  games: number[][] | null;
  points: (string | null)[];
  server: 1 | 2 | null;
  is_tiebreak: boolean;
  stale: boolean;
}

export interface Match {
  id: number;
  tournament: string;
  event_status: string | null;
  players: { p1: { name: string }; p2: { name: string } };
  score: Score | null;
}

export interface MatchList {
  matches: Match[];
  hasMore: boolean;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numbers(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0)
  );
}

function parseScore(value: unknown): Score | null {
  if (value == null) return null;
  if (
    !object(value) ||
    !numbers(value.sets) ||
    !(
      value.games === null ||
      (Array.isArray(value.games) && value.games.every(numbers))
    ) ||
    !Array.isArray(value.points) ||
    !value.points.every(
      (point) => point === null || typeof point === "string",
    ) ||
    ![null, 1, 2].includes(value.server as number | null) ||
    typeof value.is_tiebreak !== "boolean" ||
    (value.stale !== undefined && typeof value.stale !== "boolean")
  ) {
    throw new Error("Invalid score response");
  }
  return {
    sets: value.sets,
    games: value.games as number[][] | null,
    points: value.points,
    server: value.server as Score["server"],
    is_tiebreak: value.is_tiebreak,
    stale: value.stale === true,
  };
}

export function parseMatches(value: unknown): MatchList {
  if (
    !object(value) ||
    !Array.isArray(value.data) ||
    !object(value.meta) ||
    typeof value.meta.has_more !== "boolean"
  ) {
    throw new Error("Invalid match response");
  }
  const ids = new Set<number>();
  const matches = value.data.map((row: unknown): Match => {
    if (
      !object(row) ||
      !Number.isSafeInteger(row.id) ||
      typeof row.tournament !== "string" ||
      (row.event_status != null && typeof row.event_status !== "string") ||
      !object(row.players) ||
      !object(row.players.p1) ||
      !object(row.players.p2) ||
      typeof row.players.p1.name !== "string" ||
      typeof row.players.p2.name !== "string" ||
      ids.has(row.id as number)
    ) {
      throw new Error("Invalid match response");
    }
    ids.add(row.id as number);
    return {
      id: row.id as number,
      tournament: row.tournament,
      event_status:
        typeof row.event_status === "string" ? row.event_status : null,
      players: {
        p1: { name: row.players.p1.name },
        p2: { name: row.players.p2.name },
      },
      score: parseScore(row.score),
    };
  });
  return { matches, hasMore: value.meta.has_more };
}

export function setScores(score: Score | null): string {
  if (!score?.games?.length) return "Score unavailable";
  // games is player-major: [[6, 3], [4, 4]] means 6–4, 3–4.
  const count = Math.max(
    score.games[0]?.length ?? 0,
    score.games[1]?.length ?? 0,
  );
  return (
    Array.from(
      { length: count },
      (_, i) =>
        `${score.games?.[0]?.[i] ?? "—"}–${score.games?.[1]?.[i] ?? "—"}`,
    ).join(", ") || "Score unavailable"
  );
}

export function pointScore(score: Score | null): string {
  if (!score || score.points.every((point) => point === null))
    return "Unavailable";
  return `${score.points[0] ?? "—"}–${score.points[1] ?? "—"}${score.is_tiebreak ? " (tiebreak)" : ""}`;
}
