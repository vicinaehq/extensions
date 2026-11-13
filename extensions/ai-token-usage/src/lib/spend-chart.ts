// Stacked bar per period: your spend vs the rest of a shared API key's spend.
// Palette: categorical slots 1-2 from the dataviz reference, validated for both modes.

export type SpendRow = { label: string; mine: number; key: number };

const THEME = {
	dark: { you: "#3987e5", others: "#d95926", track: "#383835", text: "#f0efec", muted: "#c3c2b7" },
	light: { you: "#2a78d6", others: "#eb6834", track: "#f0efec", text: "#0b0b0b", muted: "#52514e" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const usd = (n: number) => `$${n.toFixed(2)}`;

// A bar segment with rounded outer ends only; inner ends stay square.
function segment(x: number, y: number, w: number, h: number, fill: string, left: boolean, right: boolean): string {
	if (w <= 0) return "";
	const r = Math.min(4, w / 2, h / 2);
	const [rl, rr] = [left ? r : 0, right ? r : 0];
	return `<path fill="${fill}" d="M${x + rl},${y}H${x + w - rr}${rr ? `A${rr},${rr} 0 0 1 ${x + w},${y + rr}` : ""}V${y + h - rr}${rr ? `A${rr},${rr} 0 0 1 ${x + w - rr},${y + h}` : ""}H${x + rl}${rl ? `A${rl},${rl} 0 0 1 ${x},${y + h - rl}` : ""}V${y + rl}${rl ? `A${rl},${rl} 0 0 1 ${x + rl},${y}` : ""}Z"/>`;
}

export function spendChartSvg(rows: SpendRow[], mode: "light" | "dark"): string {
	const c = THEME[mode];
	const W = 560;
	const barX = 0;
	const barW = W;
	const barH = 14;
	const rowH = 52;
	const top = 30;
	const font = `font-family="Inter, system-ui, sans-serif"`;
	const parts: string[] = [];

	// legend (2 series => always shown)
	parts.push(
		`<rect x="0" y="4" width="12" height="12" rx="3" fill="${c.you}"/>`,
		`<text x="18" y="14" font-size="13" fill="${c.muted}" ${font}>You (local logs)</text>`,
		`<rect x="150" y="4" width="12" height="12" rx="3" fill="${c.others}"/>`,
		`<text x="168" y="14" font-size="13" fill="${c.muted}" ${font}>Others on this key</text>`,
	);

	rows.forEach((row, i) => {
		const y = top + i * rowH;
		const mine = Math.min(row.mine, row.key);
		const others = Math.max(0, row.key - mine);
		const share = row.key > 0 ? Math.round((mine / row.key) * 100) : 0;
		parts.push(
			`<text x="0" y="${y + 12}" font-size="13" font-weight="600" fill="${c.text}" ${font}>${esc(row.label)}</text>`,
			`<text x="${W}" y="${y + 12}" font-size="13" text-anchor="end" fill="${c.muted}" ${font}>you ${usd(row.mine)} of ${usd(row.key)} · ${share}%</text>`,
		);
		const by = y + 20;
		if (row.key <= 0) {
			parts.push(segment(barX, by, barW, barH, c.track, true, true));
			return;
		}
		const gap = mine > 0 && others > 0 ? 2 : 0;
		const youW = (mine / row.key) * (barW - gap);
		const othersW = barW - gap - youW;
		parts.push(
			segment(barX, by, youW, barH, c.you, true, others <= 0),
			segment(barX + youW + gap, by, othersW, barH, c.others, mine <= 0, true),
		);
	});

	const H = top + rows.length * rowH;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

export function svgDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
