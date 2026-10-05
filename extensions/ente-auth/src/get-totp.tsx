import {
	Action,
	ActionPanel,
	Clipboard,
	Color,
	closeMainWindow,
	Detail,
	getPreferenceValues,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SHORTCUTS } from "./actions";
import { copyCode, guardAction } from "./clipboard";
import { readExportedSecrets } from "./ente-cli";
import {
	type EnteSecret,
	noteUrl,
	snapshotSecret,
	type TotpSnapshot,
} from "./ente-contract";
import { ensureIcons, faviconForNotes, getIconPath } from "./service-icons";

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
function progressIcon(remaining: number, period: number): { source: string } {
	const fraction = Math.max(0, Math.min(1, remaining / Math.max(period, 1)));
	const color = remaining > 10 ? "#A400B6" : "#FF9800";
	const radius = 9;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference * (1 - fraction);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="${radius}" fill="none" stroke="${color}" stroke-opacity="0.28" stroke-width="2.2"/><circle cx="12" cy="12" r="${radius}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 12 12)"/></svg>`;
	return { source: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}

function serviceIcon(snapshot: TotpSnapshot) {
	const cached = getIconPath(snapshot.serviceName);
	if (cached) return { source: cached };
	const favicon = faviconForNotes(snapshot.notes);
	return favicon ? { source: favicon } : Icon.Key;
}

// Vicinae closes the launcher asynchronously. Give the host a short,
// platform-neutral focus-settle window before requesting the native paste.
const PASTE_FOCUS_SETTLE_DELAY_MS = 100;

function waitForPasteFocus(): Promise<void> {
	return new Promise((resolve) =>
		setTimeout(resolve, PASTE_FOCUS_SETTLE_DELAY_MS),
	);
}

async function pasteCode(code: string): Promise<void> {
	await closeMainWindow();
	await waitForPasteFocus();
	await Clipboard.paste(code);
}

function TotpListDetail({ snapshot }: { snapshot: TotpSnapshot }) {
	const [timestamp, setTimestamp] = useState(Date.now());
	useEffect(() => {
		const interval = setInterval(() => setTimestamp(Date.now()), 1000);
		return () => clearInterval(interval);
	}, []);
	const current = useMemo(
		() => snapshotSecret(snapshot, timestamp),
		[snapshot, timestamp],
	);
	const url = noteUrl(current.notes);
	return (
		<List.Item.Detail
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Current" text={current.current} />
					<Detail.Metadata.Label title="Next" text={current.next} />
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label title="Username" text={current.username} />
					<Detail.Metadata.Label title="Algorithm" text={current.algorithm} />
					<Detail.Metadata.Label title="Digits" text={String(current.digits)} />
					<Detail.Metadata.Label title="Period" text={String(current.period)} />
					<Detail.Metadata.Separator />
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
					{current.tags.length > 0 && (
						<Detail.Metadata.TagList title="Tags">
							{current.tags.map((tag) => (
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
	const current = useMemo(
		() => snapshotSecret(snapshot, timestamp),
		[snapshot, timestamp],
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
	const copyCurrent = (
		<Action
			title="Copy Current Code"
			icon={Icon.CopyClipboard}
			shortcut={SHORTCUTS.copyCurrent}
			onAction={() =>
				void guardAction("Unable to copy current code", () =>
					copyCode("Current code", current.current),
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
					pasteCode(current.current),
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
							title="Copy Next Code"
							icon={Icon.CopyClipboard}
							shortcut={SHORTCUTS.copyNext}
							onAction={() =>
								void guardAction("Unable to copy next code", () =>
									copyCode("Next code", current.next),
								)
							}
						/>
						<Action
							title="Paste Next Code"
							icon={Icon.Key}
							onAction={() =>
								void guardAction("Unable to paste next code", () =>
									pasteCode(current.next),
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

	const snapshots = useMemo(() => {
		void iconEpoch;
		return secrets
			.map((secret) => snapshotSecret(secret, timestamp))
			.sort((left, right) => left.serviceName.localeCompare(right.serviceName));
	}, [iconEpoch, secrets, timestamp]);
	const preferredAction = getPreferenceValues<Preferences>().primaryAction;
	const pasteIsPrimary = preferredAction !== "copy";

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
					const details = (
						<Action.Push
							title="View Details"
							icon={Icon.Eye}
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
									copyCode("Current code", snapshot.current),
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
									pasteCode(snapshot.current),
								)
							}
						/>
					);
					return (
						<List.Item
							key={`${snapshot.serviceName}:${snapshot.username}:${index}`}
							title={snapshot.serviceName}
							subtitle={snapshot.username || undefined}
							icon={serviceIcon(snapshot)}
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
											title="Copy Next Code"
											icon={Icon.CopyClipboard}
											shortcut={SHORTCUTS.copyNext}
											onAction={() =>
												void guardAction("Unable to copy next code", () =>
													copyCode("Next code", snapshot.next),
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
											/>
										)}
										<Action
											title="Refresh Export"
											icon={Icon.ArrowClockwise}
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
