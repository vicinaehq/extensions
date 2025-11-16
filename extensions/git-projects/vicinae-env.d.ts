/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Projects Path - The absolute path to your Git projects root directory */
	"projectsPath"?: string;

	/** Search Depth - The depth of directory traversal when searching for Git projects */
	"projectsDepth": string;

	/** Code Editor Program - The program used to open your code editor (e.g., 'code' for VSCode, 'subl' for Sublime Text) */
	"editorProgram": "code" | "zed";

	/** Terminal Program - The program used to open your terminal (e.g., 'gnome-terminal', 'iTerm') */
	"terminalProgram": "gnome-terminal" | "ghostty" | "ptyxis";
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Open Project */
	export type Open = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Open Project */
	export type Open = {
		
	}
}