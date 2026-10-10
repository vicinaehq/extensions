import { Action, ActionPanel, Icon, List, closeMainWindow, open } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { dataDirForVariant, detectVariant, extractHost, getBraveProfiles, getFavicon, variantInfo, variantName } from "./utils";
import type { BraveVariant } from "./utils";

type Bookmark = {
	id: string;
	title: string;
	url: string;
	folder: string;
};

function parseBookmarks(variant: BraveVariant, profilePath: string): Bookmark[] {
	const filePath = path.join(dataDirForVariant(variant), profilePath, "Bookmarks");
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
	const variant = detectVariant();

	useEffect(() => {
		if (!variant) {
			setError("No Brave or Brave Origin profiles found. Is Brave installed?");
			setIsLoading(false);
			return;
		}
		try {
			const { profiles } = getBraveProfiles(variant);
			const all = profiles.flatMap((p) => parseBookmarks(variant, p.path));
			setBookmarks(all);
			if (profiles.length === 0) setError(`No ${variantName(variant)} profiles found. Is Brave installed?`);
		} catch (e) {
			setError(String(e));
		}
		setIsLoading(false);
	}, []);

	const items = useMemo(() => bookmarks, [bookmarks]);

	if (error) {
		return (
			<List isLoading={false}>
				<List.EmptyView title="Brave not found" description={error} icon={Icon.Exclamationmark} />
			</List>
		);
	}

	return (
		<List isLoading={isLoading} searchBarPlaceholder={`Search ${variant ? variantName(variant) : "Brave"} bookmarks`}>
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
								title="Open in Brave"
								icon={Icon.Globe01}
								onAction={async () => {
									await closeMainWindow();
									await open(b.url, variant ? variantInfo(variant).openScheme : "brave");
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