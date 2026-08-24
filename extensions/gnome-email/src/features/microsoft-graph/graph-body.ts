import { environment } from "@vicinae/api";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";
import type { GraphMailAccount } from "../../types";
import { graphCollection, graphRequest } from "./graph-client";

type GraphBody = { body?: { contentType?: string; content?: string } };
type GraphAttachment = {
  "@odata.type"?: string;
  name?: string;
  contentType?: string;
  contentId?: string;
  contentBytes?: string;
  isInline?: boolean;
};

function safeFileName(value: string): string {
  return value.replace(/[^a-z\d._-]+/gi, "_");
}

async function inlineImages(account: GraphMailAccount, messageId: string, maxBytes: number): Promise<Map<string, string>> {
  const attachments = await graphCollection<GraphAttachment>(
    account,
    `/me/messages/${encodeURIComponent(messageId)}/attachments?$top=100`,
  );
  const directory = path.join(environment.supportPath, "message-images", safeFileName(account.id), safeFileName(messageId));
  const images = new Map<string, string>();
  let savedBytes = 0;

  for (const attachment of attachments) {
    if (!attachment.isInline || !attachment.contentId || !attachment.contentBytes || !attachment.contentType?.startsWith("image/")) continue;

    const content = Buffer.from(attachment.contentBytes, "base64");
    if (savedBytes + content.length > maxBytes) continue;

    savedBytes += content.length;
    await mkdir(directory, { recursive: true });

    const extension = attachment.contentType.split("/")[1]?.replace("jpeg", "jpg") || "img";
    const fileName = safeFileName(attachment.name || `${createHash("sha256").update(attachment.contentId).digest("hex")}.${extension}`);
    const target = path.join(directory, fileName);
    await writeFile(target, content);

    images.set(attachment.contentId.replace(/^<|>$/g, ""), target);
  }

  return images;
}

function renderHtml(html: string, embedded: Map<string, string>, showImages: boolean): string {
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

export async function fetchGraphMessageBody(
  account: GraphMailAccount,
  messageId: string,
  showImages: boolean,
  maxSourceBytes: number,
): Promise<string> {
  const message = await graphRequest<GraphBody>(account, `/me/messages/${encodeURIComponent(messageId)}?$select=body`);
  const content = message.body?.content?.trim();

  if (!content) return "_This message has no readable text body._";

  const bodyBytes = Buffer.byteLength(content);

  if (bodyBytes > maxSourceBytes) throw new Error("The message body exceeds the configured download size limit");

  if (message.body?.contentType?.toLowerCase() !== "html") return content;

  const embedded = showImages
    ? await inlineImages(account, messageId, Math.max(0, maxSourceBytes - bodyBytes))
    : new Map<string, string>();

  return renderHtml(content, embedded, showImages) || "_This message has no readable text body._";
}
