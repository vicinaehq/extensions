import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function execHimalayaCommand(command: string): Promise<string> {
  const { stdout } = await execAsync(command);
  return stdout;
}

export interface Email {
  id: string;
  subject: string;
  from: { name?: string; addr: string };
  to: { name?: string; addr: string };
  date: string;
  flags: string[];
  hasAttachments: boolean;
}

export class Himalaya {
  static async listFolders(): Promise<string[]> {
    const stdout = await execHimalayaCommand(`himalaya folder list --output json`);
    const folderData = JSON.parse(stdout);
    return folderData.map((folder: { name: string }) => folder.name);
  }

  static async listEmails(folder: string = "INBOX"): Promise<Email[]> {
    const stdout = await execHimalayaCommand(`himalaya envelope list --folder ${folder} --output json`);
    const data = JSON.parse(stdout);
    return data.map((email: any) => ({
      id: email.id.toString(),
      subject: email.subject || "(no subject)",
      from: email.from || { addr: "" },
      to: email.to || { addr: "" },
      date: new Date(email.date).toLocaleString(),
      flags: email.flags || [],
      hasAttachments: email.has_attachment || false,
    }));
  }

  static async readEmail(
    id: string,
    folder: string = "INBOX",
  ): Promise<string> {
    const stdout = await execHimalayaCommand(`himalaya message read ${id} --folder ${folder}`);
    // Parse headers from the message
    const lines = stdout.split('\n');
    const headers: Record<string, string> = {};
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') {
        bodyStart = i + 1;
        break;
      }
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2];
      }
    }
    const body = lines.slice(bodyStart).join('\n');

    // Convert raw URLs to markdown links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const bodyWithLinks = body.replace(urlRegex, '[$1]($1)');

    // Format as markdown
    let markdown = `# ${headers.subject || 'No Subject'}\n\n`;
    if (headers.from) markdown += `**From:** ${headers.from}\n\n`;
    if (headers.to) markdown += `**To:** ${headers.to}\n\n`;
    if (headers.date) markdown += `**Date:** ${headers.date}\n\n`;
    markdown += `---\n\n${bodyWithLinks}`;

    return markdown;
  }

  static async deleteEmail(
    id: string,
    folder: string = "INBOX",
  ): Promise<void> {
    await execHimalayaCommand(`himalaya message delete ${id} --folder ${folder}`);
  }
}
