export type WarmthValue = { strength: number } | { kelvin: number };

/**
 * Accepts a strength ("0.8") or a Kelvin target ("3000", "3000K"), mirroring the ranges
 * `abendrot set warmth` enforces. Returns null for anything out of range instead of clamping,
 * so bad input fails loudly as a form error, exactly like the CLI (exit 2).
 */
export function parseWarmth(input: string): WarmthValue | null {
	const raw = input.trim();
	if (!raw) return null;

	const kelvinLike = /[kK]\s*$/.test(raw);
	const numeric = Number(raw.replace(/[kK]\s*$/, "").trim());
	if (!Number.isFinite(numeric)) return null;

	if (kelvinLike) {
		return Number.isInteger(numeric) && numeric >= 500 && numeric <= 6500
			? { kelvin: numeric }
			: null;
	}
	// A bare value inside 0..1 is a strength; anything bigger integer in range is Kelvin.
	if (numeric >= 0 && numeric <= 1) return { strength: numeric };
	if (Number.isInteger(numeric) && numeric >= 500 && numeric <= 6500) return { kelvin: numeric };
	return null;
}

export function warmthArgs(value: WarmthValue): string[] {
	return "strength" in value
		? ["set", "warmth", String(value.strength)]
		: ["set", "warmth", "--kelvin", String(value.kelvin)];
}

export function describeWarmth(value: WarmthValue): string {
	return "strength" in value
		? `${Math.round(value.strength * 100)}%`
		: `${value.kelvin}K`;
}