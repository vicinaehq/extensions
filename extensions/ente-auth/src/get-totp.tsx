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

function serviceIcon(snapshot: TotpSnapshot) {
	const cached = getIconPath(snapshot.serviceName);
	if (cached) return { source: cached };
	const favicon = faviconForNotes(snapshot.notes);
	return favicon ? { source: favicon } : Icon.Key;
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
			markdown={`#${current.remaining}s`}
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
					) : current.notes ? (
						<Detail.Metadata.Label title="Notes" text={current.notes} />
					) : null}
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
					{current.notes && (
						<Detail.Metadata.Label title="Notes" text={current.notes} />
					)}
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
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
					<Action.Paste
						title="Paste Current Code"
						icon={Icon.Key}
						content={current.current}
					/>
					<Action.Paste
						title="Paste Next Code"
						icon={Icon.Key}
						content={current.next}
					/>
					{url && (
						<Action.OpenInBrowser
							title="Open Notes URL"
							url={url}
							icon={Icon.Link}
						/>
					)}
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
						<Action.Paste
							title="Paste Current Code"
							icon={Icon.Key}
							content={snapshot.current}
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
									tag: {
										value: snapshot.current,
										color: timerColor(snapshot.remaining),
									},
								},
								{ text: `${snapshot.remaining}s`, icon: Icon.Clock },
							]}
							detail={<TotpListDetail snapshot={snapshot} />}
							actions={
								<ActionPanel>
									{preferredAction === "paste" ? pasteCurrent : copyCurrent}
									{preferredAction === "paste" ? copyCurrent : pasteCurrent}
									{details}
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
								</ActionPanel>
							}
						/>
					);
				})
			)}
		</List>
	);
}
