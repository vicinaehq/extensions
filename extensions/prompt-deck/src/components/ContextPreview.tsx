import { Form } from "@vicinae/api";
import { formatCharCount, previewContextBlock } from "../lib/context-preview";
import type { ContextBlock } from "../lib/types";

interface ContextPreviewDescriptionProps {
  contextBlocks: ContextBlock[];
  note?: string | undefined;
}

/**
 * Renders each captured context block as its own titled form description,
 * with a character count for what is actually sent to the model.
 */
export function ContextPreviewDescription({ contextBlocks, note }: ContextPreviewDescriptionProps) {
  return (
    <>
      {note ? <Form.Description text={note} /> : null}
      {contextBlocks.length === 0 ? (
        <Form.Description title="Context" text="No context was captured. Only your command is sent." />
      ) : (
        contextBlocks.map((block) => {
          const preview = previewContextBlock(block);
          const suffix = preview.wasTrimmed ? "\n(Preview trimmed; the full text is sent.)" : "";

          return (
            <Form.Description
              key={block.source}
              title={`${block.title} · ${formatCharCount(preview.charCount)}`}
              text={`${preview.snippet}${suffix}`}
            />
          );
        })
      )}
    </>
  );
}
