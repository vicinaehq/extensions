import {
	Action,
	ActionPanel,
	Color,
	Detail,
	environment,
	getPreferenceValues,
	Icon,
	Keyboard,
	List,
	openExtensionPreferences,
	showToast,
	Toast,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { liveRefresher, watchLogs } from "./lib/live";
import { PROVIDERS } from "./lib/providers";
import { ProjectsView } from "./projects-view";
import { type SpendRow, spendChartSvg, svgDataUrl } from "./lib/spend-chart";
import { loadLimits, loadSnapshot, saveLimits, saveSnapshot } from "./lib/cache";
import { fetchLimits, formatReset, isFresh, nextResetBoundary, type LimitsReport, type LimitsSnapshot, type LimitWindow } from "./lib/limits";
import { checkTokscale, INSTALL_COMMAND, MIN_TOKSCALE_VERSION, type TokscaleStatus } from "./lib/tokscale";
import {
	fetchSnapshot,
	formatAge,
	formatCost,
	formatTokens,
	type PeriodTotal,
	periods,
	providerSpend,
	CLAUDE_SUBSCRIPTION_PROVIDERS,
	parsePrice,
	subscriptionMonthCost,
	type Snapshot,
} from "./lib/usage";

function installMarkdown(status: Exclude<TokscaleStatus, { kind: "ok" }>): string {
	const reason =
		status.kind === "missing"
			? "`tokscale` was not found on your PATH."
			: status.kind === "outdated"
				? `tokscale ${status.version} is installed, but ${MIN_TOKSCALE_VERSION} or newer is required.`
				: `Could not read the tokscale version: \`${status.output}\``;
	return `# tokscale required

${reason}

This extension reads Claude Code, OpenCode and Codex usage through [tokscale](https://github.com/junhoyeo/tokscale).

## Install or update

\`\`\`sh
${INSTALL_COMMAND}
\`\`\`

Or with npm: \`npm install -g tokscale\`.

Make sure the directory holding \`tokscale\` (for bun: \`~/.bun/bin\`) is on the PATH Vicinae starts with, then press **Retry**.`;
}

const TOOL_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode" };

function breakdownMarkdown(title: string, period: PeriodTotal, costIncomplete: boolean): string {
	const lines = [`# ${title}`, "", `**${formatTokens(period.tokens)} tokens · ${formatCost(period.cost)}**`, ""];
	if (period.tools.length === 0) lines.push("No usage in this period.");
	for (const tool of period.tools) {
		lines.push(
			`## ${TOOL_NAMES[tool.client] ?? tool.client} — ${formatTokens(tool.tokens)} · ${formatCost(tool.cost)}`,
			"",
			"| Model | Tokens | Cost |",
			"|---|---:|---:|",
			...tool.models.map((m) => `| ${m.model} | ${formatTokens(m.tokens)} | ${formatCost(m.cost)} |`),
			"",
		);
	}
	if (costIncomplete) lines.push("_Some usage is unpriced or uses stale pricing; cost may be incomplete._");
	return lines.join("\n");
}

function usedColor(percent: number): Color {
	return percent >= 90 ? Color.Red : percent >= 70 ? Color.Orange : Color.Green;
}

function bar(percent: number): string {
	const filled = Math.round(Math.min(100, Math.max(0, percent)) / 5);
	return "█".repeat(filled) + "░".repeat(20 - filled);
}

function windowMarkdown(provider: string, w: LimitWindow, others: LimitWindow[]): string {
	const resetAt = w.resetsAt
		? new Date(w.resetsAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
		: w.resetText;
	return [
		`# ${provider} · ${w.label}`,
		"",
		`## ${w.usedPercent}% used`,
		"",
		`\`${bar(w.usedPercent)}\``,
		"",
		w.amount
			? `**${formatCost(w.amount.total - w.amount.used)} left** of ${formatCost(w.amount.total)} (${formatCost(w.amount.used)} used)`
			: "",
		"",
		`**${100 - w.usedPercent}% left**${resetAt ? ` · resets ${resetAt}` : ""}${w.resetsAt ? ` (${formatReset(w)?.replace(/^resets /, "")})` : ""}`,
		"",
		others.length ? `Other windows: ${others.map((o) => `${o.label} ${o.usedPercent}%`).join(" · ")}` : "",
	].join("\n");
}

type Spend = { today: number; week: number; month: number };

function spendMarkdown(mine: Spend | undefined, key: Spend | undefined, mode: "light" | "dark"): string {
	if (!mine || !key) return "";
	const rows: SpendRow[] = [
		{ label: "Today", mine: mine.today, key: key.today },
		{ label: "This week", mine: mine.week, key: key.week },
		{ label: "This month", mine: mine.month, key: key.month },
	];
	return [
		"",
		"### Your share of this API key",
		"",
		`![Your spend vs others on this key](${svgDataUrl(spendChartSvg(rows, mode))})`,
		"",
		"| | You | Whole key |",
		"|---|---:|---:|",
		...rows.map((r) => `| ${r.label} | ${formatCost(r.mine)} | ${formatCost(r.key)} |`),
		"",
		"_You: your Claude Code, OpenCode and Codex requests through OpenRouter, from local logs at list prices. Whole key: everyone using it, as billed by OpenRouter (UTC periods)._",
	].join("\n");
}

// The OpenRouter row that carries the "your share of this key" chart: the key limit, else credits.
function shareWindow(report: LimitsReport): LimitWindow | undefined {
	if (!report.available || report.provider !== "OpenRouter" || !report.spend) return undefined;
	return report.windows.find((w) => w.label.endsWith(" limit")) ?? report.windows[0];
}

function clock(ms: number): string {
	return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function staleNote(report: LimitsReport): string {
	if (!report.available) return "";
	const warning = report.warning ? `\n\n> **Partly unavailable:** ${report.warning}.` : "";
	if (!report.stale) return warning;
	const retry = report.retryAfter ? ` Next try at ${clock(report.retryAfter)}.` : "";
	return `\n\n> **Values from ${clock(report.stale.asOf)}.** Latest fetch failed: ${report.stale.reason}.${retry}${warning}`;
}

function limitsMetadata(report: Extract<LimitsReport, { available: true }>, fetchedAt: number) {
	return (
		<List.Item.Detail.Metadata>
			{report.plan && <List.Item.Detail.Metadata.Label title="Plan" text={report.plan} />}
			<List.Item.Detail.Metadata.Label title="Source" text={report.source} />
			<List.Item.Detail.Metadata.Label title="Updated" text={formatAge(Date.now() - fetchedAt)} />
		</List.Item.Detail.Metadata>
	);
}

function LimitRows({ limits, mine, actions }: { limits: LimitsSnapshot; mine?: Spend; actions: React.ReactNode }) {
	return (
		<List.Section title="Limits" subtitle={`Updated ${formatAge(Date.now() - limits.fetchedAt)}`}>
			{limits.reports.flatMap((report) =>
				report.available
					? report.windows.map((w: LimitWindow) => (
							<List.Item
								key={`${report.provider}-${w.label}`}
								title={`${report.provider} · ${w.label}`}
								icon={Icon.Gauge}
								accessories={[
									...(report.stale
										? [{ text: { value: `as of ${clock(report.stale.asOf)}`, color: Color.Orange }, tooltip: report.stale.reason }]
										: []),
									...(report.warning ? [{ icon: { source: Icon.Warning, tintColor: Color.Orange }, tooltip: report.warning }] : []),
									{ tag: { value: `${w.usedPercent}%`, color: usedColor(w.usedPercent) } },
									...(w === shareWindow(report) && mine ? [{ text: `you ${formatCost(mine.today)} today` }] : []),
									{ text: w.amount ? `${formatCost(w.amount.total - w.amount.used)} left` : (formatReset(w) ?? "") },
								]}
								detail={
									<List.Item.Detail
										markdown={
											windowMarkdown(
												report.provider,
												w,
												report.windows.filter((o) => o !== w),
											) + staleNote(report) + (w === shareWindow(report) ? spendMarkdown(mine, report.spend, environment.appearance) : "")
										}
										metadata={limitsMetadata(report, limits.fetchedAt)}
									/>
								}
								actions={actions}
							/>
						))
					: [
							<List.Item
								key={report.provider}
								title={`${report.provider} limits`}
								icon={Icon.Warning}
								accessories={[
									{ text: report.retryAfter ? `unavailable · retry ${clock(report.retryAfter)}` : "unavailable" },
								]}
								detail={
									<List.Item.Detail markdown={`# ${report.provider} limits\n\nUnavailable: ${report.reason}`} />
								}
								actions={actions}
							/>,
						],
			)}
		</List.Section>
	);
}

type Value = { cost: number; price: number | null; plan?: string; multiple: number | null };

function subscriptionValue(cost: number, price: number | null, plan?: string): Value {
	return { cost, price, plan, multiple: price ? cost / price : null };
}

function valueMarkdown(v: Value): string {
	const plan = v.plan ? ` (${v.plan})` : "";
	const body =
		v.multiple !== null && v.price
			? `## ${v.multiple.toFixed(1)}× your plan\n\nClaude usage this month is worth **${formatCost(v.cost)}** at list prices; you pay **${formatCost(v.price)}/month**${plan}.`
			: `Claude usage this month is worth **${formatCost(v.cost)}** at list prices${plan}. Set your subscription price in preferences to see it as a multiple.`;
	return `\n\n---\n\n### Claude subscription\n\n${body}\n\n_Counts Claude Code and OpenCode through your Claude login._`;
}

export default function Command() {
	const [status, setStatus] = useState<TokscaleStatus | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [snapshot, setSnapshot] = useState<Snapshot | null>(loadSnapshot);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [limits, setLimits] = useState<LimitsSnapshot | null>(loadLimits);
	const [limitsLoading, setLimitsLoading] = useState(true);

	// force: the user pressed Refresh; otherwise only when the cache is older than 5 min
	const refreshLimits = useCallback(async (force: boolean) => {
		const cached = loadLimits();
		if (!force && isFresh(cached)) {
			setLimitsLoading(false);
			return;
		}
		setLimitsLoading(true);
		const fresh = await fetchLimits(PROVIDERS, cached);
		saveLimits(fresh);
		setLimits(fresh);
		setLimitsLoading(false);
	}, []);

	const refresh = useCallback(async (force = false) => {
		refreshLimits(force);
		setLoading(true);
		try {
			const fresh = await fetchSnapshot();
			saveSnapshot(fresh);
			setSnapshot(fresh);
			setError(null);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			setError(message);
			showToast({ style: Toast.Style.Failure, title: "Usage data unavailable", message });
		} finally {
			setLoading(false);
		}
	}, [refreshLimits]);

	// Live usage while tmon is open: log writes re-run tokscale with Token Monitor's 1.5 s debounce / 5 s ceiling.
	const tokscaleOk = status?.kind === "ok";
	useEffect(() => {
		if (!tokscaleOk) return;
		const live = liveRefresher(async () => {
			try {
				const fresh = await fetchSnapshot();
				saveSnapshot(fresh);
				setSnapshot(fresh);
			} catch {
				// silent: the visible data stays, the next change or ⌘R tries again
			}
		});
		const stopWatching = watchLogs(live.markDirty);
		return () => {
			stopWatching();
			live.stop();
		};
	}, [tokscaleOk]);

	// Refresh limits 30 s after the next window reset while tmon stays open.
	useEffect(() => {
		const boundary = nextResetBoundary(limits);
		if (boundary === null) return;
		const delay = boundary - Date.now();
		if (delay <= 0 || delay > 24 * 3600_000) return;
		const timer = setTimeout(() => refreshLimits(false), delay);
		return () => clearTimeout(timer);
	}, [limits, refreshLimits]);

	useEffect(() => {
		setStatus(null);
		checkTokscale().then((s) => {
			setStatus(s);
			if (s.kind === "ok") refresh();
			else {
				setLoading(false);
				setLimitsLoading(false);
			}
		});
	}, [attempt, refresh]);

	if (status && status.kind !== "ok") {
		return (
			<Detail
				markdown={installMarkdown(status)}
				actions={
					<ActionPanel>
						<Action.CopyToClipboard title="Copy Install Command" content={INSTALL_COMMAND} />
						<Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => setAttempt((n) => n + 1)} />
					</ActionPanel>
				}
			/>
		);
	}

	const refreshAction = (
		<Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh} onAction={() => refresh(true)} />
	);

	if (!snapshot) {
		return (
			<List isLoading={loading}>
				{loading ? (
					<List.EmptyView
						icon={Icon.Hourglass}
						title="Scanning usage for the first time…"
						description="tokscale is reading your Claude Code, OpenCode and Codex logs. A large history can take a while."
					/>
				) : (
					<List.EmptyView
						icon={Icon.Warning}
						title="Usage data unavailable"
						description={error ?? "tokscale returned no data."}
						actions={<ActionPanel>{refreshAction}</ActionPanel>}
					/>
				)}
			</List>
		);
	}

	const p = periods(snapshot.days, new Date());
	const claudePlan = limits?.reports.find((r) => r.provider === "Claude Code" && r.available);
	const value = subscriptionValue(
		subscriptionMonthCost(snapshot.days, new Date(), CLAUDE_SUBSCRIPTION_PROVIDERS),
		parsePrice(getPreferenceValues<{ claudeMonthlyPrice?: string }>().claudeMonthlyPrice),
		claudePlan?.available ? claudePlan.plan : undefined,
	);
	const rows: [string, PeriodTotal][] = [
		["Today", p.today],
		["Last 7 Days", p.week],
		["This Month", p.month],
	];

	return (
		<List isLoading={loading || limitsLoading} isShowingDetail>
			{limits && (
				<LimitRows
					limits={limits}
					mine={providerSpend(snapshot.days, new Date(), "openrouter")}
					actions={<ActionPanel>{refreshAction}</ActionPanel>}
				/>
			)}
			<List.Section title="Usage" subtitle={`Updated ${formatAge(Date.now() - snapshot.fetchedAt)} · live`}>
				{rows.map(([title, period]) => {
					const isMonth = period === p.month;
					return (
						<List.Item
							key={title}
							title={title}
							icon={Icon.BarChart}
							accessories={[
								...(isMonth && value.multiple !== null
									? [{ tag: { value: `${value.multiple.toFixed(1)}× plan`, color: Color.Blue }, tooltip: "Claude usage at list price vs what you pay" }]
									: []),
								{ text: formatTokens(period.tokens) },
								{ text: formatCost(period.cost) },
							]}
							detail={
								<List.Item.Detail
									markdown={
										breakdownMarkdown(title, period, snapshot.costIncomplete) + (isMonth ? valueMarkdown(value) : "")
									}
								/>
							}
							actions={
								<ActionPanel>
									{refreshAction}
									{isMonth && (
										<Action
											title="Set Claude Subscription Price"
											icon={Icon.Cog}
											shortcut={Keyboard.Shortcut.Common.Edit}
											onAction={openExtensionPreferences}
										/>
									)}
								</ActionPanel>
							}
						/>
					);
				})}
			</List.Section>
			<List.Section title="Browse">
				<List.Item
					title="By Project"
					subtitle="This month's sessions per project"
					icon={Icon.Folder}
					detail={
						<List.Item.Detail
							markdown={"# By Project\n\nThis month's usage per project, then per session, with session titles from Claude Code, Codex and OpenCode.\n\nPress **Enter** to open."}
						/>
					}
					actions={
						<ActionPanel>
							<Action.Push title="Show Projects" icon={Icon.Folder} target={<ProjectsView />} />
							{refreshAction}
						</ActionPanel>
					}
				/>
			</List.Section>
		</List>
	);
}
