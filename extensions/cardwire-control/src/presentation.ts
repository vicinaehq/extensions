import { Color, Icon, type List } from "@vicinae/api";
import { type Gpu, isGpuMode } from "./parse";

export function modeTitle(mode: string): string {
	return modePresentation(mode).title;
}

export function modePresentation(mode: string): {
	title: string;
	subtitle: string;
	icon: Icon;
} {
	if (!isGpuMode(mode)) {
		return {
			title: capitalize(mode),
			subtitle: "Unknown mode",
			icon: Icon.Cog,
		};
	}

	switch (mode) {
		case "integrated":
			return {
				title: "Integrated",
				subtitle: "Block discrete GPU",
				icon: Icon.Battery,
			};
		case "hybrid":
			return {
				title: "Hybrid",
				subtitle: "All GPUs available",
				icon: Icon.Bolt,
			};
		case "manual":
			return {
				title: "Manual",
				subtitle: "Block or unblock GPUs by ID",
				icon: Icon.Cog,
			};
		case "smart":
			return {
				title: "Smart",
				subtitle: "Block dGPU except allowed apps",
				icon: Icon.Stars,
			};
		default: {
			const _exhaustive: never = mode;
			return _exhaustive;
		}
	}
}

export function gpuAccessories(gpu: Gpu): List.Item.Accessory[] {
	const accessories: List.Item.Accessory[] = [];
	if (gpu.default) {
		accessories.push({ tag: { value: "Default", color: Color.Blue } });
	}
	if (gpu.discrete) {
		accessories.push({ tag: "Discrete" });
	}
	if (gpu.blocked) {
		accessories.push({ tag: { value: "Blocked", color: Color.Red } });
	}
	accessories.push({ text: gpu.vendor });
	return accessories;
}

function capitalize(value: string): string {
	if (value.length === 0) {
		return value;
	}
	return value.charAt(0).toUpperCase() + value.slice(1);
}
