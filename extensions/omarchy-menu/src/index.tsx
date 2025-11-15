import {
  List,
  ActionPanel,
  Action,
  useNavigation,
  closeMainWindow,
} from "@vicinae/api";
import { exec } from "node:child_process";
import { capitalize } from "~/utils/capitalize";

import { MENU_ITEMS, MenuItem } from "./config/menu";

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
  const { push } = useNavigation();

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
                  onAction={() => {
                    exec(item.command ?? "");
                    closeMainWindow();
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

  return (
    <List
      navigationTitle={menu}
      searchBarPlaceholder={`${capitalize(menu)}...`}
    >
      {ITEMS?.map((item) => {
        if (item.command)
          return (
            <List.Item
              key={item.name}
              title={item.name}
              accessories={[{ tag: item.icon }]}
              actions={
                <ActionPanel title="Omarchy">
                  <Action
                    title="Open"
                    onAction={() => {
                      exec(item.command ?? "");
                      closeMainWindow();
                    }}
                  />
                </ActionPanel>
              }
            />
          );

        return (
          <List.Item
            key={item.name}
            title={capitalize(item.name)}
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
