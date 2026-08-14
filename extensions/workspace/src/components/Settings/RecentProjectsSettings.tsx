import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";

interface RecentProjectsSettingsProps {
  recentProjectsCount: number;
  showRecentProjects: boolean;
  updateRecentProjectsCount: (count: number) => Promise<void>;
  updateShowRecentProjects: (show: boolean) => Promise<void>;
}

export default function RecentProjectsSettings({
  recentProjectsCount,
  showRecentProjects,
  updateRecentProjectsCount,
  updateShowRecentProjects,
}: RecentProjectsSettingsProps) {
  return (
    <List.Section title="Recent Projects">
      <List.Item
        accessories={[
          {
            tag: {
              color: showRecentProjects ? Color.Green : Color.SecondaryText,
              value: showRecentProjects ? "Enabled" : "Disabled",
            },
          },
        ]}
        actions={
          <ActionPanel>
            <ActionPanel.Section title="Recent Projects">
              <Action
                onAction={() => updateShowRecentProjects(!showRecentProjects)}
                title={showRecentProjects ? "Disable Recent Projects" : "Enable Recent Projects"}
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
        icon={Icon.Clock}
        subtitle="Show recently opened projects in the workspace list"
        title="Show Recent Projects"
      />
      {showRecentProjects && (
        <List.Item
          accessories={[
            {
              tag: {
                color: Color.SecondaryText,
                value: `${recentProjectsCount}`,
              },
            },
          ]}
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Count">
                {[3, 5, 7, 10].map((count) => (
                  <Action
                    key={count}
                    onAction={() => updateRecentProjectsCount(count)}
                    title={`Show ${count} Recent Projects`}
                  />
                ))}
              </ActionPanel.Section>
            </ActionPanel>
          }
          icon={Icon.AppWindowList}
          subtitle="Number of recent projects to display"
          title="Recent Projects Count"
        />
      )}
    </List.Section>
  );
}
