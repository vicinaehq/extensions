export type Claims = Record<string, unknown>;

export type DecodedJwt =
  | { ok: true; token: string; header: Claims; payload: Claims; signature: string }
  | { ok: false; error: string };

/** Strips the `Bearer ` prefix and surrounding whitespace a copied token usually carries. */
const normalize = (raw: string) => raw.trim().replace(/^bearer\s+/i, "").trim();

function parseSegment(segment: string, name: string): Claims {
  let json: string;
  try {
    json = Buffer.from(segment, "base64url").toString("utf8");
  } catch {
    throw new Error(`The ${name} is not valid base64url.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(`The ${name} does not contain JSON.`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`The ${name} is not a JSON object.`);
  }
  return value as Claims;
}

export function decodeJwt(raw: string): DecodedJwt {
  const token = normalize(raw ?? "");
  if (!token) return { ok: false, error: "No token to decode." };

  const parts = token.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `A JWT has three dot-separated segments, this one has ${parts.length}.`,
    };
  }

  const [header, payload, signature] = parts as [string, string, string];
  try {
    return {
      ok: true,
      token,
      header: parseSegment(header, "header"),
      payload: parseSegment(payload, "payload"),
      signature,
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Purely about the token's lifetime. Nothing here may read as a verdict on the signature. */
export type Status = { label: string; tone: "valid" | "expired" | "pending" | "unknown" };

const asEpoch = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function tokenStatus(payload: Claims, nowSeconds = Date.now() / 1000): Status {
  const exp = asEpoch(payload.exp);
  const nbf = asEpoch(payload.nbf);
  if (exp !== undefined && exp <= nowSeconds) return { label: "Expired", tone: "expired" };
  if (nbf !== undefined && nbf > nowSeconds) return { label: "Not yet active", tone: "pending" };
  if (exp !== undefined) return { label: "Active", tone: "valid" };
  return { label: "No expiry", tone: "unknown" };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

function relativeTime(epoch: number, nowSeconds: number): string {
  const delta = epoch - nowSeconds;
  const [unit, seconds] = UNITS.find(([, s]) => Math.abs(delta) >= s) ?? UNITS[UNITS.length - 1]!;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round(delta / seconds),
    unit,
  );
}

/** `exp`, `iat` and `nbf` are epoch seconds; show them as a date plus a relative hint. */
export function formatClaimTime(value: unknown, nowSeconds = Date.now() / 1000): string {
  const epoch = asEpoch(value);
  if (epoch === undefined) return String(value);

  const absolute = new Date(epoch * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${absolute} · ${relativeTime(epoch, nowSeconds)}`;
}

/**
 * The same, sized for an inline comment: the year is dropped for timestamps in the
 * current year, because the code block clips rather than wraps.
 */
export function formatClaimTimeCompact(value: unknown, nowSeconds = Date.now() / 1000): string {
  const epoch = asEpoch(value);
  if (epoch === undefined) return String(value);

  const date = new Date(epoch * 1000);
  const sameYear = date.getFullYear() === new Date(nowSeconds * 1000).getFullYear();
  const absolute = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
  return `${absolute} · ${relativeTime(epoch, nowSeconds)}`;
}
