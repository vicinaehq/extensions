import {
	Action,
	ActionPanel,
	Color,
	Detail,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SHORTCUTS } from "./actions";
import { copyCode, guardAction, pasteCode } from "./clipboard";
import { readExportedSecrets } from "./ente-cli";
import {
	type EnteSecret,
	noteUrl,
	snapshotSecret,
	type TotpSnapshot,
} from "./ente-contract";
import { ensureIcons, faviconForNotes, getIconPath } from "./service-icons";
import { createSnapshotCache } from "./totp-cache";

type Preferences = { primaryAction?: string };
const PURPLE = Color.Purple;
const ORANGE = Color.Orange;

function escapeMarkdown(value: string): string {
	return value.replace(/[\\`*_[\]<>|]/g, "\\$&");
}

function timerColor(remaining: number): Color {
	return remaining > 10 ? PURPLE : ORANGE;
}

// A full circular progress bar: the elapsed portion is dimmed, while the
// remaining portion uses Raycast's purple/orange threshold. The whole ring
// stays visible without putting seconds or the code in the list row.
const progressIconCache = new Map<string, { source: string }>();

function progressIcon(remaining: number, period: number): { source: string } {
	const key = `${period}:${remaining}`;
	const cached = progressIconCache.get(key);
	if (cached) return cached;
	const fraction = Math.max(0, Math.min(1, remaining / Math.max(period, 1)));
	const color = remaining > 10 ? "#A400B6" : "#FF9800";
	const radius = 9;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference * (1 - fraction);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${radius}" fill="none" stroke="${color}" stroke-opacity="0.28" stroke-width="2.2"/><circle cx="12" cy="12" r="${radius}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 12 12)"/></svg>`;
	const icon = { source: `data:image/svg+xml,${encodeURIComponent(svg)}` };
	if (progressIconCache.size >= 256) progressIconCache.clear();
	progressIconCache.set(key, icon);
	return icon;
}

function serviceIcon(secret: EnteSecret) {
	const cached = getIconPath(secret.issuer || secret.username || "Ente Auth");
	if (cached) return { source: cached };
	const favicon = faviconForNotes(secret.notes);
	return favicon ? { source: favicon } : Icon.Key;
}

function TotpListDetail({ snapshot }: { snapshot: TotpSnapshot }) {
	const url = noteUrl(snapshot.notes);
	return (
		<List.Item.Detail
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Current" text={snapshot.current} />
					<Detail.Metadata.Label title="Next" text={snapshot.next} />
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label title="Username" text={snapshot.username} />
					<Detail.Metadata.Label title="Algorithm" text={snapshot.algorithm} />
					<Detail.Metadata.Label
						title="Digits"
						text={String(snapshot.digits)}
					/>
					<Detail.Metadata.Label
						title="Period"
						text={String(snapshot.period)}
					/>
					<Detail.Metadata.Separator />
					{url ? (
						<Detail.Metadata.Link
							title="Notes"
							target={url}
							text={snapshot.notes}
						/>
					) : (
						<Detail.Metadata.Label title="Notes" text={snapshot.notes || "—"} />
					)}
					<Detail.Metadata.Separator />
					{snapshot.tags.length > 0 && (
						<Detail.Metadata.TagList title="Tags">
							{snapshot.tags.map((tag) => (
								<Detail.Metadata.TagList.Item
									key={tag}
									text={tag}
									color={PURPLE}
								/>
							))}
						</Detail.Metadata.TagList>
					)}
				</Detail.Metadata>
			}
		/>
	);
}

function TotpDetail({ snapshot }: { snapshot: TotpSnapshot }) {
	const [timestamp, setTimestamp] = useState(Date.now());
	useEffect(() => {
		const interval = setInterval(() => setTimestamp(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);
	const cachedSnapshot = useMemo(() => createSnapshotCache(snapshotSecret), []);
	const current = useMemo(
		() => cachedSnapshot(snapshot, timestamp),
		[cachedSnapshot, snapshot, timestamp],
	);
	const url = noteUrl(current.notes);
	const markdown = [
		`# ${escapeMarkdown(current.serviceName)}`,
		`**Current code:** ${current.current}`,
		`**Next code:** ${current.next}`,
		`**Expires in:** ${current.remaining}s`,
	].join("\n\n");
	const pasteIsPrimary =
		getPreferenceValues<Preferences>().primaryAction !== "copy";
	const liveCode = (kind: "current" | "next") =>
		cachedSnapshot(snapshot, Date.now())[kind];
	const copyCurrent = (
		<Action
			title="Copy Current Code"
			icon={Icon.CopyClipboard}
			shortcut={SHORTCUTS.copyCurrent}
			onAction={() =>
				void guardAction("Unable to copy current code", () =>
					copyCode("Current code", liveCode("current")),
				)
			}
		/>
	);
	const pasteCurrent = (
		<Action
			title="Paste Current Code"
			icon={Icon.Key}
			onAction={() =>
				void guardAction("Unable to paste current code", () =>
					pasteCode(liveCode("current")),
				)
			}
		/>
	);

	return (
		<Detail
			navigationTitle={current.serviceName}
			markdown={markdown}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Username"
						text={current.username || "—"}
					/>
					<Detail.Metadata.Label title="Algorithm" text={current.algorithm} />
					<Detail.Metadata.Label title="Digits" text={String(current.digits)} />
					<Detail.Metadata.Label title="Period" text={`${current.period}s`} />
					<Detail.Metadata.Label
						title="Current"
						text={{
							value: current.current,
							color: timerColor(current.remaining),
						}}
						icon={Icon.Key}
					/>
					<Detail.Metadata.Label
						title="Tags"
						text={current.tags.length ? current.tags.join(", ") : "—"}
					/>
					{url ? (
						<Detail.Metadata.Link
							title="Notes"
							target={url}
							text={current.notes}
						/>
					) : (
						<Detail.Metadata.Label title="Notes" text={current.notes || "—"} />
					)}
					<Detail.Metadata.Separator />
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<ActionPanel.Section title="Current">
						{pasteIsPrimary ? pasteCurrent : copyCurrent}
						{pasteIsPrimary ? copyCurrent : pasteCurrent}
					</ActionPanel.Section>
					<ActionPanel.Section title="Next">
						<Action
							title="Paste Next Code"
							icon={Icon.Key}
							shortcut={SHORTCUTS.pasteNext}
							onAction={() =>
								void guardAction("Unable to paste next code", () =>
									pasteCode(liveCode("next")),
								)
							}
						/>
						<Action
							title="Copy Next Code"
							icon={Icon.CopyClipboard}
							shortcut={SHORTCUTS.copyNext}
							onAction={() =>
								void guardAction("Unable to copy next code", () =>
									copyCode("Next code", liveCode("next")),
								)
							}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section>
						{url && (
							<Action.OpenInBrowser
								title="Open Notes URL"
								url={url}
								icon={Icon.Link}
								shortcut={SHORTCUTS.openNotesUrl}
							/>
						)}
					</ActionPanel.Section>
				</ActionPanel>
			}
		/>
	);
}

export default function Command() {
	const [secrets, setSecrets] = useState<EnteSecret[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>();
	const [iconEpoch, setIconEpoch] = useState(0);
	const [timestamp, setTimestamp] = useState(Date.now());

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await readExportedSecrets();
			setSecrets(result.secrets);
			setError(undefined);
		} catch (reason: unknown) {
			setSecrets([]);
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		const interval = setInterval(() => setTimestamp(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (!secrets.length) return;
		let active = true;
		void ensureIcons(secrets.map((secret) => secret.issuer || secret.username))
			.then(() => {
				if (active) setIconEpoch((value) => value + 1);
			})
			.catch(() => {
				// TOTP use remains available with the default icon when the network is unavailable.
			});
		return () => {
			active = false;
		};
	}, [secrets]);

	const sortedSecrets = useMemo(
		() =>
			[...secrets].sort((left, right) =>
				(left.issuer || left.username || "Ente Auth").localeCompare(
					right.issuer || right.username || "Ente Auth",
				),
			),
		[secrets],
	);
	const cachedSnapshot = useMemo(() => createSnapshotCache(snapshotSecret), []);
	const snapshots = useMemo(
		() => sortedSecrets.map((secret) => cachedSnapshot(secret, timestamp)),
		[cachedSnapshot, sortedSecrets, timestamp],
	);
	const serviceIcons = useMemo(() => {
		void iconEpoch;
		return sortedSecrets.map(serviceIcon);
	}, [iconEpoch, sortedSecrets]);
	const pasteIsPrimary =
		getPreferenceValues<Preferences>().primaryAction !== "copy";

	async function refreshIcons(): Promise<void> {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Refreshing service icons…",
		});
		try {
			await ensureIcons(
				snapshots.map((snapshot) => snapshot.serviceName),
				true,
			);
			setIconEpoch((value) => value + 1);
			toast.style = Toast.Style.Success;
			toast.title = "Service icons refreshed";
		} catch (reason: unknown) {
			toast.style = Toast.Style.Failure;
			toast.title = "Icon refresh failed";
			toast.message = reason instanceof Error ? reason.message : String(reason);
		}
	}

	return (
		<List
			isLoading={loading}
			isShowingDetail
			navigationTitle="Get TOTP"
			searchBarPlaceholder="Search Ente Auth accounts…"
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Unable to load Ente Auth accounts"
					description={error}
					actions={
						<ActionPanel>
							<Action
								title="Reload Export"
								icon={Icon.ArrowClockwise}
								shortcut={SHORTCUTS.reloadExport}
								onAction={() => void load()}
							/>
						</ActionPanel>
					}
				/>
			) : snapshots.length === 0 && !loading ? (
				<List.EmptyView
					icon={Icon.Key}
					title="No Ente Auth accounts found"
					description="Run Import Ente Auth Secrets first."
				/>
			) : (
				snapshots.map((snapshot, index) => {
					const sourceSecret = sortedSecrets[index] ?? snapshot;
					const liveCode = (kind: "current" | "next") =>
						cachedSnapshot(sourceSecret, Date.now())[kind];
					const details = (
						<Action.Push
							title="View Details"
							icon={Icon.Eye}
							shortcut={SHORTCUTS.viewDetails}
							target={<TotpDetail snapshot={snapshot} />}
						/>
					);
					const copyCurrent = (
						<Action
							title="Copy Current Code"
							icon={Icon.CopyClipboard}
							shortcut={SHORTCUTS.copyCurrent}
							onAction={() =>
								void guardAction("Unable to copy current code", () =>
									copyCode("Current code", liveCode("current")),
								)
							}
						/>
					);
					const pasteCurrent = (
						<Action
							title="Paste Current Code"
							icon={Icon.Key}
							onAction={() =>
								void guardAction("Unable to paste current code", () =>
									pasteCode(liveCode("current")),
								)
							}
						/>
					);
					return (
						<List.Item
							key={`${snapshot.serviceName}:${snapshot.username}:${index}`}
							title={snapshot.serviceName}
							subtitle={snapshot.username || undefined}
							icon={serviceIcons[index] ?? Icon.Key}
							keywords={[
								snapshot.serviceName,
								snapshot.username,
								...snapshot.tags,
								snapshot.notes,
							]}
							accessories={[
								{
									icon: progressIcon(snapshot.remaining, snapshot.period),
								},
							]}
							detail={<TotpListDetail snapshot={snapshot} />}
							actions={
								<ActionPanel>
									<ActionPanel.Section title="Current">
										{pasteIsPrimary ? pasteCurrent : copyCurrent}
										{pasteIsPrimary ? copyCurrent : pasteCurrent}
									</ActionPanel.Section>
									<ActionPanel.Section title="Next">
										<Action
											title="Paste Next Code"
											icon={Icon.Key}
											shortcut={SHORTCUTS.pasteNext}
											onAction={() =>
												void guardAction("Unable to paste next code", () =>
													pasteCode(liveCode("next")),
												)
											}
										/>
										<Action
											title="Copy Next Code"
											icon={Icon.CopyClipboard}
											shortcut={SHORTCUTS.copyNext}
											onAction={() =>
												void guardAction("Unable to copy next code", () =>
													copyCode("Next code", liveCode("next")),
												)
											}
										/>
									</ActionPanel.Section>
									<ActionPanel.Section>
										{details}
										{noteUrl(snapshot.notes) && (
											<Action.OpenInBrowser
												title="Open Notes URL"
												url={noteUrl(snapshot.notes) ?? ""}
												icon={Icon.Link}
												shortcut={SHORTCUTS.openNotesUrl}
											/>
										)}
										<Action
											title="Refresh Export"
											icon={Icon.ArrowClockwise}
											shortcut={SHORTCUTS.refreshExport}
											onAction={() => void load()}
										/>
										<Action
											title="Refresh Service Icons"
											icon={Icon.Image}
											shortcut={SHORTCUTS.refresh}
											onAction={() => void refreshIcons()}
										/>
									</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					);
				})
			)}
		</List>
	);
}
