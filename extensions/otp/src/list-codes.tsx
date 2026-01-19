import {
	Action,
	ActionPanel,
	Icon,
	List,
	showToast,
	useNavigation,
	confirmAlert,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { getOTPAccount, listOTPAccounts, updateOTPAccount, deleteOTPAccount } from "./keyring";
import { createOTPUrl, generateOTP, incrementHOTPCounter } from "./otp";
import type { OTPItem } from "./types";
import { formatOTPCode, getTimeLeftForTOTP, showErrorToast } from "./utils";
import QRCodeDisplay from "./qr-code";

export default function ListOTPCodes() {
	const { push } = useNavigation();
	const [items, setItems] = useState<OTPItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		loadAccounts();

		// Auto-refresh TOTP codes every second
		const interval = setInterval(() => {
			loadAccounts();
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	const loadAccounts = async () => {
		try {
			const accounts = await listOTPAccounts();
			const otpItems: OTPItem[] = [];

			for (const accountName of accounts) {
				const account = await getOTPAccount(accountName);
				if (account) {
					const code = generateOTP(account);
					const timeLeft =
						account.type === "totp"
							? getTimeLeftForTOTP()
							: undefined;

					otpItems.push({
						name: account.name,
						code,
						type: account.type,
						timeLeft,
						counter: account.counter,
					});
				}
			}

			setItems(otpItems);
		} catch (error) {
			await showErrorToast(showToast, "Error", error);
		} finally {
			setIsLoading(false);
		}
	};

	const showQRCode = async (item: OTPItem) => {
		try {
			const account = await getOTPAccount(item.name);
			if (account) {
				const url = createOTPUrl(account);
				push(<QRCodeDisplay url={url} />);
			}
		} catch (error) {
			await showErrorToast(showToast, "Error", error);
		}
	};

	const copyCode = async (item: OTPItem) => {
		// For HOTP, increment counter after copying
		if (item.type === "hotp") {
			try {
				const account = await getOTPAccount(item.name);
				if (account && account.counter !== undefined) {
					const updatedAccount = incrementHOTPCounter(account);
					await updateOTPAccount(updatedAccount);
					// Refresh the list to show updated counter
					await loadAccounts();
				}
			} catch (error) {
				await showErrorToast(showToast, "Error", error);
			}
		}

		await showToast({
			title: "Copied",
			message: "OTP code copied to clipboard",
		});
	};

	const deleteAccount = async (item: OTPItem) => {
		const confirmed = await confirmAlert({
			title: "Delete OTP Account",
			message: `Are you sure you want to delete the account "${item.name}"? This action cannot be undone.`,
			primaryAction: { title: "Delete" },
			dismissAction: { title: "Cancel" },
		});

		if (confirmed) {
			try {
				await deleteOTPAccount(item.name);
				await showToast({
					title: "Deleted",
					message: `Account "${item.name}" has been deleted`,
				});
				// Refresh the list to remove the deleted account
				await loadAccounts();
			} catch (error) {
				await showErrorToast(showToast, "Error", error);
			}
		}
	};

	if (isLoading) {
		return <List isLoading />;
	}

	if (items.length === 0) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Key}
					title="No OTP Accounts"
					description="No OTP accounts configured. Add your first account to get started with two-factor authentication."
					actions={
						<ActionPanel>
							<Action.Open
								title="Add Account"
								icon={Icon.Plus}
								target="vicinae://extensions/knoopx/otp/add-account"
								shortcut={{ modifiers: ["ctrl"], key: "n" }}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	return (
		<List
			searchBarPlaceholder="Search OTP accounts..."
		>
			<List.Section
				title={`OTP Codes (${items.length})`}
				subtitle="TOTP codes auto-refresh every second. HOTP codes increment counter on use."
			>
				{items.map((item) => (
					<List.Item
						key={item.name}
						title={item.name}
						subtitle={`${formatOTPCode(item.code)} ${
							item.type === "totp"
								? `(${item.timeLeft}s)`
								: `(Counter: ${item.counter})`
						}`}
						icon={Icon.Key}
						actions={
							<ActionPanel>
								<Action.CopyToClipboard title="Copy Code" content={item.code} />
								{item.type === "hotp" && (
									<Action
										title="Use Code (Increment Counter)"
										icon={Icon.ArrowRight}
										onAction={() => copyCode(item)}
									/>
								)}
								<Action
									title="Show QR Code"
									icon={Icon.BarCode}
									onAction={() => showQRCode(item)}
								/>
								<Action
									title="Delete Account"
									icon={Icon.Trash}
									onAction={() => deleteAccount(item)}
									shortcut={{ modifiers: [], key: "delete" }}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
