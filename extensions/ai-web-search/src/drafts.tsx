import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	Toast,
	showToast,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
	type DraftRecord,
	type PendingApprovalEntry,
	listPendingApprovals,
	resolveDraft,
} from "./daemon";

function formatExpiry(expiresAtSec: number): string {
	const remMin = Math.max(0, Math.round((expiresAtSec - Math.floor(Date.now() / 1000)) / 60));
	if (remMin < 60) return `expires in ${remMin}m`;
	const hrs = Math.round(remMin / 60);
	return `expires in ${hrs}h`;
}

function buildMailtoUrl(draft: DraftRecord): string {
	const params = new URLSearchParams();
	params.set("subject", draft.subject);
	params.set("body", draft.body);
	if (draft.cc.length > 0) params.set("cc", draft.cc.join(","));
	return `mailto:${draft.to.join(",")}?${params.toString()}`;
}

function buildDraftDetailMarkdown(entry: PendingApprovalEntry): string {
	const { draft, challenge } = entry;
	const lines = [
		`### ${draft.subject || "(No Subject)"}`,
		`**To:** ${draft.to.join(", ")}`,
	];
	if (draft.cc.length > 0) {
		lines.push(`**Cc:** ${draft.cc.join(", ")}`);
	}
	if (draft.attachments.length > 0) {
		lines.push(
			`**Attachments:** ${draft.attachments.map((a) => `\`${a}\``).join(", ")}`,
		);
	}
	lines.push(
		`**Status:** ${challenge ? "Awaiting confirmation to send" : "Pending draft"} · *${formatExpiry(draft.expires_at)}*`,
		"---",
		draft.body || "_Empty message body._",
	);
	return lines.join("\n\n");
}

export default function ReviewDraftsCommand() {
	const [entries, setEntries] = useState<PendingApprovalEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setErrorMsg(null);
		try {
			const res = await listPendingApprovals();
			setEntries(res);
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : String(err));
			setEntries([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleDecision = async (entry: PendingApprovalEntry, approve: boolean) => {
		const id = entry.draft.draft_id;
		setBusyId(id);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: approve ? "Sending email via SMTP..." : "Discarding draft...",
		});
		try {
			const outcome = await resolveDraft(id, approve, entry.challenge);
			toast.style = Toast.Style.Success;
			toast.title = approve ? "Email Sent" : "Draft Discarded";
			toast.message = outcome.sent_message_id ?? outcome.outcome;
			await refresh();
		} catch (err) {
			toast.style = Toast.Style.Failure;
			toast.title = approve ? "Send Failed" : "Discard Failed";
			toast.message = err instanceof Error ? err.message : String(err);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<List
			isShowingDetail={entries.length > 0}
			isLoading={loading || busyId !== null}
			navigationTitle="Review Email Drafts"
			searchBarPlaceholder="Filter pending email drafts..."
		>
			{entries.map((entry) => {
				const { draft, challenge } = entry;
				const awaiting = Boolean(challenge) || draft.status === "awaiting_ui";
				return (
					<List.Item
						key={draft.draft_id}
						id={draft.draft_id}
						title={draft.subject || "(No Subject)"}
						subtitle={`To: ${draft.to.join(", ")}`}
						icon={{
							source: awaiting ? Icon.Envelope : Icon.BlankDocument,
							tintColor: awaiting ? Color.Orange : Color.Blue,
						}}
						accessories={[
							awaiting
								? { tag: { value: "Confirm Send", color: Color.Orange } }
								: { tag: { value: "Draft", color: Color.SecondaryText } },
							...(draft.attachments.length > 0
								? [{ text: `${draft.attachments.length} file(s)` }]
								: []),
						]}
						detail={<List.Item.Detail markdown={buildDraftDetailMarkdown(entry)} />}
						actions={
							<ActionPanel>
								<Action
									title="Send Email Now"
									icon={Icon.Envelope}
									onAction={() => void handleDecision(entry, true)}
								/>
								<Action.OpenInBrowser
									title="Open in Mail Client"
									url={buildMailtoUrl(draft)}
								/>
								<Action.CopyToClipboard title="Copy Body" content={draft.body} />
								<Action
									title="Discard Draft"
									icon={Icon.Trash}
									style={Action.Style.Destructive}
									shortcut={{ modifiers: ["ctrl"], key: "x" }}
									onAction={() => void handleDecision(entry, false)}
								/>
								<Action
									title="Refresh Drafts"
									icon={Icon.ArrowClockwise}
									shortcut={{ modifiers: ["ctrl"], key: "r" }}
									onAction={() => void refresh()}
								/>
							</ActionPanel>
						}
					/>
				);
			})}

			{!loading && entries.length === 0 && (
				<List.EmptyView
					title={errorMsg ? "Draft Queue Unavailable" : "No Pending Email Drafts"}
					description={
						errorMsg ??
						"Drafts created by omafind / Antigravity CLI appear here for explicit confirmation before sending."
					}
					icon={Icon.Envelope}
					actions={
						<ActionPanel>
							<Action
								title="Refresh Drafts"
								icon={Icon.ArrowClockwise}
								onAction={() => void refresh()}
							/>
						</ActionPanel>
					}
				/>
			)}
		</List>
	);
}
