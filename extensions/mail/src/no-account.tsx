import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import AddAccount from "./add-account";

export default function NoAccount() {
	return <List.EmptyView
		icon={Icon.Envelope}
		title="No Accounts Configured"
		description="Add an email account to get started"
		actions={
			<ActionPanel>
				<Action.Push
					title="Add Account"
					target={<AddAccount />}
				/>
			</ActionPanel>
		}
	/>
}
