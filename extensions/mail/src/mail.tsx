import {
	Detail,
	showToast,
	List,
	Toast,
	Action,
	ActionPanel,
	useNavigation,
} from "@vicinae/api";
import { useState, useEffect } from 'react';
import { ErrorView } from "./error";
import type { Address, Email } from "postal-mime";
import { client } from "./mailbox";
import { FetchMessageObject } from "imapflow";
import PostalMime from "postal-mime";
import TurndownService from 'turndown';
import { ReplyAction } from "./reply";

export type MailState =
	| { status: 'loading' }
	| { status: 'ok'; ok: Email }
	| { status: 'error'; error: Error };

export function addressToString(addr: Address): string {
	if (addr.address) return `${addr.name} <${addr.address}>`;
	else return addr.name;
}

function format_header(mail: Email): string {
	let header = new Array<string>();
	if (mail.subject) header.push("#### Subject: " + mail.subject);
	if (header.length != 0) header.push("---");
	if (mail.from) header.push("From: " + addressToString(mail.from));
	if (mail.to) header.push("To: " + mail.to.map(t => addressToString(t)).join(", "));
	if (mail.cc) header.push("Cc: " + mail.cc.map(t => addressToString(t)).join(", "));
	if (mail.bcc) header.push("Bcc: " + mail.bcc.map(t => addressToString(t)).join(", "));
	if (mail.date) header.push("Date: " + mail.date);
	header.push("---");

	return header.join("\n\n")
}

let toast: Toast;

export async function fetchMail(id: number): Promise<false | FetchMessageObject> {
	toast = await showToast({ title: "fetching mail...", style: Toast.Style.Animated });
	if (!client) return false;
	let message = await client.fetchOne(id.toString(), {
		source: true
	}, { uid: true })
	return message
}

export async function parseMail(message: false | FetchMessageObject): Promise<MailState> {
	if (!message) {
		toast.style = Toast.Style.Failure;
		toast.message = "Could not fetch mail";
		return { status: 'error', error: Error("Could not fetch mail") }
	}

	if (!message.source) {
		toast.style = Toast.Style.Failure;
		toast.message = "Could not fetch mail";
		return { status: 'error', error: Error("Could not fetch mail") }
	}

	try {
		toast.message = "Parsing mail";
		const mail = await PostalMime.parse(message.source)
		toast.hide();
		return { status: 'ok', ok: mail };
	} catch {
		toast.style = Toast.Style.Failure;
		toast.message = "Could not fetch mail";
		return { status: 'error', error: Error("Could not parse mail") }
	}
}

function parseHtml(html: string): string {
	const td = new TurndownService({
		headingStyle: 'atx',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
	})

	const normalizeUrls = (html: string) =>
		html.replace(/(href|src)="([^"]*)"/gi, (_match, attr, url) =>
			`${attr}="${url.replace(/\s+/g, '')}"`
		)

	html = normalizeUrls(html);

	// Strip elements that should never appear in output
	td.remove(['style', 'script', 'head', 'meta', 'link', 'title'])

	// Strip tracking pixels (1x1 images) but keep real images
	td.addRule('trackingPixels', {
		filter: (node: any) =>
			node.nodeName === 'IMG' &&
			(node.getAttribute('width') === '1' || node.getAttribute('height') === '1'),
		replacement: () => '',
	})

	// Collapse pure layout tables (no real content structure)
	// Email clients use tables for layout unwrap them, keep text
	td.addRule('layoutTable', {
		filter: (node: any) =>
			node.nodeName === 'TABLE' &&
			!node.querySelector('th'), // tables with <th> are probably data tables
		replacement: (content: any) => content.trim() + '\n\n',
	})

	// Strip font/span wrappers that only carry styling
	td.addRule('styleSpans', {
		filter: (node: any) =>
			(node.nodeName === 'SPAN' || node.nodeName === 'FONT') &&
			!node.getAttribute('href'),
		replacement: (content: any) => content,
	})

	// Collapse excessive whitespace after conversion
	const convert = (html: string) => {
		const md = td.turndown(html)
		return md
			.replace(/\n{3,}/g, '\n\n')  // max 2 consecutive newlines
			.trim()
	}

	return convert(html);
}

export default function Mail({ id, allUids }: { id: number; allUids: number[] }) {
	const [mailState, setMailState] = useState<MailState>({ status: 'loading' });
	const { push, pop } = useNavigation();

	// IMAP UIDs are non-contiguous deleted mails leave gaps, so uid +/- 1
	// is unreliable. The full sorted UID list (newest-first) must be passed in
	// and searched to find the true previous/next mail.
	const idx = allUids.indexOf(id);
	const prevId = idx > 0 ? allUids[idx - 1] : undefined;
	const nextId = idx < allUids.length - 1 ? allUids[idx + 1] : undefined;

	useEffect(() => {
		fetchMail(id)
			.then(parseMail)
			.then(setMailState)
	}, []);

	if (mailState.status === 'loading') return <List isLoading />;
	if (mailState.status === 'error') return <ErrorView
		error={mailState.error}
		screen="Mail" />

	const mail = mailState.ok;
	let headers = format_header(mail);
	if (mail.html) mail.html = parseHtml(mail.html);

	// prefer formatted html, use text as fallback
	let body = (mail.html
		? mail.html
		: (mail.text
			? mail.text
			: "empty"))

	return <Detail
		navigationTitle={mail.subject}
		markdown={
			headers
			+ "\n\n"
			+ body
			// + "\n\n"
			// + "```json\n" + JSON.stringify(mail, null, 2) + "\n```"
		}
		actions={
			<ActionPanel>
				<ActionPanel.Section>
					<ReplyAction uid={id} mail={mail} />
				</ActionPanel.Section>
				<ActionPanel.Section>
					{prevId != null && (
						<Action
							title="Previous Mail"
							shortcut={{ key: "h", modifiers: ["ctrl"] }}
							onAction={() => {
								// pop + push in the same handler replaces the current view
								// instead of stacking, so the back button returns to the inbox.
								pop();
								push(<Mail id={prevId} allUids={allUids} />);
							}} />
					)}
					{nextId != null && (
						<Action
							title="Next Mail"
							shortcut={{ key: "l", modifiers: ["ctrl"] }}
							onAction={() => {
								pop();
								push(<Mail id={nextId} allUids={allUids} />);
							}} />
					)}
				</ActionPanel.Section>
			</ActionPanel>
		} />
}
