import { useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Application,
  Icon,
  List,
  getApplications,
  getFrontmostApplication,
  popToRoot,
} from "@vicinae/api";
import { listRunningProcesses } from "./lib/processes";
import { caffeinateAndNotify, fail } from "./lib/feedback";
import { usePromise } from "./lib/use-promise";

async function caffeinateWhile(pid: number, name: string) {
  await caffeinateAndNotify(
    { mode: "while", waitPid: pid, waitName: name, reason: `While ${name} is open` },
    `Caffeinated while ${name} is open`,
  );
  await popToRoot();
}

export default function Command() {
  const [query, setQuery] = useState("");
  const processes = usePromise(listRunningProcesses);
  const apps = usePromise(getApplications);
  const frontmost = usePromise(getFrontmostApplication);

  useEffect(() => {
    if (apps.error) void fail(apps.error);
  }, [apps.error]);

  const appByName = useMemo(() => {
    const map = new Map<string, Application>();
    for (const app of apps.value ?? []) {
      map.set(app.name.toLowerCase(), app);
    }
    return map;
  }, [apps.value]);

  const items = useMemo(() => {
    const running = processes.value ?? [];
    const needle = query.trim().toLowerCase();
    return running.filter((process) => {
      if (!needle) return true;
      return process.name.toLowerCase().includes(needle) || String(process.pid).includes(needle);
    });
  }, [processes.value, query]);

  const frontmostMatch =
    !frontmost.error && frontmost.value
      ? items.find((process) => namesMatch(process.name, frontmost.value?.name ?? ""))
      : undefined;

  const searching = Boolean(query.trim());
  const emptyTitle = processes.error
    ? "Unable to list apps"
    : searching
      ? "No matching apps"
      : "No apps found";
  const emptyDescription = processes.error
    ? processes.error.message
    : searching
      ? "Try a different search."
      : "Open an app, then run Caffeinate While again.";

  return (
    <List
      isLoading={processes.loading}
      searchBarPlaceholder="Search running apps"
      filtering={false}
      onSearchTextChange={setQuery}
    >
      {items.length === 0 && !processes.loading ? (
        <List.EmptyView title={emptyTitle} description={emptyDescription} icon={Icon.AppWindowList} />
      ) : null}
      {frontmostMatch ? (
        <List.Section title="Frontmost">
          <ProcessItem process={frontmostMatch} app={matchApp(frontmostMatch.name, appByName)} />
        </List.Section>
      ) : null}
      {items.length > 0 ? (
      <List.Section title="Running" subtitle={`${items.length}`}>
        {items
          .filter((process) => process.pid !== frontmostMatch?.pid)
          .map((process) => (
            <ProcessItem
              key={`${process.name}-${process.pid}`}
              process={process}
              app={matchApp(process.name, appByName)}
            />
          ))}
      </List.Section>
      ) : null}
    </List>
  );
}

function ProcessItem({
  process,
  app,
}: {
  process: { pid: number; name: string };
  app?: Application;
}) {
  return (
    <List.Item
      title={app?.name ?? process.name}
      subtitle={app && app.name !== process.name ? process.name : undefined}
      icon={app?.icon ?? Icon.AppWindowList}
      accessories={[{ text: String(process.pid) }]}
      actions={
        <ActionPanel>
          <Action
            title="Caffeinate"
            icon={Icon.Clock}
            onAction={() => caffeinateWhile(process.pid, app?.name ?? process.name)}
          />
        </ActionPanel>
      }
    />
  );
}

function matchApp(name: string, apps: Map<string, Application>): Application | undefined {
  const direct = apps.get(name.toLowerCase());
  if (direct) return direct;
  for (const [key, app] of apps) {
    if (key.includes(name.toLowerCase()) || name.toLowerCase().includes(key)) return app;
  }
  return undefined;
}

function namesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}
