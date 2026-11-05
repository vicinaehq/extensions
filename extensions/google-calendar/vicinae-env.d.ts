/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Google OAuth Client ID - Client ID of your Google Cloud "Desktop app" OAuth client. */
	"googleClientId"?: string;

	/** Google OAuth Client Secret - Client secret — only needed if your Google client type requires one. */
	"googleClientSecret"?: string;

	/** Refresh Token - Refresh Token — paste one to authenticate without a browser flow. */
	"refreshToken"?: string;

	/** Default Calendar ID override - Calendar ID used when creating events (defaults to primary). */
	"defaultCalendarId"?: string;

	/** Default Event Duration - Default duration for new events. */
	"defaultEventDuration"?: "15" | "30" | "45" | "60" | "90" | "120";

	/** Send Invitations - Who receives invitation emails when an event is created. */
	"sendInvitations"?: "all" | "externalOnly" | "none";

	/** Add Signature - Append a one-line Created with Vicinae signature to the description of new events. */
	"addSignature"?: boolean;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: List Events */
	export type ListEvents = ExtensionPreferences & {
		/** Days to Show - How many days ahead to list events for. */
		"daysToShow"?: "1" | "3" | "7" | "14" | "30";

		/** Show Location - Show event locations in the list. */
		"showLocation"?: boolean;

		/** Open Action Joins Meeting - Make the open action join the attached video meeting when one exists. */
		"openCommandJoinsMeeting"?: boolean;
	}

	/** Command: List Calendars */
	export type ListCalendars = ExtensionPreferences & {
		
	}

	/** Command: Create Event */
	export type CreateEvent = ExtensionPreferences & {
		
	}

	/** Command: Create Quick Event */
	export type CreateQuickEvent = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: List Events */
	export type ListEvents = {
		
	}

	/** Command: List Calendars */
	export type ListCalendars = {
		
	}

	/** Command: Create Event */
	export type CreateEvent = {
		
	}

	/** Command: Create Quick Event */
	export type CreateQuickEvent = {
		
	}
}