export type PrimaryAction =
	| "paste"
	| "copy"
	| "pasteFile"
	| "copyFile"
	| "pasteName"
	| "copyName"
	| "copyURL"
	| "copyDataURI";

export type IconColorPreference = "currentColor" | "customColor";

export type IconNameFormat =
	| "IconName"
	| "icon-name"
	| "set-name:icon-name"
	| "set-name-icon-name"
	| "set-name/icon-name"
	| "set-name--icon-name"
	| "setNameIconName"
	| "SetNameIconName"
	| "<SetNameIconName />"
	| "<set-name-icon-name />"
	| "i-set-name:icon-name"
	| "i-set-name-icon-name"
	| "icon-[set-name--icon-name]";

export type Preferences = {
	primaryAction?: PrimaryAction;
	iconColor?: IconColorPreference;
	customColor?: string;
	iconNameFormat?: IconNameFormat;
	columns?: string;
	itemsPerPage?: string;
};

export type IconSetResponse = {
	name: string;
	category?: string;
	hidden?: boolean;
};

export type IconSet = {
	id: string;
	name: string;
	category: string;
};

export type IconResponse = {
	prefix: string;
	icons: Record<string, { body: string }>;
	width: number;
	height: number;
};

export type IconData = {
	set: {
		id: string;
		title: string;
	};
	id: string;
	width: number;
	height: number;
	body: string;
};

export type IconSearchResponse = {
	icons: string[];
	collections: Record<string, IconSetResponse>;
};
