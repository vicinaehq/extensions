import { dirname } from "node:path";
import { useState } from "react";
import {
	Action,
	ActionPanel,
	Icon,
	type LaunchProps,
	List,
	openExtensionPreferences,
} from "@vicinae/api";
import { FileActions } from "./lib/actions";
import {
	type GrepCursor,
	type GrepEntry,
	type GrepMode,
	fff,
	logPath,
} from "./lib/daemon";
import { gitAccessory } from "./lib/git";
import { loadPreferences, tildify } from "./lib/preferences";
import { matchContextMarkdown } from "./lib/preview";
import { usePagedSearch } from "./lib/use-paged-search";

const PAGE_SIZE = 60;
const MAX_TITLE = 160;

const MODES: { value: GrepMode; title: string }[] = [
	{ value: "plain", title: "Plain Text" },
	{ value: "regex", title: "Regex" },
	{ value: "fuzzy", title: "Fuzzy" },
];

const matchId = (m: GrepEntry) => `${m.path}:${m.line}:${m.column}`;

const LEAD_CHARS = 24;

/** The matched line, shifted so the match stays visible in long lines. */
function title(m: GrepEntry) {
	const start = m.ranges[0]?.[0] ?? 0;
	const bytes = Buffer.from(m.text, "utf8");
	let cut = start > LEAD_CHARS ? start - LEAD_CHARS : 0;
	// Don't split a multi-byte UTF-8 character.
	while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut -= 1;
	let text = (cut ? `…${bytes.subarray(cut).toString("utf8")}` : m.text).trim();
	if (text.length > MAX_TITLE) text = `${text.slice(0, MAX_TITLE)}…`;
	return text || " ";
}

/** Groups consecutive matches from the same file into one section. */
function groupByFile(items: GrepEntry[]) {
	const groups: { path: string; matches: GrepEntry[] }[] = [];
	for (const m of items) {
		const last = groups.at(-1);
		if (last?.path === m.path) last.matches.push(m);
		else groups.push({ path: m.path, matches: [m] });
	}
	return groups;
}

export default function SearchFileContents(props: LaunchProps) {
	const prefs = loadPreferences();
	// Set when launched as a fallback command from the root search.
	const [query, setQuery] = useState(props.fallbackText ?? "");
	const [mode, setMode] = useState<GrepMode>("plain");
	const [showPreview, setShowPreview] = useState(prefs.showPreview);
	const [regexError, setRegexError] = useState<string | undefined>();

	const { items, isLoading, error, hasMore, loadMore } = usePagedSearch<
		GrepEntry,
		GrepCursor
	>(`${mode}\u0000${query}`, async (cursor) => {
		if (!query.trim()) return { items: [], next: null, scanning: false };
		const r = await fff.grep({ query, mode, cursor, pageSize: PAGE_SIZE });
		if (!cursor) setRegexError(r.regexError);
		return { items: r.items, next: r.nextCursor, scanning: r.scanning };
	});

	const togglePreview = () => setShowPreview((v) => !v);
	const groups = groupByFile(items);

	let empty = (
		<List.EmptyView
			icon={Icon.MagnifyingGlass}
			title="Search inside your files"
			description={
				"Type to search file contents. Narrow by file with tokens like *.ts or src/ in the query.\nSwitch between plain text, regex and fuzzy matching with the dropdown."
			}
		/>
	);
	if (error) {
		empty = (
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
		);
	} else if (query.trim() && !isLoading) {
		empty = (
			<List.EmptyView
				icon={Icon.MagnifyingGlass}
				title="No matches"
				description={
					mode === "plain"
						? "Try Fuzzy mode for typo-tolerant matching."
						: undefined
				}
			/>
		);
	}

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={showPreview && items.length > 0}
			searchText={query}
			onSearchTextChange={setQuery}
			searchBarPlaceholder="Search file contents…"
			throttle
			navigationTitle={
				regexError ? "Invalid regex, matching literally" : undefined
			}
			pagination={{ hasMore, onLoadMore: loadMore }}
			searchBarAccessory={
				<List.Dropdown
					tooltip="Match mode"
					value={mode}
					onChange={(v) => setMode(v as GrepMode)}
					storeValue
				>
					{MODES.map((m) => (
						<List.Dropdown.Item key={m.value} title={m.title} value={m.value} />
					))}
				</List.Dropdown>
			}
		>
			{empty}
			{groups.map((group) => (
				<List.Section
					key={`${group.path}:${group.matches[0].line}`}
					title={group.matches[0].name}
					subtitle={tildify(dirname(group.path))}
				>
					{group.matches.map((m) => (
						<List.Item
							key={matchId(m)}
							id={matchId(m)}
							title={title(m)}
							icon={{ fileIcon: m.path }}
							accessories={[
								...gitAccessory(m.gitStatus),
								{ text: `${m.line}` },
							]}
							detail={
								showPreview ? (
									<List.Item.Detail
										markdown={matchContextMarkdown(
											m.path,
											m.line,
											m.text,
											m.before,
											m.after,
										)}
										metadata={
											<List.Item.Detail.Metadata>
												<List.Item.Detail.Metadata.Label
													title="File"
													text={m.name}
												/>
												<List.Item.Detail.Metadata.Label
													title="Where"
													text={tildify(dirname(m.path))}
												/>
												<List.Item.Detail.Metadata.Label
													title="Line"
													text={`${m.line}, column ${m.column + 1}`}
												/>
											</List.Item.Detail.Metadata>
										}
									/>
								) : undefined
							}
							actions={
								<FileActions
									path={m.path}
									kind="file"
									trackQuery=""
									line={m.line}
									column={m.column + 1}
									preferEditor
									extraCopy={{ title: "Copy Line", content: m.text }}
									onTogglePreview={togglePreview}
								/>
							}
						/>
					))}
				</List.Section>
			))}
		</List>
	);
}
