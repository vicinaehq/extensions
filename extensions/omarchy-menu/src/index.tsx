import {
  Action,
  ActionPanel,
  closeMainWindow,
  Color,
  Detail,
  type ImageLike,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { usePromise } from "@raycast/utils";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  flattenVisible,
  loadMenu,
  type MenuItem,
  type MenuModel,
  pathFor,
  resolveRoute,
} from "./menu";
import { providerChildren } from "./providers";
import { noOmarchyEnv } from "./config/error";

function glyphIcon(item: MenuItem): ImageLike | undefined {
  if (!item.icon) return undefined;

  const font = escapeXml(item.iconFont || "JetBrainsMono Nerd Font");
  const glyph = escapeXml(item.icon);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="12" y="18" text-anchor="middle" font-size="18" font-family="${font}" fill="currentColor">${glyph}</text></svg>`;
  return {
    source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    tintColor: Color.PrimaryText,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type CommandResult = { ok: true } | { ok: false; message: string };

function runCommand(
  command: string,
  options: { detached: boolean },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-lc", command], {
      detached: options.detached,
      stdio: "ignore",
    });
    child.once("error", (error) =>
      resolve({ ok: false, message: error.message }),
    );
    child.once("exit", (code, signal) =>
      resolve(
        code === 0
          ? { ok: true }
          : {
              ok: false,
              message: signal
                ? `Terminated by ${signal}`
                : `Exited with code ${code}`,
            },
      ),
    );
    if (options.detached) child.unref();
  });
}

function showActionFailure(result: CommandResult) {
  if (result.ok) return;
  void showToast({
    style: Toast.Style.Failure,
    title: "Omarchy action failed",
    message: result.message,
  });
}

async function runAction(command: string) {
  await closeMainWindow();
  await delay(80);
  showActionFailure(await runCommand(command, { detached: true }));
}

// Provider-generated rows (fonts, power profiles) toggle state the menu
// itself displays, so Vicinae stays open while the setter runs and the
// provider list is revalidated afterwards to move the checked indicator.
async function runProviderAction(command: string, revalidate: () => void) {
  showActionFailure(await runCommand(command, { detached: false }));
  revalidate();
}

function ItemActions({
  item,
  model,
  revalidate,
}: {
  item: MenuItem;
  model: MenuModel;
  revalidate: () => void;
}) {
  const { push } = useNavigation();

  return (
    <ActionPanel title="Omarchy">
      {item.action ? (
        <Action
          title="Run"
          onAction={() =>
            item.revalidatesOnRun
              ? runProviderAction(item.action, revalidate)
              : runAction(item.action)
          }
        />
      ) : (
        <Action
          title="Open"
          onAction={() =>
            push(<MenuList model={model} parent={item.target || item.id} />)
          }
        />
      )}
    </ActionPanel>
  );
}

function MenuList({ model, parent }: { model: MenuModel; parent: string }) {
  const parentItem = model.items.get(parent);
  const staticItems = childrenOf(model, parent);
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const queryActive = parent === "root" && query.trim() !== "";

  // Debounce only the expensive empty-to-searching transition (flattened
  // rows + provider loading). Leaving search mode is immediate, and
  // Vicinae's built-in filtering narrows the current rows live while typing.
  useEffect(() => {
    if (!queryActive) {
      setSettledQuery("");
      return;
    }
    const timeout = setTimeout(() => setSettledQuery(query), 120);
    return () => clearTimeout(timeout);
  }, [query, queryActive]);

  // Root parity with the native launcher: an active query searches every
  // visible menu descendant, not just the top-level entries. Provider
  // submenus contribute their generated rows (fonts, power profiles) so
  // global search can reach them by name.
  const searching = queryActive && settledQuery.trim() !== "";
  const visibleItems = useMemo(() => flattenVisible(model), [model]);
  const providerTargets = useMemo(() => {
    const targets = parentItem?.provider ? [parentItem] : [];
    if (searching)
      targets.push(...visibleItems.filter((item) => item.provider));
    return targets;
  }, [parentItem, visibleItems, searching]);
  const {
    data: providerRowsById = new Map<string, MenuItem[]>(),
    isLoading,
    error,
    revalidate,
  } = usePromise(
    async (targets: MenuItem[]) => {
      const entries = await Promise.all(
        targets.map(
          async (target) =>
            [target.id, await providerChildren(target)] as [string, MenuItem[]],
        ),
      );
      return new Map(entries);
    },
    [providerTargets],
  );

  const rows: Array<{ item: MenuItem; path?: string }> = searching
    ? [
        ...visibleItems.map((item) => ({
          item,
          path: pathFor(model, item.parent),
        })),
        ...providerTargets.flatMap((provider) =>
          (providerRowsById.get(provider.id) ?? []).map((row) => ({
            item: row,
            path: pathFor(model, provider.id),
          })),
        ),
      ]
    : [
        ...staticItems.map((item) => ({ item })),
        ...(parentItem?.provider
          ? (providerRowsById.get(parentItem.id) ?? []).map((item) => ({
              item,
            }))
          : []),
      ];
  const title =
    parent === "root"
      ? "Omarchy Menu"
      : parentItem?.title || parentItem?.label || parent;

  if (error) {
    return (
      <Detail markdown={`# Could not load ${title}\n\n${error.message}`} />
    );
  }

  return (
    <List
      navigationTitle={title}
      searchBarPlaceholder={`Search ${title}...`}
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      filtering={true}
    >
      {rows.map(({ item, path }) => {
        return (
          <List.Item
            key={item.id}
            title={item.label}
            subtitle={path || item.description || undefined}
            keywords={
              path
                ? [...item.aliases, item.label, ...path.split(" › ")]
                : item.aliases
            }
            icon={glyphIcon(item)}
            accessories={item.isChecked ? [{ tag: "✓" }] : undefined}
            actions={
              <ItemActions item={item} model={model} revalidate={revalidate} />
            }
          />
        );
      })}
      {!isLoading && rows.length === 0 ? (
        <List.EmptyView title="No available menu items" />
      ) : null}
    </List>
  );
}

function LoadError({ error }: { error: Error }) {
  const markdown =
    (error as NodeJS.ErrnoException).code === "ENOENT"
      ? noOmarchyEnv
      : `# Could not load the Omarchy menu\n\n${error.message}`;
  return <Detail markdown={markdown} />;
}

// A route may resolve to an action entry (e.g. "theme" runs the theme
// switcher) or a link entry rather than a submenu; native openRoute
// executes/follows those directly instead of opening an empty submenu.
export function RoutedCommand({ route }: { route: string }) {
  const { data, isLoading, error } = usePromise(loadMenu, []);
  const action = data
    ? data.items.get(resolveRoute(data, route))?.action
    : undefined;
  // Fires once per distinct resolved action; re-renders with the same
  // action do not re-run it.
  const firedActions = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (action && !firedActions.current.has(action)) {
      firedActions.current.add(action);
      void runAction(action);
    }
  }, [action]);

  // Surface operational fallbacks (malformed packaged menu, failed state
  // checks) instead of letting the degraded menu state stay silent.
  const warning = data?.warning;
  const shownWarnings = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (warning && !shownWarnings.current.has(warning)) {
      shownWarnings.current.add(warning);
      void showToast({
        style: Toast.Style.Animated,
        title: "Omarchy menu warning",
        message: warning,
      });
    }
  }, [warning]);

  if (error) return <LoadError error={error} />;
  if (!data) return <List isLoading={isLoading} />;

  const resolved = data.items.get(resolveRoute(data, route));
  if (resolved?.action) return <List isLoading={true} />;
  const parent = resolved?.target || resolved?.id || "root";
  return <MenuList model={data} parent={parent} />;
}

export default function Command() {
  return <RoutedCommand route="root" />;
}
