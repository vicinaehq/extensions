import React from "react";
import {
  List,
  Detail,
  showToast,
  ActionPanel,
  Action,
  Toast,
  Icon,
  Color,
  getPreferenceValues,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { getHyprlandKeybinds, HyprBind } from "./utils/hyprland";

type Preferences = {
  keybindsConfigPath: string;
};

export default function Command() {
  const { keybindsConfigPath } = getPreferenceValues<Preferences>();
  const [isLoading, setIsLoading] = useState(true);
  const [keybinds, setKeybinds] = useState<HyprBind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isShowingDetail, setIsShowingDetail] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const binds = await getHyprlandKeybinds(keybindsConfigPath);
        setKeybinds(binds);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Failed to load Hyprland keybinds");
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load keybinds",
          message: e?.message,
        });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [keybindsConfigPath]);

  if (error) {
    return (
      <Detail
        markdown={`Failed to load keybinds from ${keybindsConfigPath}\n\nError: ${error}`}
      />
    );
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search key, action, modifiers, comments..."
    >
      <List.Section title="Hyprland Keybinds" subtitle={`${keybinds.length}`}>
        {keybinds.map((kb, idx) => {
          const title = kb.modifiers
            ? `${kb.modifiers} ${kb.key}`
            : `${kb.key}`;
          const command = kb.command ? `${kb.command}` : `${kb.comment}`;
          const comment = kb.comment; //? `${kb.comment}` : `${kb.command}`;
          const accessories = [];
          if (comment)
            accessories.push({ tag: { value: comment, color: Color.Blue } });

          return (
            <List.Item
              key={`${kb.key}-${kb.action}-${idx}`}
              title={title}
              subtitle={command}
              accessories={accessories}
              icon={Icon.Keyboard}
              actions={
                <ActionPanel>
                  <Action
                    title={isShowingDetail ? "Hide Details" : "Show Details"}
                    onAction={() => setIsShowingDetail((v) => !v)}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                  />
                </ActionPanel>
              }
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Config Path"
                        text={`${kb.configPath}`}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Line Number"
                        text={`${kb.lineNumber}`}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label
                        title="Modifier(s)"
                        text={kb.modifiers || "-"}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Key"
                        text={kb.key || "-"}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.TagList title="Directive">
                        <List.Item.Detail.Metadata.TagList.Item
                          text={kb.directive || "-"}
                        />
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Label
                        title="Action"
                        text={kb.action || "-"}
                      />
                      <List.Item.Detail.Metadata.Separator />

                      <List.Item.Detail.Metadata.Label
                        title="Command"
                        text={kb.command || "-"}
                      />
                      {kb.comment ? (
                        <>
                          <List.Item.Detail.Metadata.Separator />
                          <List.Item.Detail.Metadata.Label
                            title="Comment"
                            text={kb.comment}
                          />
                        </>
                      ) : null}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
