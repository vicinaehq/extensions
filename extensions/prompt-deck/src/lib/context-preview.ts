import type { ContextBlock } from "./types";
import { trimText } from "./string";

const DEFAULT_MAX_BLOCKS = 3;
const DEFAULT_TOTAL_BUDGET = 900;
const DEFAULT_BLOCK_BUDGET = 400;
const DEFAULT_LINE_LIMIT = 3;
const MARKDOWN_TRIMMED_NOTICE = "_Preview trimmed; full context is still sent._";

interface ContextPreviewOptions {
  maxBlocks?: number;
  totalBudget?: number;
  blockBudget?: number;
  lineLimit?: number;
}

/**
 * Builds a compact markdown context preview with visible trimming notices.
 */
export function buildContextPreviewMarkdown(blocks: ContextBlock[], options: ContextPreviewOptions = {}): string {
  return buildContextPreview(blocks, options, {
    trimNotice: MARKDOWN_TRIMMED_NOTICE,
    renderBlock: ({ title, content }) => `### ${title}\n\n> ${content.replace(/\n/g, "\n> ")}`,
    renderOmitted: (count) => `_${count} more context source${count === 1 ? "" : "s"} captured._`,
  });
}

export interface BlockPreview {
  snippet: string;
  wasTrimmed: boolean;
  charCount: number;
}

/**
 * Builds a compact single-block preview for per-field form descriptions.
 */
export function previewContextBlock(block: ContextBlock, options: ContextPreviewOptions = {}): BlockPreview {
  const content = trimText(block.content);
  const preview = truncateContext(content, options.blockBudget ?? DEFAULT_BLOCK_BUDGET, options.lineLimit ?? DEFAULT_LINE_LIMIT);

  return {
    snippet: preview.text,
    wasTrimmed: preview.wasTrimmed,
    charCount: content.length,
  };
}

/**
 * Formats a character count for compact display, e.g. "312 chars" or "4.2k chars".
 */
export function formatCharCount(count: number): string {
  if (count < 1000) {
    return `${count} chars`;
  }

  return `${(count / 1000).toFixed(1)}k chars`;
}

function buildContextPreview(
  blocks: ContextBlock[],
  options: ContextPreviewOptions,
  renderer: {
    trimNotice: string;
    renderBlock: (block: { title: string; content: string }) => string;
    renderOmitted: (count: number) => string;
  },
): string {
  const maxBlocks = options.maxBlocks ?? DEFAULT_MAX_BLOCKS;
  const blockBudget = options.blockBudget ?? DEFAULT_BLOCK_BUDGET;
  const lineLimit = options.lineLimit ?? DEFAULT_LINE_LIMIT;
  const shownBlocks = blocks.slice(0, maxBlocks);
  let remainingBudget = options.totalBudget ?? DEFAULT_TOTAL_BUDGET;
  const rendered: string[] = [];

  for (const block of shownBlocks) {
    if (remainingBudget <= 0) {
      break;
    }

    const preview = truncateContext(block.content, Math.min(blockBudget, remainingBudget), lineLimit);
    remainingBudget -= preview.text.length;
    rendered.push(
      renderer.renderBlock({
        title: block.title,
        content: appendTrimNotice(preview.text, preview.wasTrimmed, renderer.trimNotice),
      }),
    );
  }

  const omitted = blocks.length - shownBlocks.length;
  if (omitted > 0) {
    rendered.push(renderer.renderOmitted(omitted));
  }

  return rendered.join("\n\n");
}

function truncateContext(content: string, maxLength: number, lineLimit: number): { text: string; wasTrimmed: boolean } {
  const lines = trimText(content).split(/\r?\n/);
  const byLine = lines.slice(0, lineLimit).join("\n");
  const wasLineTrimmed = lines.length > lineLimit;

  if (byLine.length <= maxLength) {
    return { text: byLine, wasTrimmed: wasLineTrimmed };
  }

  return {
    text: byLine.slice(0, Math.max(0, maxLength)).trimEnd(),
    wasTrimmed: true,
  };
}

function appendTrimNotice(text: string, wasTrimmed: boolean, notice: string): string {
  if (!wasTrimmed) {
    return text;
  }

  return `${text}\n${notice}`;
}
