import {
	Action,
	ActionPanel,
	environment,
	Form,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useState } from "react";
import { ImapFlow } from "imapflow";
import * as fs from "fs";
import * as path from "path";

export type Account = {
	host: string;
	port: number;
	user: string;
	pass: string;
	secure: boolean;
	strategy: "direct" | "file";
	default?: boolean;
};

export function getAccountsPath(): string {
	return path.join(environment.supportPath, "accounts.json");
}

export function getAccounts(): Account[] {
	const filePath = getAccountsPath();
	if (!fs.existsSync(filePath)) return [];
	try {
		const data = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(data);
	} catch {
		return [];
	}
}

export function saveAccount(account: Account): void {
	const filePath = getAccountsPath();
	const accounts = getAccounts();
	accounts.push(account);
	fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2));
}

export function updateAccount(index: number, account: Account): void {
	const filePath = getAccountsPath();
	const accounts = getAccounts();
	accounts[index] = account;
	fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2));
}

export function deleteAccount(index: number): void {
	const filePath = getAccountsPath();
	const accounts = getAccounts();
	accounts.splice(index, 1);
	fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2));
}

export function setDefaultAccount(index: number): void {
	const filePath = getAccountsPath();
	const accounts = getAccounts();
	accounts.forEach((a, i) => a.default = i === index);
	fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2));
}

export function getDefaultAccount(accounts: Account[]): Account | undefined {
	return accounts.find(a => a.default) ?? accounts[0];
}

export function resolvePassword(password: string, strategy: "direct" | "file"): string {
	if (strategy === "file") {
		return fs.readFileSync(password, "utf-8").trim();
	}
	return password;
}

export async function testConnection(
	host: string,
	port: string,
	email: string,
	password: string,
	secure: boolean,
	strategy: "direct" | "file"
) {
	if (!host || !email || !password) {
		await showToast({ title: "Missing required fields", style: Toast.Style.Failure });
		return;
	}

	let pass: string;
	try {
		pass = resolvePassword(password, strategy);
	} catch {
		await showToast({ title: "Could not read password file", style: Toast.Style.Failure });
		return;
	}

	const toast = await showToast({ title: "Testing connection...", style: Toast.Style.Animated });

	try {
		const client = new ImapFlow({
			logger: false,
			host,
			port: parseInt(port, 10),
			secure,
			auth: { user: email, pass },
		});
		await client.connect();
		await client.logout();
		toast.title = "Connection successful";
		toast.style = Toast.Style.Success;
	} catch (e) {
		toast.title = "Connection failed";
		toast.message = (e as Error).message;
		toast.style = Toast.Style.Failure;
	}
}

export type AccountFormProps = {
	title: string;
	initialValues?: Partial<Account>;
	passwordPlaceholder?: string;
	existingPassword?: string;
	onSubmit: (account: Account) => Promise<boolean>;
	onDone?: () => void;
};

export function AccountForm({ title, initialValues, passwordPlaceholder, existingPassword, onSubmit, onDone }: AccountFormProps) {
	const { pop } = useNavigation();
	const [host, setHost] = useState(initialValues?.host ?? "");
	const [port, setPort] = useState(initialValues?.port?.toString() ?? "993");
	const [email, setEmail] = useState(initialValues?.user ?? "");
	const [secure, setSecure] = useState(initialValues?.secure ?? true);
	const [password, setPassword] = useState("");
	const [strategy, setStrategy] = useState<"direct" | "file">(initialValues?.strategy ?? "direct");

	const effectivePassword = password || existingPassword;

	return <Form
		navigationTitle={title}
		actions={
			<ActionPanel>
				<Action
					title="Test Connection"
					onAction={() => testConnection(host, port, email, effectivePassword ?? "", secure, strategy)}
				/>
				<Action.SubmitForm
					title="Save Account"
					shortcut={{ key: "s", modifiers: ["ctrl"] }}
					onSubmit={async () => {
						if (!host || !email || !effectivePassword) {
							await showToast({ title: "Missing required fields", style: Toast.Style.Failure });
							return;
						}

						const pass = password ? resolvePassword(password, strategy) : existingPassword!;
						const success = await onSubmit({ host, port: parseInt(port, 10), user: email, pass, secure, strategy });
						if (success) {
							onDone?.();
							pop();
						}
					}}
				/>
			</ActionPanel>
		}
	>
		<Form.TextField
			id="host"
			title="Host"
			placeholder="mail.example.com"
			autoFocus
			value={host}
			onChange={setHost}
		/>
		<Form.TextField
			id="port"
			title="Port"
			value={port}
			onChange={setPort}
		/>
		<Form.TextField
			id="email"
			title="Email"
			placeholder="username or email address"
			value={email}
			onChange={setEmail}
		/>
		<Form.Dropdown
			id="strategy"
			title="Password strategy"
			value={strategy}
			onChange={(v) => setStrategy(v as "direct" | "file")}
		>
			<Form.Dropdown.Item value="direct" title="Direct" />
			<Form.Dropdown.Item value="file" title="From file" />
		</Form.Dropdown>
		<Form.PasswordField
			id="password"
			title={strategy === "file" ? "Password file" : "Password"}
			placeholder={passwordPlaceholder}
			value={password}
			onChange={setPassword}
		/>
		<Form.Checkbox
			id="secure"
			title="Secure connection"
			label="Use TLS"
			value={secure}
			onChange={setSecure}
		/>
	</Form>
}
