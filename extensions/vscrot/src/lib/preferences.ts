import { getPreferenceValues } from "@vicinae/api";
import os from "node:os";

export interface Preferences {
	screenshot_path: string;
	screenshot_tool: string;
	annotation_tool: string;
	use_editor: boolean;
	copy_to_clipboard: boolean;
	save_to_file: boolean;
	subfolder_format: string;
	filename_format: string;
	autoclose_vicinae: boolean;
}

export const getPrefs = (): Preferences => getPreferenceValues<Preferences>();

export const expandPath = (p: string): string => p.replace(/^~/, os.homedir());
