import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { useEffect, useState } from "react";
import { SHORTCUTS } from "./actions";
import { exportEnteAuthSecrets, getExportFilePath } from "./ente-cli";

export default function Command() {
	const [state, setState] = useState<{
		loading: boolean;
		message?: string;
		error?: string;
	}>({ loading: true });

	useEffect(() => {
		let active = true;
		void exportEnteAuthSecrets()
			.then(({ filePath, secrets }) => {
				if (active)
					setState({
						loading: false,
						message: `Exported ${secrets.length} TOTP account${secrets.length === 1 ? "" : "s"} to ${filePath}.`,
					});
			})
			.catch((reason: unknown) => {
				if (active)
					setState({
						loading: false,
						error: reason instanceof Error ? reason.message : String(reason),
					});
			});
		return () => {
			active = false;
		};
	}, []);

	if (state.loading)
		return <Detail markdown="# Exporting Ente Auth secrets…" />;
	if (state.error) {
		return (
			<Detail
				markdown={`# Export failed\n\n${state.error}`}
				actions={
					<ActionPanel>
						<Action.OpenInBrowser
							title="Open Ente CLI Guide"
							url="https://github.com/ente-io/ente/tree/main/cli"
							icon={Icon.Globe01}
							shortcut={SHORTCUTS.openCliGuide}
						/>
					</ActionPanel>
				}
			/>
		);
	}
	return (
		<Detail
			markdown={`# Ente Auth export complete\n\n${state.message ?? `Export file: ${getExportFilePath()}`}`}
		/>
	);
}
