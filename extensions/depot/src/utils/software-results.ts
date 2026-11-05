import type { SoftwarePackage } from "../types";

const RESULT_LIMIT = 60;

export function rankSoftwareResults(
  query: string,
  ...groups: readonly SoftwarePackage[][]
): SoftwarePackage[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return groups.flat().slice(0, RESULT_LIMIT);

  return groups
    .flat()
    .map((pkg, originalIndex) => ({
      pkg,
      originalIndex,
      score: scoreSoftwarePackage(pkg, normalizedQuery),
    }))
    .sort((left, right) =>
      left.score - right.score ||
      sourceOrder(left.pkg) - sourceOrder(right.pkg) ||
      left.pkg.name.localeCompare(right.pkg.name) ||
      left.pkg.id.localeCompare(right.pkg.id) ||
      left.originalIndex - right.originalIndex
    )
    .slice(0, RESULT_LIMIT)
    .map(({ pkg }) => pkg);
}

export function sortSoftwareAlphabetically<T extends SoftwarePackage>(
  packages: readonly T[],
): T[] {
  return [...packages].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || left.id.localeCompare(right.id, undefined, {
      sensitivity: "base",
      numeric: true,
    })
  );
}

function scoreSoftwarePackage(pkg: SoftwarePackage, query: string): number {
  const name = normalize(pkg.name);
  const id = normalize(pkg.id);
  const description = normalize(pkg.description);
  const queryTokens = words(query);
  const nameTokens = words(name);
  const idTokens = words(id);
  const idSegments = pkg.id
    .toLocaleLowerCase()
    .split(/[.:/+_-]+/)
    .map(normalize)
    .filter(Boolean);
  const compactQuery = query.replace(/\s+/g, "");

  if (name === query || id === query) {
    return 0;
  }

  let score: number;
  if (name.startsWith(`${query} `)) {
    score = 5;
  } else if (idSegments.some((segment) =>
    segment === query || segment.replace(/\s+/g, "") === compactQuery
  )) {
    score = 8;
  } else if (name.includes(` ${query}`)) {
    score = 12;
  } else if (id.startsWith(`${query} `)) {
    score = 14;
  } else if (queryTokens.every((token) =>
    nameTokens.some((word) => word === token || word.startsWith(token))
  )) {
    score = 16;
  } else if (queryTokens.every((token) =>
    idTokens.some((word) => word === token || word.startsWith(token))
  )) {
    score = 20;
  } else if (description === query) {
    score = 30;
  } else if (description.startsWith(`${query} `)) {
    score = 32;
  } else if (description.includes(query)) {
    score = 36;
  } else if (queryTokens.every((token) => description.includes(token))) {
    score = 42;
  } else {
    score = 60;
  }

  return score + noisePenalty(pkg, queryTokens);
}

function noisePenalty(pkg: SoftwarePackage, queryTokens: readonly string[]): number {
  const rawId = pkg.id.toLocaleLowerCase();
  const idTokens = words(normalize(rawId));
  const nameAndDescription = normalize(`${pkg.name} ${pkg.description}`);
  let penalty = 0;

  const variants: ReadonlyArray<[string, number]> = [
    ["dev", 35],
    ["devel", 35],
    ["doc", 30],
    ["docs", 30],
    ["dbg", 35],
    ["debug", 35],
    ["data", 22],
    ["common", 18],
    ["l10n", 30],
    ["langpack", 30],
    ["locale", 25],
    ["plugin", 30],
    ["plugins", 30],
    ["addon", 24],
  ];

  for (const [variant, value] of variants) {
    if (idTokens.includes(variant) && !queryTokens.includes(variant)) {
      penalty += value;
      break;
    }
  }

  if (!queryTokens.some((token) => token === "lib" || token === "library")) {
    if (/^lib(?!reoffice)/.test(rawId)) penalty += 28;
    if (/^(python\d*|node|golang|gir\d*(?:\.\d+)*)[-.]/.test(rawId)) {
      penalty += 32;
    }
  }

  if (!queryTokens.includes("plugin") && (
    /\.plugin[.-]/i.test(pkg.id) || /\bplugins?\b/.test(nameAndDescription)
  )) {
    penalty += 24;
  }
  if (!queryTokens.includes("library") && /\b(?:library|bindings)\b/.test(nameAndDescription)) {
    penalty += 14;
  }
  if (!queryTokens.includes("command") && /\bcommand[ -]line\b/.test(nameAndDescription)) {
    penalty += 18;
  }

  return penalty;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function words(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function sourceOrder(pkg: SoftwarePackage): number {
  return pkg.source === "apt" ? 0 : 1;
}
