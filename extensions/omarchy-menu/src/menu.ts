import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type MenuItem = {
  id: string;
  parent: string;
  icon: string;
  iconFont: string;
  label: string;
  aliases: string[];
  title: string;
  description: string;
  action: string;
  target: string;
  provider: string;
  when: string;
  checked: string;
  isChecked: boolean;
  // Render policy for generated provider rows: running the action changes
  // state this list displays, so the window stays open and the provider
  // list revalidates afterwards. Parsed menu entries never set this.
  revalidatesOnRun: boolean;
};

// Field types are `unknown` on purpose: user menu files are untrusted JSONC
// and every value is coerced individually so a malformed entry cannot crash
// icon rendering or action handling downstream.
type RawMenuItem = Partial<{
  parent: unknown;
  icon: unknown;
  iconFont: unknown;
  label: unknown;
  aliases: unknown;
  title: unknown;
  description: unknown;
  action: unknown;
  target: unknown;
  provider: unknown;
  when: unknown;
  checked: unknown;
}>;

type RawMenu = Record<string, RawMenuItem>;

export type MenuModel = {
  items: Map<string, MenuItem>;
  order: string[];
  // Operational problem that did not prevent loading (e.g. the packaged
  // menu failed to parse or guard evaluation failed); surfaced as a
  // warning so fallback state is never silent.
  warning?: string;
};

const omarchyPath = process.env.OMARCHY_PATH || "/usr/share/omarchy";
const menuModelPath = join(omarchyPath, "shell/plugins/menu/MenuModel.js");
export const defaultMenuPath = join(
  omarchyPath,
  "default/omarchy/omarchy-menu.jsonc",
);
export const userMenuPath = join(
  homedir(),
  ".config/omarchy/extensions/omarchy-menu.jsonc",
);

// The guard batcher and route resolver shipped with the installed Omarchy
// release. Optional: every caller falls back to local equivalents.
type NativeMenuModel = {
  guardScript?: (items: Record<string, MenuItem>) => string;
  resolveRoute?: (
    items: Record<string, unknown>,
    itemOrder: string[],
    input: string,
  ) => string;
};

let nativeMenuModel: NativeMenuModel | undefined | null = null;

function loadNativeMenuModel(): NativeMenuModel | undefined {
  if (nativeMenuModel !== null) return nativeMenuModel;
  try {
    nativeMenuModel = createRequire(defaultMenuPath)(
      menuModelPath,
    ) as NativeMenuModel;
  } catch {
    nativeMenuModel = undefined;
  }
  return nativeMenuModel;
}

function parseMenu(source: string, path: string): RawMenu {
  let parsed: unknown;
  try {
    // This intentionally matches Omarchy's own MenuModel JSONC handling.
    const json = source
      .replace(/^\s*\/\/[^\n]*(\n|$)/gm, "")
      .replace(/,(\s*[}\]])/g, "$1");
    if (!json.trim()) return {};
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid Omarchy menu at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid Omarchy menu at ${path}: expected an object`);
  }

  const wrapper = parsed as { items?: unknown };
  const menu =
    wrapper.items &&
    typeof wrapper.items === "object" &&
    !Array.isArray(wrapper.items)
      ? wrapper.items
      : parsed;

  return Object.fromEntries(
    Object.entries(menu as Record<string, unknown>).filter(
      ([, value]) =>
        value !== null && typeof value === "object" && !Array.isArray(value),
    ),
  ) as RawMenu;
}

async function readOptionalMenu(path: string): Promise<RawMenu> {
  try {
    return parseMenu(await readFile(path, "utf8"), path);
  } catch {
    // Omarchy treats a missing or malformed optional user menu as empty.
    return {};
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Authoritative defaults for every parsed or generated menu row. Keeping
// this in one place means a new MenuItem field has exactly one home.
export function baseMenuItem(id: string, parent: string): MenuItem {
  return {
    id,
    parent,
    icon: "",
    iconFont: "",
    label: "",
    aliases: [],
    title: "",
    description: "",
    action: "",
    target: "",
    provider: "",
    when: "",
    checked: "",
    isChecked: false,
    revalidatesOnRun: false,
  };
}

function asAliases(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
  }
  return typeof value === "string" && value ? [value] : [];
}

function normalizeItem(id: string, raw: RawMenuItem): MenuItem {
  return {
    ...baseMenuItem(
      id,
      id === "root"
        ? ""
        : raw.parent === undefined
          ? id.includes(".")
            ? id.split(".").slice(0, -1).join(".")
            : "root"
          : asText(raw.parent),
    ),
    icon: asText(raw.icon),
    iconFont: asText(raw.iconFont),
    label: asText(raw.label) || id,
    aliases: asAliases(raw.aliases),
    title: asText(raw.title),
    description: asText(raw.description),
    action: asText(raw.action),
    target: asText(raw.target),
    provider: asText(raw.provider),
    when: asText(raw.when),
    checked: asText(raw.checked),
  };
}

type GuardKind = "when" | "checked";

// Native guard-script output tags each result line with these suffixes.
const guardTags: Record<GuardKind, string> = { when: "w", checked: "c" };

async function evaluateGuards(items: MenuItem[]): Promise<string | undefined> {
  const guards = items.flatMap((item) => [
    ...(item.when
      ? [{ item, kind: "when" as const, expression: item.when }]
      : []),
    ...(item.checked
      ? [{ item, kind: "checked" as const, expression: item.checked }]
      : []),
  ]);

  if (guards.length === 0) return undefined;

  let usesNativeOutput = false;
  let script = guards
    .map(
      ({ expression }, index) =>
        `if { ${expression}; } >/dev/null 2>&1; then printf '${index}:1\\n'; else printf '${index}:0\\n'; fi`,
    )
    .join("\n");

  // Use the guard batcher shipped with this exact Omarchy release when it is
  // available. It caches package/default lookups and keeps this view's state
  // checks in lockstep with the native menu. The simple script below remains
  // a compatibility fallback if Omarchy changes that internal helper.
  const nativeScript = loadNativeMenuModel()?.guardScript?.(
    Object.fromEntries(items.map((item) => [item.id, item])),
  );
  if (nativeScript) {
    script = nativeScript;
    usesNativeOutput = true;
  }

  let stdout: string;
  try {
    const result = await execFileAsync("/bin/bash", ["-lc", script], {
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    stdout = result.stdout;
  } catch (error) {
    // Match the native menu, which hides a `when` item only on an explicit
    // false: a guard batch that fails or times out must keep the menu
    // usable rather than dropping every guarded row. The caller surfaces
    // this message as a warning so the fallback state is never silent.
    const timedOut = (error as { signal?: string }).signal === "SIGTERM";
    return `Menu state checks ${timedOut ? "timed out" : "failed"}; showing entries without them`;
  }
  const guardIndexes = new Map(
    guards.map(({ item, kind }, index) => [
      `${item.id}:${guardTags[kind]}`,
      index,
    ]),
  );
  const results = new Map<number, boolean>();
  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    if (usesNativeOutput) {
      const match = line.match(/^(.*):(w|c):([01])$/);
      if (!match) continue;
      const index = guardIndexes.get(`${match[1]}:${match[2]}`);
      if (index !== undefined) results.set(index, match[3] === "1");
    } else {
      const [index, value] = line.split(":");
      results.set(Number(index), value === "1");
    }
  }

  guards.forEach(({ item, kind }, index) => {
    const result = results.get(index);
    if (kind === "when" && result === false) item.parent = "";
    if (kind === "checked" && result === true) item.isChecked = true;
  });

  return undefined;
}

export async function loadMenu(): Promise<MenuModel> {
  // A missing packaged menu means Omarchy itself is not installed (the
  // error view explains that). A readable but malformed one keeps the
  // native synthetic-root fallback and carries a warning instead of
  // silently presenting an empty menu.
  await access(defaultMenuPath, constants.R_OK);
  const source = await readFile(defaultMenuPath, "utf8");
  let defaults: RawMenu;
  const warnings: string[] = [];
  try {
    defaults = parseMenu(source, defaultMenuPath);
  } catch {
    defaults = {};
    warnings.push(
      "The packaged Omarchy menu is malformed; only custom entries are shown",
    );
  }
  const overrides = await readOptionalMenu(userMenuPath);
  const order = Object.keys(defaults);
  const normalizedById = new Map(
    Object.entries(defaults).map(([id, item]) => [id, normalizeItem(id, item)]),
  );

  // Match Omarchy: normalize each source first, then merge complete entries.
  for (const [id, override] of Object.entries(overrides)) {
    if (!normalizedById.has(id)) order.push(id);
    normalizedById.set(id, {
      ...(normalizedById.get(id) ?? normalizeItem(id, {})),
      ...normalizeItem(id, override),
    });
  }

  // Match mergeMenuSources: never leave the model without a root entry.
  if (!normalizedById.has("root")) {
    normalizedById.set("root", normalizeItem("root", { label: "Go" }));
    order.unshift("root");
  }

  const normalized = order.map((id) => normalizedById.get(id)!);
  const guardWarning = await evaluateGuards(normalized);
  if (guardWarning) warnings.push(guardWarning);

  return {
    items: new Map(normalized.map((item) => [item.id, item])),
    order,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

export function childrenOf(model: MenuModel, parent: string): MenuItem[] {
  return model.order
    .map((id) => model.items.get(id))
    .filter((item): item is MenuItem => item?.parent === parent)
    .filter((item) => isVisible(model, item));
}

// Cycle guard for visibility recursion; matches the depth cap Omarchy's
// MenuModel.js uses for the same walks.
const MAX_MENU_DEPTH = 32;

function isVisible(model: MenuModel, item: MenuItem, depth = 0): boolean {
  if (depth >= MAX_MENU_DEPTH) return false;
  if (item.action) return true;
  if (item.provider) return true;

  const target = item.target || item.id;
  return model.order.some((id) => {
    const child = model.items.get(id);
    return child?.parent === target && isVisible(model, child, depth + 1);
  });
}

// Labels from the item up to (but excluding) root, joined like the native
// menu's pathFor, e.g. "Setup › Network › DNS".
export function pathFor(model: MenuModel, id: string): string {
  const labels: string[] = [];
  let current = model.items.get(id);
  let guard = 0;
  while (current && current.id !== "root" && guard < MAX_MENU_DEPTH) {
    labels.unshift(current.label);
    current = current.parent ? model.items.get(current.parent) : undefined;
    guard += 1;
  }
  return labels.join(" › ");
}

// Every visible non-root item with its path, for the root command's global
// search over menu descendants (parity with the native launcher).
export function flattenVisible(model: MenuModel): MenuItem[] {
  return model.order
    .filter((id) => id !== "root")
    .map((id) => model.items.get(id))
    .filter((item): item is MenuItem => !!item?.parent)
    .filter((item) => isVisible(model, item));
}

// Routes may name a real id or an alias declared in JSONC; an exact id beats
// any alias. Mirrors MenuModel.resolveRoute, including its literal fallthrough
// for unknown input.
export function resolveRoute(model: MenuModel, input: string): string {
  const nativeResolve = loadNativeMenuModel()?.resolveRoute;
  if (nativeResolve) {
    return nativeResolve(Object.fromEntries(model.items), model.order, input);
  }

  const raw = input.toLowerCase().replace(/_/g, "-");
  if (!raw || raw === "go" || raw === "menu") return "root";
  if (model.items.has(raw)) return raw;
  for (const id of model.order) {
    const entry = model.items.get(id);
    if (!entry) continue;
    for (const alias of entry.aliases) {
      if (alias.toLowerCase().replace(/_/g, "-") === raw) return id;
    }
  }
  return raw;
}

export function shellQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}
