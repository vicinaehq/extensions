import { Detail, type LaunchProps } from "@vicinae/api";
import { ShortcutRunner } from "./components/ShortcutRunner";
import { trimText } from "./lib/string";

export default function RunPrompt(props: LaunchProps<{ arguments: { shortcutId?: string } }>) {
  const shortcutId = trimText(props.arguments?.shortcutId);

  if (!shortcutId) {
    return (
      <Detail markdown="## No prompt id provided\nThis command is meant to be launched through a Quicklink. Open **Manage Prompts** and use **Create Quicklink** on a prompt." />
    );
  }

  return <ShortcutRunner shortcutId={shortcutId} />;
}
