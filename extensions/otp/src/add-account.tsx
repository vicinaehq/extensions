import {
	Action,
	ActionPanel,
	closeMainWindow,
	Form,
	Icon,
	showToast,
} from "@vicinae/api";
import { useState } from "react";
import { storeOTPAccount } from "./keyring";
import {
	createOTPAccountFromUrl,
} from "./otp";
import type { OTPType, OTPAccount } from "./types";
import { showErrorToast, validateOTPSecret } from "./utils";

export default function AddOTPAccount() {
	const [accountName, setAccountName] = useState("");
	const [secret, setSecret] = useState("");
	const [type, setType] = useState<OTPType>("totp");
	const [otpUrl, setOtpUrl] = useState("");

		const handleSubmit = async (values: Record<string, unknown>) => {
			try {
				let account: OTPAccount | null = null;

			// If URL is provided, parse it
			if ((values.otpUrl as string)?.trim()) {
				account = createOTPAccountFromUrl((values.otpUrl as string).trim());
				if (!account) {
					await showToast({
						title: "Error",
						message: "Invalid OTP URL format",
					});
					return;
				}
			} else {
				// Manual entry
				if (!(values.accountName as string).trim()) {
					await showToast({
						title: "Error",
						message: "Account name is required",
					});
					return;
				}

				if (!(values.secret as string).trim()) {
					await showToast({
						title: "Error",
						message: "Secret key is required",
					});
					return;
				}

				// Validate OTP secret
				if (
					!validateOTPSecret(values.secret as string, values.type as OTPType)
				) {
					await showToast({
						title: "Error",
						message: "Invalid OTP secret key",
					});
					return;
				}

				account = {
					name: values.accountName as string,
					secret: values.secret as string,
					type: values.type as OTPType,
					counter: (values.type as string) === "hotp" ? 0 : undefined,
				};
			}

			if (!account) {
				await showToast({
					title: "Error",
					message: "Failed to create account",
				});
				return;
			}

			await storeOTPAccount(account);

			await showToast({
				title: "Success",
				message: `${account.type.toUpperCase()} account "${account.name}" added successfully`,
			});

			await closeMainWindow();
		} catch (error) {
			await showErrorToast(showToast, "Error", error);
		}
	};

	const handleUrlChange = (url: string) => {
		setOtpUrl(url);

		// If URL is provided and valid, auto-populate fields
		if (url.trim()) {
			const account = createOTPAccountFromUrl(url.trim());
			if (account) {
				setAccountName(account.name);
				setSecret(account.secret);
				setType(account.type);
			}
		}
	};

	return (
		<Form
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Add Account"
						icon={Icon.Plus}
						onSubmit={handleSubmit}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="otpUrl"
				title="OTP URL (optional)"
				value={otpUrl}
				onChange={handleUrlChange}
			/>
			<Form.Separator />
			<Form.TextField
				id="accountName"
				title="Account Name"
				value={accountName}
				onChange={setAccountName}
			/>
			<Form.TextField
				id="secret"
				title="OTP Secret"
				value={secret}
				onChange={setSecret}
			/>
			<Form.Dropdown
				id="type"
				title="OTP Type"
				value={type}
				onChange={(value) => setType(value as OTPType)}
			>
				<Form.Dropdown.Item value="totp" title="TOTP (Time-based)" />
				<Form.Dropdown.Item value="hotp" title="HOTP (Counter-based)" />
			</Form.Dropdown>
			<Form.Description text="Paste an otpauth:// URL to auto-fill the form, or fill in the fields manually. Secrets are stored securely in LocalStorage." />
		</Form>
	);
}
