import { useState, useEffect, useMemo } from "react";
import { closeMainWindow } from "@vicinae/api";
import fs from "node:fs";
import { getPrefs, expandPath } from "./lib/preferences";
import { formatDateTokens } from "./lib/dateFormat";
import {
	TEMP_PATH,
	getSavePath,
	loadRecentFiles,
	saveImageFile,
} from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { getBackend } from "./backends";
import { getAnnotator } from "./annotators";
import {
	getInstalledBackends,
	getInstalledAnnotators,
	resolveBackend,
	resolveAnnotator,
	saveBackendChoice,
	saveAnnotatorChoice,
} from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";
import { CaptureList } from "./components/CaptureList";
import type { CaptureMode } from "./backends/types";

export default function Scrot() {
	const prefs = getPrefs();
	const saveDirBase = expandPath(
		prefs.screenshot_path || "~/Pictures/Screenshots",
	);

	// Detected synchronously at startup - stable across renders
	const installedBackends = useMemo(() => getInstalledBackends(), []);
	const installedAnnotators = useMemo(() => getInstalledAnnotators(), []);

	const [recentFiles, setRecentFiles] = useState<string[]>([]);
	const [lastCapture, setLastCapture] = useState<string | null>(null);

	// Sync initial guess from prefs so first render is instant, then
	// useEffect async-corrects from LocalStorage if a saved choice exists.
	const [activeBackendId, setActiveBackendId] = useState<string | null>(() => {
		const b = getBackend(prefs.screenshot_tool ?? "auto");
		return b?.isAvailable() ? b.id : (installedBackends[0]?.id ?? null);
	});
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		() => {
			const a = getAnnotator(prefs.annotation_tool ?? "auto");
			return a ? a.id : (installedAnnotators[0]?.id ?? null);
		},
	);

	const refreshRecent = () => setRecentFiles(loadRecentFiles(saveDirBase));
	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	useEffect(() => {
		refreshRecent();
		resolveBackend(prefs.screenshot_tool ?? "auto").then((b) => {
			if (b) setActiveBackendId(b.id);
		});
		resolveAnnotator(prefs.annotation_tool ?? "auto").then((a) => {
			if (a) setActiveAnnotatorId(a.id);
		});
	}, []);

	const activeBackend = activeBackendId ? getBackend(activeBackendId) : null;
	const supportedModes: CaptureMode[] = activeBackend?.supportedModes ?? [
		"area",
		"window",
		"monitor",
		"full",
	];

	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;
	const annotatorLabel =
		activeAnnotator && activeAnnotator.id !== "none"
			? `Annotate (${activeAnnotator.displayName})`
			: null;

	const capture = async (mode: CaptureMode) => {
		if (!activeBackendId) return;
		const result = await captureScreenshot(mode, activeBackendId);
		if (!result) return;

		// Auto-annotate if the preference is set and an annotator is configured
		if (prefs.use_editor && activeAnnotatorId) {
			const shouldReload = await annotateWith(result, activeAnnotatorId);
			if (shouldReload) {
				// Auto-reload tools (Satty, swappy) wrote the file back — pick it up
				// Fall through to auto-copy/save with the (now annotated) file
			}
		}

		// Auto-copy and/or auto-save if the preferences say so
		if (prefs.copy_to_clipboard) await copyToClipboard(result, false);
		if (prefs.save_to_file) {
			saveImageFile(result, getSavePath(prefs));
			refreshRecent();
		}

		// Close if autoclose is on and at least one auto-action ran
		if ((prefs.copy_to_clipboard || prefs.save_to_file) && prefs.autoclose_vicinae) {
			closeMainWindow();
			return;
		}

		setLastCapture(result);
	};

	const handleSave = () => {
		if (!lastCapture) return;
		saveImageFile(lastCapture, getSavePath(prefs));
		refreshRecent();
		setLastCapture(null);
		if (prefs.autoclose_vicinae) closeMainWindow();
	};

	const handleAnnotate = async () => {
		if (!lastCapture || !activeAnnotatorId) return;
		const shouldReload = await annotateWith(lastCapture, activeAnnotatorId);
		if (shouldReload) refreshPreview();
	};

	const handleSelectBackend = async (id: string) => {
		await saveBackendChoice(id);
		setActiveBackendId(id);
	};

	const handleSelectAnnotator = async (id: string) => {
		await saveAnnotatorChoice(id);
		setActiveAnnotatorId(id);
	};

	const handleDeleteFile = (filePath: string) => {
		fs.unlinkSync(filePath);
		refreshRecent();
	};

	if (lastCapture) {
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
					capture("area");
				}}
				onDiscard={() => setLastCapture(null)}
			/>
		);
	}

	return (
		<CaptureList
			recentFiles={recentFiles}
			supportedModes={supportedModes}
			activeBackend={activeBackend}
			activeAnnotator={activeAnnotator}
			installedBackends={installedBackends}
			installedAnnotators={installedAnnotators}
			onCapture={capture}
			onRefresh={refreshRecent}
			onCopyFile={copyToClipboard}
			onDeleteFile={handleDeleteFile}
			onSelectBackend={handleSelectBackend}
			onSelectAnnotator={handleSelectAnnotator}
		/>
	);
}
