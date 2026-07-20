import { showToast, Toast } from "@vicinae/api";
import { AccountForm, saveAccount } from "./account";

export default function AddAccount({ onDone }: { onDone?: () => void } = {}) {
	return <AccountForm
		title="Add Account"
		onSubmit={async (account) => {
			saveAccount(account);
			await showToast({ title: "Account saved", style: Toast.Style.Success });
			return true;
		}}
		onDone={onDone}
	/>
}
