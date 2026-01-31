import { Action, ActionPanel, Clipboard, Detail, Form, Toast, showToast, useNavigation } from "@vicinae/api";
import fs from "node:fs/promises";

import { importFromJsonText } from "./lib/import-export";
import type { ImportReport } from "./lib/snippet-model";

type ImportFormValues = {
  file?: string[];
  jsonText?: string;
};

function reportToMarkdown(r: ImportReport): string {
  const lines: string[] = [];
  lines.push("# Import Report");
  lines.push("");
  lines.push(`- Added: **${r.addedCount}**`);
  lines.push(`- Skipped (duplicates): **${r.skippedCount}**`);
  lines.push(`- Failed: **${r.failedCount}**`);
  if (r.errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    for (const e of r.errors.slice(0, 50)) {
      lines.push(`- ${e.reason} (${e.itemHint})`);
    }
  }
  return lines.join("\n");
}

export default function ImportSnippetsCommand() {
  const { push } = useNavigation();

  return (
    <Form
      navigationTitle="Import Snippets"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import"
            onSubmit={async (values: ImportFormValues) => {
              try {
                let jsonText: string | undefined;

                const file = values.file?.[0];
                if (file) {
                  jsonText = await fs.readFile(file, "utf8");
                } else if (values.jsonText?.trim()) {
                  jsonText = values.jsonText;
                } else {
                  jsonText = await Clipboard.readText();
                }

                if (!jsonText?.trim()) {
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Import failed",
                    message: "No JSON found. Select a file or paste/copy JSON into the clipboard.",
                  });
                  return;
                }

                const report = await importFromJsonText(jsonText);
                await showToast({
                  style: report.failedCount > 0 ? Toast.Style.Animated : Toast.Style.Success,
                  title: "Import finished",
                  message: `Added ${report.addedCount} / Skipped ${report.skippedCount} / Failed ${report.failedCount}`,
                });

                push(<Detail markdown={reportToMarkdown(report)} />);
              } catch (err) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Import failed",
                  message: err instanceof Error ? err.message : String(err),
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="JSON file (preferred)"
        canChooseFiles
        canChooseDirectories={false}
        allowMultipleSelection={false}
      />
      <Form.TextArea id="jsonText" title="JSON text (optional fallback)" />
      <Form.Description text="File first. If no file is selected, uses the text field or clipboard. Dedupe by title+content." />
    </Form>
  );
}
