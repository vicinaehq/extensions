export type WorkspaceRef = {
  id: number;
  name: string;
};

export type HyprMonitor = {
  id: number;
  name: string;
  description: string;
  make?: string;
  model?: string;
  serial?: string;
  width?: number;
  height?: number;
  physicalWidth?: number;
  physicalHeight?: number;
  refreshRate?: number;
  x?: number;
  y?: number;
  activeWorkspace?: WorkspaceRef;
  specialWorkspace?: WorkspaceRef;
  reserved?: number[];
  scale?: number;
  transform?: number;
  focused?: boolean;
  dpmsStatus?: boolean;
  vrr?: boolean;
  disabled?: boolean;
  currentFormat?: string;
  mirrorOf?: string;
  availableModes?: string[];
};

export type HyprWorkspace = {
  id: number;
  name: string;
  monitor: string;
  monitorID: number;
  windows: number;
  hasfullscreen: boolean;
  lastwindow: string;
  lastwindowtitle: string;
  ispersistent: boolean;
  tiledLayout?: string;
};

export type HyprClient = {
  address: string;
  mapped: boolean;
  hidden: boolean;
  visible: boolean;
  acceptsInput: boolean;
  at: [number, number];
  size: [number, number];
  workspace: WorkspaceRef;
  floating: boolean;
  monitor: number;
  class: string;
  title: string;
  initialClass: string;
  initialTitle: string;
  pid: number;
  xwayland: boolean;
  pinned: boolean;
  fullscreen: number;
  fullscreenClient: number;
  overFullscreen: boolean;
  grouped: string[];
  tags: string[];
  swallowing: string;
  focusHistoryID: number;
  inhibitingIdle: boolean;
  xdgTag?: string;
  xdgDescription?: string;
  contentType?: string;
  stableId?: string;
};

export type HyprLayerSurface = {
  address: string;
  x: number;
  y: number;
  w: number;
  h: number;
  namespace: string;
  pid: number;
};

export type HyprLayersResponse = Record<
  string,
  {
    levels: Record<string, HyprLayerSurface[]>;
  }
>;

export type FlatHyprLayerSurface = HyprLayerSurface & {
  monitor: string;
  level: number;
  layer: string;
};

export type HyprctlBind = {
  locked: boolean;
  mouse: boolean;
  release: boolean;
  repeat: boolean;
  longPress: boolean;
  non_consuming: boolean;
  auto_consuming?: boolean;
  has_description: boolean;
  modmask: number;
  submap: string;
  submap_universal?: string | boolean;
  key: string;
  keycode: number;
  catch_all: boolean;
  description: string;
  dispatcher: string;
  arg: string;
};

export type HyprBind = {
  key: string;
  modifiers: string;
  dispatch: string;
  dispatcher: string;
  arg: string;
  description: string;
  locked: boolean;
  mouse: boolean;
  release: boolean;
  repeat: boolean;
  longPress: boolean;
  nonConsuming: boolean;
  autoConsuming: boolean;
  catchAll: boolean;
  submap: string;
};
