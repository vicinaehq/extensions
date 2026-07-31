import { Action, Clipboard, Icon, Keyboard, showHUD, showToast, Toast } from "@vicinae/api";

interface CopyActionProps {
  title: string;
  content: string;
  closeWindowOnCopy?: boolean | undefined;
  icon?: Icon;
  shortcut?: Keyboard.Shortcut | Keyboard.Shortcut.Common;
}

/**
 * Copies text with shortcut-controlled launcher close behavior.
 */
export function CopyAction({ title, content, closeWindowOnCopy = false, icon = Icon.CopyClipboard, shortcut }: CopyActionProps) {
  const shortcutProps = shortcut ? { shortcut } : {};

  return (
    <Action
      title={title}
      icon={icon}
      {...shortcutProps}
      onAction={async () => {
        await Clipboard.copy(content);
        if (closeWindowOnCopy) {
          await showHUD("Copied");
          return;
        }

        await showToast({ style: Toast.Style.Success, title: "Copied", message: title });
      }}
    />
  );
}
