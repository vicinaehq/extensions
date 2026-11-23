import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useCallback } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { useScratchpads } from "./lib/config-hooks";
import { performAction } from "./lib/feedback";
import { compareStrings, pluralize } from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Scratchpad, Window } from "./lib/types";

function padArgs(name: string): string[] {
  return name === "default" ? [] : [name];
}

export default function Scratchpads() {
  const windowsQuery = useUmbrielQuery<Window[]>("windows");
  const {
    scratchpads,
    error: configError,
    refresh: refreshConfig,
  } = useScratchpads();

  const windows = windowsQuery.data ?? [];
  const unavailable = Boolean(windowsQuery.error && !windowsQuery.data);

  const refresh = useCallback(async () => {
    await Promise.all([windowsQuery.refresh(), refreshConfig()]);
  }, [windowsQuery.refresh, refreshConfig]);

  const values = new Map<string, Scratchpad>();
  for (const scratchpad of scratchpads) values.set(scratchpad.name, scratchpad);
  for (const window of windows) {
    if (window.scratchpad && !values.has(window.scratchpad)) {
      values.set(window.scratchpad, { name: window.scratchpad });
    }
  }
  const names = [...values.values()].sort((a, b) =>
    compareStrings(a.name, b.name),
  );

  const perform = (action: string, name: string, title: string) =>
    performAction(action, padArgs(name), { success: title, refresh });

  return (
    <UmbrielList
      isLoading={windowsQuery.loading}
      isEmpty={unavailable || names.length === 0}
      error={unavailable ? windowsQuery.error : configError}
      emptyTitle="No Scratchpads Found"
      emptyDescription="No scratchpads are configured and no scratchpad windows exist."
      emptyIcon={Icon.FloatingWindow}
      searchBarPlaceholder="Search scratchpads and their windows…"
      onRefresh={refresh}
    >
      {names.map((scratchpad) => {
        const members = windows.filter(
          (window) => window.scratchpad === scratchpad.name,
        );
        const visible = members.some((member) => member.visible);

        return (
          <List.Item
            key={scratchpad.name}
            title={scratchpad.name}
            icon={Icon.FloatingWindow}
            active={visible}
            accessories={[
              {
                tag: {
                  value: pluralize(members.length, "window"),
                },
              },
            ]}
            keywords={[
              scratchpad.name,
              ...members.flatMap((member) => [member.title, member.app_id]),
            ].filter(Boolean)}
            actions={
              <ActionPanel>
                <Action
                  title="Toggle Scratchpad"
                  icon={Icon.FloatingWindow}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() =>
                    perform(
                      "scratchpad-toggle",
                      scratchpad.name,
                      `Toggled scratchpad ${scratchpad.name}`,
                    )
                  }
                />
                <RefreshAction onRefresh={refresh} />
              </ActionPanel>
            }
          />
        );
      })}
    </UmbrielList>
  );
}
