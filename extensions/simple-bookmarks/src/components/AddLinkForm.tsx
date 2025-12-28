import { useState } from "react";
import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { addLink } from "../utils/storage";
import type { CustomLink } from "../types";

interface AddLinkFormProps {
  onLinkAdded: (link: CustomLink) => void;
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

export function AddLinkForm({ onLinkAdded }: AddLinkFormProps) {
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
      const newLink = await addLink({ title, url: normalizedUrl });
      
      await showToast({
        style: Toast.Style.Success,
        title: "Link Added",
        message: title,
      });

      onLinkAdded(newLink);
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to Add Link",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return (
    <Form
      navigationTitle="Add New Link"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Link"
            icon={Icon.Plus}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        error={titleError}
        onChange={() => setTitleError(undefined)}
      />
      <Form.TextField
        id="url"
        title="URL"
        error={urlError}
        onChange={() => setUrlError(undefined)}
      />
      <Form.Description text="The URL will be opened in your default browser when selected." />
    </Form>
  );
}

