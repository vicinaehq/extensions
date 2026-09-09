import { showToast, Toast } from "@vicinae/api";
import { AccountForm, getAccounts, updateAccount } from "./account";

export default function EditAccount({ index, onDone }: { index: number; onDone?: () => void }) {
	const account = getAccounts()[index];

	return <AccountForm
		title="Edit Account"
		initialValues={account}
		existingPassword={account.pass}
		passwordPlaceholder="Leave empty to keep current password"
		onSubmit={async (updated) => {
			updateAccount(index, updated);
			await showToast({ title: "Account updated", style: Toast.Style.Success });
			return true;
		}}
		onDone={onDone}
	/>
}
