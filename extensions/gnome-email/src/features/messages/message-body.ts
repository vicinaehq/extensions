import { environment } from "@vicinae/api";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { simpleParser, type Attachment, type ParsedMail } from "mailparser";
import TurndownService from "turndown";
import { createImapClient } from "../../lib/imap-client";
import type { ImapMailAccount } from "../../types";

function safeFileName(value: string): string {
  return value.replace(/[^a-z\d._-]+/gi, "_");
}

function imageDirectory(account: ImapMailAccount, mailboxPath: string, uid: number): string {
  return path.join(environment.supportPath, "message-images", safeFileName(account.id), safeFileName(mailboxPath), String(uid));
}

async function saveEmbeddedImages(account: ImapMailAccount, mailboxPath: string, uid: number, attachments: Attachment[]): Promise<Map<string, string>> {
  const directory = imageDirectory(account, mailboxPath, uid);
  const images = new Map<string, string>();
  for (const attachment of attachments) {
    if (!attachment.contentType.startsWith("image/") || !attachment.cid) continue;
    await mkdir(directory, { recursive: true });
    const extension = attachment.contentType.split("/")[1]?.replace("jpeg", "jpg") || "img";
    const name = safeFileName(attachment.filename || `${createHash("sha256").update(attachment.cid).digest("hex")}.${extension}`);
    const target = path.join(directory, name);
    await writeFile(target, attachment.content);
    images.set(attachment.cid.replace(/^<|>$/g, ""), target);
  }
  return images;
}

async function saveDataImages(html: string, account: ImapMailAccount, mailboxPath: string, uid: number): Promise<string> {
  const directory = imageDirectory(account, mailboxPath, uid);
  const matches = [...html.matchAll(/data:(image\/([a-z\d.+-]+));base64,([a-z\d+/=\s]+)/gi)];
  if (!matches.length) return html;
  await mkdir(directory, { recursive: true });

  for (const match of matches) {
    const content = Buffer.from(match[3].replace(/\s/g, ""), "base64");
    const extension = match[2].replace("jpeg", "jpg").replace("svg+xml", "svg");
    const target = path.join(directory, `${createHash("sha256").update(content).digest("hex")}.${extension}`);
    await writeFile(target, content);
    html = html.replace(match[0], target);
  }
  return html;
}

async function renderHtml(parsed: ParsedMail, account: ImapMailAccount, mailboxPath: string, uid: number, showImages: boolean): Promise<string> {
  let html = typeof parsed.html === "string" ? parsed.html : "";
  const embedded = showImages ? await saveEmbeddedImages(account, mailboxPath, uid, parsed.attachments) : new Map<string, string>();
  if (showImages) html = await saveDataImages(html, account, mailboxPath, uid);
  if (showImages) {
    html = html.replace(/(<img\b[^>]*?\bsrc=["'])cid:([^"']+)(["'][^>]*>)/gi, (_match, before, cid, after) => {
      const source = embedded.get(String(cid).replace(/^<|>$/g, ""));
      return source ? `${before}${source}${after}` : "";
    });
  }

  const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  turndown.remove(["style", "script", "head", "title", "meta", "link", "noscript", "template"]);
  if (!showImages) {
    turndown.addRule("replace-images", {
      filter: "img",
      replacement: (_content, node) => {
        const alt = node.getAttribute("alt")?.trim();
        const label = alt ? `[Image hidden: ${alt}]` : "[Image hidden]";
        return `\n\n| ${label.replace(/\|/g, "\\|")} |\n|:---:|\n\n`;
      },
    });
  }
  return turndown.turndown(html).trim();
}

export async function fetchImapMessageBody(
  account: ImapMailAccount,
  mailboxPath: string,
  remoteId: string,
  showImages = true,
  maxSourceBytes = 10 * 1024 * 1024,
): Promise<string> {
  const client = await createImapClient(account);
  const uid = Number(remoteId);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailboxPath, { readOnly: true });
    try {
      const result = await client.fetchOne(uid, { source: { maxLength: maxSourceBytes } }, { uid: true });
      if (!result || !result.source) throw new Error("The message body is unavailable");

      const parsed = await simpleParser(result.source, {
        skipHtmlToText: true,
        skipTextToHtml: true,
        keepCidLinks: true,
      });
      if (parsed.html) {
        const markdown = await renderHtml(parsed, account, mailboxPath, uid, showImages);
        if (markdown) return markdown;
      }
      if (parsed.text?.trim()) return parsed.text.trim();
      return "_This message has no readable text body._";
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
