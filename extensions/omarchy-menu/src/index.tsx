import {
  Action,
  ActionPanel,
  closeMainWindow,
  List,
  useNavigation,
} from "@vicinae/api";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { capitalize } from "./utils/capitalize";

import { OmarchyCheck } from "./components/OmarchyCheck";
import { menu } from "./config/menu";
import { useState } from "react";
import { MenuItem } from "./config/types";
import { flatten } from "./helpers/flatten";

const Command = () => {
  return (
    <OmarchyCheck>
      <DynamicList menu={menu} />
    </OmarchyCheck>
  );
};

export default Command;

export const ActionPanelCommand = ({ item }: { item: MenuItem }) => {
  const { push } = useNavigation();
  return (
    <ActionPanel title="Omarchy">
      {item.command ? (
        <Action
          title="Open"
          onAction={async () => {
            await closeMainWindow();
            await delay(150);
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
          onAction={() => push(<DynamicList menu={item} />)}
        />
      )}
    </ActionPanel>
  );
};

export const DynamicList = ({ menu }: { menu: MenuItem }) => {
  const hasPreview = menu.items?.some((i) => i.preview);
  const [query, setQuery] = useState("");
  if (menu.form) return <menu.form />;
  return (
    <List
      navigationTitle={`Omarchy ${menu.name}`}
      searchBarPlaceholder={`${capitalize(menu.name)}...`}
      isShowingDetail={hasPreview}
      onSearchTextChange={setQuery}
      filtering={true}
    >
      {query.trim() === ""
        ? menu.items?.map((item) => {
            return (
              <List.Item
                key={item.name}
                title={item.name}
                accessories={menu.icon ? [{ tag: item.icon }] : undefined}
                icon={item.icon}
                detail={item.preview}
                actions={<ActionPanelCommand item={item} />}
              />
            );
          })
        : flatten(menu.items ?? []).map((item) => {
            return (
              <List.Item
                key={item.path + item.id}
                accessories={
                  !menu.icon && item.path !== item.name
                    ? [{ text: item.path }, { tag: item.icon }]
                    : [{ text: item.path }]
                }
                keywords={[item.name, item.path]}
                title={item.name}
                actions={<ActionPanelCommand item={item} />}
              />
            );
          })}
    </List>
  );
};
