/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Terminal - Terminal to open ssh in, empty is the default one. You can also use a custom command, for instance `kitty -1 kitten` */
	"terminal": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: SSH */
	export type Ssh = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: SSH */
	export type Ssh = {
		
	}
}