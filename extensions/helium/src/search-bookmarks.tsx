import { Action, ActionPanel, Icon, List, closeMainWindow, open } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HELIUM_DATA_DIR, getHeliumProfiles, extractHost, getFavicon } from "./utils";

type Bookmark = {
	id: string;
	title: string;
	url: string;
	folder: string;
};

function parseBookmarks(profilePath: string): Bookmark[] {
	const filePath = path.join(HELIUM_DATA_DIR, profilePath, "Bookmarks");
	if (!existsSync(filePath)) return [];

	const data = JSON.parse(readFileSync(filePath, "utf-8"));
	const results: Bookmark[] = [];

	const walk = (node: any, folder: string) => {
		if (node.type === "url" && node.url) {
			results.push({ id: node.guid ?? node.url, title: node.name ?? node.url, url: node.url, folder });
		} else if (node.type === "folder" && Array.isArray(node.children)) {
			const name = folder ? `${folder}/${node.name}` : node.name;
			for (const child of node.children) walk(child, name);
		}
	};

	const roots = data.roots ?? {};
	for (const key of Object.keys(roots)) {
		const root = roots[key];
		if (root && typeof root === "object") walk(root, "");
	}

	return results;
}

export default function Command() {
	const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		try {
			const { profiles } = getHeliumProfiles();
			const all = profiles.flatMap((p) => parseBookmarks(p.path));
			setBookmarks(all);
			if (profiles.length === 0) setError("No Helium profiles found. Is Helium installed?");
		} catch (e) {
			setError(String(e));
		}
		setIsLoading(false);
	}, []);

	const items = useMemo(() => bookmarks, [bookmarks]);

	if (error) {
		return (
			<List isLoading={false}>
				<List.EmptyView title="Helium not found" description={error} icon={Icon.Exclamationmark} />
			</List>
		);
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search Helium bookmarks">
			{items.map((b) => (
				<List.Item
					key={b.id}
					icon={getFavicon(b.url, Icon.Bookmark)}
					title={b.title}
					subtitle={extractHost(b.url)}
					accessories={b.folder ? [{ icon: Icon.Folder, tag: b.folder }] : []}
					actions={
						<ActionPanel>
							<Action
								title="Open in Helium"
								icon={Icon.Globe01}
								onAction={async () => {
									await closeMainWindow();
									await open(b.url, "helium");
								}}
							/>
							<Action.CopyToClipboard title="Copy URL" content={b.url} />
						</ActionPanel>
					}
				/>
			))}
			<List.EmptyView
				title="No bookmarks found"
				description="No bookmarks match your search."
				icon={Icon.Bookmark}
			/>
		</List>
	);
}
