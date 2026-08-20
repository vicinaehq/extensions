import { Action, ActionPanel, Form, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { ActiveMirrorSession, Output } from "./types";
import {
	cancelScreenMirror,
	getActiveMirrorSession,
	getDisplayOutputs,
	isWlMirrorInstalled,
	isWlrRandrInstalled,
	startScreenMirror,
} from "./utils";
import HandleMissingRequirements from "./handle-missing-requirements";
import ActiveMirrorUi from "./active-mirror-ui";

export default function MirrorScreen() {
	const [isWlrRandrFound, setIsWlrRandrFound] = useState(true);
	const [isWlMirrorFound, setIsWlMirrorFound] = useState(true);
	const [loading, setLoading] = useState(false);
	const [outputs, setOutputs] = useState<Output[]>();
	const [selectedSource, setSelectedSource] = useState<string>("");
	const [selectedTarget, setSelectedTarget] = useState<string>("");
	const [activeMirror, setActiveMirror] = useState<ActiveMirrorSession | null>(
		null,
	);

	const loadOutputs = async () => {
		setLoading(true);

		const wlrRandrFound = await isWlrRandrInstalled();
		if (!wlrRandrFound) {
			setLoading(false);
			setIsWlrRandrFound(false);
			return;
		}
		const wlMirrorFound = await isWlMirrorInstalled();
		if (!wlMirrorFound) {
			setLoading(false);
			setIsWlMirrorFound(false);
			return;
		}

		const session = await getActiveMirrorSession();
		setActiveMirror(session);

		const data = await getDisplayOutputs();
		setOutputs(data);

		const enabled = (data as Output[])?.filter(
			(output) => output.enabled !== false,
		);
		if (enabled && enabled.length >= 2) {
			if (session?.source) {
				setSelectedSource(session.source);
			} else {
				setSelectedSource((prev) =>
					prev && enabled.some((d) => d.name === prev) ? prev : enabled[0].name,
				);
			}

			if (session?.target) {
				setSelectedTarget(session.target);
			} else {
				setSelectedTarget((prev) =>
					prev &&
					enabled.some((d) => d.name === prev) &&
					prev !== enabled[0].name
						? prev
						: enabled[1].name,
				);
			}
		}

		setLoading(false);
	};

	useEffect(() => {
		loadOutputs();

		const interval = setInterval(async () => {
			const session = await getActiveMirrorSession();
			setActiveMirror((prev) => {
				if (
					prev?.source !== session?.source ||
					prev?.target !== session?.target
				) {
					return session;
				}
				return prev;
			});
		}, 1500);

		return () => clearInterval(interval);
	}, []);

	const enabledDisplays = outputs?.filter((output) => output.enabled !== false);

	const handleSourceChange = (newSource: string) => {
		setSelectedSource(newSource);

		if (!enabledDisplays || enabledDisplays.length < 2) return;

		if (enabledDisplays.length === 2) {
			const other = enabledDisplays.find((d) => d.name !== newSource);
			if (other) setSelectedTarget(other.name);
		} else if (newSource === selectedTarget) {
			const alternative =
				selectedSource &&
				selectedSource !== newSource &&
				enabledDisplays.some((d) => d.name === selectedSource)
					? selectedSource
					: enabledDisplays.find((d) => d.name !== newSource)?.name;

			if (alternative) setSelectedTarget(alternative);
		}
	};

	const handleTargetChange = (newTarget: string) => {
		setSelectedTarget(newTarget);

		if (!enabledDisplays || enabledDisplays.length < 2) return;

		if (enabledDisplays.length === 2) {
			const other = enabledDisplays.find((d) => d.name !== newTarget);
			if (other) setSelectedSource(other.name);
		} else if (newTarget === selectedSource) {
			const alternative =
				selectedTarget &&
				selectedTarget !== newTarget &&
				enabledDisplays.some((d) => d.name === selectedTarget)
					? selectedTarget
					: enabledDisplays.find((d) => d.name !== newTarget)?.name;

			if (alternative) setSelectedSource(alternative);
		}
	};

	const handleSubmit = async (values: Form.Values) => {
		if (activeMirror) {
			await cancelScreenMirror(setActiveMirror);
			return;
		}

		const source =
			selectedSource ||
			(values.source as string) ||
			(enabledDisplays?.[0]?.name as string);
		const target =
			selectedTarget ||
			(values.target as string) ||
			(enabledDisplays?.[1]?.name as string);

		await startScreenMirror({ source, target, setActiveMirror });
	};

	if (!isWlrRandrFound) {
		return (
			<HandleMissingRequirements
				reason="wlr-randr-not-found"
				onRefresh={loadOutputs}
			/>
		);
	}
	if (!isWlMirrorFound) {
		return (
			<HandleMissingRequirements
				reason="wl-mirror-not-found"
				onRefresh={loadOutputs}
			/>
		);
	}
	if (enabledDisplays && enabledDisplays?.length <= 1) {
		return (
			<HandleMissingRequirements
				reason="monitors-req-not-met"
				onRefresh={loadOutputs}
			/>
		);
	}

	if (activeMirror) {
		return (
			<ActiveMirrorUi
				outputs={outputs}
				activeMirror={activeMirror}
				setActiveMirror={setActiveMirror}
			/>
		);
	}

	return (
		<>
			{loading ? (
				<List.EmptyView
					icon={Icon.Monitor}
					title="No Monitors Found"
					description="Could not detect active monitor outputs."
				/>
			) : (
				<Form
					isLoading={loading}
					actions={
						<ActionPanel>
							<Action.SubmitForm
								title="Start Screen Mirror"
								style={Action.Style.Regular}
								onSubmit={handleSubmit}
							/>
						</ActionPanel>
					}
				>
					<Form.Description
						title="Note"
						text="Make sure to select different monitors for source and destination, otherwise the mirror will not work."
					/>
					<Form.Separator />

					<Form.Dropdown
						id="source"
						title="Source Monitor"
						value={selectedSource}
						onChange={handleSourceChange}
					>
						{enabledDisplays?.map((output) => {
							const current = output.modes.find((mode) => mode.current);
							const res = `${current?.width}x${current?.height}@${current?.refresh}Hz`;
							return (
								<Form.Dropdown.Item
									key={output.name}
									title={`${output.name} ${output.make} - ${res}`}
									value={output.name}
								/>
							);
						})}
					</Form.Dropdown>

					<Form.Dropdown
						id="target"
						title="Target Monitor"
						value={selectedTarget}
						onChange={handleTargetChange}
					>
						{enabledDisplays?.map((output) => {
							const current = output.modes.find((mode) => mode.current);
							const res = `${current?.width}x${current?.height}@${current?.refresh}Hz`;
							return (
								<Form.Dropdown.Item
									key={output.name}
									title={`${output.name} ${output.make} - ${res}`}
									value={output.name}
								/>
							);
						})}
					</Form.Dropdown>
				</Form>
			)}
		</>
	);
}
