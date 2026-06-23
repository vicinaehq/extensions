import {
	Action,
	ActionPanel,
	Color,
	Icon,
	List,
	showToast,
	Toast,
} from "@vicinae/api";
import { useState, useEffect } from 'react';
import { ErrorView } from './error';
import { FetchMessageObject, ImapFlow, ListResponse, MailboxLockObject } from "imapflow";
import Mail from "./mail";
import { ReplyAction } from "./reply";
import { getAccounts, getDefaultAccount, type Account } from "./account";
import NoAccount from "./no-account";

type MailboxState =
	| { status: 'loading' }
	| { status: 'ok'; ok: FetchMessageObject[] }
	| { status: 'error'; error: Error };

export let client: ImapFlow | undefined

export let lock: MailboxLockObject;

let toast: Toast;

function AccountSwitchActions() {
	const accounts = getAccounts();
	return (
		<ActionPanel.Section title="Switch Account">
			{accounts.map((acc, i) => (
				<Action.Push
					key={i}
					title={acc.user}
					icon={Icon.Person}
					target={<Mailbox account={acc} />}
				/>
			))}
		</ActionPanel.Section>
	);
}

function folderIcon(specialUse?: string): Icon {
	switch (specialUse) {
		case '\\Inbox': return Icon.Envelope;
		case '\\Sent': return Icon.ArrowRight;
		case '\\Drafts': return Icon.BlankDocument;
		case '\\Trash': return Icon.Trash;
		case '\\Junk': return Icon.Exclamationmark;
		case '\\Archive': return Icon.Box;
		case '\\Flagged': return Icon.Star;
		default: return Icon.Folder;
	}
}

function FolderSwitchActions({ account, folders }: { account: Account; folders: ListResponse[] }) {
	if (folders.length === 0) return null;
	return (
		<ActionPanel.Section title="Switch Folder">
			{folders.map((folder) => (
				<Action.Push
					key={folder.path}
					title={folder.name}
					icon={folderIcon(folder.specialUse)}
					target={<Mailbox account={account} mailboxPath={folder.path} />}
				/>
			))}
		</ActionPanel.Section>
	);
}

async function connectClient(account: Account) {
	client = new ImapFlow({
		logger: false,  // disable logger, else the event loop starves
		host: account.host,
		port: account.port,
		secure: account.secure,
		auth: {
			user: account.user,
			pass: account.pass
		}
	});

	toast = await showToast({ title: "Connecting to account...", style: Toast.Style.Animated });
	await client.connect();
}

async function fetchInbox(query: string): Promise<MailboxState> {
	try {
		if (!client) return {
			status: 'error',
			error: Error("client is undefined")
		}

		const data = await client.fetchAll(query, {
			flags: true,
			envelope: true,
		});

		toast.title = "Envelope loaded";
		toast.style = Toast.Style.Success;
		return { status: 'ok', ok: data.reverse() };
	} catch (error) {
		toast.title = "Failed to load envelope";
		toast.style = Toast.Style.Failure;
		return { status: 'error', error: error as Error };
	}
}

export default function Mailbox({ account: propAccount, mailboxPath = 'INBOX' }: { account?: Account; mailboxPath?: string } = {}) {
	const [mailbox, setMailbox] = useState<MailboxState>({ status: 'loading' });
	const [folders, setFolders] = useState<ListResponse[]>([]);
	const accounts = getAccounts();

	if (accounts.length === 0) {
		return <List><NoAccount /></List>;
	}

	const account = propAccount ?? getDefaultAccount(accounts)!;

	useEffect(() => {
		connectClient(account)
			.then(async () => {
				if (!client) return {
					status: 'error',
					error: Error("client is undefined")
				}

				const mailboxList = await client.list();
				setFolders(mailboxList);

				toast.title = "Fetching mail...";
				lock = await client.getMailboxLock(mailboxPath);
				if (!client.mailbox) return {
					status: 'error',
					error: Error("could not get mailbox")
				}

				const total = client.mailbox.exists;
				if (total === 0) return { status: 'ok', ok: [] };

				// First quickly fetch a single page of mails
				const start = Math.max(1, total - 8);
				let firstFetch = await fetchInbox(`${start}:*`);
				setMailbox(firstFetch);

				// Then fetch the whole mailbox in the background
				if (start > 1 && firstFetch.status === 'ok') {
					const restFetch = await fetchInbox(`1:${start - 1}`);
					if (restFetch.status === 'ok') {
						setMailbox({ status: 'ok', ok: [...firstFetch.ok, ...restFetch.ok] });
					}
				}

				lock.release();
			});

		return () => {
			console.log('cleanup');
			toast.hide();
			if (client) client.logout();
		}
	}, []);

	if (mailbox.status === 'loading') return (
		<List isLoading actions={<ActionPanel>
			<FolderSwitchActions account={account} folders={folders} />
			<AccountSwitchActions />
		</ActionPanel>}>
			<List.EmptyView title="Loading..." icon={Icon.Envelope} />
		</List>
	);
	if (mailbox.status === 'error') {
		console.log(mailbox.error);
		return <ErrorView
			error={mailbox.error}
			message="Failed to fetch envelope"
			screen="Envelope"
			actions={
				<ActionPanel>
					<FolderSwitchActions account={account} folders={folders} />
					<AccountSwitchActions />
				</ActionPanel>
			}
		/>;
	};

	const uids = mailbox.ok.map(m => m.uid);

	return <List searchBarPlaceholder="Search mailbox">
		{mailbox.ok.map(mail => (
			<MailItem
				key={mail.uid}
				mail={mail}
				allUids={uids}
				account={account}
				folders={folders} />
		))}
	</List>
}

const SeenAccessory: List.Item.Accessory = {
	icon: Icon.Check,
	tooltip: "Seen",
	tag: {
		value: "",
		color: Color.Green
	}
};

const AnsweredAccessory: List.Item.Accessory = {
	icon: Icon.Reply,
	tooltip: "Answered",
	tag: {
		value: "",
		color: Color.Blue
	}
};

const FlaggedAccessory: List.Item.Accessory = {
	icon: Icon.Star,
	tooltip: "Flagged",
	tag: {
		value: "",
		color: Color.Yellow
	}
};

const DateAccessory = (date: Date): List.Item.Accessory => ({
	text: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
	tooltip: date.toLocaleString(),
});

/// Component to render a single mail item in the list, showing the subject, sender, and accessories for flags and attachments.
/// allUids is needed because IMAP UIDs are non-contiguous (deleted mails leave gaps),
/// so uid +/- 1 cannot be relied on for next/previous navigation.
function MailItem({ mail, allUids, account, folders }: { mail: FetchMessageObject; allUids: number[]; account: Account; folders: ListResponse[] }) {
	let accessories: List.Item.Accessory[] = []
	if (mail.flags) {
		if (mail.flags.has('\\Answered')) accessories.push(AnsweredAccessory);
		if (mail.flags.has('\\Flagged')) accessories.push(FlaggedAccessory);
		if (mail.flags.has('\\Seen')) accessories.push(SeenAccessory);
	}

	if (mail.envelope && mail.envelope.date)
		accessories.push(DateAccessory(mail.envelope.date));

	function getTitle(): string {
		if (!mail.envelope) return ""
		if (mail.envelope.subject === undefined) return "Untitled"
		return mail.envelope.subject
	}

	function getSubtitle(): string | undefined {
		if (!mail.envelope?.from?.length) return undefined;
		const addr = mail.envelope.from[0]?.address;
		return addr ? `<${addr}>` : undefined;
	}

	return <List.Item
		title={getTitle()}
		subtitle={getSubtitle()}
		accessories={accessories}
		actions={
			<ActionPanel>
				<ActionPanel.Section>
					<Action.Push
						title="Open mail"
						target={<Mail id={mail.uid} allUids={allUids} />} />
					<ReplyAction
						uid={mail.uid}
						mail={mail}
						shortcut={{ key: "r", modifiers: ["ctrl"] }} />
					<Action
						title="Mark as Read"
						onAction={() => showToast({ title: "Marking as read...", style: Toast.Style.Success })} />
				</ActionPanel.Section>
				<FolderSwitchActions account={account} folders={folders} />
				<AccountSwitchActions />
			</ActionPanel >
		}
	/>
}
