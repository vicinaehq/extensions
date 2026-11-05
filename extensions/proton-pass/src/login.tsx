import {
	Action,
	ActionPanel,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { checkAuth, loginWithBrowser } from "./lib/pass-cli";
import { PassCliError, PROTON_PASS_CLI_DOCS } from "./lib/types";

type AuthState =
	| "loading"
	| "not-installed"
	| "not-authenticated"
	| "authenticated";

export default function Command() {
	const [authState, setAuthState] = useState<AuthState>("loading");
	const [isLoggingIn, setIsLoggingIn] = useState(false);

	useEffect(() => {
		async function verifyAuth() {
			try {
				const isAuthenticated = await checkAuth();
				setAuthState(isAuthenticated ? "authenticated" : "not-authenticated");
			} catch (error) {
				if (error instanceof PassCliError) {
					if (error.type === "not_installed") {
						setAuthState("not-installed");
						return;
					}
					if (error.type === "not_authenticated") {
						setAuthState("not-authenticated");
						return;
					}
				}
				await showToast(
					Toast.Style.Failure,
					"Error checking authentication status",
					error instanceof Error ? error.message : undefined,
				);
				setAuthState("not-authenticated");
			}
		}

		void verifyAuth();
	}, []);

	async function handleBrowserLogin() {
		setIsLoggingIn(true);
		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Starting Proton Pass login",
			message: "Complete authentication in your browser",
		});

		try {
			await loginWithBrowser();
			const isAuthenticated = await checkAuth();
			if (!isAuthenticated) {
				throw new PassCliError(
					"Login did not complete. Please try again.",
					"not_authenticated",
				);
			}
			setAuthState("authenticated");
			toast.style = Toast.Style.Success;
			toast.title = "Logged in";
			toast.message = "Proton Pass session is active";
		} catch (error) {
			toast.style = Toast.Style.Failure;
			toast.title = "Login failed";
			toast.message = error instanceof Error ? error.message : undefined;
			setAuthState("not-authenticated");
		} finally {
			setIsLoggingIn(false);
		}
	}

	if (authState === "loading" || isLoggingIn) {
		return <List isLoading />;
	}

	if (authState === "not-installed") {
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

	if (authState === "not-authenticated") {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Lock}
					title="Not Logged In"
					description="Log in with your browser to access your vaults."
					actions={
						<ActionPanel>
							<Action
								title="Login with Browser"
								icon={Icon.Globe01}
								onAction={handleBrowserLogin}
							/>
							<Action.OpenInBrowser
								title="View CLI Documentation"
								url={PROTON_PASS_CLI_DOCS}
								icon={Icon.Globe01}
								shortcut={{ modifiers: ["cmd"], key: "d" }}
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
				icon={Icon.CheckCircle}
				title="You're Logged In"
				description="You are authenticated with Proton Pass. Use the other commands to search and copy credentials."
				actions={
					<ActionPanel>
						<Action
							title="Re-Run Browser Login"
							icon={Icon.Globe01}
							onAction={handleBrowserLogin}
						/>
						<Action.OpenInBrowser
							title="View CLI Documentation"
							url={PROTON_PASS_CLI_DOCS}
							icon={Icon.Globe01}
							shortcut={{ modifiers: ["cmd"], key: "d" }}
						/>
					</ActionPanel>
				}
			/>
		</List>
	);
}
