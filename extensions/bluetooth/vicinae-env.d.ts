/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Connection Toggleable - Use a single toggle action for connect/disconnect instead of separate actions */
	"connectionToggleable": boolean;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Scan */
	export type Scan = ExtensionPreferences & {
		
	}

	/** Command: Devices */
	export type Devices = ExtensionPreferences & {
		
	}

	/** Command: Discover */
	export type Discover = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Scan */
	export type Scan = {
		
	}

	/** Command: Devices */
	export type Devices = {
		
	}

	/** Command: Discover */
	export type Discover = {
		
	}
}