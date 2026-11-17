import { expect, test } from "bun:test";
import { spendChartSvg } from "../src/lib/spend-chart";

test("chart has legend, one row per period, and clamps an over-estimate", () => {
	const svg = spendChartSvg(
		[
			{ label: "Today", mine: 0.5, key: 2.94 },
			{ label: "This month", mine: 40, key: 35.53 },
			{ label: "Empty", mine: 0, key: 0 },
		],
		"dark",
	);
	expect(svg).toContain("You (local logs)");
	expect(svg).toContain("Others on this key");
	expect(svg).toContain("you $0.50 of $2.94 · 17%");
	expect(svg).toContain("you $40.00 of $35.53 · 100%");
	expect(svg).not.toContain("NaN");
	expect(svg.startsWith("<svg")).toBe(true);
});
