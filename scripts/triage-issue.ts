import { readFileSync } from "fs";

const [owner, repo] = process.env.GITHUB_REPOSITORY!.split("/");
const token = process.env.GITHUB_TOKEN!;
const issueNumber = parseInt(process.env.ISSUE_NUMBER!);
const issueBody = process.env.ISSUE_BODY || "";
const issueAuthor = process.env.ISSUE_AUTHOR || "";

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
};

const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

async function commentAndClose(message: string) {
  await fetch(`${apiBase}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: message }),
  });
  await fetch(`${apiBase}/issues/${issueNumber}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  });
}

async function comment(message: string) {
  await fetch(`${apiBase}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: message }),
  });
}

async function main() {
  const match = issueBody.match(/### Extension name\s*\n\s*(.+)/);
  if (!match) {
    console.log("Could not find extension name in issue body");
    return;
  }

  const extensionName = match[1].trim();
  console.log(`Extension: ${extensionName}`);

  let manifest: { author?: string };
  try {
    const content = readFileSync(
      `extensions/${extensionName}/package.json`,
      "utf8"
    );
    manifest = JSON.parse(content);
  } catch {
    console.log(`Could not find extension "${extensionName}", closing issue`);
    await commentAndClose(
      `Could not find extension \`${extensionName}\`. The extension name must match a directory under \`extensions/\` in this repository (e.g. \`extensions/${extensionName}\`). Please verify the name and reopen with the correct one.`
    );
    return;
  }

  const author = manifest.author;
  if (!author) {
    console.log("No author field in manifest");
    return;
  }

  if (issueAuthor.toLowerCase() === author.toLowerCase()) {
    console.log("Issue author is the extension author, skipping tag");
    return;
  }

  await comment(`cc @${author}`);
}

main();
