import { Action, ActionPanel, Color, Detail, Icon, useNavigation } from "@vicinae/api";
import { buildPromptQuicklink } from "../lib/quicklink";
import type { LlmShortcut } from "../lib/types";

interface QuicklinkWizardProps {
  shortcut: LlmShortcut;
}

/**
 * Post-save step guiding the user through registering the prompt as a
 * Vicinae Quicklink so it becomes launchable from root search.
 */
export function QuicklinkWizard({ shortcut }: QuicklinkWizardProps) {
  const { pop } = useNavigation();
  const markdown = `# Prompt Saved ✓

**"${shortcut.name}"** is ready to use from **Manage Prompts**.

---

## Add It to Root Search

Prompts do not appear in Vicinae root search on their own. To launch this one directly, register it as a **Quicklink**:

1. Press **Enter** — Vicinae's Quicklink form opens, fully prefilled.
2. Adjust the **name** or **icon** if you like, then save.
3. You will land back on this screen — choose **Done** to finish.

> The sidebar shows which prefilled fields must stay unchanged.

_You can skip this now and use **Create Quicklink** from the prompt's actions later._`;

  return (
    <Detail
      navigationTitle="Create Quicklink"
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Link" text={{ value: "Keep as prefilled", color: Color.Red }} icon={Icon.Lock} />
          <Detail.Metadata.Label title="Open With" text={{ value: "Keep as prefilled", color: Color.Red }} icon={Icon.Lock} />
          <Detail.Metadata.Label title="Name" text={{ value: "Customize freely", color: Color.Green }} icon={Icon.Pencil} />
          <Detail.Metadata.Label title="Icon" text={{ value: "Customize freely", color: Color.Green }} icon={Icon.Pencil} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Prompt" text={shortcut.name} icon={Icon.Stars} />
          <Detail.Metadata.Label title="Found in root search as" text={shortcut.name} icon={Icon.MagnifyingGlass} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CreateQuicklink
            title="Create Quicklink"
            quicklink={buildPromptQuicklink(shortcut)}
          />
          <Action title="Done" icon={Icon.Checkmark} onAction={pop} />
        </ActionPanel>
      }
    />
  );
}
