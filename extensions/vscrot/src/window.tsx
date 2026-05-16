import { useState, useEffect } from "react";
import { closeMainWindow } from "@vicinae/api";
import { getPrefs } from "./lib/preferences";
import { formatDateTokens } from "./lib/dateFormat";
import { TEMP_PATH, getSavePath, saveImageFile } from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { getAnnotator } from "./annotators";
import { resolveBackend, resolveAnnotator } from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";

export default function CaptureWindow() {
	const prefs = getPrefs();
	const [lastCapture, setLastCapture] = useState<string | null>(null);
	const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		null,
	);

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	const capture = async (backendId: string) => {
		const result = await captureScreenshot("window", backendId);
		if (result) setLastCapture(result);
	};

	useEffect(() => {
		Promise.all([
			resolveBackend(prefs.screenshot_tool ?? "auto"),
			resolveAnnotator(prefs.annotation_tool ?? "auto"),
		]).then(([backend, annotator]) => {
			const bid = backend?.id ?? null;
			setActiveBackendId(bid);
			setActiveAnnotatorId(annotator?.id ?? null);
			if (bid) capture(bid);
		});
	}, []);

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

	if (!lastCapture) return null;

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
				if (activeBackendId) capture(activeBackendId);
			}}
			onDiscard={() => setLastCapture(null)}
		/>
	);
}
