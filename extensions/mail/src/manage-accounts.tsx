import {
	Action,
	ActionPanel,
	Alert,
	confirmAlert,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useState, useCallback } from "react";
import { getAccounts, deleteAccount, setDefaultAccount, type Account } from "./account";
import AddAccount from "./add-account";
import EditAccount from "./edit-account";

export default function ManageAccounts() {
	const [accounts, setAccounts] = useState<Account[]>(getAccounts());

	const refresh = useCallback(() => {
		setAccounts(getAccounts());
	}, []);

	return <List searchBarPlaceholder="Search accounts">
		<List.Section>
			<List.Item
				title="Add Account"
				icon={Icon.Plus}
				actions={
					<ActionPanel>
						<Action.Push
							title="Add Account"
							target={<AddAccount onDone={refresh} />} />
					</ActionPanel>
				}
			/>
		</List.Section>
		<AccountList
			accounts={accounts}
			refresh={refresh} />
	</List>
}

function AccountList(
	{
		accounts,
		refresh
	}: {
		accounts: Account[];
		refresh: () => void
	}
) {
	if (accounts.length === 0) return null;

	return <List.Section title="Accounts">
		{accounts.map((account, i) => (
			<AccountItem
				key={i}
				account={account}
				index={i}
				refresh={refresh} />
		))}
	</List.Section>
}

async function confirmDelete(account: Account, index: number, refresh: () => void) {
	let confirmed = await confirmAlert({
		title: "Delete Account",
		message: `Are you sure you want to delete ${account.user}?`,
		primaryAction: {
			title: "Delete",
			style: Alert.ActionStyle.Destructive,
		}
	});

	if (confirmed) {
		deleteAccount(index);
		refresh();
		await showToast({
			title: "Account deleted",
			style: Toast.Style.Success,
		});
	}
}

function AccountItem(
	{
		account,
		index,
		refresh
	}: {
		account: Account;
		index: number;
		refresh: () => void
	}
) {
	const accessories: List.Item.Accessory[] = [];

	if (account.default)
		accessories.push({ icon: Icon.Star, tooltip: "Default account" });

	return <List.Item
		title={account.user}
		subtitle={account.host}
		accessories={accessories}
		actions={
			<ActionPanel>
				<Action.Push
					title="Edit Account"
					icon={Icon.Pencil}
					target={<EditAccount index={index} onDone={refresh} />}
				/>
				{!account.default && (
					<Action
						title="Set as Default"
						icon={Icon.Star}
						shortcut={{ key: "d", modifiers: ["ctrl"] }}
						onAction={() => {
							setDefaultAccount(index);
							refresh();
						}} />
				)}
				<Action
					title="Delete Account"
					icon={Icon.Trash}
					style={Action.Style.Destructive}
					shortcut={{ key: "delete", modifiers: ["ctrl"] }}
					onAction={() => confirmDelete(account, index, refresh)}
				/>
			</ActionPanel>
		}
	/>
}
