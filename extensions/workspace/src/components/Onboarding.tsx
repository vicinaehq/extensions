import { Action, ActionPanel, Color, Icon, List, type Application } from "@vicinae/api";

import AddWorkspaceForm from "@/components/AddWorkspaceForm";
import ImportSettingsForm from "@/components/ImportSettingsForm";
import SelectEditor from "@/components/SelectEditor";
import Settings from "@/components/Settings";
import { App } from "@/types";

interface OnboardingProps {
  defaultApp: App | null;
  loadData: () => Promise<void>;
  onComplete: () => void;
  onImportSettings: (filePath: string) => Promise<boolean>;
  onSelectDefaultApp: (app: Application) => Promise<void>;
  workspaces: string[];
}

export default function Onboarding({
  defaultApp,
  loadData,
  onComplete,
  onImportSettings,
  onSelectDefaultApp,
  workspaces,
}: OnboardingProps) {
  const hasWorkspaces = workspaces.length > 0;
  const hasApp = !!defaultApp;
  const isReady = hasWorkspaces;
  const nextStep = !hasWorkspaces ? "Add your first workspace" : "Finish onboarding";

  return (
    <List navigationTitle="Workspace Onboarding">
      <List.Section title="Workspace">
        <List.Item
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Next Step">
                {!hasWorkspaces && <AddWorkspaceAction loadData={loadData} />}
                {isReady && <Action icon={Icon.Check} onAction={onComplete} title="Finish Onboarding" />}
              </ActionPanel.Section>
              <ActionPanel.Section title="Setup Actions">
                <AddWorkspaceAction loadData={loadData} />
                <SelectAppAction onSelect={onSelectDefaultApp} title="Select Default App" />
              </ActionPanel.Section>
              <OpenSettingsAction loadData={loadData} />
            </ActionPanel>
          }
          icon={Icon.Info01}
          subtitle={`Next step: ${nextStep}. A default app is optional and can be set later in Settings.`}
          title="Setup Guide"
        />
        <List.Item
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Workspace">
                <AddWorkspaceAction loadData={loadData} />
              </ActionPanel.Section>
              <OpenSettingsAction loadData={loadData} />
            </ActionPanel>
          }
          icon={stepIcon(hasWorkspaces)}
          subtitle={
            hasWorkspaces
              ? `${workspaces.length} workspace${workspaces.length > 1 ? "s" : ""} added`
              : "Choose a parent folder that contains your projects"
          }
          title="1. Add Workspace"
        />
        <List.Item
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Application">
                <SelectAppAction onSelect={onSelectDefaultApp} />
              </ActionPanel.Section>
              <OpenSettingsAction loadData={loadData} />
            </ActionPanel>
          }
          icon={stepIcon(hasApp)}
          subtitle={
            hasApp
              ? `Selected: ${defaultApp.name}`
              : "Optional. Choose which app opens your projects, or skip and finish."
          }
          title="2. Default App (optional)"
        />
        {isReady && (
          <List.Item
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Complete">
                  <Action icon={Icon.Check} onAction={onComplete} title="Finish Onboarding" />
                </ActionPanel.Section>
                <OpenSettingsAction loadData={loadData} />
              </ActionPanel>
            }
            icon={{ source: Icon.CheckCircle, tintColor: Color.Green }}
            subtitle="You're ready to go."
            title="3. Finish Setup"
          />
        )}
      </List.Section>
      <List.Section title="Import Existing Setup">
        <List.Item
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Import">
                <Action.Push
                  icon={Icon.Upload}
                  target={<ImportSettingsForm onImport={onImportSettings} />}
                  title="Import Settings File"
                />
              </ActionPanel.Section>
              <OpenSettingsAction loadData={loadData} />
            </ActionPanel>
          }
          icon={Icon.Upload}
          subtitle="Import a JSON backup to prefill workspaces, apps, and preferences"
          title="Import Settings File"
        />
      </List.Section>
    </List>
  );
}

function stepIcon(done: boolean) {
  return done ? { source: Icon.CheckCircle, tintColor: Color.Green } : Icon.Circle;
}

function AddWorkspaceAction({ loadData }: { loadData: () => Promise<void> }) {
  return (
    <Action.Push
      icon={Icon.Folder}
      shortcut={{ key: "n", modifiers: ["cmd"] }}
      target={<AddWorkspaceForm onDone={loadData} />}
      title="Add Workspace"
    />
  );
}

function SelectAppAction({
  onSelect,
  title = "Select App",
}: {
  onSelect: (app: Application) => Promise<void>;
  title?: string;
}) {
  return (
    <Action.Push
      icon={Icon.AppWindow}
      shortcut={{ key: "e", modifiers: ["cmd"] }}
      target={<SelectEditor onSelect={onSelect} />}
      title={title}
    />
  );
}

function OpenSettingsAction({ loadData }: { loadData: () => Promise<void> }) {
  return (
    <ActionPanel.Section title="Navigation">
      <Action.Push
        icon={Icon.Cog}
        shortcut={{ key: ",", modifiers: ["cmd", "shift"] }}
        target={<Settings onWorkspacesChanged={loadData} />}
        title="Open Settings"
      />
    </ActionPanel.Section>
  );
}
