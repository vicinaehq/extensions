import {
  List,
  ActionPanel,
  Action,
  useNavigation,
  closeMainWindow,
  Detail,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { capitalize } from "./utils/capitalize";

import { MENU_ITEMS, MenuItem } from "./config/menu";
import { noOmarchyEnv } from "~/config/error";
import { useExec } from "@raycast/utils";

const findMenuItems = (
  items: MenuItem[],
  targetId: string,
): MenuItem[] | undefined => {
  for (const item of items) {
    if (item.id === targetId) {
      return item.items;
    }
    if (item.items && item.items.length > 0) {
      const found = findMenuItems(item.items, targetId);
      if (found) return found;
    }
  }
  return undefined;
};

const Command = () => {
  const { isLoading, error } = useExec(
    "/bin/sh",
    ["-c", "command -v omarchy-menu"],
    {
      execute: true,
    },
  );
  const { push } = useNavigation();

  if (isLoading) return <List isLoading={true} />;
  if (error) return <Detail markdown={noOmarchyEnv} />;

  return (
    <List navigationTitle="Omarchy Menu" searchBarPlaceholder="Go...">
      {MENU_ITEMS.map((item) => (
        <List.Item
          key={item.id}
          title={item.name}
          icon={item.icon}
          actions={
            <ActionPanel title="Omarchy">
              {item.command ? (
                <Action
                  title="Open"
                  onAction={async () => {
                    await closeMainWindow();
                    await delay(80);
                    spawn(item.command ?? "", {
                      shell: true,
                      detached: true,
                      stdio: "ignore",
                    }).unref();
                  }}
                />
              ) : (
                <Action
                  title="Open"
                  onAction={() => push(<DynamicList menu={item.id} />)}
                />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
};

export default Command;

const DynamicList = ({ menu }: { menu: string }) => {
  const { push } = useNavigation();
  const ITEMS = findMenuItems(MENU_ITEMS, menu);
  const hasPreview = ITEMS?.some((i) => i.preview);

  return (
    <List
      navigationTitle={menu}
      searchBarPlaceholder={`${capitalize(menu)}...`}
      isShowingDetail={hasPreview}
    >
      {ITEMS?.map((item) => {
        if (item.command)
          return (
            <List.Item
              key={item.name}
              title={item.name}
              accessories={[{ tag: item.icon }]}
              detail={item.preview}
              actions={
                <ActionPanel title="Omarchy">
                  <Action
                    title="Open"
                    onAction={async () => {
                      await closeMainWindow();
                      await delay(80);
                      spawn(item.command ?? "", {
                        shell: true,
                        detached: true,
                        stdio: "ignore",
                      }).unref();
                    }}
                  />
                </ActionPanel>
              }
            />
          );

        return (
          <List.Item
            key={item.name}
            title={item.name}
            accessories={[{ tag: item.icon }]}
            actions={
              <ActionPanel title="Omarchy">
                <Action
                  title="Open"
                  onAction={() => push(<DynamicList menu={item.id} />)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
};
