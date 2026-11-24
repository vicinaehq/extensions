import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { SHORTCUTS } from "./actions";
import { exportEnteAuthSecrets } from "./ente-cli";

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
				if (active) {
					setState({
						loading: false,
						message: `Imported ${secrets.length} TOTP account${secrets.length === 1 ? "" : "s"} from ${filePath}.`,
					});
					void showToast({
						style: Toast.Style.Success,
						title: "Ente Auth secrets imported",
						message: `${secrets.length} account${secrets.length === 1 ? "" : "s"} ready in Get Ente Auth TOTP`,
					});
				}
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
		return <Detail markdown="# Importing Ente Auth secrets…" />;
	if (state.error) {
		return (
			<Detail
				markdown={`# Import failed\n\n${state.error}`}
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
			markdown={`# Ente Auth import complete\n\n${state.message ?? "The export is ready."}`}
		/>
	);
}
