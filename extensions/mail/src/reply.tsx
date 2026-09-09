import {
	Action,
	closeMainWindow,
	environment,
	open,
	PopToRootType,
	showToast,
	Toast,
} from "@vicinae/api";
import type { Email } from "postal-mime";
import type { Keyboard } from "@vicinae/api";
import * as fs from 'fs';
import * as path from 'path';
import { addressToString, fetchMail, MailState, parseMail } from "./mail";
import { FetchMessageObject } from "imapflow";
import { getAccounts } from "./account";

/// Writes a .eml file to the filesystem
async function writeReply(
	uid: number,
	mail: Email,
	from: string,
) {
	const fromAddr = mail.from || { name: '', address: '' };
	const subject = mail.subject;
	const messageId = mail.messageId;
	const date = mail.date || '';
	const text = mail.text || '';
	const to = addressToString(fromAddr);
	const reSubject = `Re: ${subject || ''}`;
	const msgId = messageId || '';
	const now = new Date().toUTCString();
	const origDate = date || '';
	const origFrom = addressToString(fromAddr);
	const origBody = text || '';
	const quoted = origBody.split('\n').map(line => `> ${line}`).join('\n');

	const eml = [
		`From: ${from}`,
		`To: ${to}`,
		`Subject: ${reSubject}`,
		`In-Reply-To: ${msgId}`,
		`References: ${msgId}`,
		`Date: ${now}`,
		`MIME-Version: 1.0`,
		`Content-Type: text/plain; charset=utf-8`,
		`Content-Transfer-Encoding: 7bit`,
		'',
		'',
		`On ${origDate}, ${origFrom} wrote:`,
		quoted,
	].join('\r\n');

	let filePath = path.join(environment.supportPath, `reply-${uid}.eml`);
	fs.writeFileSync(filePath, eml);
	return filePath;
}

async function openReply(
	uid: number,
	mail: Email | FetchMessageObject,
) {
	const mailstate: MailState = 'seq' in mail
		? await fetchMail(uid)
			.then(parseMail)
		: { status: 'ok', ok: mail };

	if (mailstate.status == 'loading' || mailstate.status == 'error') {
		await showToast({ title: "Could not parse mail", style: Toast.Style.Failure });
		return;
	}

	const accounts = getAccounts();
	const from = accounts.length > 0 ? accounts[0].user : '';
	let filePath = await writeReply(uid, mailstate.ok, from);
	await open(filePath);
	await closeMainWindow({ popToRootType: PopToRootType.Immediate });
}

export function ReplyAction({
	uid,
	mail,
	shortcut,
}: {
	uid: number;
	mail: Email | FetchMessageObject;
	shortcut?: Keyboard.Shortcut;
}) {
	return <Action
		title="Reply"
		autoFocus={true}
		shortcut={shortcut}
		onAction={() => openReply(uid, mail)}
	/>
}
