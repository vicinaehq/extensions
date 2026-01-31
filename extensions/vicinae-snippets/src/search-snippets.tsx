import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Keyboard,
  closeMainWindow,
  confirmAlert,
  Form,
  Icon,
  List,
  Toast,
  getFrontmostApplication,
  showHUD,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";

import { ArgumentSpec, Snippet } from "./lib/snippet-model";
import { extractArguments, renderTemplate } from "./lib/placeholder-engine";
import { collectCategories, filterByCategory, listKeywordsForSnippet } from "./lib/search";
import { SnippetForm, type SnippetFormValues } from "./lib/snippet-form";
import {
  deleteSnippet,
  duplicateSnippet,
  listSnippets,
  recordSuccessfulCopyOrPaste,
  setSnippetPinned,
  updateSnippet,
} from "./lib/snippet-store";

type InsertMode = "paste" | "copy";

function trimTrailingBlankLines(text: string): string {
  // Fix: historical data / editor padding can leave a lot of trailing blank lines.
  // Only trim *trailing* blank lines; keep interior blank lines and in-line spaces.
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function escapeHtmlChar(ch: string): string {
  // Generate safe HTML and try to prevent Markdown from being interpreted:
  // - escape `& < >`
  // - escape common Markdown trigger chars (e.g. `**`, backticks, link syntax)
  //
  // Note: we intentionally keep non-ASCII characters as-is (better performance and output size).
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  // Markdown / GFM trigger chars (escape as entities to avoid parsing)
  if (ch === "*") return "&#42;";
  if (ch === "_") return "&#95;";
  if (ch === "`") return "&#96;";
  if (ch === "~") return "&#126;";
  if (ch === "[") return "&#91;";
  if (ch === "]") return "&#93;";
  if (ch === "(") return "&#40;";
  if (ch === ")") return "&#41;";
  if (ch === "!") return "&#33;";
  // Extra conservative: these can also trigger structure-like rendering in some pipelines
  if (ch === "#") return "&#35;";
  if (ch === "-") return "&#45;";
  if (ch === "+") return "&#43;";
  return ch;
}

function toPlainTextViewerHtml(text: string): string {
  // Goal: show *raw* snippet content in the right preview (preserve newlines/spaces/indentation),
  // and avoid Markdown being interpreted.
  //
  // Note: in Vicinae's rendering pipeline, block-level HTML (e.g. `<pre>`) may introduce an
  // extra blank line at the top. So we avoid block containers and encode line-by-line:
  // `<br>` for newlines + `&nbsp;` for preserving spaces.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ");
  const lines = normalized.split("\n");

  function encodeLine(line: string): string {
    let out = "";
    let pendingSpaces = 0;

    const flushSpaces = (isLineEnd: boolean) => {
      if (pendingSpaces <= 0) return;

      // Leading spaces: use `&nbsp;` for all of them
      if (out.length === 0) {
        out += "&nbsp;".repeat(pendingSpaces);
        pendingSpaces = 0;
        return;
      }

      // Trailing spaces: also use `&nbsp;` or they may be collapsed/invisible
      if (isLineEnd) {
        out += "&nbsp;".repeat(pendingSpaces);
        pendingSpaces = 0;
        return;
      }

      // In-line spaces: keep one breakable normal space; encode the rest as `&nbsp;`
      out += " " + "&nbsp;".repeat(Math.max(0, pendingSpaces - 1));
      pendingSpaces = 0;
    };

    for (const ch of line) {
      if (ch === " ") {
        pendingSpaces += 1;
        continue;
      }
      flushSpaces(false);
      out += escapeHtmlChar(ch);
    }
    flushSpaces(true);

    // Keep a placeholder for empty lines; otherwise some renderers may merge `<br>` into neighbors
    return out.length === 0 ? "&nbsp;" : out;
  }

  return lines.map(encodeLine).join("<br>");
}

function formatSnippetContent(snippet: Snippet): string {
  return toPlainTextViewerHtml(snippet.content);
}

function formatModified(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function ArgumentPrompt(props: {
  specs: ArgumentSpec[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const { specs, onSubmit } = props;

  return (
    <Form
      navigationTitle="Fill Placeholder Arguments"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Continue"
            onSubmit={async (values: Form.Values) => {
              const out: Record<string, string> = {};
              for (const s of specs) {
                const v = values[s.key];
                const str = typeof v === "string" ? v : v == null ? "" : String(v);
                out[s.key] = str;
              }
              await onSubmit(out);
            }}
          />
        </ActionPanel>
      }
    >
      {specs.map((s) => {
        if (s.options && s.options.length > 0) {
          return (
            <Form.Dropdown
              key={s.key}
              id={s.key}
              title={s.name ?? s.key}
              defaultValue={s.defaultValue ?? s.options[0]}
            >
              {s.options.map((opt) => (
                <Form.Dropdown.Item key={opt} title={opt} value={opt} />
              ))}
            </Form.Dropdown>
          );
        }

        return (
          <Form.TextField
            key={s.key}
            id={s.key}
            title={s.name ?? s.key}
            defaultValue={s.defaultValue ?? ""}
          />
        );
      })}
    </Form>
  );
}

type MoveToCategoryFormValues = {
  category?: string;
  customCategory?: string;
};

function MoveToOtherCategoryPrompt(props: {
  snippet: Snippet;
  categories: string[];
  onSubmit: (category?: string) => Promise<void>;
}) {
  const { snippet, categories, onSubmit } = props;
  const current = snippet.category?.trim() ? snippet.category : undefined;

  const [choice, setChoice] = useState<string>(current ?? "__NONE__");
  const categoryOptions = useMemo(() => {
    const uniq = Array.from(new Set(categories.map((c) => c.trim()).filter(Boolean)));
    // Ensure the current value always exists in the dropdown (even if it came from old data)
    if (current && !uniq.includes(current)) uniq.unshift(current);
    return uniq;
  }, [categories, current]);

  return (
    <Form
      navigationTitle="Move to Other Category"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Move"
            onSubmit={async (values: MoveToCategoryFormValues) => {
              const selected = typeof values.category === "string" ? values.category : choice;
              if (selected === "__NONE__") {
                await onSubmit(undefined);
                return;
              }

              if (selected === "__OTHER__") {
                const custom =
                  typeof values.customCategory === "string" ? values.customCategory.trim() : "";
                if (!custom) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Move failed",
                    message: "Please enter a new category.",
                  });
                  return false;
                }
                await onSubmit(custom);
                return;
              }

              await onSubmit(selected.trim() || undefined);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="category"
        title="Category"
        info="This updates the snippet Category field."
        value={choice}
        onChange={setChoice}
      >
        <Form.Dropdown.Item title="Uncategorized" value="__NONE__" />
        {categoryOptions.map((c) => (
          <Form.Dropdown.Item key={c} title={c} value={c} />
        ))}
        <Form.Dropdown.Item title="Other…" value="__OTHER__" />
      </Form.Dropdown>
      {choice === "__OTHER__" ? (
        <Form.TextField id="customCategory" title="New Category" defaultValue={current ?? ""} />
      ) : null}
    </Form>
  );
}

export default function SearchSnippetsCommand() {
  const { push, pop } = useNavigation();

  const enterShortcut: Keyboard.Shortcut = { key: "enter", modifiers: [] };
  const ctrlEnterShortcut: Keyboard.Shortcut = { key: "enter", modifiers: ["ctrl"] };
  // UX decision: default Enter triggers "Paste to Active App" (no extra toggle).
  const pasteShortcut: Keyboard.Shortcut = enterShortcut;
  const copyShortcut: Keyboard.Shortcut = ctrlEnterShortcut;

  const [frontmostAppName, setFrontmostAppName] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [category, setCategory] = useState<string>("__ALL__");

  async function refresh() {
    try {
      setSnippets(await listSnippets());
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Load failed",
        message: err instanceof Error ? err.message : String(err),
      });
      setSnippets([]);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  useEffect(() => {
    getFrontmostApplication()
      .then((app) => {
        const name = app?.name?.trim();
        if (!name) return;
        // Avoid treating Vicinae itself as the "Active App"
        if (name.toLowerCase().includes("vicinae")) return;
        setFrontmostAppName(name);
      })
      .catch(() => undefined);
  }, []);

  const categories = useMemo(() => collectCategories(snippets ?? []), [snippets]);
  const visibleSnippets = useMemo(
    () => filterByCategory(snippets ?? [], category),
    [snippets, category],
  );

  async function safeRunInsert(snippet: Snippet, mode: InsertMode, argValues: Record<string, string>) {
    try {
      await runInsert(snippet, mode, argValues);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Insert failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function safeHandleInsert(snippet: Snippet, mode: InsertMode) {
    try {
      await handleInsert(snippet, mode);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Insert failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function runInsert(snippet: Snippet, mode: InsertMode, argValues: Record<string, string>) {
    const rendered = await renderTemplate(snippet.content, argValues);
    const insertText = trimTrailingBlankLines(rendered.text);

    // Lightweight UX: only show the first notice to avoid spamming
    if (rendered.notices.length > 0) {
      const first = rendered.notices[0];
      if (first.kind === "too_many_arguments") {
        await showToast({
          style: Toast.Style.Animated,
          title: "Too many arguments (max 3)",
          message: first.message,
        });
      } else {
        await showToast({ style: Toast.Style.Animated, title: first.message });
      }
    }

    if (mode === "paste") {
      // Clipboard History-inspired: close the main window first so focus returns to the frontmost app.
      await closeMainWindow();
      try {
        await Clipboard.paste(insertText);
        await recordSuccessfulCopyOrPaste(snippet.id);
      } catch (err) {
        // Fallback: if paste fails, copy instead (privacy-friendly: concealed).
        await Clipboard.copy(insertText, { concealed: true });
        await recordSuccessfulCopyOrPaste(snippet.id);
        await showHUD(
          `Paste failed; copied to clipboard${err instanceof Error && err.message ? `: ${err.message}` : ""}`,
        );
      }
      return;
    }

    // Privacy-friendly: conceal the copy so it won't be indexed by Vicinae clipboard history.
    await Clipboard.copy(insertText, { concealed: true });
    await recordSuccessfulCopyOrPaste(snippet.id);
    // UX requirement: after copying, close Vicinae main window (don't stay on the extension page).
    await closeMainWindow();
    await showHUD("Copied to clipboard");
  }

  async function handleInsert(snippet: Snippet, mode: InsertMode) {
    const { specs, notices } = extractArguments(snippet.content);
    const tooMany = notices.some((n) => n.kind === "too_many_arguments");
    if (tooMany) {
      // Raycast-compatible: when there are >3 distinct arguments, don't prompt for inputs.
      // Insert the raw template (renderTemplate fails fast) and show a lightweight notice.
      await safeRunInsert(snippet, mode, {});
      return;
    }

    if (specs.length === 0) {
      await safeRunInsert(snippet, mode, {});
      return;
    }

    push(
      <ArgumentPrompt
        specs={specs}
        onSubmit={async (vals) => {
          pop();
          await safeRunInsert(snippet, mode, vals);
        }}
      />,
    );
  }

  return (
    <List
      isLoading={snippets == null}
      isShowingDetail
      searchBarPlaceholder="Search snippets…"
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by category" storeValue value={category} onChange={setCategory}>
          <List.Dropdown.Item title="All categories" value="__ALL__" />
          {categories.map((c) => (
            <List.Dropdown.Item key={c} title={c} value={c} />
          ))}
        </List.Dropdown>
      }
    >
      {(visibleSnippets ?? []).length === 0 && snippets != null ? (
        <List.EmptyView title="No snippets yet" description="Run “Create Snippet” to add your first one." />
      ) : (
        (visibleSnippets ?? []).map((s) => (
          <List.Item
            key={s.id}
            id={s.id}
            title={s.title}
            icon={Icon.Snippets}
            keywords={listKeywordsForSnippet(s)}
            detail={
              <List.Item.Detail
                markdown={formatSnippetContent(s)}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Name" text={s.title} icon={Icon.Text} />
                    <List.Item.Detail.Metadata.Label
                      title="Category"
                      text={s.category?.trim() ? s.category : "Uncategorized"}
                      icon={Icon.Folder}
                    />
                    <List.Item.Detail.Metadata.Label title="Content type" text="Plain Text" icon={Icon.CodeBlock} />
                    <List.Item.Detail.Metadata.Label title="Modified" text={formatModified(s.updatedAt)} icon={Icon.Clock} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            accessories={[
              ...(s.isPinned ? [{ icon: Icon.Pin, tooltip: "Pinned" as const }] : []),
              ...(s.keyword ? [{ tag: { value: s.keyword, color: Color.SecondaryText }, tooltip: "Key" as const }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={frontmostAppName ? `Paste to ${frontmostAppName}` : "Paste to Active App"}
                  icon={Icon.Clipboard}
                  autoFocus
                  shortcut={pasteShortcut}
                  onAction={async () => {
                    await safeHandleInsert(s, "paste");
                  }}
                />
                <Action
                  title="Copy to Clipboard"
                  icon={Icon.CopyClipboard}
                  shortcut={copyShortcut}
                  onAction={async () => {
                    await safeHandleInsert(s, "copy");
                  }}
                />
                <Action
                  title={s.isPinned ? "Unpin Snippet" : "Pin Snippet"}
                  icon={Icon.Pin}
                  shortcut={Keyboard.Shortcut.Common.Pin}
                  onAction={async () => {
                    try {
                      await setSnippetPinned(s.id, !Boolean(s.isPinned));
                      await refresh();
                    } catch (err) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Pin failed",
                        message: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                />
                <Action
                  title="Edit Snippet"
                  icon={Icon.Pencil}
                  shortcut={Keyboard.Shortcut.Common.Edit}
                  onAction={() => {
                    push(
                      <SnippetForm
                        navigationTitle="Edit Snippet"
                        submitTitle="Save Changes"
                        initialValues={{
                          title: s.title,
                          category: s.category,
                          keyword: s.keyword,
                          content: s.content,
                        }}
                        onSubmit={async (values: SnippetFormValues) => {
                          try {
                            await updateSnippet(s.id, values);
                            await showToast({ style: Toast.Style.Success, title: "Snippet updated" });
                            pop();
                            await refresh();
                          } catch (err) {
                            await showToast({
                              style: Toast.Style.Failure,
                              title: "Update failed",
                              message: err instanceof Error ? err.message : String(err),
                            });
                          }
                        }}
                      />,
                    );
                  }}
                />
                <Action
                  title="Duplicate Snippet"
                  icon={Icon.Duplicate}
                  onAction={async () => {
                    try {
                      await duplicateSnippet(s.id);
                      await showToast({ style: Toast.Style.Success, title: "Snippet duplicated" });
                      await refresh();
                    } catch (err) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Duplicate failed",
                        message: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                />
                <Action
                  title="Move to Other Category"
                  icon={Icon.Move}
                  onAction={() => {
                    push(
                      <MoveToOtherCategoryPrompt
                        snippet={s}
                        categories={categories}
                        onSubmit={async (nextCategory) => {
                          try {
                            await updateSnippet(s.id, { category: nextCategory });
                            await showToast({ style: Toast.Style.Success, title: "Moved" });
                            pop();
                            await refresh();
                          } catch (err) {
                            await showToast({
                              style: Toast.Style.Failure,
                              title: "Move failed",
                              message: err instanceof Error ? err.message : String(err),
                            });
                          }
                        }}
                      />,
                    );
                  }}
                />
                <ActionPanel.Section title="Danger zone">
                  <Action
                    title="Delete Snippet"
                    style={Action.Style.Destructive}
                    icon={Icon.Trash}
                    shortcut={Keyboard.Shortcut.Common.Remove}
                    onAction={async () => {
                      const ok = await confirmAlert({
                        title: "Delete snippet?",
                        description: "This cannot be undone.",
                      });
                      if (!ok) return;

                      try {
                        await deleteSnippet(s.id);
                        await showToast({ style: Toast.Style.Success, title: "Deleted" });
                        await refresh();
                      } catch (err) {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: "Delete failed",
                          message: err instanceof Error ? err.message : String(err),
                        });
                      }
                    }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
