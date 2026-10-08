import type {NiriAction} from "./catalog";
import type {NiriOutput, NiriWindow, NiriWorkspace} from "./niri";

/** Fixed increments offered for the size-changing actions */
export const SIZE_CHANGES = ["+10%", "-10%", "50%", "100%"] as const;

/** Fixed choices for the remaining enum-like arguments */
export const INDEX_RANGE = Array.from({length: 9}, (_, i) => i + 1);
export const DISPLAY_MODES = ["normal", "tabbed"] as const;
export const LAYOUTS = ["next", "prev"] as const;

export type NiriState = {
    workspaces: NiriWorkspace[];
    outputs: NiriOutput[];
    windows: NiriWindow[];
};

export type ExpandedAction = {
    key: string;
    /** Full command display, e.g. "focus-workspace 3" */
    title: string;
    subtitle: string;
    /** Accessory tag (app id, output name, ...) */
    tag?: string;
    /** Secondary accessory text */
    text?: string;
    /** Extra search keywords */
    keywords: string[];
    /** argv passed to `niri msg action <name> ...` */
    args: string[];
};

function describeWorkspaceRefs(state: NiriState) {
    const maxIdx = state.workspaces.reduce((max, ws) => Math.max(max, ws.idx), 0);
    const indices = Array.from({length: maxIdx + 1}, (_, i) => i + 1);
    const named = state.workspaces.filter((ws) => ws.name !== null);
    return {indices, named};
}

export function expandAction(action: NiriAction, state: NiriState): ExpandedAction[] {
    const items: ExpandedAction[] = [];
    const push = (argDisplay: string, args: string[], extra?: Partial<ExpandedAction>) => {
        items.push({
            key: `${action.name} ${argDisplay}`,
            title: `${action.name} ${argDisplay}`,
            subtitle: action.description,
            keywords: [action.description, argDisplay, ...(extra?.keywords ?? [])],
            tag: extra?.tag,
            text: extra?.text,
            args,
        });
    };

    switch (action.argKind) {
        case "none":
            items.push({
                key: action.name,
                title: action.name,
                subtitle: action.description,
                keywords: [action.description],
                args: [],
            });
            break;
        case "workspaceRef": {
            const {indices, named} = describeWorkspaceRefs(state);
            for (const i of indices) push(String(i), [String(i)]);
            for (const ws of named)
                push(ws.name as string, [ws.name as string], {
                    tag: "named",
                    text: ws.output,
                });
            break;
        }
        case "workspaceIndex": {
            const {indices} = describeWorkspaceRefs(state);
            for (const i of indices) push(String(i), [String(i)]);
            break;
        }
        case "index":
            for (const i of INDEX_RANGE) push(String(i), [String(i)]);
            break;
        case "monitorName":
            for (const output of state.outputs)
                push(output.name, [output.name], {
                    text: [output.make, output.model].filter(Boolean).join(" ").trim() || undefined,
                });
            break;
        case "windowId": {
            const windows = [...state.windows].sort(
                (a, b) => (a.workspace_id ?? 0) - (b.workspace_id ?? 0) || a.id - b.id,
            );
            for (const w of windows) {
                const label = w.title || w.app_id || "Untitled window";
                items.push({
                    key: `${action.name} --id ${w.id}`,
                    title: label,
                    subtitle: action.description,
                    keywords: [action.description, action.name, w.app_id ?? "", w.title ?? ""],
                    tag: w.app_id ?? undefined,
                    text: `id ${w.id}`,
                    args: ["--id", String(w.id)],
                });
            }
            break;
        }
        case "sizeChange":
            for (const change of SIZE_CHANGES) push(change, [change]);
            break;
        case "displayMode":
            for (const mode of DISPLAY_MODES) push(mode, [mode]);
            break;
        case "layout":
            for (const layout of LAYOUTS) push(layout, [layout]);
            break;
    }
    return items.filter((item) => item.title.trim().length > 0);
}
