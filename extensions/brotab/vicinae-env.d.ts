/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Brotab Path - The absolute path to your Brotab executable */
  brotabPath?: string;
};

declare type Preferences = ExtensionPreferences;

declare namespace Preferences {
  /** Command: List Open Tabs */
  export type TabsList = ExtensionPreferences & {};
}

declare namespace Arguments {
  /** Command: List Open Tabs */
  export type TabsList = {};
}
