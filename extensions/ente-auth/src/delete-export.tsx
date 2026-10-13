import {
	Action,
	ActionPanel,
	confirmAlert,
	Detail,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { SHORTCUTS } from "./actions";
import { deleteEnteAuthExport, getExportFilePath } from "./ente-cli";

export default function Command() {
	const [state, setState] = useState<
		"loading" | "deleted" | "cancelled" | "error"
	>("loading");
	const [error, setError] = useState<string>();
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let active = true;
		void (async () => {
			if (
				!(await confirmAlert({
					title: "Delete the Ente Auth export?",
					message: getExportFilePath(),
				}))
			) {
				if (active) setState("cancelled");
				return;
			}
			try {
				const filePath = await deleteEnteAuthExport();
				if (active) {
					setState("deleted");
					await showToast({
						style: Toast.Style.Success,
						title: "Ente Auth export deleted",
						message: filePath,
					});
				}
			} catch (reason: unknown) {
				if (active) {
					setState("error");
					setError(reason instanceof Error ? reason.message : String(reason));
				}
			}
		})();
		return () => {
			active = false;
		};
	}, [attempt]);

	if (state === "loading")
		return <Detail markdown="# Waiting for confirmation…" />;
	if (state === "cancelled") return <Detail markdown="# Deletion cancelled" />;
	if (state === "error") {
		return (
			<Detail
				markdown={["# Delete failed", "", error ?? "Unknown error"].join("\n")}
				actions={
					<ActionPanel>
						<Action
							title="Retry"
							icon={Icon.ArrowClockwise}
							shortcut={SHORTCUTS.retry}
							onAction={() => {
								setState("loading");
								setAttempt((value) => value + 1);
							}}
						/>
					</ActionPanel>
				}
			/>
		);
	}
	return (
		<Detail
			markdown={[
				"# Ente Auth export deleted",
				"",
				"The plaintext export file has been removed.",
			].join("\n")}
		/>
	);
}
