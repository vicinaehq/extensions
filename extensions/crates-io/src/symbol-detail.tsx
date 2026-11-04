import { List } from "@raycast/api";
import { SymbolDetails, SymbolItem } from "./api";

export function symbolMarkdown(symbol: SymbolItem, details?: SymbolDetails): string {
  const lines = [`# ${symbol.name}`];
  if (symbol.full_name !== symbol.name) {
    lines.push("", `\`${symbol.full_name}\``);
  }
  if (details?.declaration) {
    lines.push("", "```rust", details.declaration, "```");
  }
  if (details?.description) {
    lines.push("", details.description);
  }
  for (const section of details?.sections ?? []) {
    lines.push("", `## ${section.title}`, "");
    for (const item of section.items) {
      lines.push(`- \`${item}\``);
    }
  }
  return lines.join("\n");
}

export default function SymbolDetail({
  symbol,
  details,
  error,
  loading,
}: {
  symbol: SymbolItem;
  details?: SymbolDetails;
  error?: string;
  loading?: boolean;
}) {
  const markdown = symbolMarkdown(symbol, details);
  const status = loading
    ? "_Loading docs.rs details…_"
    : error
      ? `_Couldn't load details: ${error}_`
      : undefined;

  return (
    <List.Item.Detail
      markdown={status ? `${markdown}\n\n${status}` : markdown}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Category" text={symbol.category} />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Link
            title="docs.rs"
            target={symbol.docsrs_url}
            text="Open page"
          />
        </List.Item.Detail.Metadata>
      }
    />
  );
}
