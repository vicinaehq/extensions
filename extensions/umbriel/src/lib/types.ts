export interface OutputMode {
	width: number;
	height: number;
	refresh_mhz: number;
	preferred: boolean;
	current: boolean;
}

export interface OutputSize {
	width: number;
	height: number;
}

export interface OutputPosition {
	x: number;
	y: number;
}

export interface OutputArea extends OutputPosition, OutputSize {}

export interface DirectScanoutWindow {
	id: string;
	app_id: string;
	title: string;
}

export interface DirectScanout {
	active: boolean;
	reason: string | null;
	window: DirectScanoutWindow | null;
	commits: number;
	scanout_commits: number;
	commit_seq: number;
}

export interface Output {
	name: string;
	description: string;
	make: string;
	model: string;
	serial: string;
	config_name: string | null;
	physical_size: { width_mm: number; height_mm: number };
	enabled: boolean;
	powered: boolean;
	focused: boolean;
	active_workspace: string;
	position: OutputPosition;
	logical_size: OutputSize;
	usable_area: OutputArea;
	transform: string;
	scale: number;
	adaptive_sync: string | null;
	hdr_active: boolean;
	direct_scanout: DirectScanout | null;
	modes: OutputMode[];
}

export interface Window {
	id: string;
	title: string;
	app_id: string;
	pid: number;
	workspace: string;
	output: string;
	scratchpad: string;
	x: number;
	y: number;
	w: number;
	h: number;
	column: number;
	row: number;
	active: boolean;
	focused: boolean;
	floating: boolean;
	fullscreen: boolean;
	maximized: boolean;
	maximized_to_edges: boolean;
	minimizable: boolean;
	minimized: boolean;
	pinned: boolean;
	tabbed: boolean;
	tab_hidden: boolean;
	visible: boolean;
	urgent: boolean;
	title_bar: boolean;
	xwayland: boolean;
	region: string | null;
	parent: string;
	tab_index: number;
	content_type: string;
	xdg_tag: string;
}

export interface Workspace {
	id: string;
	name: string;
	named: boolean;
	index: number;
	output: string;
	layout: string;
	layout_override: boolean;
	occupied: boolean;
	active: boolean;
	focused: boolean;
	urgent: boolean;
	window_count: number;
	focused_window: string;
}

export interface Layer {
	namespace: string;
	output: string;
	layer: string;
	keyboard_interactivity: string;
	mapped: boolean;
	focused: boolean;
	pid: number;
	exclusive_zone: number;
	anchor: string[];
	margin: { top: number; right: number; bottom: number; left: number };
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface KeyboardLayouts {
	current_index: number;
	names: string[];
}

export interface Scratchpad {
	name: string;
}

export interface Keybind {
	/** Key combination as written in the config, including any submap prefix. */
	combo: string;
	/** Key combination without the submap prefix. */
	keys: string;
	modifiers: string[];
	key: string;
	submap: string | null;
	/** Submap transition applied after the action. */
	transition: string | null;
	action: string;
	actionName: string;
	args: string;
	repeat: boolean;
	cooldownMs: number | null;
	allowWhenLocked: boolean;
	allowWhenInhibited: boolean;
	source: string;
	line: number;
	text: string;
}

export interface ActionSection {
	title: string;
	actions: string[];
}

export interface ActionCatalog {
	sections: ActionSection[];
	byAction: Map<string, string>;
}
