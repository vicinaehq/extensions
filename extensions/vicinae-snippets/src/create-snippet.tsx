import { popToRoot, showToast, Toast } from "@vicinae/api";

import { createSnippet } from "./lib/snippet-store";
import { SnippetForm, type SnippetFormValues } from "./lib/snippet-form";

export default function CreateSnippetCommand() {
  return (
    <SnippetForm
      navigationTitle="Create Snippet"
      submitTitle="Save Snippet"
      onSubmit={async (values: SnippetFormValues) => {
        try {
          await createSnippet({
            title: values.title ?? "",
            category: values.category,
            keyword: values.keyword,
            content: values.content ?? "",
          });
          await showToast({ style: Toast.Style.Success, title: "Snippet created" });
          await popToRoot({ clearSearchBar: true });
        } catch (err) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Create failed",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }}
    />
  );
}
