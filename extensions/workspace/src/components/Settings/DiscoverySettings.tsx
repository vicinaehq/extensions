import { Action, ActionPanel, Form, Icon, List, showToast, Toast, useNavigation } from "@vicinae/api";
import { useState } from "react";

import { DEFAULT_IGNORE_PATTERNS, DEFAULT_SCAN_DEPTH } from "@/utils/discovery";

const SCAN_DEPTH_OPTIONS = [1, 2, 3, 5] as const;

interface DiscoverySettingsProps {
  ignorePatterns: string[];
  includeNested: boolean;
  onChanged?: () => Promise<void>;
  requireMarkers: boolean;
  scanDepth: number;
  updateIgnorePatterns: (patterns: string[]) => Promise<void>;
  updateIncludeNested: (value: boolean) => Promise<void>;
  updateRequireMarkers: (value: boolean) => Promise<void>;
  updateScanDepth: (depth: number) => Promise<void>;
}

export default function DiscoverySettings({
  ignorePatterns,
  includeNested,
  onChanged,
  requireMarkers,
  scanDepth,
  updateIgnorePatterns,
  updateIncludeNested,
  updateRequireMarkers,
  updateScanDepth,
}: DiscoverySettingsProps) {
  const setDepth = async (depth: number) => {
    await updateScanDepth(depth);
    if (onChanged) {
      await onChanged();
    }
    await showToast({
      message: depthLabel(depth),
      style: Toast.Style.Success,
      title: "Scan depth updated",
    });
  };

  const toggleIncludeNested = async () => {
    const next = !includeNested;
    await updateIncludeNested(next);
    if (onChanged) {
      await onChanged();
    }
    await showToast({
      style: Toast.Style.Success,
      title: next ? "Nested projects enabled" : "Nested projects disabled",
    });
  };

  const toggleRequireMarkers = async () => {
    const next = !requireMarkers;
    await updateRequireMarkers(next);
    if (onChanged) {
      await onChanged();
    }
    await showToast({
      style: Toast.Style.Success,
      title: next ? "Only marker projects" : "All folders at depth 1",
    });
  };

  const resetIgnorePatterns = async () => {
    await updateIgnorePatterns(DEFAULT_IGNORE_PATTERNS);
    if (onChanged) {
      await onChanged();
    }
    await showToast({ style: Toast.Style.Success, title: "Ignore patterns reset" });
  };

  return (
    <List.Item
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Scan Depth">
            {SCAN_DEPTH_OPTIONS.map((depth) => (
              <Action
                icon={depth === scanDepth ? Icon.CheckCircle : Icon.Circle}
                key={depth}
                onAction={() => setDepth(depth)}
                title={depthLabel(depth)}
              />
            ))}
          </ActionPanel.Section>
          <ActionPanel.Section title="Detection">
            <Action
              icon={requireMarkers ? Icon.Eye : Icon.EyeDisabled}
              onAction={toggleRequireMarkers}
              title={requireMarkers ? "List All Top-Level Folders" : "Require Project Markers"}
            />
            <Action
              icon={includeNested ? Icon.EyeDisabled : Icon.Eye}
              onAction={toggleIncludeNested}
              title={includeNested ? "Stop At Project Roots" : "Include Nested Projects"}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Ignore">
            <Action.Push
              icon={Icon.Pencil}
              target={
                <EditIgnorePatternsForm
                  ignorePatterns={ignorePatterns}
                  onChanged={onChanged}
                  updateIgnorePatterns={updateIgnorePatterns}
                />
              }
              title="Edit Ignore Patterns"
            />
            <Action icon={Icon.ArrowCounterClockwise} onAction={resetIgnorePatterns} title="Reset Ignore Patterns" />
          </ActionPanel.Section>
        </ActionPanel>
      }
      detail={
        <List.Item.Detail
          markdown={discoveryMarkdown(scanDepth, requireMarkers, includeNested)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Scan depth" text={depthLabel(scanDepth)} />
              <List.Item.Detail.Metadata.Label
                title="Markers"
                text={requireMarkers || scanDepth > 1 ? "Required for nested scans" : "Optional at depth 1"}
              />
              <List.Item.Detail.Metadata.Label title="Nested projects" text={includeNested ? "Included" : "Skipped"} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label
                title="Ignore patterns"
                text={`${ignorePatterns.length} rule${ignorePatterns.length === 1 ? "" : "s"}`}
              />
            </List.Item.Detail.Metadata>
          }
        />
      }
      icon={Icon.MagnifyingGlass}
      id="discovery"
      keywords={["scan", "depth", "ignore", "monorepo", "nested", "markers"]}
      title="Discovery"
    />
  );
}

function EditIgnorePatternsForm({
  ignorePatterns,
  onChanged,
  updateIgnorePatterns,
}: {
  ignorePatterns: string[];
  onChanged?: () => Promise<void>;
  updateIgnorePatterns: (patterns: string[]) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(values: { patterns?: string }) {
    const raw = values.patterns ?? "";
    const next = raw
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (next.length === 0) {
      setError("Add at least one pattern, or reset to defaults from Discovery settings");
      return;
    }

    await updateIgnorePatterns(next);
    if (onChanged) {
      await onChanged();
    }
    await showToast({ style: Toast.Style.Success, title: "Ignore patterns updated" });
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.Check} onSubmit={handleSubmit} title="Save Ignore Patterns" />
        </ActionPanel>
      }
      navigationTitle="Ignore Patterns"
    >
      <Form.Description
        text="One folder name per line (or comma-separated). Matching directories are skipped while scanning. Supports simple * wildcards."
        title="Rules"
      />
      <Form.TextArea
        defaultValue={ignorePatterns.join("\n")}
        error={error}
        id="patterns"
        onChange={() => setError(undefined)}
        placeholder={DEFAULT_IGNORE_PATTERNS.join("\n")}
        title="Patterns"
      />
    </Form>
  );
}

function depthLabel(depth: number): string {
  if (depth <= DEFAULT_SCAN_DEPTH) {
    return "Top level only";
  }
  if (depth >= 5) {
    return "5 levels";
  }
  return `${depth} levels`;
}

function discoveryMarkdown(scanDepth: number, requireMarkers: boolean, includeNested: boolean): string {
  const lines = [
    "Control how Workspace finds projects inside each workspace folder.",
    "",
    `- **Depth ${scanDepth}:** ${scanDepth === 1 ? "only immediate child folders" : `search up to ${scanDepth} levels deep`}.`,
    `- **Markers:** folders with \`.git\`, \`package.json\`, \`Cargo.toml\`, and similar count as projects${scanDepth > 1 ? " (required when depth > 1)" : ""}.`,
    `- **Require markers:** ${requireMarkers ? "on, also at depth 1" : "off, depth 1 lists every folder"}.`,
    `- **Nested:** ${includeNested ? "keep scanning inside project folders" : "stop when a project root is found"}.`,
    `- **Custom icon:** put an image at \`.workspace/icon.png\` (also \`.jpg\` / \`.webp\` / \`.svg\` / \`.ico\`).`,
  ];
  return lines.join("\n");
}
