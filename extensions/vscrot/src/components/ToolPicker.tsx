import { Action, ActionPanel, Icon, List, pop } from "@vicinae/api";
import type { CaptureBackend } from "../backends/types";
import type { AnnotatorBackend } from "../annotators/types";

interface BackendPickerProps {
	available: CaptureBackend[];
	currentId: string | null;
	onSelect: (id: string) => void;
}

export function BackendPicker({
	available,
	currentId,
	onSelect,
}: BackendPickerProps) {
	return (
		<List
			navigationTitle="Select Capture Tool"
			searchBarPlaceholder="Filter tools..."
		>
			{available.map((backend) => (
				<List.Item
					key={backend.id}
					icon={backend.id === currentId ? Icon.CheckCircle : Icon.Circle}
					title={backend.displayName}
					subtitle={backend.supportedModes.join(" · ")}
					actions={
						<ActionPanel>
							<Action
								title="Use This Tool"
								onAction={() => {
									onSelect(backend.id);
									pop();
								}}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}

interface AnnotatorPickerProps {
	available: AnnotatorBackend[];
	currentId: string | null;
	onSelect: (id: string) => void;
}

export function AnnotatorPicker({
	available,
	currentId,
	onSelect,
}: AnnotatorPickerProps) {
	return (
		<List
			navigationTitle="Select Annotation Tool"
			searchBarPlaceholder="Filter tools..."
		>
			<List.Item
				key="none"
				icon={currentId === "none" ? Icon.CheckCircle : Icon.Circle}
				title="None"
				subtitle="Disable annotation"
				actions={
					<ActionPanel>
						<Action
							title="Use This Tool"
							onAction={() => {
								onSelect("none");
								pop();
							}}
						/>
					</ActionPanel>
				}
			/>
			{available.map((annotator) => (
				<List.Item
					key={annotator.id}
					icon={annotator.id === currentId ? Icon.CheckCircle : Icon.Circle}
					title={annotator.displayName}
					subtitle={annotator.mode === "auto" ? "Auto-reload" : "Manual save"}
					actions={
						<ActionPanel>
							<Action
								title="Use This Tool"
								onAction={() => {
									onSelect(annotator.id);
									pop();
								}}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
