import { Action, ActionPanel, Icon, List, closeMainWindow, open } from "@vicinae/api";
import { useEffect, useState } from "react";
import { detectVariant, extractHost, getBraveProfiles, getFavicon, openHistoryDb, variantInfo, variantName } from "./utils";
import type { BraveVariant } from "./utils";

type HistoryItem = {
	id: number;
	title: string;
	url: string;
	visitCount: number;
	lastVisit: Date;
};

const CHROME_EPOCH_OFFSET_US = BigInt("11644473600000000");

function fromChromeTimestamp(us: number | bigint): Date {
	return new Date(Number((BigInt(us) - CHROME_EPOCH_OFFSET_US) / BigInt(1000)));
}

export default function Command() {
	const [items, setItems] = useState<HistoryItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const variant = detectVariant();

	useEffect(() => {
		(async () => {
			if (!variant) {
				setError("No Brave or Brave Origin profiles found. Is Brave installed?");
				setIsLoading(false);
				return;
			}
			try {
				const { profiles } = getBraveProfiles(variant);
				if (profiles.length === 0) {
					setError(`No ${variantName(variant)} profiles found. Is Brave installed?`);
					return;
				}

				const all: HistoryItem[] = [];
				let readProfiles = 0;
				for (const profile of profiles) {
					try {
						const db = await openHistoryDb(variant, profile.path);
						const stmt = db.prepare(
							"SELECT id, url, title, visit_count, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 1000",
						);
						while (stmt.step()) {
							const row = stmt.getAsObject() as Record<string, number | string>;
							all.push({
								id: Number(row.id),
								url: String(row.url),
								title: String(row.title) || String(row.url),
								visitCount: Number(row.visit_count),
								lastVisit: fromChromeTimestamp(BigInt(row.last_visit_time)),
							});
						}
						stmt.free();
						db.close();
						readProfiles++;
					} catch {
					}
				}

				if (readProfiles === 0) {
					setError(`Could not read any ${variantName(variant)} history database.`);
					return;
				}

				all.sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
				setItems(all);
			} catch (e) {
				setError(String(e));
			} finally {
				setIsLoading(false);
			}
		})();
	}, []);

	if (error) {
		return (
			<List isLoading={false}>
				<List.EmptyView title="Brave not found" description={error} icon={Icon.Exclamationmark} />
			</List>
		);
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder={`Search ${variant ? variantName(variant) : "Brave"} history`}>
			{items.map((item) => (
				<List.Item
					key={`${item.id}-${item.url}`}
					icon={getFavicon(item.url, Icon.Globe01)}
					title={item.title}
					subtitle={extractHost(item.url)}
					accessories={[{ text: item.lastVisit.toLocaleDateString() }]}
					actions={
						<ActionPanel>
							<Action
								title="Open in Brave"
								icon={Icon.Globe01}
								onAction={async () => {
									await closeMainWindow();
									await open(item.url, variant ? variantInfo(variant).openScheme : "brave");
								}}
							/>
							<Action.CopyToClipboard title="Copy URL" content={item.url} />
						</ActionPanel>
					}
				/>
			))}
			<List.EmptyView
				title="No history found"
				description="No history entries match your search."
				icon={Icon.Globe01}
			/>
		</List>
	);
}