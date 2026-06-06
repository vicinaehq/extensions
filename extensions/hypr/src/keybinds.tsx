import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprctlBind } from './types';
import { mapHyprBinds } from './utils';

export default function Keybinds() {
  const [rawBinds, isLoading] = useHyprctlData<HyprctlBind[]>(
    'binds',
    [],
    'Failed to load keybinds'
  );
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const keybinds = mapHyprBinds(rawBinds);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search key, dispatcher, modifiers, description..."
    >
      {keybinds.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Keyboard}
          title="No Keybinds Found"
          description="No Hyprland keybinds were returned by hyprctl."
        />
      ) : (
        <List.Section title="Keybinds" subtitle={keybinds.length.toString()}>
          {keybinds.map((keybind, index) => {
            const title = keybind.modifiers
              ? `${keybind.modifiers} + ${keybind.key}`
              : keybind.key;
            const flags = [
              keybind.locked ? 'locked' : '',
              keybind.mouse ? 'mouse' : '',
              keybind.release ? 'release' : '',
              keybind.repeat ? 'repeat' : '',
              keybind.longPress ? 'longPress' : '',
              keybind.nonConsuming ? 'nonConsuming' : '',
              keybind.autoConsuming ? 'autoConsuming' : '',
              keybind.catchAll ? 'catchAll' : '',
            ].filter(Boolean);

            return (
              <List.Item
                key={`${keybind.key}-${keybind.dispatch}-${index}`}
                title={title}
                subtitle={keybind.dispatch}
                icon={Icon.Keyboard}
                keywords={[
                  title,
                  keybind.description,
                  keybind.dispatch,
                  keybind.dispatcher,
                  keybind.arg,
                  keybind.submap,
                  ...flags,
                ]}
                accessories={[
                  ...(keybind.description
                    ? [
                        {
                          tag: {
                            value: keybind.description,
                            color: Color.Blue,
                          },
                        },
                      ]
                    : []),
                  ...(keybind.submap
                    ? [
                        {
                          tag: {
                            value: `submap: ${keybind.submap}`,
                            color: Color.Orange,
                          },
                        },
                      ]
                    : []),
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title={isShowingDetail ? 'Hide Details' : 'Show Details'}
                      icon={Icon.AppWindowSidebarRight}
                      shortcut={{ modifiers: ['cmd'], key: 'd' }}
                      onAction={() => setIsShowingDetail((visible) => !visible)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Keybind"
                      content={title}
                    />
                    <Action.CopyToClipboard
                      title="Copy Dispatch"
                      content={keybind.dispatch}
                    />
                    <Action.CopyToClipboard
                      title="Copy Dispatcher"
                      content={keybind.dispatcher}
                    />
                    <Action.CopyToClipboard
                      title="Copy Argument"
                      content={keybind.arg}
                    />
                    <Action.CopyToClipboard
                      title="Copy JSON"
                      content={JSON.stringify(keybind, null, 2)}
                    />
                  </ActionPanel>
                }
                detail={
                  <List.Item.Detail
                    metadata={
                      <List.Item.Detail.Metadata>
                        <List.Item.Detail.Metadata.Label
                          title="Modifier(s)"
                          text={keybind.modifiers || '-'}
                        />
                        <List.Item.Detail.Metadata.Label
                          title="Key"
                          text={keybind.key || '-'}
                        />
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label
                          title="Dispatch"
                          text={keybind.dispatch || '-'}
                        />
                        <List.Item.Detail.Metadata.TagList title="Dispatcher">
                          <List.Item.Detail.Metadata.TagList.Item
                            text={keybind.dispatcher || '-'}
                          />
                        </List.Item.Detail.Metadata.TagList>
                        <List.Item.Detail.Metadata.Label
                          title="Argument"
                          text={keybind.arg || '-'}
                        />
                        {keybind.description ? (
                          <List.Item.Detail.Metadata.Label
                            title="Description"
                            text={keybind.description}
                          />
                        ) : null}
                        {keybind.submap ? (
                          <List.Item.Detail.Metadata.Label
                            title="Submap"
                            text={keybind.submap}
                          />
                        ) : null}
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.TagList title="Flags">
                          {keybind.locked ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="locked"
                              color={Color.Green}
                            />
                          ) : null}
                          {keybind.mouse ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="mouse"
                              color={Color.Purple}
                            />
                          ) : null}
                          {keybind.release ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="release"
                              color={Color.Yellow}
                            />
                          ) : null}
                          {keybind.repeat ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="repeat"
                              color={Color.Blue}
                            />
                          ) : null}
                          {keybind.longPress ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="longPress"
                              color={Color.Orange}
                            />
                          ) : null}
                          {keybind.nonConsuming ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="nonConsuming"
                              color={Color.Magenta}
                            />
                          ) : null}
                          {keybind.autoConsuming ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="autoConsuming"
                              color={Color.Red}
                            />
                          ) : null}
                          {keybind.catchAll ? (
                            <List.Item.Detail.Metadata.TagList.Item
                              text="catchAll"
                              color={Color.SecondaryText}
                            />
                          ) : null}
                        </List.Item.Detail.Metadata.TagList>
                      </List.Item.Detail.Metadata>
                    }
                  />
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
