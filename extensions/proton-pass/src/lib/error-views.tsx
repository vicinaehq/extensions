import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { PassCliError, PassCliErrorType, PROTON_PASS_CLI_DOCS } from "./types";

type ErrorViewProps = {
	error: PassCliError | PassCliErrorType | null;
	onRetry: () => void;
	onLogin?: () => void;
};

export function renderErrorView(
	error: PassCliError | PassCliErrorType | null,
	onRetry: () => void,
	onLogin?: () => void,
) {
	if (!error) return null;

	const type = typeof error === "string" ? error : error.type;
	const message = typeof error === "string" ? undefined : error.message;

	if (type === "not_installed") {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Warning}
					title="Proton Pass CLI Not Installed"
					description="Install pass-cli to use this extension."
					actions={
						<ActionPanel>
							<Action.OpenInBrowser
								title="Open Installation Guide"
								url={PROTON_PASS_CLI_DOCS}
								icon={Icon.Globe01}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	if (type === "not_authenticated") {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Lock}
					title="Not Logged In"
					description="Log in with your browser to access your vaults."
					actions={
						<ActionPanel>
							{onLogin && (
								<Action
									title="Login with Browser"
									icon={Icon.Globe01}
									onAction={onLogin}
								/>
							)}
							<Action.OpenInBrowser
								title="View CLI Documentation"
								url={PROTON_PASS_CLI_DOCS}
								icon={Icon.Globe01}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	if (type === "keyring_error") {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Key}
					title="Keyring Access Failed"
					description={
						message ??
						"pass-cli could not access secure key storage. Check the Key provider and Linux keyring backend preferences, or see the troubleshooting guide."
					}
					actions={
						<ActionPanel>
							<Action
								title="Retry"
								icon={Icon.ArrowClockwise}
								onAction={onRetry}
							/>
							<Action.OpenInBrowser
								title="View Documentation"
								url={PROTON_PASS_CLI_DOCS}
								icon={Icon.Globe01}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	if (type === "network_error") {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Wifi}
					title="Network Error"
					description="Check your internet connection and try again"
					actions={
						<ActionPanel>
							<Action
								title="Retry"
								icon={Icon.ArrowClockwise}
								onAction={onRetry}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	if (type === "timeout") {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Clock}
					title="Request Timed Out"
					description="pass-cli took too long to respond. Please try again."
					actions={
						<ActionPanel>
							<Action
								title="Retry"
								icon={Icon.ArrowClockwise}
								onAction={onRetry}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	return (
		<List>
			<List.EmptyView
				icon={Icon.Exclamationmark}
				title="Error"
				description={message ?? "An unknown error occurred"}
				actions={
					<ActionPanel>
						<Action
							title="Retry"
							icon={Icon.ArrowClockwise}
							onAction={onRetry}
						/>
						<Action.OpenInBrowser
							title="View Documentation"
							url={PROTON_PASS_CLI_DOCS}
							icon={Icon.Globe01}
						/>
					</ActionPanel>
				}
			/>
		</List>
	);
}
