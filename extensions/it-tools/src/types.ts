/**
 * Type definitions for IT Tools extension
 */

export interface ITTool {
	name: string;
	description: string;
	href: string;
	path: string;
	icon?: string;
}

/**
 * Preference values for the IT Tools extension
 */
export interface PreferenceValues {
	"base-url": string;
}
