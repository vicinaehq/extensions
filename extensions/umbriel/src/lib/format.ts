import type { Output, OutputMode, Workspace } from "./types";

export function compareStrings(a: string, b: string): number {
	return a.localeCompare(b, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

export function formatRefreshRate(refreshMhz: number): string {
	const hz = refreshMhz / 1000;
	if (Number.isInteger(hz)) return hz.toFixed(0);
	return hz.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatMode(mode: OutputMode): string {
	return `${mode.width}×${mode.height}@${formatRefreshRate(mode.refresh_mhz)}Hz`;
}

export function currentMode(output: Output): OutputMode | undefined {
	return (
		output.modes.find((mode) => mode.current) ??
		output.modes.find((mode) => mode.preferred) ??
		output.modes[0]
	);
}

export function formatOutputResolution(output: Output): string {
	const mode = currentMode(output);
	return mode ? formatMode(mode) : "No mode reported";
}

export function formatTransform(transform: string): string {
	const labels: Record<string, string> = {
		normal: "Normal",
		"90": "90°",
		"180": "180°",
		"270": "270°",
		flipped: "Flipped",
		"flipped-90": "Flipped 90°",
		"flipped-180": "Flipped 180°",
		"flipped-270": "Flipped 270°",
	};
	return labels[transform] ?? transform;
}

export function formatScale(scale: number): string {
	return `${Number.isInteger(scale) ? scale.toFixed(0) : scale}×`;
}

export function formatLayout(layout: string): string {
	if (!layout) return "Unknown";
	return layout.charAt(0).toUpperCase() + layout.slice(1);
}

export function formatWorkspaceLabel(workspace: Workspace): string {
	return workspace.named ? workspace.name : `Workspace ${workspace.index}`;
}

export function formatWorkspaceTarget(workspace: Workspace): string[] {
	if (workspace.named)
		return ["--name", workspace.name, "--output", workspace.output];
	return [String(workspace.index), "--output", workspace.output];
}

export function formatSize(width: number, height: number): string {
	return `${width}×${height}`;
}

export function formatPosition(x: number, y: number): string {
	return `${x}, ${y}`;
}

export function formatBoolean(value: boolean): string {
	return value ? "Yes" : "No";
}

export function pluralize(
	count: number,
	singular: string,
	plural = `${singular}s`,
): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

export function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}
