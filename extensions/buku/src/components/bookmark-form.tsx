import { Action, ActionPanel, Clipboard, Form, Icon, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import {
  type Bookmark,
  type BookmarkDraft,
  addBookmark,
  bookmarkTags,
  isBukuTimeout,
  listTags,
  updateBookmark,
} from "../lib/buku";
import { joinTags, splitTags } from "../lib/tags";
import { showBukuFailure, showFailure, showSuccess } from "../lib/toast";
import { isHttpUrl } from "../lib/url";
import { PickTagsAction } from "./tag-picker";

type BookmarkFormProps = {
  /** Bookmark to edit. When omitted, the form adds a new bookmark instead. */
  bookmark?: Bookmark;
  onSaved?: () => void;
};

/**
 * Form fields as the user sees them. Tags stay a raw string here so typing a comma
 * does not get normalized away mid-word; they are split when the form is submitted.
 */
type FormState = {
  url: string;
  title: string;
  tags: string;
  description: string;
};

const EMPTY_STATE: FormState = {
  url: "",
  title: "",
  tags: "",
  description: "",
};

function stateOf(bookmark?: Bookmark): FormState {
  if (!bookmark) return EMPTY_STATE;

  return {
    url: bookmark.uri,
    title: bookmark.title,
    tags: joinTags(bookmarkTags(bookmark)),
    description: bookmark.description,
  };
}

function draftOf(state: FormState): BookmarkDraft {
  return {
    url: state.url.trim(),
    title: state.title.trim(),
    tags: splitTags(state.tags),
    description: state.description.trim(),
  };
}

/** Shared form behind both the Add Bookmark command and the edit action of the list. */
export function BookmarkForm({ bookmark, onSaved }: BookmarkFormProps) {
  const { pop } = useNavigation();
  const isEditing = bookmark !== undefined;
  const [state, setState] = useState(() => stateOf(bookmark));
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => setState((current) => ({ ...current, [key]: value })),
    [],
  );

  // A failing tag listing only costs the user the picker, so it never blocks the form;
  // a broken buku surfaces properly when they submit.
  const refreshKnownTags = useCallback(async () => {
    setKnownTags(await listTags().catch(() => []));
  }, []);

  useEffect(() => {
    (async () => {
      // Adding a bookmark almost always starts from a URL that is already copied.
      const prefill = isEditing
        ? Promise.resolve()
        : Clipboard.readText()
            .then((text) => {
              const clipped = (text ?? "").trim();
              if (isHttpUrl(clipped)) update("url", clipped);
            })
            .catch(() => {});

      await Promise.all([prefill, refreshKnownTags()]);
      setLoading(false);
    })();
  }, [isEditing, refreshKnownTags, update]);

  const submit = useCallback(async () => {
    const draft = draftOf(state);

    if (!draft.url) {
      await showFailure("URL required", "Enter the address to bookmark.");
      return;
    }

    setSaving(true);
    try {
      if (bookmark) {
        await updateBookmark(bookmark, draft);
        await showSuccess("Bookmark updated", draft.url);
        onSaved?.();
        pop();
      } else {
        await addBookmark(draft);
        await showSuccess("Bookmark added", draft.url);
        onSaved?.();
        // Stay on the form so several bookmarks can be added in a row.
        setState(EMPTY_STATE);
        await refreshKnownTags();
      }
    } catch (error) {
      if (!isEditing && isBukuTimeout(error)) {
        await showFailure(
          "Add timed out",
          "buku is still waiting on the page title. Fill in the Title field to save without fetching it.",
        );
      } else {
        await showBukuFailure(isEditing ? "Update failed" : "Add failed", error);
      }
    } finally {
      setSaving(false);
    }
  }, [bookmark, isEditing, onSaved, pop, refreshKnownTags, state]);

  if (loading) return <Form isLoading />;

  return (
    <Form
      isLoading={saving}
      navigationTitle={isEditing ? "Edit Bookmark" : "Add Bookmark"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={isEditing ? "Save Bookmark" : "Add Bookmark"} icon={Icon.Check} onSubmit={submit} />
          <PickTagsAction
            knownTags={knownTags}
            selected={splitTags(state.tags)}
            onChange={(tags) => update("tags", joinTags(tags))}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://..."
        value={state.url}
        onChange={(value) => update("url", value)}
      />
      <Form.TextField
        id="title"
        title="Title"
        placeholder={isEditing ? "" : "leave empty to fetch from the page"}
        info={isEditing ? undefined : "Left empty, buku fetches the title from the page. Type one to skip the fetch."}
        value={state.title}
        onChange={(value) => update("title", value)}
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="comma separated"
        info="Press Ctrl+T to pick from the tags already in buku."
        value={state.tags}
        onChange={(value) => update("tags", value)}
      />
      <Form.TextArea
        id="description"
        title="Description"
        value={state.description}
        onChange={(value) => update("description", value)}
      />
    </Form>
  );
}
