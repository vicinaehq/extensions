import { basename, dirname } from "node:path";
import { useEffect, useRef, useState } from "react";
import {
	Action,
	ActionPanel,
	Icon,
	type LaunchProps,
	List,
	openExtensionPreferences,
} from "@vicinae/api";
import { FileActions } from "./lib/actions";
import { type FileEntry, fff, logPath, type SearchResponse } from "./lib/daemon";
import { gitAccessory, gitLabel } from "./lib/git";
import { loadPreferences, tildify } from "./lib/preferences";
import { formatBytes, previewMarkdown } from "./lib/preview";
import { usePagedSearch } from "./lib/use-paged-search";

const PAGE_SIZE = 50;

function lineOf(location: SearchResponse["location"]) {
	if (!location) return {};
	if (location.type === "line") return { line: location.line };
	if (location.type === "position")
		return { line: location.line, column: location.col };
	return { line: location.start.line, column: location.start.col };
}

function FileDetail({ entry }: { entry: FileEntry }) {
	const [markdown, setMarkdown] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setMarkdown(null);
		previewMarkdown(entry.path, entry.kind).then((md) => {
			if (!cancelled) setMarkdown(md);
		});
		return () => {
			cancelled = true;
		};
	}, [entry.path, entry.kind]);

	const git = gitLabel(entry.gitStatus);

	return (
		<List.Item.Detail
			isLoading={markdown === null}
			markdown={markdown ?? ""}
			metadata={
				<List.Item.Detail.Metadata>
					<List.Item.Detail.Metadata.Label title="Name" text={entry.name} />
					<List.Item.Detail.Metadata.Label
						title="Where"
						text={tildify(dirname(entry.path))}
					/>
					{entry.kind === "file" && entry.size !== undefined ? (
						<List.Item.Detail.Metadata.Label
							title="Size"
							text={formatBytes(entry.size)}
						/>
					) : null}
					{entry.modified ? (
						<List.Item.Detail.Metadata.Label
							title="Modified"
							text={new Date(entry.modified * 1000).toLocaleString()}
						/>
					) : null}
					{git ? (
						<List.Item.Detail.Metadata.Label
							title="Git"
							text={{ value: git.label, color: git.color }}
						/>
					) : null}
				</List.Item.Detail.Metadata>
			}
		/>
	);
}

export default function SearchFiles(props: LaunchProps) {
	const prefs = loadPreferences();
	// Set when launched as a fallback command from the root search.
	const [query, setQuery] = useState(props.fallbackText ?? "");
	const [showPreview, setShowPreview] = useState(prefs.showPreview);
	const [selected, setSelected] = useState<string | null>(null);
	const location = useRef<SearchResponse["location"]>(undefined);

	const { items, isLoading, error, hasMore, loadMore } = usePagedSearch<
		FileEntry,
		number
	>(query, async (page) => {
		const r = await fff.search({ query, page: page ?? 0, pageSize: PAGE_SIZE });
		if (!page) location.current = r.location;
		return {
			items: r.items,
			next: r.hasMore ? (page ?? 0) + 1 : null,
			scanning: r.scanning,
		};
	});

	const togglePreview = () => setShowPreview((v) => !v);
	const active = items.some((i) => i.path === selected)
		? selected
		: items[0]?.path;
	const position = lineOf(location.current);

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={showPreview && items.length > 0}
			searchText={query}
			onSearchTextChange={setQuery}
			onSelectionChange={setSelected}
			searchBarPlaceholder="Search files and folders…"
			throttle
			pagination={{ hasMore, onLoadMore: loadMore }}
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="fff index unavailable"
					description={`${error}\nLog: ${tildify(logPath())}`}
					actions={
						<ActionPanel>
							<Action
								title="Open Extension Preferences"
								icon={Icon.Cog}
								onAction={openExtensionPreferences}
							/>
						</ActionPanel>
					}
				/>
			) : (
				<List.EmptyView
					icon={Icon.MagnifyingGlass}
					title={isLoading ? "Indexing…" : "No matching files"}
				/>
			)}
			<List.Section
				title={query ? "Results" : "Recent"}
				subtitle={items.length ? String(items.length) : undefined}
			>
				{items.map((entry) => (
					<List.Item
						key={entry.path}
						id={entry.path}
						title={entry.name || basename(entry.path)}
						subtitle={tildify(dirname(entry.path))}
						icon={{ fileIcon: entry.path }}
						accessories={
							showPreview
								? gitAccessory(entry.gitStatus)
								: [
										...gitAccessory(entry.gitStatus),
										...(entry.modified
											? [{ text: new Date(entry.modified * 1000) }]
											: []),
									]
						}
						detail={
							showPreview && active === entry.path ? (
								<FileDetail entry={entry} />
							) : undefined
						}
						actions={
							<FileActions
								path={entry.path}
								kind={entry.kind}
								trackQuery={query}
								line={position.line}
								column={position.column}
								onTogglePreview={togglePreview}
							/>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
