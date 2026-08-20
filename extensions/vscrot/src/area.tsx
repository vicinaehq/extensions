import { useState, useEffect } from "react";
import { Detail, closeMainWindow } from "@vicinae/api";
import { getPrefs, isNativeHandoff } from "./lib/preferences";
import { formatDateTokens } from "./lib/dateFormat";
import {
	TEMP_PATH,
	getSavePath,
	removeTempCapture,
	saveImageFile,
} from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { getAnnotator } from "./annotators";
import { resolveBackend, resolveAnnotator } from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";

export default function CaptureArea() {
	const prefs = getPrefs();
	const [lastCapture, setLastCapture] = useState<string | null>(null);
	const [finished, setFinished] = useState(false);
	const [savedPath, setSavedPath] = useState<string | null>(null);
	const [discarded, setDiscarded] = useState(false);
	const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		null,
	);

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	const capture = async (backendId: string) => {
		setFinished(false);
		const result = await captureScreenshot("area", backendId);
		if (result) {
			// In native hand-off the desktop tool owns the result: it is already
			// saved where the user wants it, so Vicinae reports rather than previews.
			if (isNativeHandoff()) {
				setSavedPath(result);
				if (prefs.autoclose_vicinae) closeMainWindow();
			} else {
				setLastCapture(result);
			}
		}
		setFinished(true);
	};

	useEffect(() => {
		Promise.all([
			resolveBackend(prefs.screenshot_tool ?? "auto", "area"),
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
		const destination = getSavePath(prefs);
		saveImageFile(lastCapture, destination);
		setSavedPath(destination);
		setLastCapture(null);
		if (prefs.autoclose_vicinae) closeMainWindow();
	};

	const handleAnnotate = async () => {
		if (!lastCapture || !activeAnnotatorId) return;
		const shouldReload = await annotateWith(lastCapture, activeAnnotatorId);
		if (shouldReload) refreshPreview();
	};

	if (!lastCapture) {
		if (discarded) {
			return <Detail markdown="## Screenshot discarded" />;
		}
		if (savedPath) {
			return (
				<Detail markdown={`## Screenshot saved\n\n\`${savedPath}\``} />
			);
		}
		return (
			<Detail
				markdown={
					finished
						? "## No screenshot captured\n\nThe selection was cancelled, or the capture tool reported an error."
						: "## Capturing...\n\nSelect the region you want to capture."
				}
			/>
		);
	}

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
			onDiscard={() => {
				removeTempCapture();
				setDiscarded(true);
				setLastCapture(null);
			}}
		/>
	);
}
