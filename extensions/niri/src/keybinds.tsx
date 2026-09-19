import { List, Icon, Color, ActionPanel, Action } from '@vicinae/api';
import { basename } from 'path';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { handleError } from './lib/feedback';
import { collectKeybinds, getNiriConfigPath, loadNiriConfig } from './lib/keybinds/config';
import type { Keybind } from './lib/types';

interface Category {
  title: string;
  icon: Icon;
  matches: (action: string) => boolean;
}

const OTHER_CATEGORY: Category = {
  title: 'Compositor',
  icon: Icon.Cog,
  matches: () => true,
};

const CATEGORIES: Category[] = [
  {
    title: 'Applications',
    icon: Icon.Terminal,
    matches: (action) => action === 'spawn' || action === 'spawn-sh',
  },
  {
    title: 'Screenshots',
    icon: Icon.Camera,
    matches: (action) => action.startsWith('screenshot'),
  },
  {
    title: 'Monitors',
    icon: Icon.Monitor,
    matches: (action) => action.includes('monitor') || action.includes('output'),
  },
  {
    title: 'Workspaces',
    icon: Icon.Layers,
    matches: (action) => action.includes('workspace'),
  },
  {
    title: 'Columns',
    icon: Icon.AppWindowGrid2x2,
    matches: (action) => action.includes('column'),
  },
  {
    title: 'Windows',
    icon: Icon.AppWindow,
    matches: (action) => action.includes('window'),
  },
  OTHER_CATEGORY,
];

function categoryOf(action: string): Category {
  return CATEGORIES.find((category) => category.matches(action)) ?? OTHER_CATEGORY;
}

function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => part.replace(/_/g, ' '))
    .join(' + ');
}

function formatArgs(args: string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ');
}

function formatCommand(keybind: Keybind): string {
  return [keybind.action, formatArgs(keybind.args)].filter(Boolean).join(' ');
}

function flagsOf(keybind: Keybind): { text: string; color: Color }[] {
  const flags: { text: string; color: Color }[] = [];

  if (!keybind.repeat) flags.push({ text: 'No Repeat', color: Color.SecondaryText });
  if (keybind.cooldownMs !== null) {
    flags.push({ text: `${keybind.cooldownMs}ms Cooldown`, color: Color.Blue });
  }
  if (keybind.allowWhenLocked) flags.push({ text: 'Works When Locked', color: Color.Orange });
  if (!keybind.allowInhibiting) flags.push({ text: 'Never Inhibited', color: Color.Purple });
  if (keybind.hiddenFromOverlay) {
    flags.push({ text: 'Hidden From Overlay', color: Color.SecondaryText });
  }

  return flags;
}

export default function Keybinds() {
  const [keybinds, setKeybinds] = useState<Keybind[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeybinds(collectKeybinds(await loadNiriConfig()));
      setError(null);
    } catch (caught) {
      setKeybinds([]);
      setError(caught instanceof Error ? caught.message : 'Unknown error');
      handleError('Failed to read the niri config', caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        keybinds: keybinds.filter((keybind) => categoryOf(keybind.action) === category),
      })).filter((section) => section.keybinds.length > 0),
    [keybinds]
  );

  const reloadAction = (
    <Action
      title="Reload Config"
      icon={Icon.ArrowClockwise}
      onAction={() => load()}
      shortcut={{ modifiers: ['cmd'], key: 'r' }}
    />
  );

  const emptyView = loading ? null : (
    <List.EmptyView
      icon={error === null ? Icon.Keyboard : Icon.Warning}
      title={error === null ? 'No Keybinds Found' : 'Cannot Read the Niri Config'}
      description={error ?? `No binds are declared in ${getNiriConfigPath()}.`}
      actions={<ActionPanel>{reloadAction}</ActionPanel>}
    />
  );

  return (
    <List
      isLoading={loading}
      isShowingDetail={showDetail && keybinds.length > 0}
      searchBarPlaceholder="Search keys, actions and arguments"
    >
      {keybinds.length === 0
        ? emptyView
        : sections.map((section) => (
            <List.Section
              key={section.category.title}
              title={section.category.title}
              subtitle={`${section.keybinds.length}`}
            >
              {section.keybinds.map((keybind, index) => {
                const keys = formatCombo(keybind.combo);
                const command = formatCommand(keybind);
                const flags = flagsOf(keybind);

                return (
                  <List.Item
                    key={`${keybind.source}:${keybind.line}:${index}`}
                    title={keys}
                    subtitle={showDetail ? '' : (keybind.overlayTitle ?? command)}
                    icon={section.category.icon}
                    keywords={[
                      keybind.combo,
                      keybind.action,
                      keybind.overlayTitle ?? '',
                      ...keybind.args,
                    ].filter(Boolean)}
                    accessories={
                      showDetail
                        ? []
                        : flags.map((flag) => ({
                            tag: { value: flag.text, color: flag.color },
                          }))
                    }
                    actions={
                      <ActionPanel>
                        <Action
                          title={showDetail ? 'Hide Details' : 'Show Details'}
                          icon={Icon.Text}
                          onAction={() => setShowDetail((shown) => !shown)}
                          shortcut={{ modifiers: ['cmd'], key: 'd' }}
                        />
                        <Action.CopyToClipboard
                          title="Copy Keys"
                          icon={Icon.Keyboard}
                          content={keys}
                        />
                        <Action.CopyToClipboard
                          title="Copy Command"
                          icon={Icon.Terminal}
                          content={command}
                        />
                        <Action.CopyToClipboard
                          title="Copy Bind"
                          icon={Icon.CopyClipboard}
                          content={keybind.text}
                        />
                        <Action.CopyToClipboard
                          title="Copy Config Path"
                          icon={Icon.Finder}
                          content={keybind.source}
                        />
                        {reloadAction}
                      </ActionPanel>
                    }
                    detail={
                      <List.Item.Detail
                        metadata={
                          <List.Item.Detail.Metadata>
                            <List.Item.Detail.Metadata.Label title="Keys" text={keys} />
                            <List.Item.Detail.Metadata.Label
                              title="Action"
                              text={keybind.action || 'None'}
                            />
                            {keybind.args.length > 0 && (
                              <List.Item.Detail.Metadata.Label
                                title="Arguments"
                                text={formatArgs(keybind.args)}
                              />
                            )}
                            {keybind.overlayTitle !== null && (
                              <List.Item.Detail.Metadata.Label
                                title="Overlay Title"
                                text={keybind.overlayTitle}
                              />
                            )}
                            <List.Item.Detail.Metadata.Separator />
                            {flags.length > 0 && (
                              <List.Item.Detail.Metadata.TagList title="Flags">
                                {flags.map((flag) => (
                                  <List.Item.Detail.Metadata.TagList.Item
                                    key={flag.text}
                                    text={flag.text}
                                    color={flag.color}
                                  />
                                ))}
                              </List.Item.Detail.Metadata.TagList>
                            )}
                            <List.Item.Detail.Metadata.Label
                              title="Declared In"
                              text={`${basename(keybind.source)}:${keybind.line}`}
                            />
                          </List.Item.Detail.Metadata>
                        }
                      />
                    }
                  />
                );
              })}
            </List.Section>
          ))}
    </List>
  );
}
