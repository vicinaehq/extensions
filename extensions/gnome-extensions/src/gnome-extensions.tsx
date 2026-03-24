import React, { JSX, useCallback, useEffect, useState } from "react";
import { Action, ActionPanel, Clipboard, getPreferenceValues, Icon, List, open, showToast, Toast } from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

interface GnomeExtension {
  uuid: string;
  name: string;
  description: string;
  enabled: boolean;
  version?: string;
  author?: string;
  path?: string;
  url?: string;
  state?: string;
  settingsSchema?: string;
}

interface Preferences {
  extensionManagerPath?: string;
  showDisabled?: boolean;
}

async function executeCommand(command: string): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { stdout: "", stderr: errorMessage, error: errorMessage };
  }
}

function parseSimpleList(output: string): string[] {
  return output
    .split("\n")
    .map(line => line.trim())
    .filter(line => 0 < line.length);
}

function getNameFromUuid(uuid: string): string {
  const match = uuid.match(/^([a-zA-Z0-9_-]+)@/);
  return match ? match[1] : uuid.split("@")[0];
}

async function getExtensionInfo(uuid: string): Promise<Partial<GnomeExtension>> {
  const result = await executeCommand(`gnome-extensions info "${uuid}"`);

  if (result.error || !result.stdout) {
    return {
      name: getNameFromUuid(uuid),
      description: "",
      enabled: true,
    };
  }

  const lines = result.stdout.split("\n");
  const info: Partial<GnomeExtension> = {
    name: getNameFromUuid(uuid),
    description: "",
    enabled: true,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Name:")) {
      info.name = trimmed.replace("Name:", "").trim();
    } else if (trimmed.startsWith("Description:")) {
      info.description = trimmed.replace("Description:", "").trim();
    } else if (trimmed.startsWith("Version:")) {
      info.version = trimmed.replace("Version:", "").trim();
    } else if (trimmed.startsWith("Enabled:")) {
      const state = trimmed.replace("Enabled:", "").trim();
      info.enabled = "yes" === state.toLowerCase();
    } else if (trimmed.startsWith("State:")) {
      info.state = trimmed.replace("State:", "").trim();
    } else if (trimmed.startsWith("Author:")) {
      info.author = trimmed.replace("Author:", "").trim();
    } else if (trimmed.startsWith("Path:")) {
      info.path = trimmed.replace("Path:", "").trim();
    } else if (trimmed.startsWith("URL:")) {
      info.url = trimmed.replace("URL:", "").trim();
    }
  }

  return info;
}

async function getSettingsSchema(path?: string): Promise<string | undefined> {
  if (!path) return undefined;

  try {
    const metadataPath = join(path, "metadata.json");
    const content = await readFile(metadataPath, "utf-8");
    const metadata = JSON.parse(content);
    return metadata["settings-schema"];
  } catch {
    return undefined;
  }
}

async function listExtensions(): Promise<GnomeExtension[]> {
  const enabledResult = await executeCommand("gnome-extensions list --enabled");
  const disabledResult = await executeCommand("gnome-extensions list --disabled");

  const enabledUuids = enabledResult.stdout ? parseSimpleList(enabledResult.stdout) : [];
  const disabledUuids = disabledResult.stdout ? parseSimpleList(disabledResult.stdout) : [];

  if (0 === enabledUuids.length && 0 === disabledUuids.length) {
    return [];
  }

  const allUuids = [...enabledUuids, ...disabledUuids];
  const extensions: GnomeExtension[] = [];

  for (const uuid of allUuids) {
    const info = await getExtensionInfo(uuid);
    const settingsSchema = await getSettingsSchema(info.path);
    extensions.push({
      uuid,
      name: info.name || getNameFromUuid(uuid),
      description: info.description || "",
      enabled: enabledUuids.includes(uuid),
      version: info.version,
      author: info.author,
      path: info.path,
      url: info.url,
      state: info.state,
      settingsSchema,
    });
  }

  return extensions;
}

async function enableExtension(uuid: string): Promise<boolean> {
  const { error } = await executeCommand(`gnome-extensions enable "${uuid}"`);
  return !error;
}

async function disableExtension(uuid: string): Promise<boolean> {
  const { error } = await executeCommand(`gnome-extensions disable "${uuid}"`);
  return !error;
}

async function openExtensionPrefs(uuid: string): Promise<boolean> {
  const { error } = await executeCommand(`gnome-extensions prefs "${uuid}"`);
  return !error;
}

// noinspection JSUnusedGlobalSymbols
export default function Command(): JSX.Element {
  const preferences = getPreferenceValues<Preferences>();
  const [extensions, setExtensions] = useState<GnomeExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  const loadExtensions = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const extensions = await listExtensions();

      if (0 === extensions.length) {
        setError("No GNOME extensions found. Make sure gnome-extensions CLI is installed.");
      } else {
        setExtensions(extensions);
      }
    } catch {
      setError("Failed to load GNOME extensions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExtensions().then(null);
  }, [loadExtensions]);

  const filteredExtensions = extensions.filter(ext => {
    if (preferences.showDisabled) return true;
    return ext.enabled;
  });

  const enabledCount = extensions.filter(e => e.enabled).length;
  const disabledCount = extensions.filter(e => !e.enabled).length;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search extensions..."
      actions={(
        <ActionPanel>
          <Action title="Reload Extensions" icon={Icon.RotateAntiClockwise} onAction={loadExtensions} />
          <Action title="Open Extension Manager" icon={Icon.AppWindow} onAction={() => open("gnome-extensions")} />
          <Action
            title="Browse Extensions"
            icon={Icon.Globe01}
            onAction={() => open("https://extensions.gnome.org/")}
          />
        </ActionPanel>
      )}
    >
      <List.Section
        title={`Enabled (${enabledCount})`}
        subtitle={preferences.showDisabled ? `Disabled (${disabledCount})` : undefined}
      >
        {filteredExtensions.map(extension => (
          <List.Item
            key={extension.uuid}
            title={extension.name}
            subtitle={extension.description || extension.uuid}
            icon={extension.enabled ? Icon.Checkmark : Icon.XMarkCircle}
            accessories={extension.version ? [{ text: `v${extension.version}` }] : []}
            detail={(
              <List.Item.Detail
                markdown={extension.description || "_No description available._"}
                metadata={(
                  <List.Item.Detail.Metadata>
                    {extension.url && (
                      <List.Item.Detail.Metadata.Link title="Homepage" text={extension.url} target={extension.url} />
                    )}
                    {extension.author && <List.Item.Detail.Metadata.Label title="Author" text={extension.author} />}
                    <List.Item.Detail.Metadata.Label title="UUID" text={extension.uuid} />
                    {extension.version && <List.Item.Detail.Metadata.Label title="Version" text={extension.version} />}
                    {extension.state && <List.Item.Detail.Metadata.Label title="State" text={extension.state} />}
                    <List.Item.Detail.Metadata.Label title="Status" text={extension.enabled ? "Enabled" : "Disabled"} />
                    {extension.settingsSchema && (
                      <List.Item.Detail.Metadata.Label title="Schema" text={extension.settingsSchema} />
                    )}
                    {extension.path && <List.Item.Detail.Metadata.Label title="Path" text={extension.path} />}
                  </List.Item.Detail.Metadata>
                )}
              />
            )}
            actions={(
              <ActionPanel>
                <Action
                  title={isShowingDetail ? "Hide Details" : "Show Details"}
                  icon={Icon.Info01}
                  onAction={() => setIsShowingDetail(!isShowingDetail)}
                />
                {extension.enabled ? (
                  <Action
                    title="Disable"
                    icon={Icon.XMarkCircle}
                    onAction={async () => {
                      const success = await disableExtension(extension.uuid);
                      if (success) {
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Disabled",
                          message: extension.name,
                        });
                        await loadExtensions();
                      } else {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: "Failed to disable",
                          message: extension.name,
                        });
                      }
                    }}
                  />
                ) : (
                  <Action
                    title="Enable"
                    icon={Icon.CheckCircle}
                    onAction={async () => {
                      const success = await enableExtension(extension.uuid);
                      if (success) {
                        await showToast({
                          style: Toast.Style.Success,
                          title: "Enabled",
                          message: extension.name,
                        });
                        await loadExtensions();
                      } else {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: "Failed to enable",
                          message: extension.name,
                        });
                      }
                    }}
                  />
                )}
                <Action title="Preferences" icon={Icon.Cog} onAction={() => openExtensionPrefs(extension.uuid)} />
                <Action
                  title="Copy UUID"
                  icon={Icon.CopyClipboard}
                  onAction={async () => {
                    await Clipboard.copy(extension.uuid);
                    await showToast({
                      style: Toast.Style.Success,
                      title: "UUID copied",
                    });
                  }}
                />
              </ActionPanel>
            )}
          />
        ))}
      </List.Section>

      {!isLoading && 0 === filteredExtensions.length && !error && (
        <List.EmptyView
          icon={Icon.AppWindow}
          title="No extensions found"
          description={
            preferences.showDisabled
              ? "No GNOME extensions are installed"
              : "All extensions are disabled. Enable showDisabled to see them."
          }
          actions={(
            <ActionPanel>
              <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={loadExtensions} />
              <Action
                title="Browse Extensions"
                icon={Icon.Globe01}
                onAction={() => open("https://extensions.gnome.org/")}
              />
            </ActionPanel>
          )}
        />
      )}

      {error && (
        <List.EmptyView
          icon={Icon.Warning}
          title="Error loading extensions"
          description={error}
          actions={(
            <ActionPanel>
              <Action title="Reload" icon={Icon.RotateAntiClockwise} onAction={loadExtensions} />
            </ActionPanel>
          )}
        />
      )}
    </List>
  );
}
