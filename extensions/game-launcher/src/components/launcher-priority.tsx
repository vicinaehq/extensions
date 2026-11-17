import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useState } from "react";
import { type GameSource, LAUNCHER_NAMES, LAUNCHER_PRECEDENCE } from "../lib/games";
import { isDefaultPriority, moveLauncher } from "../lib/launcher-priority";

/**
 * Reorderable launcher priority (pushed from the "Launcher Priority…" action).
 * Vicinae's settings page has no reorderable list, so this lives in its own view.
 */
export function LauncherPriority(props: {
  initial: readonly GameSource[];
  enabled: readonly GameSource[];
  duplicatesMerged: boolean;
  onChange: (order: GameSource[]) => void;
}) {
  const [order, setOrder] = useState<GameSource[]>([...props.initial]);
  const update = (next: GameSource[]) => {
    setOrder(next);
    props.onChange(next);
  };

  return (
    <List navigationTitle="Launcher Priority" searchBarPlaceholder="Launchers">
      <List.Section
        title={
          props.duplicatesMerged
            ? "A game installed in several launchers opens with the first one; the others are alternate actions"
            : "Order of launchers in filters (duplicates are shown separately; see Settings)"
        }
      >
        {order.map((launcher, i) => (
          <List.Item
            key={launcher}
            id={launcher}
            title={`${i + 1}. ${LAUNCHER_NAMES[launcher]}`}
            subtitle={props.enabled.includes(launcher) ? undefined : "Turned off in Settings"}
            icon={Icon.AppWindow}
            actions={
              <ActionPanel>
                {i > 0 && (
                  <Action
                    title="Move Up"
                    icon={Icon.ArrowUp}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "arrowUp" }}
                    onAction={() => update(moveLauncher(order, launcher, -1))}
                  />
                )}
                {i < order.length - 1 && (
                  <Action
                    title="Move Down"
                    icon={Icon.ArrowDown}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "arrowDown" }}
                    onAction={() => update(moveLauncher(order, launcher, 1))}
                  />
                )}
                {!isDefaultPriority(order) && (
                  <Action
                    title="Reset to Default Order"
                    icon={Icon.ArrowClockwise}
                    onAction={() => update([...LAUNCHER_PRECEDENCE])}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
