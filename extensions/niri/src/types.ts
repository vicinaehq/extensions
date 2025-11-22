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
