import type {
  PreferredSource,
  SoftwareItem,
  SoftwareUpdate,
} from "../types.ts";
import { expandedSearchQueries } from "../backends/appstream-parsing.ts";
import { normalizeSearchText as normalize } from "./search-text.ts";

const RESULT_LIMIT = 60;
const PREFERRED_SOURCE_BONUS = 2;

export function softwareItemKey(pkg: SoftwareItem): string {
  return pkg.source === "flatpak"
    ? `flatpak:${pkg.flatpak?.scope ?? "unknown"}:${pkg.id}`
    : `apt:${pkg.id}`;
}

export function rankSoftwareResults(
  query: string,
  preferredSource: PreferredSource,
  ...groups: readonly SoftwareItem[][]
): SoftwareItem[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return groups.flat().slice(0, RESULT_LIMIT);

  return groups
    .flat()
    .map((pkg, originalIndex) => ({
      pkg,
      originalIndex,
      score: scoreSoftwareItem(pkg, normalizedQuery) +
        sourcePreferenceAdjustment(pkg, preferredSource),
    }))
    .sort((left, right) =>
      left.score - right.score ||
      sourceOrder(left.pkg, preferredSource) -
        sourceOrder(right.pkg, preferredSource) ||
      left.pkg.name.localeCompare(right.pkg.name) ||
      left.pkg.id.localeCompare(right.pkg.id) ||
      left.originalIndex - right.originalIndex
    )
    .slice(0, RESULT_LIMIT)
    .map(({ pkg }) => pkg);
}

export function findInstalledAlternative(
  pkg: SoftwareItem,
  candidates: readonly SoftwareItem[],
): SoftwareItem | undefined {
  return candidates.find((candidate) =>
    candidate.installed &&
    candidate.source !== pkg.source &&
    isSameApplication(pkg, candidate)
  );
}

export function sortSoftwareAlphabetically<T extends SoftwareItem>(
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

/**
 * APT update records are always architecture-qualified (`vlc:amd64`), while
 * installed applications use APT's bare form for the native architecture.
 * A bare ID therefore matches only its native or architecture-independent
 * update, never a foreign-architecture sibling.
 */
export function findSoftwareUpdate(
  pkg: SoftwareItem,
  updates: readonly SoftwareUpdate[],
  nativeArchitecture?: string,
): SoftwareUpdate | undefined {
  return updates.find((update) => {
    if (update.source !== pkg.source) return false;
    if (pkg.source === "flatpak") {
      return softwareItemKey(update) === softwareItemKey(pkg);
    }
    if (update.id === pkg.id) return true;
    if (pkg.id.includes(":")) return false;
    return update.id === `${pkg.id}:all` ||
      (nativeArchitecture !== undefined &&
        update.id === `${pkg.id}:${nativeArchitecture}`);
  });
}

export function removeSoftwareUpdates(
  updates: readonly SoftwareUpdate[],
  completed: readonly SoftwareUpdate[],
): SoftwareUpdate[] {
  const completedKeys = new Set(completed.map(softwareItemKey));
  return updates.filter((update) => !completedKeys.has(softwareItemKey(update)));
}

function scoreSoftwareItem(pkg: SoftwareItem, query: string): number {
  const queries = expandedSearchQueries(query);
  return Math.min(...queries.map((candidate, index) =>
    scoreSoftwareItemForQuery(pkg, candidate, index > 0)
  ));
}

function scoreSoftwareItemForQuery(
  pkg: SoftwareItem,
  query: string,
  isAlias: boolean,
): number {
  const name = normalize(pkg.name);
  const id = normalize(pkg.id);
  const applicationId = normalize(pkg.appstream?.componentId ?? "");
  const description = normalize(pkg.description);
  const queryTokens = words(query);
  const nameTokens = words(name);
  const idTokens = words(id);
  const idSegments = pkg.id
    .toLowerCase()
    .split(/[.:/+_-]+/)
    .map(normalize)
    .filter(Boolean);
  const compactQuery = query.replace(/\s+/g, "");

  if (!isAlias && id === query) return 0;

  let score: number;
  if (name === query || applicationId === query) {
    score = isAlias ? 2 : 1;
  } else if (name.startsWith(`${query} `)) {
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

  const applicationBonus = pkg.appstream?.isGuiApplication ? -1 : 0;
  const installedBonus = pkg.installed ? -0.25 : 0;
  return score + noisePenalty(pkg, queryTokens) + applicationBonus + installedBonus;
}

function noisePenalty(pkg: SoftwareItem, queryTokens: readonly string[]): number {
  const rawId = pkg.id.toLowerCase();
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

function words(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function sourcePreferenceAdjustment(
  pkg: SoftwareItem,
  preferredSource: PreferredSource,
): number {
  return preferredSource !== "all" && pkg.source === preferredSource
    ? -PREFERRED_SOURCE_BONUS
    : 0;
}

function sourceOrder(
  pkg: SoftwareItem,
  preferredSource: PreferredSource,
): number {
  if (preferredSource !== "all") return pkg.source === preferredSource ? 0 : 1;
  return pkg.source === "apt" ? 0 : 1;
}

function isSameApplication(left: SoftwareItem, right: SoftwareItem): boolean {
  const leftComponent = normalizeComponentId(left.appstream?.componentId);
  const rightComponent = normalizeComponentId(right.appstream?.componentId);
  if (leftComponent && rightComponent && leftComponent === rightComponent) {
    return true;
  }

  const leftName = normalize(left.name);
  return leftName.length >= 3 && leftName === normalize(right.name);
}

function normalizeComponentId(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/\.desktop$/, "");
  return normalized || undefined;
}
