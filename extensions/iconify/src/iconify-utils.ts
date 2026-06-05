import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	Clipboard,
	Color,
	environment,
	getPreferenceValues,
	Icon,
	type Image,
	showHUD,
	showToast,
	Toast,
} from "@vicinae/api";
import type {
	IconData,
	IconNameFormat,
	Preferences,
	PrimaryAction,
} from "./iconify-types";

const DEFAULT_PRIMARY_ACTION: PrimaryAction = "paste";
const DEFAULT_NAME_FORMAT: IconNameFormat = "set-name:icon-name";

export const ACTION_ORDER: PrimaryAction[] = [
	"paste",
	"copy",
	"pasteFile",
	"copyFile",
	"pasteName",
	"copyName",
	"copyURL",
	"copyDataURI",
];

export const DEFAULT_COLUMNS = 8;
export const DEFAULT_ITEMS_PER_PAGE = 800;

export const getPreferences = () => getPreferenceValues<Preferences>();

export const getPrimaryAction = () =>
	getPreferences().primaryAction ?? DEFAULT_PRIMARY_ACTION;

export const getColumnsPreference = () => {
	const value = Number.parseInt(getPreferences().columns ?? "", 10);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_COLUMNS;
};

export const getItemsPerPagePreference = () => {
	const value = Number.parseInt(getPreferences().itemsPerPage ?? "", 10);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_ITEMS_PER_PAGE;
};

export const getIconColor = (launchContext?: { hex?: string }) => {
	if (launchContext?.hex) {
		return launchContext.hex;
	}

	const { iconColor, customColor } = getPreferences();
	if (
		iconColor === "customColor" &&
		customColor &&
		/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(customColor)
	) {
		return customColor;
	}

	return "currentColor";
};

export const toSvg = (
	body: string,
	width: number,
	height: number,
	color: string,
) => {
	const resolvedBody = body.replace(/currentColor/g, color);
	return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${resolvedBody}</svg>`;
};

export const toDataUri = (svg: string) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const toSvgUrl = (setId: string, iconId: string) =>
	`https://api.iconify.design/${setId}/${iconId}.svg`;

export const iconToImage = (icon: IconData, color: string): Image => {
	const svg = toSvg(icon.body, icon.width, icon.height, color);
	return {
		source: toDataUri(svg),
		tintColor:
			icon.body.includes("currentColor") && color === "currentColor"
				? Color.PrimaryText
				: undefined,
	};
};

const toPascalCase = (value: string) =>
	value
		.split(/[-_]/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join("");

const toCamelCase = (value: string) => {
	const pascal = toPascalCase(value);
	return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : value;
};

export const formatIconName = (setId: string, iconId: string) => {
	const format = getPreferences().iconNameFormat ?? DEFAULT_NAME_FORMAT;

	switch (format) {
		case "IconName":
			return toPascalCase(iconId);
		case "icon-name":
			return iconId;
		case "set-name-icon-name":
			return `${setId.toLowerCase()}-${iconId.toLowerCase()}`;
		case "set-name/icon-name":
			return `${setId.toLowerCase()}/${iconId.toLowerCase()}`;
		case "set-name--icon-name":
			return `${setId.toLowerCase()}--${iconId.toLowerCase()}`;
		case "setNameIconName":
			return `${toCamelCase(setId)}${toPascalCase(iconId)}`;
		case "SetNameIconName":
			return `${toPascalCase(setId)}${toPascalCase(iconId)}`;
		case "<SetNameIconName />":
			return `<${toPascalCase(setId)}${toPascalCase(iconId)} />`;
		case "<set-name-icon-name />":
			return `<${setId.toLowerCase()}-${iconId.toLowerCase()} />`;
		case "i-set-name:icon-name":
			return `i-${setId.toLowerCase()}:${iconId.toLowerCase()}`;
		case "i-set-name-icon-name":
			return `i-${setId.toLowerCase()}-${iconId.toLowerCase()}`;
		case "icon-[set-name--icon-name]":
			return `icon-[${setId.toLowerCase()}--${iconId.toLowerCase()}]`;
		default:
			return `${setId}:${iconId}`;
	}
};

const ensureIconDirectory = async () => {
	const directory = path.join(environment.supportPath, "icons");
	await fsp.mkdir(directory, { recursive: true });
	return directory;
};

export const writeSvgFile = async (icon: IconData, svg: string) => {
	const directory = await ensureIconDirectory();
	const filePath = path.join(directory, `${icon.set.id}-${icon.id}.svg`);
	await fsp.writeFile(filePath, svg, "utf8");
	return filePath;
};

export const copySvgFile = async (icon: IconData, svg: string) => {
	const filePath = await writeSvgFile(icon, svg);
	await Clipboard.copy({ file: filePath });
	return filePath;
};

export const pasteSvgFile = async (icon: IconData, svg: string) => {
	const filePath = await writeSvgFile(icon, svg);
	await Clipboard.paste({ file: filePath });
	return filePath;
};

export const handleActionError = async (title: string, error: unknown) => {
	const message = error instanceof Error ? error.message : "Unknown error";
	await showToast(Toast.Style.Failure, title, message);
	return message;
};

export const notifySuccess = async (title: string, message?: string) => {
	await showToast(Toast.Style.Success, title, message);
	await showHUD(title);
};

export const getPrimaryActionIcon = (action: PrimaryAction) => {
	switch (action) {
		case "copy":
		case "copyFile":
		case "copyName":
		case "copyURL":
		case "copyDataURI":
			return Icon.CopyClipboard;
		case "paste":
		case "pasteFile":
		case "pasteName":
			return Icon.CopyClipboard;
	}
};
