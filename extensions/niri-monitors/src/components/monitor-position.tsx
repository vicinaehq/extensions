import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	Color,
	useNavigation,
} from "@vicinae/api";
import { useRef, useState } from "react";
import { applyMonitorLayout, readLiveLayout } from "./apply-monitor-layout";
import { handleError, showSuccess } from "../utils/global";
import {
	compactLayout,
	canMoveDisplay,
	directions,
	layoutImage,
	PositionMovement,
	outputLayout,
	type DisplayRect,
	type Direction,
} from "./monitor-layout";

interface Props {
	layout: DisplayRect[];
	selected: string;
	onChoose?: (layout: DisplayRect[]) => void;
	onRefresh?: () => Promise<void>;
}

const icons = {
	left: Icon.ArrowLeft,
	right: Icon.ArrowRight,
	up: Icon.ArrowUp,
	down: Icon.ArrowDown,
};
const movementKeys = {
	up: ["arrowUp", "k"],
	left: ["arrowLeft", "h"],
	down: ["arrowDown", "j"],
	right: ["arrowRight", "l"],
} as const;

export default function MonitorPosition({
	layout: initial,
	selected: initialSelected,
	onChoose,
	onRefresh,
}: Props) {
	const [layout, setLayout] = useState(() => compactLayout(initial));
	const preview = useRef(layout);
	const [selected, setSelected] = useState(initialSelected);
	const [busy, setBusy] = useState(false);
	const saving = useRef(false);
	const movement = useRef(new PositionMovement());
	const { pop } = useNavigation();
	const monitor = layout.find((rect) => rect.name === selected);
	// Markdown does not accept Image.tintColor. Route the mask through Vicinae's
	// native image URL provider, which resolves the same API Color token against
	// the current theme (including custom palettes and live theme changes).
	const layoutSource = `icon://datauri/${encodeURIComponent(layoutImage(layout, selected))}?fill=${encodeURIComponent(Color.PrimaryText)}`;

	const move = (direction: Direction) => {
		if (saving.current) return;
		const next = movement.current.move(preview.current, selected, direction);
		if (!next) return;
		preview.current = next.layout;
		setLayout(next.layout);
	};

	const center = () => {
		if (saving.current) return;
		const next = movement.current.center(preview.current, selected);
		if (!next) return;
		preview.current = next.layout;
		setLayout(next.layout);
	};

	const save = async () => {
		if (saving.current) return;
		saving.current = true;
		setBusy(true);
		const chosenLayout = preview.current;
		try {
			if (onChoose) {
				onChoose(chosenLayout);
				pop();
				return;
			}
			const live = outputLayout(Object.values(await readLiveLayout()));
			if (
				live.length !== initial.length ||
				initial.some(
					(rect) =>
						!live.some(
							(current) =>
								current.name === rect.name &&
								current.width === rect.width &&
								current.height === rect.height &&
								current.x === rect.x &&
								current.y === rect.y,
						),
				)
			) {
				throw new Error(
					"Displays changed. Reopen Set Position to use the current layout.",
				);
			}
			if (await applyMonitorLayout(chosenLayout, live)) {
				showSuccess("Display positions updated");
				await onRefresh?.();
				pop();
			}
		} catch (error) {
			handleError("Could not set positions", error);
		} finally {
			saving.current = false;
			setBusy(false);
		}
	};

	return (
		<Detail
			navigationTitle={`${selected} — ${busy ? "Applying Positions…" : "Set Position"}`}
			markdown={`![Display layout](${layoutSource})\n\n## ${selected}\n\n**Position:** (${monitor?.x ?? 0}, ${monitor?.y ?? 0}) · **Size:** ${monitor?.width ?? 0} × ${monitor?.height ?? 0} logical pixels\n\n${layout.length > 1 ? "Move with Shift + arrow keys or Shift + H/J/K/L.\n\nPress Shift + C to horizontally or vertically center the display." : "Connect or enable another display to rearrange this monitor."}\n\nPress Ctrl + Enter to select the display and Shift + R to reset the layout.`}
			actions={
				<ActionPanel>
					<Action
						title={onChoose ? "Use These Positions" : "Apply Positions"}
						icon={Icon.Checkmark}
						onAction={save}
					/>
					<ActionPanel.Submenu
						title="Select Display"
						icon={Icon.Monitor}
						shortcut={{ modifiers: ["ctrl"], key: "return" }}
					>
						{layout.map((rect) => (
							<Action
								key={rect.name}
								title={rect.name}
								icon={rect.name === selected ? Icon.Checkmark : Icon.Monitor}
								onAction={() => {
									if (saving.current) return;
									setSelected(rect.name);
									movement.current = new PositionMovement();
								}}
							/>
						))}
					</ActionPanel.Submenu>
					<Action
						title="Reset Preview"
						icon={Icon.ArrowCounterClockwise}
						shortcut={{ modifiers: ["shift"], key: "r" }}
						onAction={() => {
							if (!saving.current) {
								const reset = compactLayout(initial);
								movement.current = new PositionMovement();
								preview.current = reset;
								setLayout(reset);
							}
						}}
					/>
					<ActionPanel.Section title={`Move ${selected}`}>
						{canMoveDisplay(layout, selected) && (
							<Action
								title="Toggle Centering"
								icon={Icon.Monitor}
								shortcut={{ modifiers: ["shift"], key: "c" }}
								onAction={center}
							/>
						)}
						{directions.flatMap((direction) => {
							if (!canMoveDisplay(layout, selected)) return [];
							return movementKeys[direction].map((key, index) => (
								<Action
									key={key}
									title={`Move ${direction[0].toUpperCase()}${direction.slice(1)}${index ? ` (${key.toUpperCase()})` : ""}`}
									icon={icons[direction]}
									shortcut={{
										modifiers: ["shift"],
										key,
									}}
									onAction={() => move(direction)}
								/>
							));
						})}
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}
