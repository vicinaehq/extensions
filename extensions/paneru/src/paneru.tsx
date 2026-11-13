import {
	Action,
	ActionPanel,
	Icon,
	List,
	openExtensionPreferences,
} from "@vicinae/api";
import { useState } from "react";
import { COMMANDS, type PaneruCommand, SECTIONS } from "./lib/commands";
import { runCommand } from "./lib/run";

const shellCommand = (argv: string[]) => `paneru send-cmd ${argv.join(" ")}`;
const bindingKey = (argv: string[]) => argv.join("_");

export default function PaneruCommands() {
	return (
		<List searchBarPlaceholder="Search Paneru commands…">
			{SECTIONS.map((section) => (
				<List.Section key={section} title={section}>
					{COMMANDS.filter((c) => c.section === section).map((command) => (
						<CommandItem key={command.name} command={command} />
					))}
				</List.Section>
			))}
		</List>
	);
}

function CommandItem({ command }: { command: PaneruCommand }) {
	const argvHint = command.numberArg
		? [...command.argv, `<${command.numberArg.placeholder.toLowerCase()}>`]
		: command.argv;

	return (
		<List.Item
			title={command.title}
			subtitle={command.description}
			icon={Icon[command.icon]}
			keywords={[...(command.keywords ?? []), ...command.argv]}
			accessories={[{ tag: argvHint.join(" ") }]}
			actions={
				<ActionPanel>
					{command.numberArg ? (
						<Action.Push
							title={`Choose ${command.numberArg.placeholder}…`}
							icon={Icon.Hashtag}
							target={<NumberPicker command={command} />}
						/>
					) : (
						<Action
							title="Run Command"
							icon={Icon[command.icon]}
							onAction={() => runCommand(command)}
						/>
					)}
					<ActionPanel.Section>
						{/* Numbered commands only get copy actions in NumberPicker,
						    once the <placeholder> is resolved to a real number. */}
						{!command.numberArg && <CopyActions argv={command.argv} />}
						<Action
							title="Open Extension Preferences"
							icon={Icon.Cog}
							onAction={openExtensionPreferences}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}

function CopyActions({ argv }: { argv: string[] }) {
	return (
		<>
			<Action.CopyToClipboard
				title="Copy Shell Command"
				content={shellCommand(argv)}
				shortcut={{ modifiers: ["cmd"], key: "c" }}
			/>
			<Action.CopyToClipboard
				title="Copy Paneru Binding Name"
				content={bindingKey(argv)}
				shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
			/>
		</>
	);
}

function NumberPicker({ command }: { command: PaneruCommand }) {
	const [search, setSearch] = useState("");
	const label = command.numberArg?.placeholder ?? "Number";
	const typed = /^\d+$/.test(search.trim()) ? Number(search.trim()) : undefined;
	const numbers = Array.from({ length: 9 }, (_, i) => i + 1);
	if (typed && typed > 0 && !numbers.includes(typed)) numbers.unshift(typed);

	return (
		<List
			navigationTitle={command.title}
			searchBarPlaceholder={`Type a ${label.toLowerCase()} number…`}
			onSearchTextChange={setSearch}
			filtering={false}
		>
			{numbers
				.filter((n) => !typed || String(n).startsWith(String(typed)))
				.map((n) => {
					const argv = [...command.argv, String(n)];
					return (
						<List.Item
							key={n}
							title={`${label} ${n}`}
							icon={Icon.Hashtag}
							accessories={[{ tag: argv.join(" ") }]}
							actions={
								<ActionPanel>
									<Action
										title={`${command.title.replace(/…$/, "")} ${n}`}
										icon={Icon[command.icon]}
										onAction={() => runCommand(command, n)}
									/>
									<ActionPanel.Section>
										<CopyActions argv={argv} />
									</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					);
				})}
		</List>
	);
}
