import { Action, ActionPanel, Detail, Icon, Keyboard } from "@vicinae/api";
import type { OperationResult } from "../lib/apt";
import { resultMarkdown } from "../lib/apt";

type Props = {
	heading: string;
	title: string;
	result: OperationResult;
	/** Optional arguments to re-run the operation with `sudo` in a terminal. */
	sudoArgs?: string[];
	/** Command used for the `sudo` retry action. Defaults to `apt-get`. */
	sudoCommand?: string;
};

export function RunResult({
	heading,
	title,
	result,
	sudoArgs,
	sudoCommand,
}: Props) {
	const markdown = resultMarkdown(result, heading);
	const retryCommand = sudoCommand ?? "apt-get";

	const actions = (
		<ActionPanel title={title}>
			<Action.CopyToClipboard
				title="Copy Output"
				content={[result.stdout, result.stderr].filter(Boolean).join("\n")}
				icon={Icon.CopyClipboard}
				shortcut={Keyboard.Shortcut.Common.Copy}
			/>
			{sudoArgs && sudoArgs.length > 0 ? (
				<Action.RunInTerminal
					title="Retry in Terminal (sudo)"
					icon={Icon.Terminal}
					args={["sudo", retryCommand, ...sudoArgs]}
					options={{ hold: true }}
				/>
			) : null}
		</ActionPanel>
	);

	return (
		<Detail markdown={markdown} navigationTitle={title} actions={actions} />
	);
}
