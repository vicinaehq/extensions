import {
	Action,
	ActionPanel,
	Icon,
	List,
	openExtensionPreferences,
	showToast,
	Toast,
} from "@vicinae/api";
import { useState } from "react";
import {
	BinError,
	type Gpu,
	loadSnapshot,
	setGpuBlocked,
	setMode,
} from "./cardwire";
import { GpuSection, ModeSection } from "./list-sections";
import { modeTitle } from "./presentation";
import { RefreshAction } from "./refresh-action";

type ViewState =
	| { kind: "loading" }
	| { kind: "missing-cli"; message: string }
	| { kind: "error"; message: string }
	| {
			kind: "ready";
			current: string;
			available: string[];
			gpus: Gpu[];
	  };

async function refreshSnapshot(
	setState: (state: ViewState) => void,
): Promise<void> {
	try {
		const snapshot = await loadSnapshot();
		setState({ kind: "ready", ...snapshot });
	} catch (error) {
		if (error instanceof BinError && error.kind === "missing-cli") {
			setState({ kind: "missing-cli", message: error.message });
			return;
		}
		setState({
			kind: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

export default function SetCardwireState() {
	const [state, setState] = useState<ViewState>({ kind: "loading" });
	const [reload] = useState(() => {
		const run = () => refreshSnapshot(setState);
		void run();
		return run;
	});

	const handleSetMode = async (mode: string) => {
		if (state.kind !== "ready") {
			return;
		}
		const title = modeTitle(mode);
		if (mode === state.current) {
			await showToast({ title: `Already ${title}` });
			return;
		}

		const toast = await showToast({
			style: Toast.Style.Animated,
			title: `Switching to ${title}`,
		});
		try {
			await setMode(mode);
			toast.style = Toast.Style.Success;
			toast.title = `Now ${title}`;
			await reload();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Failed to set mode";
			toast.message = error instanceof Error ? error.message : String(error);
		}
	};

	const handleSetGpuBlocked = async (gpu: Gpu, blocked: boolean) => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: blocked ? `Blocking ${gpu.name}` : `Unblocking ${gpu.name}`,
		});
		try {
			await setGpuBlocked(gpu.id, blocked);
			toast.style = Toast.Style.Success;
			toast.title = blocked ? `Blocked ${gpu.name}` : `Unblocked ${gpu.name}`;
			await reload();
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = blocked ? "Failed to block GPU" : "Failed to unblock GPU";
			toast.message = error instanceof Error ? error.message : String(error);
		}
	};

	return (
		<List
			isLoading={state.kind === "loading"}
			searchBarPlaceholder="Search GPU modes"
			navigationTitle={
				state.kind === "ready"
					? `Mode: ${modeTitle(state.current)}`
					: "Cardwire"
			}
		>
			{state.kind === "missing-cli" ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="cardwire not found"
					description={state.message}
					actions={
						<ActionPanel>
							<Action
								title="Open extension preferences"
								icon={Icon.Cog}
								onAction={openExtensionPreferences}
							/>
						</ActionPanel>
					}
				/>
			) : null}

			{state.kind === "error" ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Could not read Cardwire state"
					description={state.message}
					actions={
						<ActionPanel>
							<RefreshAction onReload={reload} />
						</ActionPanel>
					}
				/>
			) : null}

			{state.kind === "ready" ? (
				<>
					<ModeSection
						current={state.current}
						available={state.available}
						onSetMode={handleSetMode}
						onReload={reload}
					/>
					<GpuSection
						currentMode={state.current}
						gpus={state.gpus}
						onSetBlocked={handleSetGpuBlocked}
						onReload={reload}
					/>
				</>
			) : null}
		</List>
	);
}
