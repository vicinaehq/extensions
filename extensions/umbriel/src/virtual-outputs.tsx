import {
	Action,
	ActionPanel,
	Form,
	Icon,
	List,
	useNavigation,
} from "@vicinae/api";
import { useState } from "react";
import { RefreshAction } from "./components/RefreshAction";
import { UmbrielList } from "./components/UmbrielList";
import { confirmDestructive, performCli } from "./lib/feedback";
import { compareStrings, currentMode, formatMode } from "./lib/format";
import { useUmbrielQuery } from "./lib/hooks";
import type { Output } from "./lib/types";

const VIRTUAL_OUTPUT_NAME = /^[A-Za-z0-9._-]+$/;
const VIRTUAL_OUTPUT_MODE = /^\d+x\d+(?:@\d+(?:\.\d+)?)?$/;

function isVirtualOutput(output: Output): boolean {
	return output.description.toLowerCase().startsWith("headless output");
}

function CreateVirtualOutput({
	existingNames,
	onDone,
}: {
	existingNames: string[];
	onDone: () => void | Promise<void>;
}) {
	const { pop } = useNavigation();
	const [name, setName] = useState("");
	const [mode, setMode] = useState("");
	const [nameError, setNameError] = useState<string | undefined>();
	const [modeError, setModeError] = useState<string | undefined>();

	const submit = async () => {
		const trimmedName = name.trim();
		const trimmedMode = mode.trim();
		let valid = true;

		if (!VIRTUAL_OUTPUT_NAME.test(trimmedName)) {
			setNameError("Use ASCII letters, digits, dots, dashes, or underscores.");
			valid = false;
		} else if (
			existingNames.some(
				(existing) => existing.toLowerCase() === trimmedName.toLowerCase(),
			)
		) {
			setNameError("An output with this name already exists.");
			valid = false;
		} else {
			setNameError(undefined);
		}

		if (trimmedMode && !VIRTUAL_OUTPUT_MODE.test(trimmedMode)) {
			setModeError(
				"Use WIDTHxHEIGHT, optionally followed by @HZ, for example 2560x1440@120.",
			);
			valid = false;
		} else {
			setModeError(undefined);
		}

		if (!valid) return;

		const created = await performCli(
			["output-create", trimmedName, ...(trimmedMode ? [trimmedMode] : [])],
			{
				success: `Created virtual output ${trimmedName}`,
				loading: `Creating ${trimmedName}…`,
			},
		);

		if (created) {
			await onDone();
			pop();
		}
	};

	return (
		<Form
			navigationTitle="Create Virtual Output"
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Create Virtual Output"
						icon={Icon.Plus}
						onSubmit={submit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="name"
				title="Name"
				placeholder="stream"
				value={name}
				error={nameError}
				onChange={(value) => {
					setName(value);
					setNameError(undefined);
				}}
			/>
			<Form.TextField
				id="mode"
				title="Mode"
				placeholder="2560x1440@120"
				value={mode}
				error={modeError}
				onChange={(value) => {
					setMode(value);
					setModeError(undefined);
				}}
			/>
			<Form.Description text="The mode is optional. Without one, Umbriel starts the virtual output at 1280x720." />
		</Form>
	);
}

export default function VirtualOutputs() {
	const { data, loading, error, refresh } =
		useUmbrielQuery<Output[]>("outputs");
	const outputs = data ?? [];
	const virtualOutputs = outputs
		.filter(isVirtualOutput)
		.sort((a, b) => compareStrings(a.name, b.name));
	const existingNames = outputs.map((output) => output.name);
	const unavailable = !data && Boolean(error);

	const createAction = (
		<Action.Push
			title="Create Virtual Output"
			icon={Icon.Plus}
			target={
				<CreateVirtualOutput existingNames={existingNames} onDone={refresh} />
			}
		/>
	);

	const destroyOutput = async (output: Output) => {
		const confirmed = await confirmDestructive(
			`Destroy ${output.name}?`,
			"Windows on the virtual output move to another enabled output.",
			"Destroy Output",
		);
		if (!confirmed) return;

		await performCli(["output-destroy", output.name], {
			success: `Destroyed virtual output ${output.name}`,
			loading: `Destroying ${output.name}…`,
			refresh,
		});
	};

	return (
		<UmbrielList
			isLoading={loading}
			isEmpty={unavailable}
			error={unavailable ? error : null}
			emptyTitle="Cannot Reach Umbriel"
			emptyDescription="Start an Umbriel session and make sure the umbriel command is on PATH."
			emptyIcon={Icon.Monitor}
			emptyActions={createAction}
			searchBarPlaceholder="Search virtual outputs…"
			onRefresh={refresh}
		>
			<List.Section title="Virtual Outputs">
				<List.Item
					title="Create Virtual Output"
					subtitle="Add a monitor with no physical display"
					icon={Icon.Plus}
					keywords={["create", "new", "virtual", "output", "monitor"]}
					actions={
						<ActionPanel>
							{createAction}
							<RefreshAction onRefresh={refresh} />
						</ActionPanel>
					}
				/>
				{virtualOutputs.map((output) => {
					const mode = currentMode(output);
					return (
						<List.Item
							key={output.name}
							id={output.name}
							title={output.name}
							subtitle={mode ? formatMode(mode) : "Virtual output"}
							icon={Icon.Monitor}
							keywords={[output.name, output.description]}
							actions={
								<ActionPanel>
									<Action
										title="Destroy Virtual Output"
										icon={Icon.Trash}
										style={Action.Style.Destructive}
										onAction={() => destroyOutput(output)}
									/>
									<RefreshAction onRefresh={refresh} />
								</ActionPanel>
							}
						/>
					);
				})}
			</List.Section>
		</UmbrielList>
	);
}
