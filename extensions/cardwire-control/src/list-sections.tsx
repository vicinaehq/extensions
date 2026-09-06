import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import type { Gpu } from "./parse";
import { gpuAccessories, modePresentation } from "./presentation";
import { RefreshAction } from "./refresh-action";

export function ModeSection({
	current,
	available,
	onSetMode,
	onReload,
}: {
	current: string;
	available: string[];
	onSetMode: (mode: string) => void;
	onReload: () => void;
}) {
	return (
		<List.Section title="Modes">
			{available.map((mode) => {
				const active = mode === current;
				const presentation = modePresentation(mode);
				return (
					<List.Item
						key={mode}
						id={mode}
						title={presentation.title}
						subtitle={presentation.subtitle}
						icon={active ? Icon.Checkmark : presentation.icon}
						keywords={[mode, presentation.subtitle]}
						accessories={
							active ? [{ tag: { value: "Active", color: Color.Green } }] : []
						}
						actions={
							<ActionPanel>
								<Action
									title={
										active
											? `Already ${presentation.title}`
											: `Switch to ${presentation.title}`
									}
									icon={active ? Icon.Checkmark : Icon.ComputerChip}
									onAction={() => onSetMode(mode)}
								/>
								<RefreshAction onReload={onReload} />
							</ActionPanel>
						}
					/>
				);
			})}
		</List.Section>
	);
}

export function GpuSection({
	currentMode,
	gpus,
	onSetBlocked,
	onReload,
}: {
	currentMode: string;
	gpus: Gpu[];
	onSetBlocked: (gpu: Gpu, blocked: boolean) => void;
	onReload: () => void;
}) {
	return (
		<List.Section title="GPUs">
			{gpus.map((gpu) => (
				<List.Item
					key={gpu.id}
					id={`gpu-${gpu.id}`}
					title={gpu.name}
					subtitle={gpu.pci}
					icon={gpu.discrete ? Icon.Bolt : Icon.ComputerChip}
					keywords={[gpu.vendor, gpu.driver, gpu.pci, String(gpu.id)]}
					accessories={gpuAccessories(gpu)}
					actions={
						<ActionPanel>
							{currentMode === "manual" ? (
								<Action
									title={gpu.blocked ? "Unblock GPU" : "Block GPU"}
									icon={gpu.blocked ? Icon.LockUnlocked : Icon.Lock}
									onAction={() => onSetBlocked(gpu, !gpu.blocked)}
								/>
							) : null}
							<Action.CopyToClipboard
								title="Copy PCI address"
								content={gpu.pci}
							/>
							<RefreshAction onReload={onReload} />
						</ActionPanel>
					}
				/>
			))}
		</List.Section>
	);
}
