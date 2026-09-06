import { Color, Icon, type List } from "@vicinae/api";
import type { ProfileStatus } from "./asusd-parse";

export const CHARGE_LIMIT_PRESETS = [60, 80, 100] as const;

export function profilePresentation(profile: string): {
	title: string;
	subtitle: string;
	icon: Icon;
} {
	switch (profile) {
		case "Quiet":
			return {
				title: "Quiet",
				subtitle: "Lower fans and power",
				icon: Icon.Leaf,
			};
		case "Balanced":
			return {
				title: "Balanced",
				subtitle: "Default platform profile",
				icon: Icon.Gauge,
			};
		case "Performance":
			return {
				title: "Performance",
				subtitle: "Full platform power",
				icon: Icon.Bolt,
			};
		default:
			return {
				title: profile,
				subtitle: "Platform profile",
				icon: Icon.Gauge,
			};
	}
}

export function profileAccessories(
	profile: string,
	status: ProfileStatus,
): List.Item.Accessory[] {
	const accessories: List.Item.Accessory[] = [];
	if (profile === status.active) {
		accessories.push({ tag: { value: "Active", color: Color.Green } });
	}
	if (profile === status.ac) {
		accessories.push({ tag: { value: "AC", color: Color.Blue } });
	}
	if (profile === status.battery) {
		accessories.push({ tag: { value: "Battery", color: Color.Orange } });
	}
	return accessories;
}

export function chargeLimits(current: number): number[] {
	const limits = new Set<number>(CHARGE_LIMIT_PRESETS);
	limits.add(current);
	return [...limits].sort((left, right) => left - right);
}

export function dgpuFirmwarePresentation(disabled: boolean): {
	title: string;
	subtitle: string;
	icon: Icon;
} {
	if (disabled) {
		return {
			title: "Disabled",
			subtitle: "Firmware-hide the discrete GPU",
			icon: Icon.BoltDisabled,
		};
	}
	return {
		title: "Enabled",
		subtitle: "dGPU visible to firmware",
		icon: Icon.Bolt,
	};
}
