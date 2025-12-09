import { useState } from "react";
import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { updateLink } from "../utils/storage";
import type { CustomLink } from "../types";

interface EditLinkFormProps {
  link: CustomLink;
  onLinkUpdated: (link: CustomLink) => void;
}

/**
 * Validates if a string is a valid URL.
 * Auto-prepends https:// if no protocol is provided.
 */
function normalizeUrl(input: string): string | null {
  let url = input.trim();

  // Auto-prepend https:// if no protocol
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

export function EditLinkForm({ link, onLinkUpdated }: EditLinkFormProps) {
  const { pop } = useNavigation();
  const [titleError, setTitleError] = useState<string | undefined>();
  const [urlError, setUrlError] = useState<string | undefined>();

  async function handleSubmit(values: Form.Values) {
    const title = (values.title as string)?.trim();
    const urlInput = (values.url as string)?.trim();

    // Validate title
    if (!title || title.length === 0) {
      setTitleError("Title is required");
      return;
    }
    setTitleError(undefined);

    // Validate URL
    if (!urlInput || urlInput.length === 0) {
      setUrlError("URL is required");
      return;
    }

    const normalizedUrl = normalizeUrl(urlInput);
    if (!normalizedUrl) {
      setUrlError("Please enter a valid URL");
      return;
    }
    setUrlError(undefined);

    try {
      const updatedLink = await updateLink(link.id, { title, url: normalizedUrl });

      if (!updatedLink) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Link Not Found",
          message: "The link may have been deleted",
        });
        pop();
        return;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Link Updated",
        message: title,
      });

      onLinkUpdated(updatedLink);
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to Update Link",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return (
    <Form
      navigationTitle={`Edit: ${link.title}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            icon={Icon.Check}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        defaultValue={link.title}
        error={titleError}
        onChange={() => setTitleError(undefined)}
      />
      <Form.TextField
        id="url"
        title="URL"
        defaultValue={link.url}
        error={urlError}
        onChange={() => setUrlError(undefined)}
      />
    </Form>
  );
}

