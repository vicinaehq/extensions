import { Cache } from "@vicinae/api";

export type Stability = "stable" | "staging" | "unstable";
export type Source =
	| "core"
	| "cosmic-protocols"
	| "external"
	| "hyprland-protocols"
	| "kde-protocols"
	| "river-protocols"
	| "treeland-protocols"
	| "wayland-protocols"
	| "weston-protocols"
	| "wlr-protocols";

export type ProtocolData = {
	id: string;
	name: string;
	source: Source;
	stability: Stability;
};

const cache = new Cache();

const CACHE_KEY = "protos";

export type TransformedProtocolData = ProtocolData & {
	url: string;
};

export async function fetchProtocols(): Promise<TransformedProtocolData[]> {
	const cached = cache.get(CACHE_KEY);

	if (cached) {
		console.log("cached");
		try {
			return JSON.parse(cached);
		} catch (e) {
			console.error(`Failed to parse cached data, fetching new data...`, e);
		}
	}

	const res = await fetch("https://wayland.app/protocols/data/protocols.json");
	const data: ProtocolData[] = await res.json();

	const transformed = data.map<TransformedProtocolData>((d) => ({
		...d,
		url: `https://wayland.app/protocols/${d.id}`,
	}));

	cache.set(CACHE_KEY, JSON.stringify(transformed), { ttl: 3600 * 1000 });

	return transformed;
}
