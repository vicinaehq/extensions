import { Clipboard, getSelectedText } from "@vicinae/api";
import { trimText } from "./string";
import type { ContextBlock, ContextSource } from "./types";

export const CONTEXT_SOURCE_LABELS: Record<ContextSource, string> = {
  selectedText: "Selected Text",
  clipboardText: "Clipboard Text",
};

/**
 * Collects optional context blocks requested by a shortcut.
 */
export class ContextCollector {
  async collect(sources: ContextSource[]): Promise<ContextBlock[]> {
    const blocks = await Promise.all(sources.map((source) => this.collectOne(source)));
    return blocks.filter((block): block is ContextBlock => Boolean(trimText(block?.content)));
  }

  private async collectOne(source: ContextSource): Promise<ContextBlock | undefined> {
    try {
      switch (source) {
        case "selectedText":
          return this.textBlock(source, CONTEXT_SOURCE_LABELS[source], await getSelectedText());
        case "clipboardText":
          return this.textBlock(source, CONTEXT_SOURCE_LABELS[source], await Clipboard.readText());
      }
    } catch {
      return undefined;
    }
  }

  private textBlock(source: ContextSource, title: string, content: unknown): ContextBlock | undefined {
    const trimmed = trimText(content);
    if (!trimmed) {
      return undefined;
    }

    return { source, title, content: trimmed };
  }
}
