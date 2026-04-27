import type { LaunchProps } from "@vicinae/api";
import { AskCodexForm } from "./lib/codex-ui";

export default function CodexCommand(props: LaunchProps) {
	return (
		<AskCodexForm draftValues={props.draftValues as { [key: string]: any }} />
	);
}
