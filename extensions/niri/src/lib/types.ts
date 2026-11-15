export interface Keybind {
  /** Key combination exactly as written in the config, e.g. `Mod+Shift+Slash`. */
  combo: string;
  modifiers: string[];
  key: string;
  action: string;
  args: string[];
  overlayTitle: string | null;
  /** Set through `hotkey-overlay-title=null`. */
  hiddenFromOverlay: boolean;
  repeat: boolean;
  cooldownMs: number | null;
  allowWhenLocked: boolean;
  allowInhibiting: boolean;
  /** Config file the bind was declared in, which may be an included file. */
  source: string;
  line: number;
  text: string;
}

export interface Layer {
  namespace: string;
  output: string;
  layer: string;
  keyboard_interactivity: string;
}

interface OutputMode {
  width: number;
  height: number;
  refresh_rate: number;
  is_preferred: boolean;
}

export interface Output {
  name: string;
  make: string;
  model: string;
  serial: string;
  physical_size: [number, number];
  modes: OutputMode[];
  current_mode: number;
  vrr_supported: boolean;
  vrr_enabled: boolean;
  logical: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    transform: string;
  };
}

export interface Window {
  id: number;
  title: string;
  app_id: string;
  pid: number;
  workspace_id: number;
  is_focused: boolean;
  is_floating: boolean;
  is_urgent: boolean;
  focus_timestamp: {
    secs: number;
    nanos: number;
  } | null;
}

export interface Workspace {
  id: number;
  idx: number;
  name: string | null;
  output: string;
  is_urgent: boolean;
  is_active: boolean;
  is_focused: boolean;
  active_window_id: number | null;
}
