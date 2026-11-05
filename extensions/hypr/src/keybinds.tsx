import { Action, ActionPanel, Color, Icon, List } from '@vicinae/api';
import { useMemo, useState } from 'react';
import { useHyprctlData } from './hooks';
import type { HyprctlBind } from './types';
import { mapHyprBinds } from './utils/keybinds';

interface Category {
  title: string;
  icon: Icon;
  matches: (dispatcher: string) => boolean;
}

const OTHER_CATEGORY: Category = {
  title: 'Custom Actions',
  icon: Icon.Code,
  matches: () => true,
};

const CATEGORIES: Category[] = [
  {
    title: 'Commands',
    icon: Icon.Terminal,
    matches: (dispatcher) => ['exec_cmd', 'exec', 'execr'].includes(dispatcher),
  },
  {
    title: 'Monitors',
    icon: Icon.Monitor,
    matches: (dispatcher) =>
      [
        'focusmonitor',
        'movecurrentworkspacetomonitor',
        'moveworkspacetomonitor',
        'swapactiveworkspaces',
      ].includes(dispatcher),
  },
  {
    title: 'Workspaces',
    icon: Icon.Layers,
    matches: (dispatcher) =>
      [
        'toggle_special',
        'workspace',
        'movetoworkspace',
        'movetoworkspacesilent',
        'togglespecialworkspace',
        'renameworkspace',
      ].includes(dispatcher),
  },
  {
    title: 'Focus',
    icon: Icon.Eye,
    matches: (dispatcher) =>
      [
        'focus',
        'movefocus',
        'focuswindow',
        'focuscurrentorlast',
        'focusurgentorlast',
        'cyclenext',
        'focuslast',
        'focusfloating',
        'focustiled',
      ].includes(dispatcher),
  },
  {
    title: 'Movement',
    icon: Icon.ArrowRight,
    matches: (dispatcher) =>
      [
        'move',
        'drag',
        'movewindow',
        'movewindowpixel',
        'swapwindow',
        'centerwindow',
        'movetocorner',
      ].includes(dispatcher),
  },
  {
    title: 'Window State',
    icon: Icon.AppWindow,
    matches: (dispatcher) =>
      [
        'close',
        'float',
        'pseudo',
        'fullscreen',
        'killactive',
        'closewindow',
        'forcekillactive',
        'togglefloating',
        'setfloating',
        'settiled',
        'fullscreenstate',
        'pin',
        'alterzorder',
        'tagwindow',
      ].includes(dispatcher),
  },
  {
    title: 'Resizing',
    icon: Icon.ArrowsExpand,
    matches: (dispatcher) =>
      ['resize', 'resizeactive', 'resizewindow', 'resizewindowpixel'].includes(
        dispatcher
      ),
  },
  {
    title: 'Layout',
    icon: Icon.AppWindowGrid2x2,
    matches: (dispatcher) =>
      [
        'layout',
        'layoutmsg',
        'togglesplit',
        'swapsplit',
        'splitratio',
        'togglegroup',
        'changegroupactive',
        'moveintogroup',
        'moveoutofgroup',
        'movewindoworgroup',
        'lockgroups',
        'lockactivegroup',
        'setignoregrouplock',
        'denywindowfromgroup',
      ].includes(dispatcher),
  },
  OTHER_CATEGORY,
];

function normalizeDispatcher(dispatcher: string): string {
  return dispatcher.match(/^HL\.Dispatcher\(([^)]+)\)$/u)?.[1] ?? dispatcher;
}

function formatDisplayDispatch(dispatcher: string, arg: string): string {
  const normalizedDispatcher = normalizeDispatcher(dispatcher);
  if (normalizedDispatcher !== dispatcher && /^\d+$/u.test(arg)) {
    return normalizedDispatcher;
  }
  return [normalizedDispatcher, arg].filter(Boolean).join(' ');
}

function truncateDescription(description: string): string {
  const characters = Array.from(description);
  return characters.length > 50
    ? `${characters.slice(0, 49).join('')}…`
    : description;
}

function categoryOf(dispatcher: string): Category {
  const normalizedDispatcher = normalizeDispatcher(dispatcher);
  return (
    CATEGORIES.find((category) => category.matches(normalizedDispatcher)) ??
    OTHER_CATEGORY
  );
}

export default function Keybinds() {
  const [rawBinds, isLoading] = useHyprctlData<HyprctlBind[]>(
    'binds',
    [],
    'Failed to load keybinds'
  );
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const keybinds = useMemo(() => mapHyprBinds(rawBinds), [rawBinds]);
  const sections = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        keybinds: keybinds.filter(
          (keybind) => categoryOf(keybind.dispatcher) === category
        ),
      })).filter((section) => section.keybinds.length > 0),
    [keybinds]
  );

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
        sections.map((section) => (
          <List.Section
            key={section.category.title}
            title={section.category.title}
            subtitle={section.keybinds.length.toString()}
          >
            {section.keybinds.map((keybind, index) => {
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
                  subtitle={formatDisplayDispatch(
                    keybind.dispatcher,
                    keybind.arg
                  )}
                  icon={isShowingDetail ? undefined : section.category.icon}
                  keywords={[
                    title,
                    keybind.description,
                    keybind.dispatch,
                    keybind.dispatcher,
                    keybind.arg,
                    keybind.submap,
                    ...flags,
                  ]}
                  accessories={
                    isShowingDetail
                      ? []
                      : [
                          ...(keybind.locked
                            ? [
                                {
                                  icon: Icon.Lock,
                                  tag: { value: '', color: Color.Purple },
                                  tooltip: 'Works when locked',
                                },
                              ]
                            : []),
                          ...(keybind.repeat
                            ? [{ tag: { value: 'repeat', color: Color.Blue } }]
                            : []),
                          ...(keybind.description
                            ? [
                                {
                                  tag: {
                                    value: truncateDescription(
                                      keybind.description
                                    ),
                                    color: Color.PrimaryText,
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
                        ]
                  }
                  actions={
                    <ActionPanel>
                      <Action
                        title={
                          isShowingDetail ? 'Hide Details' : 'Show Details'
                        }
                        icon={Icon.AppWindowSidebarRight}
                        shortcut={{ modifiers: ['cmd'], key: 'd' }}
                        onAction={() =>
                          setIsShowingDetail((visible) => !visible)
                        }
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
                                color={Color.Purple}
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
        ))
      )}
    </List>
  );
}
