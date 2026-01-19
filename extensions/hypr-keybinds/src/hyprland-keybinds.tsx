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
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { getHyprlandKeybinds, HyprBind } from "./utils/hyprland";

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [keybinds, setKeybinds] = useState<HyprBind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isShowingDetail, setIsShowingDetail] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const binds = await getHyprlandKeybinds();
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
  }, []);

  if (error) {
    return (
      <Detail
        markdown={`Failed to load keybinds from hyprctl\n\nError: ${error}\n\nMake sure Hyprland is running and hyprctl is available.`}
      />
    );
  }
  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search key, dispatcher, modifiers, description..."
    >
      <List.Section title="Hyprland Keybinds" subtitle={`${keybinds.length}`}>
        {keybinds.map((kb, idx) => {
          const title = kb.modifiers
            ? `${kb.modifiers} + ${kb.key}`
            : `${kb.key}`;
          const accessories = [];
          if (kb.description)
            accessories.push({
              tag: { value: kb.description, color: Color.Blue },
            });
          if (kb.submap)
            accessories.push({
              tag: { value: `submap: ${kb.submap}`, color: Color.Orange },
            });

          return (
            <List.Item
              key={`${kb.key}-${kb.dispatcher}-${idx}`}
              title={title}
              accessories={accessories}
              keywords={[title, kb.description, kb.arg]}
              icon={Icon.Keyboard}
              actions={
                <ActionPanel>
                  <Action
                    title={isShowingDetail ? "Hide Details" : "Show Details"}
                    onAction={() => setIsShowingDetail((v) => !v)}
                    shortcut={{ modifiers: ["ctrl"], key: "d" }}
                  />
                </ActionPanel>
              }
              detail={
                <List.Item.Detail
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label
                        title="Modifier(s)"
                        text={kb.modifiers || "-"}
                      />
                      <List.Item.Detail.Metadata.Label
                        title="Key"
                        text={kb.key || "-"}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.TagList title="Dispatcher">
                        <List.Item.Detail.Metadata.TagList.Item
                          text={kb.dispatcher || "-"}
                        />
                      </List.Item.Detail.Metadata.TagList>
                      <List.Item.Detail.Metadata.Label
                        title="Argument"
                        text={kb.arg || "-"}
                      />
                      <List.Item.Detail.Metadata.Separator />
                      {kb.description ? (
                        <List.Item.Detail.Metadata.Label
                          title="Description"
                          text={kb.description}
                        />
                      ) : null}
                      {kb.submap ? (
                        <List.Item.Detail.Metadata.Label
                          title="Submap"
                          text={kb.submap}
                        />
                      ) : null}
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.TagList title="Flags">
                        {kb.locked && (
                          <List.Item.Detail.Metadata.TagList.Item
                            text="locked"
                            color={Color.Green}
                          />
                        )}
                        {kb.mouse && (
                          <List.Item.Detail.Metadata.TagList.Item
                            text="mouse"
                            color={Color.Purple}
                          />
                        )}
                        {kb.release && (
                          <List.Item.Detail.Metadata.TagList.Item
                            text="release"
                            color={Color.Yellow}
                          />
                        )}
                        {kb.repeat && (
                          <List.Item.Detail.Metadata.TagList.Item
                            text="repeat"
                            color={Color.Blue}
                          />
                        )}
                        {kb.longPress && (
                          <List.Item.Detail.Metadata.TagList.Item
                            text="longPress"
                            color={Color.Orange}
                          />
                        )}
                        {kb.nonConsuming && (
                          <List.Item.Detail.Metadata.TagList.Item
                            text="nonConsuming"
                            color={Color.Magenta}
                          />
                        )}
                      </List.Item.Detail.Metadata.TagList>
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
