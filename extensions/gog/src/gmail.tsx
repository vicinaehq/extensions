import { useState, useEffect, useCallback } from "react";
import {
  List,
  Detail,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  useNavigation,
  Form,
  open,
  Color,
} from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { ensureGogInstalled, useGogAccounts } from "./utils";

const execAsync = promisify(exec);

interface Thread {
  id: string;
  date: string;
  from: string;
  subject: string;
  labels: string[];
  messageCount: number;
  snippet?: string;
  historyId?: string;
}

interface Message {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  internalDate?: string;
  historyId?: string;
  sizeEstimate?: number;
  payload?: {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string; size?: number };
    parts?: MessagePart[];
  };
}

interface MessagePart {
  mimeType: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  filename?: string;
  partId?: string;
  parts?: MessagePart[];
}

interface ThreadDetailResponse {
  thread: {
    id: string;
    messages: Message[];
  };
}

interface GmailSearchResponse {
  threads: Thread[];
  nextPageToken?: string;
}

interface Label {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  labelListVisibility?: string;
  messageListVisibility?: string;
  color?: { textColor?: string; backgroundColor?: string };
}

interface LabelsListResponse {
  labels: Label[];
}

interface Draft {
  id: string;
  message: {
    id: string;
    threadId: string;
    snippet?: string;
    labelIds?: string[];
    payload?: {
      headers?: { name: string; value: string }[];
    };
  };
}

interface DraftsListResponse {
  drafts: Draft[];
  nextPageToken?: string;
}

const GMAIL_FILTERS = [
  { value: "inbox", title: "Inbox", query: "in:inbox" },
  { value: "unread", title: "Unread", query: "is:unread" },
  { value: "starred", title: "Starred", query: "is:starred" },
  { value: "important", title: "Important", query: "is:important" },
  { value: "sent", title: "Sent", query: "in:sent" },
  { value: "drafts", title: "Drafts", query: "in:drafts" },
  { value: "scheduled", title: "Scheduled", query: "in:scheduled" },
  { value: "spam", title: "Spam", query: "in:spam" },
  { value: "trash", title: "Trash", query: "in:trash" },
  { value: "all", title: "All Mail", query: "" },
];

function decodeBase64(data: string): string {
  try {
    return Buffer.from(
      data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
  } catch {
    return data;
  }
}

function getHeader(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

function getMessageBody(message: Message): string {
  const payload = message.payload;
  if (!payload) return message.snippet || "";

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]*>/g, "");
      }
    }
  }

  return message.snippet || "";
}

interface Attachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

function getAttachments(message: Message): Attachment[] {
  const attachments: Attachment[] = [];

  function extractFromParts(parts?: MessagePart[]) {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          attachmentId: part.body.attachmentId,
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  }

  extractFromParts(message.payload?.parts);
  return attachments;
}

async function getThreadUrl(
  threadId: string,
  account: string,
): Promise<string> {
  const { stdout } = await execAsync(
    `gog gmail url ${threadId} --account "${account}" --plain`,
  );
  return (
    stdout.trim().split("\t")[1] ||
    `https://mail.google.com/mail/u/0/#inbox/${threadId}`
  );
}

interface ThreadDetailViewProps {
  thread: Thread;
  account: string;
  onRefresh: () => void;
}

function ThreadDetailView({
  thread,
  account,
  onRefresh,
}: ThreadDetailViewProps) {
  const [detail, setDetail] = useState<ThreadDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [labels, setLabels] = useState<string[]>(thread.labels ?? []);
  const [threadUrl, setThreadUrl] = useState<string>("");
  const { pop, push } = useNavigation();

  const isUnread = labels.includes("UNREAD");
  const isStarred = labels.includes("STARRED");
  const isInbox = labels.includes("INBOX");
  const isSpam = labels.includes("SPAM");
  const isTrash = labels.includes("TRASH");

  useEffect(() => {
    async function loadDetail() {
      try {
        const [detailResult, url] = await Promise.all([
          execAsync(
            `gog gmail thread get ${thread.id} --account "${account}" --json`,
          ),
          getThreadUrl(thread.id, account),
        ]);
        setDetail(JSON.parse(detailResult.stdout));
        setThreadUrl(url);
      } catch (error) {
        console.error(error);
        showToast({
          title: "Failed to load thread",
          style: Toast.Style.Failure,
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadDetail();
  }, [thread.id]);

  const modifyLabels = async (add?: string, remove?: string) => {
    try {
      const args = [`--account "${account}"`];
      if (add) args.push(`--add ${add}`);
      if (remove) args.push(`--remove ${remove}`);
      await execAsync(`gog gmail thread modify ${thread.id} ${args.join(" ")}`);

      setLabels((prev) => {
        let newLabels = [...prev];
        if (remove) newLabels = newLabels.filter((l) => l !== remove);
        if (add && !newLabels.includes(add)) newLabels.push(add);
        return newLabels;
      });
      onRefresh();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed", style: Toast.Style.Failure });
    }
  };

  const downloadAttachment = async (
    messageId: string,
    attachmentId: string,
    filename: string,
  ) => {
    try {
      showToast({ title: "Downloading..." });
      const { stdout } = await execAsync(
        `gog gmail attachment ${messageId} ${attachmentId} --account "${account}" --plain`,
      );
      const path = stdout.split("\n")[0]?.split("\t")[1]?.trim();
      if (path) {
        await open(path);
      }
      showToast({ title: "Downloaded", message: filename });
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to download attachment",
        style: Toast.Style.Failure,
      });
    }
  };

  const messages = detail?.thread?.messages;
  const allAttachments: Array<{
    messageId: string;
    attachment: Attachment;
  }> = [];
  messages?.forEach((msg) => {
    const attachments = getAttachments(msg);
    attachments.forEach((att) => {
      allAttachments.push({ messageId: msg.id, attachment: att });
    });
  });

  const markdown = messages
    ? messages
        .map((msg: Message) => {
          const from = getHeader(msg.payload?.headers, "from");
          const date = getHeader(msg.payload?.headers, "date");
          const body = getMessageBody(msg);
          const attachments = getAttachments(msg);
          const attachmentText =
            attachments.length > 0
              ? `\n📎 **Attachments:** ${attachments.map((a) => a.filename).join(", ")}`
              : "";
          return `### From: ${from}\n*${date}*\n\n${body}${attachmentText}\n\n---`;
        })
        .join("\n\n")
    : isLoading
      ? "Loading..."
      : "No messages found";

  const firstMessage = messages?.[0];
  const fromHeader = firstMessage
    ? getHeader(firstMessage.payload?.headers, "from")
    : thread.from;
  const dateHeader = firstMessage
    ? getHeader(firstMessage.payload?.headers, "date")
    : thread.date;

  return (
    <Detail
      navigationTitle={thread.subject || "(No subject)"}
      markdown={isLoading ? "Loading..." : markdown}
      metadata={
        !isLoading ? (
          <Detail.Metadata>
            {fromHeader && (
              <Detail.Metadata.Label title="From" text={fromHeader} />
            )}
            {dateHeader && (
              <Detail.Metadata.Label title="Date" text={dateHeader} />
            )}
            <Detail.Metadata.Label
              title="Messages"
              text={String(thread.messageCount || messages?.length || 1)}
            />
            {allAttachments.length > 0 && (
              <Detail.Metadata.Label
                title="Attachments"
                text={String(allAttachments.length)}
              />
            )}
            <Detail.Metadata.Separator />
            <Detail.Metadata.TagList title="Labels">
              {labels.map((label) => (
                <Detail.Metadata.TagList.Item key={label} text={label.replace("_", " ").toLocaleLowerCase()} color={Color.Blue} />
              ))}
            </Detail.Metadata.TagList>
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser
              icon={Icon.Link}
              title="Open in Gmail"
              url={threadUrl}
            />
            <Action.CopyToClipboard
              icon={Icon.CopyClipboard}
              title="Copy Link"
              content={threadUrl}
            />
          </ActionPanel.Section>
          {allAttachments.length > 0 && (
            <ActionPanel.Section title="Attachments">
              {allAttachments.map(({ messageId, attachment }, idx) => (
                <Action
                  key={`${messageId}-${attachment.attachmentId}-${idx}`}
                  title={`Download ${attachment.filename}`}
                  icon={Icon.Download}
                  onAction={() =>
                    downloadAttachment(
                      messageId,
                      attachment.attachmentId,
                      attachment.filename,
                    )
                  }
                />
              ))}
            </ActionPanel.Section>
          )}
          <ActionPanel.Section title="Quick Actions">
            <Action
              title={isUnread ? "Mark as Read" : "Mark as Unread"}
              icon={isUnread ? Icon.Eye : Icon.EyeDisabled}
              onAction={() =>
                isUnread
                  ? modifyLabels(undefined, "UNREAD")
                  : modifyLabels("UNREAD")
              }
            />
            <Action
              title={isStarred ? "Unstar" : "Star"}
              icon={Icon.Star}
              onAction={() =>
                isStarred
                  ? modifyLabels(undefined, "STARRED")
                  : modifyLabels("STARRED")
              }
            />
            <Action
              title="Manage Labels"
              icon={Icon.Tag}
              onAction={() =>
                push(
                  <ApplyLabelForm
                    threadId={thread.id}
                    account={account}
                    currentLabels={labels}
                    onComplete={() => {
                      onRefresh();
                    }}
                  />,
                )
              }
            />
            {isInbox && (
              <Action
                title="Archive"
                icon={Icon.Tray}
                onAction={async () => {
                  await modifyLabels(undefined, "INBOX");
                  showToast({ title: "Archived" });
                  pop();
                }}
              />
            )}
            {!isInbox && !isTrash && !isSpam && (
              <Action
                title="Move to Inbox"
                icon={Icon.Envelope}
                onAction={async () => {
                  await modifyLabels("INBOX");
                  showToast({ title: "Moved to Inbox" });
                }}
              />
            )}
            {isSpam && (
              <Action
                title="Not Spam"
                icon={Icon.Check}
                onAction={async () => {
                  await modifyLabels("INBOX", "SPAM");
                  showToast({ title: "Marked as Not Spam" });
                  pop();
                }}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Move to Trash"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["shift"], key: "delete" }}
              onAction={async () => {
                await modifyLabels("TRASH", "INBOX");
                showToast({ title: "Moved to Trash" });
                pop();
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function ComposeForm({
  account,
  isDraft = false,
  onComplete,
}: {
  account: string;
  isDraft?: boolean;
  onComplete?: () => void;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Envelope}
            title={isDraft ? "Save Draft" : "Send"}
            onSubmit={async (values) => {
              try {
                const { to, cc, bcc, subject, body } = values as {
                  to: string;
                  cc?: string;
                  bcc?: string;
                  subject: string;
                  body: string;
                };
                const bodyEscaped = body.replace(/"/g, '\\"');
                let cmd = isDraft
                  ? `gog gmail drafts create --account "${account}" --to "${to}" --subject "${subject}" --body "${bodyEscaped}"`
                  : `gog gmail send --account "${account}" --to "${to}" --subject "${subject}" --body "${bodyEscaped}"`;
                if (cc) cmd += ` --cc "${cc}"`;
                if (bcc) cmd += ` --bcc "${bcc}"`;
                await execAsync(cmd);
                showToast({ title: isDraft ? "Draft saved" : "Email sent" });
                onComplete?.();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: isDraft
                    ? "Failed to save draft"
                    : "Failed to send email",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="to" title="To" />
      <Form.TextField id="cc" title="CC" />
      <Form.TextField id="bcc" title="BCC" />
      <Form.TextField id="subject" title="Subject" />
      <Form.TextArea id="body" title="Body" />
    </Form>
  );
}

// Labels Management
function LabelsView({ account }: { account: string }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  const loadLabels = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const { stdout } = await execAsync(
        `gog gmail labels list --account "${account}" --json`,
      );
      const data: LabelsListResponse = JSON.parse(stdout);
      setLabels(data.labels || []);
    } catch (error) {
      console.error(error);
      showToast({ title: "Error loading labels", style: Toast.Style.Failure });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  const userLabels = labels.filter((l) => l.type === "user");
  const systemLabels = labels.filter((l) => l.type === "system");

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search labels..."
      actions={
        <ActionPanel>
          <Action
            title="Create Label"
            icon={Icon.Plus}
            onAction={() =>
              push(
                <CreateLabelForm account={account} onComplete={loadLabels} />,
              )
            }
          />
          <Action
            title="Refresh"
            icon={Icon.RotateClockwise}
            shortcut={{ modifiers: ["ctrl"], key: "r" }}
            onAction={loadLabels}
          />
        </ActionPanel>
      }
    >
      {userLabels.length > 0 && (
        <List.Section title="Custom Labels">
          {userLabels.map((label) => (
            <List.Item
              key={label.id}
              title={label.name}
              accessories={[
                ...(label.messagesUnread
                  ? [{ text: `${label.messagesUnread} unread` }]
                  : []),
                ...(label.messagesTotal
                  ? [{ text: `${label.messagesTotal} total` }]
                  : []),
              ]}
              icon={Icon.Tag}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Label ID"
                    content={label.id}
                  />
                  <Action
                    title="Create Label"
                    icon={Icon.Plus}
                    onAction={() =>
                      push(
                        <CreateLabelForm
                          account={account}
                          onComplete={loadLabels}
                        />,
                      )
                    }
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {systemLabels.length > 0 && (
        <List.Section title="System Labels">
          {systemLabels.map((label) => (
            <List.Item
              key={label.id}
              title={label.name}
              accessories={[
                ...(label.messagesUnread
                  ? [{ text: `${label.messagesUnread} unread` }]
                  : []),
                ...(label.messagesTotal
                  ? [{ text: `${label.messagesTotal} total` }]
                  : []),
              ]}
              icon={Icon.Tag}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Label ID"
                    content={label.id}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function CreateLabelForm({
  account,
  onComplete,
}: {
  account: string;
  onComplete: () => void;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Plus}
            title="Create Label"
            onSubmit={async (values) => {
              try {
                const { name } = values as { name: string };
                await execAsync(
                  `gog gmail labels create --account "${account}" "${name}"`,
                );
                showToast({ title: "Label created" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to create label",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Label Name" />
    </Form>
  );
}

// Drafts Management
function DraftsView({ account }: { account: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { push } = useNavigation();

  const loadDrafts = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const { stdout } = await execAsync(
        `gog gmail drafts list --account "${account}" --json`,
      );
      const data: DraftsListResponse = JSON.parse(stdout);
      setDrafts(data.drafts || []);
    } catch (error) {
      console.error(error);
      showToast({ title: "Error loading drafts", style: Toast.Style.Failure });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const sendDraft = async (draftId: string) => {
    try {
      await execAsync(
        `gog gmail drafts send --account "${account}" ${draftId}`,
      );
      showToast({ title: "Draft sent" });
      await loadDrafts();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to send draft", style: Toast.Style.Failure });
    }
  };

  const deleteDraft = async (draftId: string) => {
    try {
      await execAsync(
        `gog gmail drafts delete --account "${account}" ${draftId} --force`,
      );
      showToast({ title: "Draft deleted" });
      await loadDrafts();
    } catch (error) {
      console.error(error);
      showToast({
        title: "Failed to delete draft",
        style: Toast.Style.Failure,
      });
    }
  };

  const globalActions = (
    <ActionPanel>
      <Action
        title="New Draft"
        icon={Icon.Plus}
        onAction={() =>
          push(
            <ComposeForm
              account={account}
              isDraft={true}
              onComplete={loadDrafts}
            />,
          )
        }
      />
      <Action
        title="Refresh"
        icon={Icon.RotateClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadDrafts}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search drafts..."
      actions={globalActions}
    >
      {!isLoading && drafts.length === 0 ? (
        <List.EmptyView
          title="No Drafts"
          description="Create a draft to save for later"
          icon={Icon.BlankDocument}
          actions={globalActions}
        />
      ) : (
        <List.Section title={`${drafts.length} drafts`}>
          {drafts.map((draft) => {
            const headers = draft.message.payload?.headers || [];
            const subject = getHeader(headers, "subject") || "(No subject)";
            const to = getHeader(headers, "to") || "";

            return (
              <List.Item
                key={draft.id}
                title={subject}
                subtitle={to}
                icon={Icon.BlankDocument}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action
                        title="Send Draft"
                        icon={Icon.Envelope}
                        onAction={() => sendDraft(draft.id)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Delete Draft"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["shift"], key: "delete" }}
                        onAction={() => deleteDraft(draft.id)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="New Draft"
                        icon={Icon.Plus}
                        onAction={() =>
                          push(
                            <ComposeForm
                              account={account}
                              isDraft={true}
                              onComplete={loadDrafts}
                            />,
                          )
                        }
                      />
                      <Action
                        title="Refresh"
                        icon={Icon.RotateClockwise}
                        shortcut={{ modifiers: ["ctrl"], key: "r" }}
                        onAction={loadDrafts}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}

// Apply Label Form
interface ApplyLabelFormProps {
  threadId: string;
  account: string;
  currentLabels: string[];
  onComplete: () => void;
}

function ApplyLabelForm({
  threadId,
  account,
  currentLabels = [],
  onComplete,
}: ApplyLabelFormProps) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { pop } = useNavigation();

  useEffect(() => {
    async function loadLabels() {
      try {
        const { stdout } = await execAsync(
          `gog gmail labels list --account "${account}" --json`,
        );
        const data: LabelsListResponse = JSON.parse(stdout);
        setLabels(data.labels?.filter((l) => l.type === "user") || []);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    loadLabels();
  }, [account]);

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Tag}
            title="Apply Labels"
            onSubmit={async (values) => {
              try {
                const { addLabels, removeLabels } = values as {
                  addLabels: string[];
                  removeLabels: string[];
                };
                const args: string[] = [];
                if (addLabels?.length) {
                  args.push(`--add ${addLabels.join(",")}`);
                }
                if (removeLabels?.length) {
                  args.push(`--remove ${removeLabels.join(",")}`);
                }
                if (args.length > 0) {
                  await execAsync(
                    `gog gmail thread modify ${threadId} --account "${account}" ${args.join(" ")}`,
                  );
                  showToast({ title: "Labels updated" });
                  onComplete();
                }
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to update labels",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TagPicker id="addLabels" title="Add Labels" defaultValue={[]}>
        {labels
          .filter((l) => !currentLabels.includes(l.id))
          .map((l) => (
            <Form.TagPicker.Item
              key={l.id}
              value={l.id}
              title={l.name}
              icon={Icon.Tag}
            />
          ))}
      </Form.TagPicker>
      <Form.TagPicker id="removeLabels" title="Remove Labels" defaultValue={[]}>
        {labels
          .filter((l) => currentLabels.includes(l.id))
          .map((l) => (
            <Form.TagPicker.Item
              key={l.id}
              value={l.id}
              title={l.name}
              icon={Icon.Tag}
            />
          ))}
      </Form.TagPicker>
    </Form>
  );
}

export default function Gmail() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("inbox");
  const [account, setAccount] = useState<string>("");
  const { accounts } = useGogAccounts();
  const { push } = useNavigation();

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !account) {
      setAccount(accounts[0]?.email || "");
    }
  }, [accounts, account]);

  const loadThreads = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    if (!account) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const filterConfig = GMAIL_FILTERS.find((f) => f.value === filter);
      const query = filterConfig?.query || "";
      const accountArg = `--account "${account}"`;
      const { stdout } = await execAsync(
        `gog gmail search '${query}' ${accountArg} --max 50 --json`,
      );
      const data: GmailSearchResponse = JSON.parse(stdout);
      setThreads(data.threads || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Error loading threads",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [filter, account]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const modifyLabels = async (
    threadId: string,
    add?: string,
    remove?: string,
  ) => {
    try {
      const args = [`--account "${account}"`];
      if (add) args.push(`--add ${add}`);
      if (remove) args.push(`--remove ${remove}`);
      await execAsync(`gog gmail thread modify ${threadId} ${args.join(" ")}`);
      await loadThreads();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed", style: Toast.Style.Failure });
    }
  };

  const globalActions = (
    <ActionPanel>
      <Action
        title="Compose Email"
        icon={Icon.Plus}
        onAction={() => push(<ComposeForm account={account} />)}
      />
      <Action
        title="Manage Labels"
        icon={Icon.Tag}
        onAction={() => push(<LabelsView account={account} />)}
      />
      <Action
        title="View Drafts"
        icon={Icon.BlankDocument}
        onAction={() => push(<DraftsView account={account} />)}
      />
      <Action
        title="Refresh"
        icon={Icon.RotateClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadThreads}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search emails..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Account & Filter"
          value={`${account}|${filter}`}
          onChange={(value) => {
            const [acc, flt] = value.split("|");
            if (acc && flt) {
              setAccount(acc);
              setFilter(flt);
            }
          }}
        >
          {accounts.map((acc) => (
            <List.Dropdown.Section key={acc.email} title={acc.email}>
              {GMAIL_FILTERS.map((f) => (
                <List.Dropdown.Item
                  key={`${acc.email}|${f.value}`}
                  title={f.title}
                  value={`${acc.email}|${f.value}`}
                />
              ))}
            </List.Dropdown.Section>
          ))}
        </List.Dropdown>
      }
      actions={globalActions}
    >
      {!isLoading && threads.length === 0 ? (
        <List.EmptyView
          title="No Emails"
          description="No emails match your current filter"
          icon={Icon.Envelope}
          actions={globalActions}
        />
      ) : (
        <List.Section title={`${threads.length} threads`}>
          {threads.map((thread) => {
            const labels = thread.labels ?? [];
            const isUnread = labels.includes("UNREAD");
            const isStarred = labels.includes("STARRED");
            const isImportant = labels.includes("IMPORTANT");
            const isInbox = labels.includes("INBOX");
            const hasAttachment = labels.includes("ATTACHMENT");

            return (
              <List.Item
                key={thread.id}
                title={thread.subject || "(No subject)"}
                subtitle={thread.from}
                accessories={[
                  ...(isStarred
                    ? [{ icon: Icon.Star, tooltip: "Starred" }]
                    : []),
                  ...(isImportant
                    ? [{ icon: Icon.Bookmark, tooltip: "Important" }]
                    : []),
                  ...(hasAttachment
                    ? [{ icon: Icon.Paperclip, tooltip: "Has attachment" }]
                    : []),
                  ...(isUnread
                    ? [{ icon: Icon.CircleFilled, tooltip: "Unread" }]
                    : []),
                  ...(thread.messageCount > 1
                    ? [
                        {
                          text: `${thread.messageCount}`,
                          tooltip: `${thread.messageCount} messages`,
                        },
                      ]
                    : []),
                  { text: thread.date },
                ]}
                icon={Icon.Envelope}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action
                        title="View Thread"
                        icon={Icon.Eye}
                        onAction={() =>
                          push(
                            <ThreadDetailView
                              thread={thread}
                              account={account}
                              onRefresh={loadThreads}
                            />,
                          )
                        }
                      />
                      <Action.OpenInBrowser
                        icon={Icon.Link}
                        title="Open in Gmail"
                        url={`https://mail.google.com/mail/u/0/#inbox/${thread.id}`}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Quick Actions">
                      <Action
                        title={isUnread ? "Mark as Read" : "Mark as Unread"}
                        icon={isUnread ? Icon.Eye : Icon.EyeDisabled}
                        onAction={async () => {
                          await modifyLabels(
                            thread.id,
                            isUnread ? undefined : "UNREAD",
                            isUnread ? "UNREAD" : undefined,
                          );
                          showToast({
                            title: isUnread
                              ? "Marked as Read"
                              : "Marked as Unread",
                          });
                        }}
                      />
                      <Action
                        title={isStarred ? "Unstar" : "Star"}
                        icon={Icon.Star}
                        onAction={async () => {
                          await modifyLabels(
                            thread.id,
                            isStarred ? undefined : "STARRED",
                            isStarred ? "STARRED" : undefined,
                          );
                          showToast({
                            title: isStarred ? "Unstarred" : "Starred",
                          });
                        }}
                      />
                      {isInbox && (
                        <Action
                          title="Archive"
                          icon={Icon.Tray}
                          onAction={async () => {
                            await modifyLabels(thread.id, undefined, "INBOX");
                            showToast({ title: "Archived" });
                          }}
                        />
                      )}
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Move to Trash"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["shift"], key: "delete" }}
                        onAction={async () => {
                          await modifyLabels(thread.id, "TRASH", "INBOX");
                          showToast({ title: "Moved to Trash" });
                        }}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Labels">
                      <Action
                        title="Apply Labels"
                        icon={Icon.Tag}
                        onAction={() =>
                          push(
                            <ApplyLabelForm
                              threadId={thread.id}
                              account={account}
                              currentLabels={labels}
                              onComplete={loadThreads}
                            />,
                          )
                        }
                      />
                      <Action
                        title="Manage Labels"
                        icon={Icon.Tag}
                        onAction={() => push(<LabelsView account={account} />)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Compose Email"
                        icon={Icon.Plus}
                        onAction={() => push(<ComposeForm account={account} />)}
                      />
                      <Action
                        title="View Drafts"
                        icon={Icon.BlankDocument}
                        onAction={() => push(<DraftsView account={account} />)}
                      />
                      <Action
                        title="Refresh"
                        icon={Icon.RotateClockwise}
                        shortcut={{ modifiers: ["ctrl"], key: "r" }}
                        onAction={loadThreads}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
