/**
 * Static catalog of niri IPC actions, generated from `niri msg action --help` (niri 26.04).
 *
 * Actions that require arguments carry an `argKind` and are expanded at runtime
 * with live compositor state (see niri-actions.tsx). Free-form argument actions
 * (spawn, spawn-sh, set-workspace-name, stop-cast, help) are intentionally omitted.
 */
export type ArgKind =
  | "none"
  | "workspaceRef"
  | "workspaceIndex"
  | "index"
  | "monitorName"
  | "windowId"
  | "sizeChange"
  | "displayMode"
  | "layout";

export type NiriAction = {
  /** IPC action name, as accepted by `niri msg action` */
  name: string;
  /** One-line description from the niri CLI help */
  description: string;
  /** List section the action belongs to */
  section: string;
  /** How the action's arguments are expanded at runtime */
  argKind: ArgKind;
};

export const SECTION_ORDER = [
  "Windows",
  "Columns",
  "Workspaces",
  "Monitors",
  "Screenshots & Casting",
  "Layout & Overview",
  "System",
] as const;

export const ACTIONS: NiriAction[] = [
  {
    name: "quit",
    description: "Exit niri",
    section: "System",
    argKind: "none",
  },
  {
    name: "power-off-monitors",
    description: "Power off all monitors via DPMS",
    section: "System",
    argKind: "none",
  },
  {
    name: "power-on-monitors",
    description: "Power on all monitors via DPMS",
    section: "System",
    argKind: "none",
  },
  {
    name: "do-screen-transition",
    description: "Do a screen transition",
    section: "Screenshots & Casting",
    argKind: "none",
  },
  {
    name: "screenshot",
    description: "Open the screenshot UI",
    section: "Screenshots & Casting",
    argKind: "none",
  },
  {
    name: "screenshot-screen",
    description: "Screenshot the focused screen",
    section: "Screenshots & Casting",
    argKind: "none",
  },
  {
    name: "screenshot-window",
    description: "Screenshot the focused window",
    section: "Screenshots & Casting",
    argKind: "none",
  },
  {
    name: "toggle-keyboard-shortcuts-inhibit",
    description: "Enable or disable the keyboard shortcuts inhibitor (if any) for the focused surface",
    section: "System",
    argKind: "none",
  },
  {
    name: "close-window",
    description: "Close the focused window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "fullscreen-window",
    description: "Toggle fullscreen on the focused window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "toggle-windowed-fullscreen",
    description: "Toggle windowed (fake) fullscreen on the focused window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window",
    description: "Focus a window by id",
    section: "Windows",
    argKind: "windowId",
  },
  {
    name: "focus-window-in-column",
    description: "Focus a window in the focused column by index",
    section: "Columns",
    argKind: "index",
  },
  {
    name: "focus-window-previous",
    description: "Focus the previously focused window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-column-left",
    description: "Focus the column to the left",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column-right",
    description: "Focus the column to the right",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column-first",
    description: "Focus the first column",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column-last",
    description: "Focus the last column",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column-right-or-first",
    description: "Focus the next column to the right, looping if at end",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column-left-or-last",
    description: "Focus the next column to the left, looping if at start",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column",
    description: "Focus a column by index",
    section: "Columns",
    argKind: "index",
  },
  {
    name: "focus-window-or-monitor-up",
    description: "Focus the window or the monitor above",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-or-monitor-down",
    description: "Focus the window or the monitor below",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-column-or-monitor-left",
    description: "Focus the column or the monitor to the left",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-column-or-monitor-right",
    description: "Focus the column or the monitor to the right",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "focus-window-down",
    description: "Focus the window below",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-up",
    description: "Focus the window above",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-down-or-column-left",
    description: "Focus the window below or the column to the left",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-down-or-column-right",
    description: "Focus the window below or the column to the right",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-up-or-column-left",
    description: "Focus the window above or the column to the left",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-up-or-column-right",
    description: "Focus the window above or the column to the right",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-or-workspace-down",
    description: "Focus the window or the workspace below",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-or-workspace-up",
    description: "Focus the window or the workspace above",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-top",
    description: "Focus the topmost window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-bottom",
    description: "Focus the bottommost window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-down-or-top",
    description: "Focus the window below or the topmost window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-window-up-or-bottom",
    description: "Focus the window above or the bottommost window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-column-left",
    description: "Move the focused column to the left",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "move-column-right",
    description: "Move the focused column to the right",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "move-column-to-first",
    description: "Move the focused column to the start of the workspace",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "move-column-to-last",
    description: "Move the focused column to the end of the workspace",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "move-column-left-or-to-monitor-left",
    description: "Move the focused column to the left or to the monitor to the left",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "move-column-right-or-to-monitor-right",
    description: "Move the focused column to the right or to the monitor to the right",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "move-column-to-index",
    description: "Move the focused column to a specific index on its workspace",
    section: "Columns",
    argKind: "index",
  },
  {
    name: "move-window-down",
    description: "Move the focused window down in a column",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-window-up",
    description: "Move the focused window up in a column",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-window-down-or-to-workspace-down",
    description: "Move the focused window down in a column or to the workspace below",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-window-up-or-to-workspace-up",
    description: "Move the focused window up in a column or to the workspace above",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "consume-or-expel-window-left",
    description: "Consume or expel the focused window left",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "consume-or-expel-window-right",
    description: "Consume or expel the focused window right",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "consume-window-into-column",
    description: "Consume the window to the right into the focused column",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "expel-window-from-column",
    description: "Expel the bottom window from the focused column",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "swap-window-right",
    description: "Swap focused window with one to the right",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "swap-window-left",
    description: "Swap focused window with one to the left",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "toggle-column-tabbed-display",
    description: "Toggle the focused column between normal and tabbed display",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "set-column-display",
    description: "Set the display mode of the focused column",
    section: "Columns",
    argKind: "displayMode",
  },
  {
    name: "center-column",
    description: "Center the focused column on the screen",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "center-window",
    description: "Center the focused window on the screen",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "center-visible-columns",
    description: "Center all fully visible columns on the screen",
    section: "Layout & Overview",
    argKind: "none",
  },
  {
    name: "focus-workspace-down",
    description: "Focus the workspace below",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "focus-workspace-up",
    description: "Focus the workspace above",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "focus-workspace",
    description: "Focus a workspace by reference (index or name)",
    section: "Workspaces",
    argKind: "workspaceRef",
  },
  {
    name: "focus-workspace-previous",
    description: "Focus the previous workspace",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-window-to-workspace-down",
    description: "Move the focused window to the workspace below",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-window-to-workspace-up",
    description: "Move the focused window to the workspace above",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-window-to-workspace",
    description: "Move the focused window to a workspace by reference (index or name)",
    section: "Workspaces",
    argKind: "workspaceRef",
  },
  {
    name: "move-column-to-workspace-down",
    description: "Move the focused column to the workspace below",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-column-to-workspace-up",
    description: "Move the focused column to the workspace above",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-column-to-workspace",
    description: "Move the focused column to a workspace by reference (index or name)",
    section: "Workspaces",
    argKind: "workspaceRef",
  },
  {
    name: "move-workspace-down",
    description: "Move the focused workspace down",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-workspace-up",
    description: "Move the focused workspace up",
    section: "Workspaces",
    argKind: "none",
  },
  {
    name: "move-workspace-to-index",
    description: "Move the focused workspace to a specific index on its monitor",
    section: "Workspaces",
    argKind: "workspaceIndex",
  },
  {
    name: "unset-workspace-name",
    description: "Unset the name of the focused workspace",
    section: "Workspaces",
    argKind: "workspaceRef",
  },
  {
    name: "focus-monitor-left",
    description: "Focus the monitor to the left",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "focus-monitor-right",
    description: "Focus the monitor to the right",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "focus-monitor-down",
    description: "Focus the monitor below",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "focus-monitor-up",
    description: "Focus the monitor above",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "focus-monitor-previous",
    description: "Focus the previous monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "focus-monitor-next",
    description: "Focus the next monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "focus-monitor",
    description: "Focus a monitor by name",
    section: "Monitors",
    argKind: "monitorName",
  },
  {
    name: "move-window-to-monitor-left",
    description: "Move the focused window to the monitor to the left",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-window-to-monitor-right",
    description: "Move the focused window to the monitor to the right",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-window-to-monitor-down",
    description: "Move the focused window to the monitor below",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-window-to-monitor-up",
    description: "Move the focused window to the monitor above",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-window-to-monitor-previous",
    description: "Move the focused window to the previous monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-window-to-monitor-next",
    description: "Move the focused window to the next monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-window-to-monitor",
    description: "Move the focused window to a specific monitor",
    section: "Monitors",
    argKind: "monitorName",
  },
  {
    name: "move-column-to-monitor-left",
    description: "Move the focused column to the monitor to the left",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-column-to-monitor-right",
    description: "Move the focused column to the monitor to the right",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-column-to-monitor-down",
    description: "Move the focused column to the monitor below",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-column-to-monitor-up",
    description: "Move the focused column to the monitor above",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-column-to-monitor-previous",
    description: "Move the focused column to the previous monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-column-to-monitor-next",
    description: "Move the focused column to the next monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-column-to-monitor",
    description: "Move the focused column to a specific monitor",
    section: "Monitors",
    argKind: "monitorName",
  },
  {
    name: "set-window-width",
    description: "Change the width of the focused window",
    section: "Windows",
    argKind: "sizeChange",
  },
  {
    name: "set-window-height",
    description: "Change the height of the focused window",
    section: "Windows",
    argKind: "sizeChange",
  },
  {
    name: "reset-window-height",
    description: "Reset the height of the focused window back to automatic",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "switch-preset-column-width",
    description: "Switch between preset column widths",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "switch-preset-column-width-back",
    description: "Switch between preset column widths backwards",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "switch-preset-window-width",
    description: "Switch between preset window widths",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "switch-preset-window-width-back",
    description: "Switch between preset window widths backwards",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "switch-preset-window-height",
    description: "Switch between preset window heights",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "switch-preset-window-height-back",
    description: "Switch between preset window heights backwards",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "maximize-column",
    description: "Toggle the maximized state of the focused column",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "maximize-window-to-edges",
    description: "Toggle the maximized-to-edges state of the focused window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "set-column-width",
    description: "Change the width of the focused column",
    section: "Columns",
    argKind: "sizeChange",
  },
  {
    name: "expand-column-to-available-width",
    description: "Expand the focused column to space not taken up by other fully visible columns",
    section: "Columns",
    argKind: "none",
  },
  {
    name: "switch-layout",
    description: "Switch between keyboard layouts",
    section: "Layout & Overview",
    argKind: "layout",
  },
  {
    name: "show-hotkey-overlay",
    description: "Show the hotkey overlay",
    section: "System",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor-left",
    description: "Move the focused workspace to the monitor to the left",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor-right",
    description: "Move the focused workspace to the monitor to the right",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor-down",
    description: "Move the focused workspace to the monitor below",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor-up",
    description: "Move the focused workspace to the monitor above",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor-previous",
    description: "Move the focused workspace to the previous monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor-next",
    description: "Move the focused workspace to the next monitor",
    section: "Monitors",
    argKind: "none",
  },
  {
    name: "move-workspace-to-monitor",
    description: "Move the focused workspace to a specific monitor",
    section: "Monitors",
    argKind: "monitorName",
  },
  {
    name: "toggle-debug-tint",
    description: "Toggle a debug tint on windows",
    section: "System",
    argKind: "none",
  },
  {
    name: "debug-toggle-opaque-regions",
    description: "Toggle visualization of render element opaque regions",
    section: "System",
    argKind: "none",
  },
  {
    name: "debug-toggle-damage",
    description: "Toggle visualization of output damage",
    section: "System",
    argKind: "none",
  },
  {
    name: "toggle-window-floating",
    description: "Move the focused window between the floating and the tiling layout",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-window-to-floating",
    description: "Move the focused window to the floating layout",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-window-to-tiling",
    description: "Move the focused window to the tiling layout",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-floating",
    description: "Switches focus to the floating layout",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "focus-tiling",
    description: "Switches focus to the tiling layout",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "switch-focus-between-floating-and-tiling",
    description: "Toggles the focus between the floating and the tiling layout",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "move-floating-window",
    description: "Move the floating window on screen",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "toggle-window-rule-opacity",
    description: "Toggle the opacity of the focused window",
    section: "Windows",
    argKind: "none",
  },
  {
    name: "set-dynamic-cast-window",
    description: "Set the dynamic cast target to the focused window",
    section: "Screenshots & Casting",
    argKind: "none",
  },
  {
    name: "set-dynamic-cast-monitor",
    description: "Set the dynamic cast target to the focused monitor",
    section: "Screenshots & Casting",
    argKind: "monitorName",
  },
  {
    name: "clear-dynamic-cast-target",
    description: "Clear the dynamic cast target, making it show nothing",
    section: "Screenshots & Casting",
    argKind: "none",
  },
  {
    name: "toggle-overview",
    description: "Toggle (open/close) the Overview",
    section: "Layout & Overview",
    argKind: "none",
  },
  {
    name: "open-overview",
    description: "Open the Overview",
    section: "Layout & Overview",
    argKind: "none",
  },
  {
    name: "close-overview",
    description: "Close the Overview",
    section: "Layout & Overview",
    argKind: "none",
  },
  {
    name: "toggle-window-urgent",
    description: "Toggle urgent status of a window",
    section: "Windows",
    argKind: "windowId",
  },
  {
    name: "set-window-urgent",
    description: "Set urgent status of a window",
    section: "Windows",
    argKind: "windowId",
  },
  {
    name: "unset-window-urgent",
    description: "Unset urgent status of a window",
    section: "Windows",
    argKind: "windowId",
  },
  {
    name: "load-config-file",
    description: "Reload the config file",
    section: "System",
    argKind: "none",
  },
];

