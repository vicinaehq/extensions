import { readFileSync } from "fs";

const [owner, repo] = process.env.GITHUB_REPOSITORY!.split("/");
const token = process.env.GITHUB_TOKEN!;
const issueNumber = parseInt(process.env.ISSUE_NUMBER!);
const issueBody = process.env.ISSUE_BODY || "";
const issueAuthor = process.env.ISSUE_AUTHOR || "";
const issueTitle = process.env.ISSUE_TITLE || "";

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
};

const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

async function githubPost(url: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${await res.text()}`);
  }
}

async function githubPatch(url: string, body: object) {
  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${url} failed: ${res.status} ${await res.text()}`);
  }
}

async function comment(message: string) {
  await githubPost(`${apiBase}/issues/${issueNumber}/comments`, {
    body: message,
  });
}

async function closeIssue(reason: string) {
  await githubPatch(`${apiBase}/issues/${issueNumber}`, {
    state: "closed",
    state_reason: reason,
  });
}

async function main() {
  const match = issueBody.match(/### Extension name\s*\n+\s*(.+)/);
  if (!match) {
    console.error("Could not find extension name in issue body");
    process.exit(1);
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
    console.log(`Extension "${extensionName}" not found, closing issue`);
    await comment(
      `Could not find extension \`${extensionName}\`. The extension name must match a directory under \`extensions/\` in this repository (e.g. \`extensions/${extensionName}\`). Please verify the name and reopen with the correct one.`
    );
    await closeIssue("not_planned");
    return;
  }

  const author = manifest.author;
  if (!author) {
    console.error(`Extension "${extensionName}" has no author field in manifest`);
    process.exit(1);
  }

  if (!issueTitle.startsWith(`[${extensionName}]`)) {
    console.log(`Updating issue title: [${extensionName}] ${issueTitle}`);
    await githubPatch(`${apiBase}/issues/${issueNumber}`, {
      title: `[${extensionName}] ${issueTitle}`,
    });
  }

  if (issueAuthor.toLowerCase() === author.toLowerCase()) {
    console.log("Issue author is the extension author, skipping tag");
    return;
  }

  console.log(`Tagging extension author: ${author}`);
  await comment(`cc @${author}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
