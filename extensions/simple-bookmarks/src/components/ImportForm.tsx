import { useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import type { CustomLink } from "../types";
import { loadLinks, saveLinks } from "../utils/storage";

interface ImportFormProps {
  onLinksImported: (links: CustomLink[]) => void;
}

interface ExportedLink {
  title: string;
  url: string;
  createdAt?: string;
}

function isValidExportedLink(obj: unknown): obj is ExportedLink {
  if (typeof obj !== "object" || obj === null) return false;
  const link = obj as Record<string, unknown>;
  return typeof link.title === "string" && typeof link.url === "string";
}

function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

export function ImportForm({ onLinksImported }: ImportFormProps) {
  const { pop } = useNavigation();
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | undefined>();

  function validateJson(value: string): string | undefined {
    if (!value.trim()) {
      return "Please paste your exported bookmarks JSON";
    }

    try {
      const parsed = JSON.parse(value);

      if (!Array.isArray(parsed)) {
        return "JSON must be an array of bookmarks";
      }

      if (parsed.length === 0) {
        return "The JSON array is empty";
      }

      for (let i = 0; i < parsed.length; i++) {
        if (!isValidExportedLink(parsed[i])) {
          return `Invalid bookmark at index ${i}: must have 'title' and 'url' properties`;
        }
        if (!isValidUrl(parsed[i].url)) {
          return `Invalid URL at index ${i}: "${parsed[i].url}"`;
        }
      }

      return undefined;
    } catch {
      return "Invalid JSON format. Please paste valid JSON.";
    }
  }

  function handleJsonChange(value: string) {
    setJsonInput(value);
    setJsonError(validateJson(value));
  }

  async function handleImport() {
    const error = validateJson(jsonInput);
    if (error) {
      setJsonError(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid Import Data",
        message: error,
      });
      return;
    }

    try {
      const parsed: ExportedLink[] = JSON.parse(jsonInput);
      const existingLinks = await loadLinks();

      // Create new links with fresh IDs
      const newLinks: CustomLink[] = parsed.map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        url: item.url,
        createdAt: item.createdAt || new Date().toISOString(),
      }));

      // Merge with existing links (avoiding duplicates by URL)
      const existingUrls = new Set(existingLinks.map((link) => link.url));
      const uniqueNewLinks = newLinks.filter(
        (link) => !existingUrls.has(link.url)
      );
      const duplicateCount = newLinks.length - uniqueNewLinks.length;

      const mergedLinks = [...existingLinks, ...uniqueNewLinks];
      await saveLinks(mergedLinks);

      onLinksImported(mergedLinks);

      const message =
        duplicateCount > 0
          ? `${uniqueNewLinks.length} imported, ${duplicateCount} skipped (duplicates)`
          : `${uniqueNewLinks.length} bookmark${
              uniqueNewLinks.length !== 1 ? "s" : ""
            } imported`;

      await showToast({
        style: Toast.Style.Success,
        title: "Bookmarks Imported",
        message,
      });

      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Import Failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return (
    <Form
      navigationTitle="Import Bookmarks"
      actions={
        <ActionPanel>
          <Action
            title="Import Bookmarks"
            icon={Icon.Download}
            onAction={handleImport}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="json"
        title="Bookmarks JSON"
        value={jsonInput}
        onChange={handleJsonChange}
        error={jsonError}
      />
      <Form.Description
        title="Format"
        text="Paste the JSON array that was copied using the Export function. Duplicate URLs will be skipped."
      />
    </Form>
  );
}
