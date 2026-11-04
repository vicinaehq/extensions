import {
	Form,
	ActionPanel,
	Action,
	useNavigation,
	confirmAlert,
	Alert,
	Icon,
} from "@vicinae/api";
import { useState } from "react";
import type { Output } from "./types";
import { COMMON_SCALES, TRANSFORMS } from "./types";
import { normalizeTransform, formatMode, showSuccess } from "./utils/global";
import { upsertOutputConfigs } from "./upsert-output-config";
import MonitorPosition from "./components/monitor-position";
import { outputLayout, type DisplayRect } from "./components/monitor-layout";
import type { OutputConfigUpdate } from "./types";

interface Props {
	monitor: Output;
	outputs: Output[];
	enabledCount: number;
	onRefresh?: () => Promise<void>;
}

interface FormValues {
	enabled?: boolean;
	mode: string;
	scale: string;
	transform: string;
}

export default function PersistMonitorConfig({
	monitor,
	outputs,
	enabledCount,
	onRefresh,
}: Props) {
	const { pop, push } = useNavigation();

	const isEnabled = monitor.logical !== null;
	const canToggle = !isEnabled || enabledCount > 1;

	const currentScale = monitor.logical?.scale ?? 1.0;
	// Keep the monitor's actual scale selectable even when it is not one of the
	// common presets (for example 1.2), otherwise the dropdown has no matching
	// item and the current value is not shown.
	const scaleOptions = COMMON_SCALES.includes(currentScale)
		? COMMON_SCALES
		: [...COMMON_SCALES, currentScale].sort((a, b) => a - b);
	const currentTransform = normalizeTransform(
		monitor.logical?.transform ?? "normal",
	);
	const currentMode = monitor.modes[monitor.current_mode] ?? monitor.modes[0];
	const currentResolution = currentMode ? formatMode(currentMode) : "";
	const [mode, setMode] = useState(currentResolution);
	const [scale, setScale] = useState(currentScale.toString());
	const [transform, setTransform] = useState(currentTransform);
	const [enabled, setEnabled] = useState(isEnabled);
	const [positions, setPositions] = useState<DisplayRect[] | null>(null);
	const [positionFieldVersion, setPositionFieldVersion] = useState(0);
	const selectedMode =
		monitor.modes.find((item) => formatMode(item) === mode) ?? currentMode;
	const rotated = /^(flipped-)?(90|270)$/.test(transform);
	const geometryUnchanged =
		mode === currentResolution &&
		Number(scale) === currentScale &&
		transform === currentTransform;
	const draftOutputs = outputs.map((output) =>
		output.name !== monitor.name
			? output
			: enabled && geometryUnchanged && monitor.logical
				? output
				: {
						...output,
						logical:
							enabled && selectedMode
								? {
										x: monitor.logical?.x ?? 0,
										y: monitor.logical?.y ?? 0,
										width: Math.round(
											(rotated ? selectedMode.height : selectedMode.width) /
												Number(scale),
										),
										height: Math.round(
											(rotated ? selectedMode.width : selectedMode.height) /
												Number(scale),
										),
										scale: Number(scale),
										transform,
									}
								: null,
					},
	);
	const position =
		positions?.find((rect) => rect.name === monitor.name) ?? monitor.logical;
	const openPosition = () => {
		// Restore the coordinate item after choosing the navigation option, even
		// when the editor is dismissed without selecting a new arrangement.
		setPositionFieldVersion((version) => version + 1);
		push(
			<MonitorPosition
				layout={positions ?? outputLayout(draftOutputs)}
				selected={monitor.name}
				onChoose={setPositions}
			/>,
		);
	};

	const saveConfig = async (values: Form.Values) => {
		const formValues = values as unknown as FormValues;

		const confirmed = await confirmAlert({
			title: "Save to Niri Config?",
			message:
				"This writes directly to your niri config file, so it persists across restarts. For a one-off change that resets on reboot, go back and use the quick actions instead.",
			primaryAction: {
				title: "Save",
				style: Alert.ActionStyle.Default,
			},
		});

		if (!confirmed) return;

		const updates: Record<string, Partial<OutputConfigUpdate>> = {};
		for (const rect of positions ?? [])
			updates[rect.name] = { position: { x: rect.x, y: rect.y } };
		updates[monitor.name] = {
			...updates[monitor.name],
			enabled: canToggle ? (formValues.enabled ?? true) : true,
			mode: formValues.mode,
			scale: parseFloat(formValues.scale),
			transform: formValues.transform,
		};
		const success = await upsertOutputConfigs(updates);

		if (success) {
			showSuccess(`Saved config for ${monitor.name}`);
			if (onRefresh) {
				// Allow Niri's config watcher to process the file change before reloading outputs usually takes ~200ms, so we wait a bit longer to be safe.
				await new Promise((resolve) => setTimeout(resolve, 400));
				await onRefresh();
			}
			pop();
		}
	};

	return (
		<Form
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Save to Niri Config"
						onSubmit={saveConfig}
					/>
					{enabled && (
						<Action
							title="Set Position"
							icon={Icon.Monitor}
							shortcut={{ modifiers: ["cmd"], key: "p" }}
							onAction={openPosition}
						/>
					)}
				</ActionPanel>
			}
		>
			<Form.Description
				title="Monitor Name"
				text={`${monitor.make} ${monitor.model}`}
			/>
			<Form.Description title="Port Name" text={monitor.name} />

			{canToggle && (
				<Form.Checkbox
					id="enabled"
					label="Monitor Enabled"
					value={enabled}
					onChange={(value) => {
						setEnabled(value);
						setPositions(null);
					}}
				/>
			)}

			<>
				<Form.Dropdown
					id="mode"
					title="Resolution"
					value={mode}
					onChange={(value) => {
						setMode(value);
						setPositions(null);
					}}
				>
					{monitor.modes.map((mode, index) => {
						const res = formatMode(mode);
						return (
							<Form.Dropdown.Item
								key={index}
								value={res}
								title={`${res}Hz${mode.is_preferred ? " (Preferred)" : ""}`}
							/>
						);
					})}
				</Form.Dropdown>

				<Form.Dropdown
					id="scale"
					title="Scale"
					value={scale}
					onChange={(value) => {
						setScale(value);
						setPositions(null);
					}}
				>
					{scaleOptions.map((scaleOption, index) => (
						<Form.Dropdown.Item
							key={index}
							value={scaleOption.toString()}
							title={`${scaleOption}x`}
						/>
					))}
				</Form.Dropdown>

				<Form.Dropdown
					id="transform"
					title="Transform"
					value={transform}
					onChange={(value) => {
						setTransform(value);
						setPositions(null);
					}}
				>
					{TRANSFORMS.map((transform, index) => (
						<Form.Dropdown.Item
							key={index}
							value={transform.value}
							title={transform.label}
						/>
					))}
				</Form.Dropdown>

				{enabled ? (
					<Form.Dropdown
						key={positionFieldVersion}
						id="position"
						title="Position"
						value="current"
						filtering={false}
						info="Coordinates in logical pixels. Choose Set Position… to arrange displays visually, or press Ctrl+P."
						onChange={(value) => {
							if (value === "edit") openPosition();
						}}
					>
						<Form.Dropdown.Item
							value="current"
							title={
								position
									? `X: ${position.x}  ·  Y: ${position.y}  —  ${positions ? "Pending save" : "Current"}`
									: "Automatic"
							}
							icon={Icon.Monitor}
						/>
						<Form.Dropdown.Item
							value="edit"
							title="Set Position…"
							icon={Icon.ArrowRight}
						/>
					</Form.Dropdown>
				) : (
					<Form.Description
						title="Position"
						text="Enable this monitor to set its position."
					/>
				)}
			</>
		</Form>
	);
}
