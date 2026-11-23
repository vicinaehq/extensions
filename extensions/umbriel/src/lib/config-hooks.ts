import { useCallback, useEffect, useState } from "react";
import { collectScratchpads, loadUmbrielConfig } from "./config";
import { formatError } from "./format";
import type { Scratchpad } from "./types";

export function useScratchpads(): {
	scratchpads: Scratchpad[];
	error: string | null;
	refresh: () => Promise<void>;
} {
	const [scratchpads, setScratchpads] = useState<Scratchpad[]>([
		{ name: "default" },
	]);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const files = await loadUmbrielConfig();
			setScratchpads(collectScratchpads(files));
			setError(null);
		} catch (caught) {
			setScratchpads([{ name: "default" }]);
			setError(formatError(caught));
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { scratchpads, error, refresh };
}
