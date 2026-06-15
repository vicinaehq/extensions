import { Action, ActionPanel, Icon, List } from '@vicinae/api';
import { useHyprctlData } from './hooks';
import {
  AVAILABLE_LAYOUTS,
  LAYOUT_DOC_LINKS,
  LAYOUT_SUBTITLES,
} from './layouts';
import type { HyprWorkspace } from './types';
import { capitalizeFirst, switchToLayout } from './utils';

export default function SwitchLayout() {
  const [activeWorkspace, isLoading] = useHyprctlData<
    HyprWorkspace | undefined
  >('activeworkspace', undefined, 'Failed to load active workspace');

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search layouts...">
      {!activeWorkspace && !isLoading ? (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No Active Workspace Found"
          description="No Hyprland active workspace was returned by hyprctl."
        />
      ) : null}

      {activeWorkspace ? (
        <List.Section title="Layouts">
          {AVAILABLE_LAYOUTS.map((layout) => {
            const title = `${capitalizeFirst(layout)} Layout`;
            const isCurrent = activeWorkspace.tiledLayout === layout;

            return (
              <List.Item
                key={layout}
                title={title}
                subtitle={LAYOUT_SUBTITLES[layout]}
                icon={Icon.AppWindowGrid2x2}
                accessories={isCurrent ? [{ tag: 'Current' }] : []}
                actions={
                  <ActionPanel>
                    <Action
                      title={`Switch to ${title}`}
                      icon={Icon.Switch}
                      onAction={() =>
                        switchToLayout(activeWorkspace.id, layout)
                      }
                    />
                    <Action.OpenInBrowser
                      title={`Open ${title} doc`}
                      icon={Icon.Globe01}
                      url={LAYOUT_DOC_LINKS[layout]}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ) : null}
    </List>
  );
}
