import { Icon } from "@vicinae/api";

export interface GnomePanel {
	name: string;
	displayName: string;
	description: string;
	icon: Icon;
	keywords: string[];
}

export const gnomePanels: GnomePanel[] = [
	{
		name: "applications",
		displayName: "Applications",
		description: "Manage installed applications and default apps",
		icon: Icon.AppWindow,
		keywords: ["apps", "software", "default", "uninstall", "install"],
	},
	{
		name: "background",
		displayName: "Background",
		description: "Change desktop background and lock screen",
		icon: Icon.Image,
		keywords: ["wallpaper", "desktop", "lock screen", "slideshow"],
	},
	{
		name: "bluetooth",
		displayName: "Bluetooth",
		description: "Configure Bluetooth devices and connections",
		icon: Icon.Bluetooth,
		keywords: ["wireless", "devices", "pair", "connect"],
	},
	{
		name: "color",
		displayName: "Color",
		description: "Manage color profiles and display calibration",
		icon: Icon.BullsEye,
		keywords: ["calibration", "profiles", "display", "color"],
	},
	{
		name: "display",
		displayName: "Display",
		description: "Configure screen resolution, scaling, and arrangement",
		icon: Icon.Monitor,
		keywords: ["resolution", "scaling", "monitor", "screen", "arrangement"],
	},
	{
		name: "keyboard",
		displayName: "Keyboard",
		description: "Configure keyboard layout, shortcuts, and typing",
		icon: Icon.Keyboard,
		keywords: ["layout", "shortcuts", "typing", "input", "hotkeys"],
	},
	{
		name: "mouse",
		displayName: "Mouse & Touchpad",
		description: "Configure mouse and touchpad settings",
		icon: Icon.Mouse,
		keywords: ["touchpad", "pointer", "click", "scroll", "gestures"],
	},
	{
		name: "multitasking",
		displayName: "Multitasking",
		description: "Configure workspace and window management",
		icon: Icon.AppWindowGrid3x3,
		keywords: ["workspace", "windows", "hot corner", "overview"],
	},
	{
		name: "network",
		displayName: "Network",
		description: "Configure network connections and settings",
		icon: Icon.Network,
		keywords: ["wifi", "ethernet", "vpn", "proxy", "connection"],
	},
	{
		name: "wifi",
		displayName: "Wi-Fi",
		description: "Manage Wi-Fi connections and settings",
		icon: Icon.Wifi,
		keywords: ["wireless", "connection", "password", "hotspot"],
	},
	{
		name: "notifications",
		displayName: "Notifications",
		description: "Configure notification settings and do not disturb",
		icon: Icon.Bell,
		keywords: ["alerts", "do not disturb", "banner", "lock screen"],
	},
	{
		name: "online-accounts",
		displayName: "Online Accounts",
		description: "Manage online accounts and cloud services",
		icon: Icon.Person,
		keywords: ["google", "microsoft", "cloud", "sync", "calendar"],
	},
	{
		name: "power",
		displayName: "Power",
		description: "Configure power management and battery settings",
		icon: Icon.Battery,
		keywords: ["battery", "sleep", "suspend", "power button", "energy"],
	},
	{
		name: "printers",
		displayName: "Printers",
		description: "Manage printers and printing settings",
		icon: Icon.Print,
		keywords: ["printing", "scanner", "driver", "queue"],
	},
	{
		name: "privacy",
		displayName: "Privacy",
		description: "Configure privacy settings and location services",
		icon: Icon.Lock,
		keywords: ["location", "camera", "microphone", "usage", "data"],
	},
	{
		name: "search",
		displayName: "Search",
		description: "Configure search settings and file indexing",
		icon: Icon.MagnifyingGlass,
		keywords: ["files", "indexing", "tracker", "find", "locate"],
	},
	{
		name: "sharing",
		displayName: "Sharing",
		description: "Configure file and screen sharing settings",
		icon: Icon.EditShape,
		keywords: ["files", "screen", "remote", "vnc", "samba"],
	},
	{
		name: "sound",
		displayName: "Sound",
		description: "Configure audio devices and sound settings",
		icon: Icon.SpeakerHigh,
		keywords: ["audio", "volume", "microphone", "speakers", "headphones"],
	},
	{
		name: "system",
		displayName: "System",
		description: "System information and general settings",
		icon: Icon.Gear,
		keywords: ["info", "about", "language", "region", "date"],
	},
	{
		name: "universal-access",
		displayName: "Universal Access",
		description: "Accessibility features and assistive technologies",
		icon: Icon.Person,
		keywords: ["accessibility", "screen reader", "magnifier", "high contrast"],
	},
	{
		name: "wacom",
		displayName: "Wacom Tablet",
		description: "Configure Wacom graphics tablet settings",
		icon: Icon.Pencil,
		keywords: ["tablet", "stylus", "pressure", "graphics", "drawing"],
	},
	{
		name: "wellbeing",
		displayName: "Wellbeing",
		description: "Screen time and digital wellness settings",
		icon: Icon.Heart,
		keywords: ["screen time", "break", "reminder", "wellness", "usage"],
	},
	{
		name: "wwan",
		displayName: "Mobile Broadband",
		description: "Configure mobile broadband and cellular connections",
		icon: Icon.Wifi,
		keywords: ["cellular", "mobile", "broadband", "sim", "carrier"],
	},
];
