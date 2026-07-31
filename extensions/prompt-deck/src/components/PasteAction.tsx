import { Action, Clipboard, closeMainWindow, Icon, Keyboard } from "@vicinae/api";

interface PasteActionProps {
  title: string;
  content: string;
  icon?: Icon;
  shortcut?: Keyboard.Shortcut | Keyboard.Shortcut.Common;
}

/**
 * Sends text to whichever app was focused before Vicinae opened.
 *
 * Deliberately not Action.Paste: that component calls closeMainWindow() and
 * Clipboard.paste() without awaiting either, so the keystroke can be injected
 * before focus has left the launcher.
 *
 * The copy up front is what makes this reliable. The target app reads the
 * selection lazily over a pipe once the keystroke lands, and that read fails
 * with "timeout reading from pipe" if selection ownership changes mid-read —
 * which it can, since Vicinae restores the previous clipboard shortly after
 * pasting and other clipboard managers may claim ownership too. Setting the
 * clipboard before the window closes gives the selection time to settle.
 *
 * No artificial delay here: the server polls for focus to land on the target
 * window before injecting, so waiting on this side only adds latency.
 */
export function PasteAction({ title, content, icon = Icon.Text, shortcut }: PasteActionProps) {
  const shortcutProps = shortcut ? { shortcut } : {};

  return (
    <Action
      title={title}
      icon={icon}
      {...shortcutProps}
      onAction={async () => {
        await Clipboard.copy(content);
        await closeMainWindow();
        await Clipboard.paste(content);
      }}
    />
  );
}
