import { useState, useEffect } from "react";
import { execSync } from "node:child_process";
import { List, Action, ActionPanel, Icon, closeMainWindow } from "@vicinae/api";
import { getPrefs } from "./lib/preferences";
import { formatDateTokens } from "./lib/dateFormat";
import { TEMP_PATH, getSavePath, saveImageFile } from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { getAnnotator } from "./annotators";
import { resolveBackend, resolveAnnotator } from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";

type HyprMonitor = { name: string; description: string };
type Phase = "loading" | "selecting" | "preview";

export default function CaptureMonitor() {
	const prefs = getPrefs();
	const [phase, setPhase] = useState<Phase>("loading");
	const [monitors, setMonitors] = useState<HyprMonitor[]>([]);
	const [lastCapture, setLastCapture] = useState<string | null>(null);
	const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		null,
	);

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	useEffect(() => {
		(async () => {
			const [backend, annotator] = await Promise.all([
				resolveBackend(prefs.screenshot_tool ?? "auto"),
				resolveAnnotator(prefs.annotation_tool ?? "auto"),
			]);

			setActiveBackendId(backend?.id ?? null);
			setActiveAnnotatorId(annotator?.id ?? null);

			try {
				const parsed: Array<{ name: string; description: string }> = JSON.parse(
					execSync("hyprctl monitors -j").toString(),
				);
				if (parsed.length > 0) {
					setMonitors(
						parsed.map((m) => ({ name: m.name, description: m.description })),
					);
					setPhase("selecting");
					return;
				}
			} catch {
				// hyprctl unavailable — fall through to slurp-based capture
			}

			// No monitor list available: fall back to slurp selection in the backend
			if (backend) {
				const result = await captureScreenshot("monitor", backend.id);
				if (result) {
					setLastCapture(result);
					setPhase("preview");
				}
			}
		})();
	}, []);

	const captureByName = async (monitorName: string) => {
		if (!activeBackendId) return;
		setPhase("loading");
		const result = await captureScreenshot(
			"monitor",
			activeBackendId,
			0,
			monitorName,
		);
		if (result) {
			setLastCapture(result);
			setPhase("preview");
		}
	};

	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;
	const annotatorLabel =
		activeAnnotator && activeAnnotator.id !== "none"
			? `Annotate (${activeAnnotator.displayName})`
			: null;

	const handleSave = () => {
		if (!lastCapture) return;
		saveImageFile(lastCapture, getSavePath(prefs));
		setLastCapture(null);
		if (prefs.autoclose_vicinae) closeMainWindow();
	};

	const handleAnnotate = async () => {
		if (!lastCapture || !activeAnnotatorId) return;
		const shouldReload = await annotateWith(lastCapture, activeAnnotatorId);
		if (shouldReload) refreshPreview();
	};

	if (phase === "preview" && lastCapture) {
		return (
			<PreviewDetail
				imagePath={lastCapture}
				suggestedName={formatDateTokens(prefs.filename_format)}
				subfolder={
					prefs.subfolder_format
						? formatDateTokens(prefs.subfolder_format)
						: "Root"
				}
				annotatorLabel={annotatorLabel}
				onSave={handleSave}
				onCopy={() => copyToClipboard(lastCapture, prefs.autoclose_vicinae)}
				onAnnotate={handleAnnotate}
				onRefreshPreview={refreshPreview}
				onReshoot={() => {
					setLastCapture(null);
					setPhase("selecting");
				}}
				onDiscard={() => setLastCapture(null)}
			/>
		);
	}

	if (phase === "selecting") {
		return (
			<List searchBarPlaceholder="Select a monitor to capture...">
				{monitors.map((m) => (
					<List.Item
						key={m.name}
						icon={Icon.Monitor}
						title={m.name}
						subtitle={m.description}
						actions={
							<ActionPanel>
								<Action
									title="Capture Monitor"
									onAction={() => captureByName(m.name)}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List>
		);
	}

	return null;
}
