import { Action, ActionPanel, Color, Icon, Keyboard, List, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import { loadProjects, saveProjects } from "./lib/cache";
import { fetchProjects, type Project, type ProjectsSnapshot, type SessionRow } from "./lib/projects";
import { formatAge, formatCost, formatTokens } from "./lib/usage";

const TOOLS: Record<string, { name: string; color: Color }> = {
	claude: { name: "Claude Code", color: Color.Orange },
	codex: { name: "Codex", color: Color.Blue },
	opencode: { name: "OpenCode", color: Color.Purple },
};
const tool = (client: string) => TOOLS[client] ?? { name: client, color: Color.SecondaryText };

function sessionMarkdown(s: SessionRow): string {
	return [
		`# ${s.title ?? "Untitled session"}`,
		"",
		`**${formatTokens(s.tokens)} tokens · ${formatCost(s.cost)}** this month`,
		"",
		"| Model | Tokens | Cost |",
		"|---|---:|---:|",
		...s.models.map((m) => `| ${m.model} | ${formatTokens(m.tokens)} | ${formatCost(m.cost)} |`),
	].join("\n");
}

function SessionsView({ project }: { project: Project }) {
	return (
		<List navigationTitle={project.label} isShowingDetail searchBarPlaceholder="Filter sessions">
			<List.Section title={project.label} subtitle={`${project.sessions.length} sessions · ${formatCost(project.cost)} this month`}>
				{project.sessions.map((s) => (
					<List.Item
						key={`${s.client}:${s.sessionId}`}
						title={s.title ?? s.sessionId}
						keywords={[tool(s.client).name, s.sessionId]}
						icon={Icon.SpeechBubble}
						accessories={[{ tag: { value: tool(s.client).name, color: tool(s.client).color } }, { text: formatCost(s.cost) }]}
						detail={
							<List.Item.Detail
								markdown={sessionMarkdown(s)}
								metadata={
									<List.Item.Detail.Metadata>
										<List.Item.Detail.Metadata.Label title="Tool" text={tool(s.client).name} />
										<List.Item.Detail.Metadata.Label title="Project" text={project.label} />
										<List.Item.Detail.Metadata.Label title="Session ID" text={s.sessionId} />
									</List.Item.Detail.Metadata>
								}
							/>
						}
						actions={
							<ActionPanel>
								<Action.CopyToClipboard title="Copy Session ID" content={s.sessionId} />
								{s.title && <Action.CopyToClipboard title="Copy Title" content={s.title} />}
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}

export function ProjectsView() {
	const [snapshot, setSnapshot] = useState<ProjectsSnapshot | null>(loadProjects);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const fresh = await fetchProjects();
			saveProjects(fresh);
			setSnapshot(fresh);
			setError(null);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			setError(message);
			showToast({ style: Toast.Style.Failure, title: "Project data unavailable", message });
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const refreshAction = (
		<Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh} onAction={refresh} />
	);

	return (
		<List isLoading={loading} navigationTitle="By Project" searchBarPlaceholder="Filter projects">
			{!snapshot && (
				<List.EmptyView
					icon={loading ? Icon.Hourglass : Icon.Warning}
					title={loading ? "Reading sessions…" : "Project data unavailable"}
					description={loading ? "Matching this month's sessions to their projects." : (error ?? undefined)}
					actions={<ActionPanel>{refreshAction}</ActionPanel>}
				/>
			)}
			{snapshot && (
				<List.Section title="This Month" subtitle={`Updated ${formatAge(Date.now() - snapshot.fetchedAt)}`}>
					{snapshot.projects.map((p) => (
						<List.Item
							key={p.key}
							title={p.label}
							icon={Icon.Folder}
							accessories={[
								{ text: `${p.sessions.length} session${p.sessions.length === 1 ? "" : "s"}` },
								{ text: formatTokens(p.tokens) },
								{ text: formatCost(p.cost) },
							]}
							actions={
								<ActionPanel>
									<Action.Push title="Show Sessions" icon={Icon.SpeechBubble} target={<SessionsView project={p} />} />
									{refreshAction}
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			)}
		</List>
	);
}
