import {
	Action,
	ActionPanel,
	Clipboard,
	Color,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderErrorView } from "./lib/error-views";
import {
	checkAuth,
	getTotp,
	listItems,
	loginWithBrowser,
} from "./lib/pass-cli";
import { Item, PassCliError } from "./lib/types";
import {
	formatTotpCode,
	getItemIcon,
	getTotpRemainingSeconds,
} from "./lib/utils";

const PROBE_CONCURRENCY = 4;

interface TotpEntry {
	item: Item;
	code?: string;
}

function getTimeStep(): number {
	return Math.floor(Date.now() / 30_000);
}

export default function Command() {
	const [entries, setEntries] = useState<TotpEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [remainingSeconds, setRemainingSeconds] = useState(
		getTotpRemainingSeconds(),
	);
	const [error, setError] = useState<PassCliError | null>(null);
	const entriesRef = useRef<TotpEntry[]>([]);
	const timeStepRef = useRef(getTimeStep());
	const isRefreshingRef = useRef(false);

	const load = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const isAuthenticated = await checkAuth();
			if (!isAuthenticated) {
				setError(
					new PassCliError(
						"Not authenticated. Log in to access your vaults.",
						"not_authenticated",
					),
				);
				return;
			}

			const { items, failedVaults } = await listItems();
			if (failedVaults.length > 0) {
				await showToast(
					Toast.Style.Failure,
					"Some vaults failed to load",
					`Failed to load items from: ${failedVaults.join(", ")}`,
				);
			}
			const entries: TotpEntry[] = [];
			// Probe every item: the item list output does not include TOTP info,
			// so we check each item and keep only the ones that yield a code.
			await probeItems(items, (entry) => {
				entries.push(entry);
				entriesRef.current = entries;
				setEntries([...entries]);
			});
		} catch (e) {
			setError(
				e instanceof PassCliError
					? e
					: new PassCliError("Failed to load TOTP items", "unknown"),
			);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const refreshCodes = useCallback(async () => {
		if (isRefreshingRef.current) return;
		isRefreshingRef.current = true;
		setIsRefreshing(true);
		try {
			const current = entriesRef.current;
			const updated = await Promise.all(
				current.map(async (entry) => {
					try {
						const code = await getTotp(entry.item.shareId, entry.item.itemId);
						return { ...entry, code };
					} catch {
						return entry;
					}
				}),
			);
			entriesRef.current = updated;
			setEntries(updated);
		} finally {
			isRefreshingRef.current = false;
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void load();

		const interval = setInterval(() => {
			setRemainingSeconds(getTotpRemainingSeconds());

			const nextTimeStep = getTimeStep();
			if (nextTimeStep !== timeStepRef.current) {
				timeStepRef.current = nextTimeStep;
				void refreshCodes();
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [load, refreshCodes]);

	const handleLogin = useCallback(async () => {
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Starting Proton Pass login",
			message: "Complete authentication in your browser",
		});
		try {
			await loginWithBrowser();
			toast.style = Toast.Style.Success;
			toast.title = "Logged in";
			await load();
		} catch (e) {
			toast.style = Toast.Style.Failure;
			toast.title = "Login failed";
			toast.message = e instanceof Error ? e.message : undefined;
		}
	}, [load]);

	const errorView = renderErrorView(error, load, handleLogin);
	if (errorView) return errorView;

	function getTimerColor(): Color {
		if (remainingSeconds > 10) return Color.Green;
		if (remainingSeconds > 5) return Color.Yellow;
		return Color.Red;
	}

	return (
		<List
			isLoading={isLoading || isRefreshing}
			searchBarPlaceholder="Search TOTP items..."
		>
			<List.Section
				title="TOTP Codes"
				subtitle={
					isRefreshing ? "Refreshing..." : `Refreshing in ${remainingSeconds}s`
				}
			>
				{entries.map((entry) => (
					<List.Item
						key={`${entry.item.shareId}-${entry.item.itemId}`}
						icon={getItemIcon(entry.item.type)}
						title={entry.item.title}
						subtitle={entry.item.vaultName}
						accessories={[
							{
								tag: {
									value: entry.code ? formatTotpCode(entry.code) : "---",
									color: getTimerColor(),
								},
							},
							{ text: `${remainingSeconds}s`, icon: Icon.Clock },
						]}
						actions={
							<ActionPanel>
								{entry.code && (
									<Action
										title="Copy TOTP Code"
										icon={Icon.CopyClipboard}
										shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
										onAction={async () => {
											await Clipboard.copy(entry.code!, { concealed: true });
											await showToast(
												Toast.Style.Success,
												"TOTP code copied",
												entry.item.title,
											);
										}}
									/>
								)}
								<Action
									title="Refresh Codes"
									icon={Icon.ArrowClockwise}
									shortcut={{ modifiers: ["cmd"], key: "r" }}
									onAction={refreshCodes}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
			{entries.length === 0 && !isLoading && (
				<List.EmptyView
					icon={Icon.Clock}
					title="No TOTP Items"
					description="None of your items have TOTP configured"
				/>
			)}
		</List>
	);
}

async function probeItems(
	items: Item[],
	onEntry: (entry: TotpEntry) => void,
): Promise<void> {
	let next = 0;

	async function worker(): Promise<void> {
		while (next < items.length) {
			const item = items[next++];
			try {
				const code = await getTotp(item.shareId, item.itemId);
				onEntry({ item, code });
			} catch (error) {
				if (!(error instanceof PassCliError && error.type === "no_totp")) {
					throw error;
				}
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(PROBE_CONCURRENCY, items.length) }, () =>
			worker(),
		),
	);
}
