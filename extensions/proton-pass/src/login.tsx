import {
	Action,
	ActionPanel,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { clearCache } from "./cache";
import { checkAuth, login } from "./pass-cli";

type AuthState = "loading" | "authenticated" | "not-authenticated";

export default function Command() {
	const [state, setState] = useState<AuthState>("loading");
	const [working, setWorking] = useState(false);
	const [error, setError] = useState<string>();

	async function refresh(): Promise<boolean> {
		setError(undefined);
		try {
			const authenticated = await checkAuth();
			setState(authenticated ? "authenticated" : "not-authenticated");
			return authenticated;
		} catch (reason: unknown) {
			setState("not-authenticated");
			setError(reason instanceof Error ? reason.message : String(reason));
			return false;
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function runLogin(): Promise<void> {
		setWorking(true);
		setError(undefined);
		try {
			await login();
			await clearCache();
			if (!(await refresh()))
				throw new Error("The Proton Pass session is still not authenticated.");
			await showToast({
				style: Toast.Style.Success,
				title: "Proton Pass login completed",
			});
		} catch (reason: unknown) {
			const message = reason instanceof Error ? reason.message : String(reason);
			setError(message);
			await showToast({
				style: Toast.Style.Failure,
				title: "Proton Pass login failed",
				message,
			});
		} finally {
			setWorking(false);
		}
	}

	if (state === "loading" || working) return <List isLoading />;

	return (
		<List>
			<List.EmptyView
				icon={state === "authenticated" ? Icon.CheckCircle : Icon.Lock}
				title={
					state === "authenticated"
						? "Proton Pass is authenticated"
						: "Proton Pass is not authenticated"
				}
				description={
					error ??
					(state === "authenticated"
						? "The local pass-cli session is ready."
						: "Run browser login to create a local pass-cli session.")
				}
				actions={
					<ActionPanel>
						<Action
							title={
								state === "authenticated"
									? "Run Login Again"
									: "Login with pass-cli"
							}
							icon={Icon.Globe01}
							onAction={() => void runLogin()}
						/>
						<Action
							title="Check Authentication"
							icon={Icon.ArrowClockwise}
							onAction={() => void refresh()}
						/>
					</ActionPanel>
				}
			/>
		</List>
	);
}
