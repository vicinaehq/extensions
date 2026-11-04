import {
	Action,
	ActionPanel,
	Form,
	Icon,
	List,
	closeMainWindow,
	sendDesktopNotification,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import type {
	ActiveMirrorSession,
	Flip,
	MirrorOptions,
	Output,
	Rotation,
	ScalingMode,
} from "./types";
import {
	cancelScreenMirror,
	getActiveMirrorSession,
	getDisplayOutputs,
	handleError,
	isSlurpInstalled,
	isWlMirrorInstalled,
	isWlrRandrInstalled,
	loadFormState,
	loadMirrorOptions,
	parseRegionOutput,
	pickRegionWithSlurp,
	relaunchCurrentCommand,
	saveFormState,
	saveMirrorOptions,
	startScreenMirror,
	validateRegion,
} from "./utils";
import HandleMissingRequirements from "./handle-missing-requirements";
import ActiveMirrorUi from "./active-mirror-ui";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function MirrorScreen() {
	const [isWlrRandrFound, setIsWlrRandrFound] = useState(true);
	const [isWlMirrorFound, setIsWlMirrorFound] = useState(true);
	const [loading, setLoading] = useState(false);
	const navigation = useNavigation();
	const [outputs, setOutputs] = useState<Output[]>();
	const [selectedSource, setSelectedSource] = useState<string>("");
	const [selectedTarget, setSelectedTarget] = useState<string>("");
	const [activeMirror, setActiveMirror] = useState<ActiveMirrorSession | null>(
		null,
	);

	const [scaling, setScaling] = useState<ScalingMode>("fit");
	const [rotation, setRotation] = useState<Rotation>("none");
	const [flip, setFlip] = useState<Flip>("none");
	const [showCursor, setShowCursor] = useState(true);
	const [region, setRegion] = useState("");
	const [optionsLoaded, setOptionsLoaded] = useState(false);

	const loadOutputs = async () => {
		setLoading(true);

		try {
			const wlrRandrFound = await isWlrRandrInstalled();
			setIsWlrRandrFound(wlrRandrFound);
			if (!wlrRandrFound) {
				return;
			}

			const wlMirrorFound = await isWlMirrorInstalled();
			setIsWlMirrorFound(wlMirrorFound);
			if (!wlMirrorFound) {
				return;
			}

			const session = await getActiveMirrorSession();
			setActiveMirror(session);

			const data = await getDisplayOutputs();
			setOutputs(data);

			const enabled = data.filter((output) => output.enabled !== false);
			if (enabled.length >= 2) {
				const savedFormState = await loadFormState();

				if (savedFormState) {
					setScaling(savedFormState.options.scaling);
					setRotation(savedFormState.options.rotation);
					setFlip(savedFormState.options.flip);
					setShowCursor(savedFormState.options.showCursor);
					setRegion(savedFormState.options.region);
				}

				const restoredSource =
					savedFormState?.source &&
					enabled.some((d) => d.name === savedFormState.source)
						? savedFormState.source
						: undefined;
				const restoredTarget =
					savedFormState?.target &&
					enabled.some((d) => d.name === savedFormState.target)
						? savedFormState.target
						: undefined;

				if (session?.source) {
					setSelectedSource(session.source);
				} else if (restoredSource) {
					setSelectedSource(restoredSource);
				} else {
					setSelectedSource((prev) =>
						prev && enabled.some((d) => d.name === prev)
							? prev
							: enabled[0].name,
					);
				}

				if (session?.target) {
					setSelectedTarget(session.target);
				} else if (restoredTarget) {
					setSelectedTarget(restoredTarget);
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
		} catch (error) {
			handleError("Failed to detect display outputs.", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const saved = await loadMirrorOptions();
			if (cancelled) return;
			// Only the cursor preference is restored on a normal open.
			setShowCursor(saved.showCursor);
			setOptionsLoaded(true);
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		loadOutputs();

		const interval = setInterval(async () => {
			const session = await getActiveMirrorSession();
			setActiveMirror((prev) => {
				if (
					prev?.source !== session?.source ||
					prev?.target !== session?.target ||
					prev?.pid !== session?.pid ||
					JSON.stringify(prev?.options) !== JSON.stringify(session?.options)
				) {
					return session;
				}
				return prev;
			});
		}, 1500);

		return () => clearInterval(interval);
	}, []);

	const enabledDisplays = outputs?.filter((output) => output.enabled !== false);
	const hasEnoughDisplays = enabledDisplays && enabledDisplays.length > 1;
	const regionOutput = parseRegionOutput(region);

	useEffect(() => {
		const output = parseRegionOutput(region);
		if (!output) return;

		setSelectedSource(output);
		const enabled = outputs?.filter((item) => item.enabled !== false) ?? [];
		if (enabled.length > 1) {
			setSelectedTarget((prev) => {
				if (prev !== output) return prev;
				return enabled.find((item) => item.name !== output)?.name ?? prev;
			});
		}
	}, [region, outputs]);

	const getCurrentOptions = (): MirrorOptions => ({
		scaling,
		rotation,
		flip,
		showCursor,
		region,
	});

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

		// When a region is selected, the region defines the source output.
		if (region) return;

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

	const handlePickRegion = async () => {
		if (!(await isSlurpInstalled())) {
			navigation.push(
				<HandleMissingRequirements
					reason="slurp-not-found"
					onRefresh={async () => {
						if (await isSlurpInstalled()) {
							navigation.pop();
						} else {
							showToast({
								style: Toast.Style.Failure,
								title: "slurp is still not installed",
							});
						}
					}}
				/>,
			);
			return;
		}

		const options = getCurrentOptions();
		await saveMirrorOptions(options);
		await saveFormState({
			source: selectedSource,
			target: selectedTarget,
			options,
		});
		await closeMainWindow();
		await sleep(200);

		try {
			const picked = await pickRegionWithSlurp();
			const regionError = validateRegion(picked);
			if (regionError) {
				throw new Error(regionError);
			}

			const nextOptions = { ...options, region: picked };
			await saveMirrorOptions(nextOptions);
			await saveFormState({
				source: selectedSource,
				target: selectedTarget,
				options: nextOptions,
			});
			const relaunched = await relaunchCurrentCommand("mirror-screen");
			if (!relaunched) {
				await sendDesktopNotification({
					title: "Region selected",
					body: `Reopen Screen Mirror to use ${picked}`,
				});
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Region selection cancelled.";
			const cancelled = /cancel/i.test(message);

			if (!cancelled) {
				await sendDesktopNotification({
					title: "Region selection failed",
					body: message,
				});
			}

			await relaunchCurrentCommand("mirror-screen");
		}
	};

	const handleClearRegion = async () => {
		setRegion("");
		await saveMirrorOptions({ ...getCurrentOptions(), region: "" });
	};

	const handleSubmit = async (values: Form.Values) => {
		if (activeMirror) {
			await cancelScreenMirror(setActiveMirror);
			return;
		}

		const source =
			regionOutput ||
			selectedSource ||
			(values.source as string) ||
			(enabledDisplays?.[0]?.name as string);
		const target = selectedTarget || (values.target as string);

		if (!source) {
			showToast({
				style: Toast.Style.Failure,
				title: "Source monitor is required.",
			});
			return;
		}

		if (!target) {
			showToast({
				style: Toast.Style.Failure,
				title: "Target monitor is required.",
			});
			return;
		}

		if (source === target) {
			showToast({
				style: Toast.Style.Failure,
				title: "Source and destination cannot be the same.",
			});
			return;
		}

		const regionError = validateRegion(region);
		if (regionError) {
			showToast({
				style: Toast.Style.Failure,
				title: "Invalid region.",
				message: regionError,
			});
			return;
		}

		const options: MirrorOptions = {
			scaling,
			rotation,
			flip,
			showCursor,
			region,
		};

		await startScreenMirror({
			source,
			target,
			options,
			setActiveMirror,
		});
	};

	if ((loading && !outputs) || !optionsLoaded) {
		return (
			<List isLoading={true}>
				<List.EmptyView
					icon={Icon.Monitor}
					title="Detecting Monitors"
					description="Loading active monitor outputs..."
				/>
			</List>
		);
	}

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

	if (activeMirror) {
		return (
			<ActiveMirrorUi
				outputs={outputs}
				activeMirror={activeMirror}
				setActiveMirror={setActiveMirror}
			/>
		);
	}

	if (!hasEnoughDisplays) {
		return (
			<HandleMissingRequirements
				reason="monitors-req-not-met"
				onRefresh={loadOutputs}
				detectedMonitors={enabledDisplays?.length ?? 0}
			/>
		);
	}

	const regionDropdownValue = region ? "current" : "full";

	return (
		<Form
			isLoading={loading}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Start Screen Mirror"
						style={Action.Style.Regular}
						shortcut={{ modifiers: ["ctrl"], key: "enter" }}
						onSubmit={handleSubmit}
					/>
					<Action
						title="Select Region on Screen"
						icon={Icon.Crop}
						shortcut={{ modifiers: ["ctrl"], key: "r" }}
						onAction={handlePickRegion}
					/>
					{region && (
						<Action
							title="Clear Region"
							icon={Icon.XMarkCircle}
							shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
							onAction={handleClearRegion}
						/>
					)}
				</ActionPanel>
			}
		>
			{!region && (
				<Form.Dropdown
					id="source"
					title="Source Monitor"
					value={selectedSource}
					onChange={handleSourceChange}
				>
					{enabledDisplays.map((output) => {
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
			)}

			{region && (
				<Form.Description
					title="Source Monitor"
					text={
						regionOutput
							? `Region on ${regionOutput}`
							: "Determined by the selected region"
					}
				/>
			)}

			<Form.Dropdown
				id="target"
				title="Target Monitor"
				value={selectedTarget}
				onChange={handleTargetChange}
			>
				{enabledDisplays.map((output) => {
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

			<Form.Checkbox
				id="showCursor"
				title="Cursor"
				label="Show cursor on the mirrored screen"
				value={showCursor}
				onChange={setShowCursor}
			/>

			<Form.Separator />

			<Form.Dropdown
				id="region"
				title="Capture"
				value={regionDropdownValue}
				onChange={(value) => {
					if (value === "pick") {
						void handlePickRegion();
						return;
					}
					if (value === "full") {
						void handleClearRegion();
					}
				}}
			>
				<Form.Dropdown.Item title="Fullscreen" value="full" />
				{region && (
					<Form.Dropdown.Item
						title={`Selected region: ${region}`}
						value="current"
						icon={Icon.Crop}
					/>
				)}
				<Form.Dropdown.Item
					title={
						region
							? "Select a different region on screen…"
							: "Select region on screen…"
					}
					value="pick"
					icon={Icon.Crop}
				/>
			</Form.Dropdown>

			<Form.Dropdown
				id="scaling"
				title="Scaling"
				value={scaling}
				onChange={(value) => setScaling(value as ScalingMode)}
			>
				<Form.Dropdown.Item title="Fit (preserve aspect ratio)" value="fit" />
				<Form.Dropdown.Item title="Cover (crop to fill)" value="cover" />
				<Form.Dropdown.Item
					title="Exact (crisp pixels, may add black bars)"
					value="exact"
				/>
			</Form.Dropdown>

			<Form.Dropdown
				id="rotation"
				title="Rotation"
				value={rotation}
				onChange={(value) => setRotation(value as Rotation)}
			>
				<Form.Dropdown.Item title="None" value="none" />
				<Form.Dropdown.Item title="90° clockwise" value="90cw" />
				<Form.Dropdown.Item title="180°" value="180cw" />
				<Form.Dropdown.Item title="270° clockwise" value="270cw" />
			</Form.Dropdown>

			<Form.Dropdown
				id="flip"
				title="Flip"
				value={flip}
				onChange={(value) => setFlip(value as Flip)}
			>
				<Form.Dropdown.Item title="None" value="none" />
				<Form.Dropdown.Item title="Horizontal (flipX)" value="flipX" />
				<Form.Dropdown.Item title="Vertical (flipY)" value="flipY" />
			</Form.Dropdown>
		</Form>
	);
}
