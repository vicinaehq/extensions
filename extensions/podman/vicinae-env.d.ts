/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Default Connection - Podman system connection to use on first launch (see `podman system connection list`). Leave empty to use podman's default. */
	"defaultConnection": string;

	/** Podman Binary - Path to the podman executable. Leave empty to search PATH and common install locations (Homebrew, /opt/podman/bin, /usr/local/bin). */
	"podmanPath": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Containers */
	export type Containers = ExtensionPreferences & {
		
	}

	/** Command: Images */
	export type Images = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Containers */
	export type Containers = {
		
	}

	/** Command: Images */
	export type Images = {
		
	}
}