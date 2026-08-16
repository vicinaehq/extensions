import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";

const NOT_FOUND_MARKDOWN = `# Niri Compositor Not Detected

This extension is built specifically for the Niri Wayland window manager.

## Why am I seeing this?
- You are not currently logged into an active **Niri** session.
- The \`niri msg\` CLI is not available on your \`PATH\`.

If you are using another desktop environment or compositor (such as GNOME, KDE, Hyprland, or Sway), this extension cannot manage your displays.`;

export default function NiriNotFound({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}) {
  return (
    <Detail
      markdown={NOT_FOUND_MARKDOWN}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open Niri Github"
            url="https://github.com/niri-wm/niri"
          />
          <Action
            title="Retry Connection"
            icon={Icon.RotateClockwise}
            onAction={onRefresh}
          />
        </ActionPanel>
      }
    />
  );
}
