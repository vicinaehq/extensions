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
    <List.Item
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Recent Projects">
            <Action
              onAction={() => updateShowRecentProjects(!showRecentProjects)}
              title={showRecentProjects ? "Disable Recent Projects" : "Enable Recent Projects"}
            />
          </ActionPanel.Section>
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
      detail={
        <List.Item.Detail
          markdown="When enabled, recently opened projects appear at the top of the workspace list. Pinned projects are never listed as recent."
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.TagList title="Status">
                <List.Item.Detail.Metadata.TagList.Item
                  color={showRecentProjects ? Color.Green : Color.SecondaryText}
                  text={showRecentProjects ? "Enabled" : "Disabled"}
                />
              </List.Item.Detail.Metadata.TagList>
              <List.Item.Detail.Metadata.Label title="Count" text={String(recentProjectsCount)} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      icon={Icon.Clock}
      id="recent-projects"
      keywords={["recent", "history"]}
      title="Recent Projects"
    />
  );
}
