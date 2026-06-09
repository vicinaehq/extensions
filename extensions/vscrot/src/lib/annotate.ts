import { exec } from "node:child_process";
import { closeMainWindow, showHUD, showToast } from "@vicinae/api";
import { getAnnotator } from "../annotators";

/**
 * Returns true if the preview should be reloaded (auto-mode annotator),
 * false if the user is saving manually or an error occurred.
 */
export const annotateWith = async (
	imagePath: string,
	toolId: string,
): Promise<boolean> => {
	const annotator = getAnnotator(toolId);
	if (!annotator || annotator.id === "none") return false;

	if (annotator.mode === "auto") {
		await closeMainWindow();
		try {
			await annotator.annotate(imagePath);
		} catch (e) {
			console.error("Annotator failed", e);
			exec("vicinae open");
			showHUD(`${annotator.displayName} failed or was cancelled`);
			return false;
		}
		exec("vicinae open");
		return true;
	}

	// Manual-save: open the editor in the background, stay in Vicinae
	try {
		annotator.annotate(imagePath);
	} catch (e) {
		console.error("Failed to launch annotator", e);
		showHUD(`Failed to open ${annotator.displayName}`);
		return false;
	}
	showToast({
		title: `Opened in ${annotator.displayName}`,
		message: "Save the file there, then use Refresh Preview to reload.",
	});
	return false;
};
