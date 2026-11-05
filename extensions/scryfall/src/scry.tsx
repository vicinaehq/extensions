import { Action, ActionPanel, Icon, List, Toast, getPreferenceValues, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { Card, ScryfallError, SearchResult, searchCards, searchUrl } from "./api";
import { manaSymbols } from "./mana";
import { formatPrices, imageUrl, formatsWithStatus, manaCost, oracleText, typeLine } from "./card";

const DEBOUNCE_MS = 300;
const SYNTAX_URL = "https://scryfall.com/docs/syntax";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function CardItem({ card }: { card: Card }) {
  const image = imageUrl(card);
  const text = oracleText(card);
  const symbols = manaSymbols(manaCost(card));
  const legal = formatsWithStatus(card, "legal");
  const restricted = formatsWithStatus(card, "restricted");
  return (
    <List.Item
      title={card.name}
      accessories={[...symbols, { tag: card.set.toUpperCase() }, { text: card.rarity }]}
      detail={
        <List.Item.Detail
          markdown={image ? `![${card.name}](${image})` : `**${card.name}**`}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Type" text={typeLine(card)} />
              <List.Item.Detail.Metadata.TagList title="Mana Value">
                {symbols.map((symbol, i) => (
                  <List.Item.Detail.Metadata.TagList.Item key={i} {...symbol} />
                ))}
                <List.Item.Detail.Metadata.TagList.Item text={`(CMC: ${card.cmc})`} />
              </List.Item.Detail.Metadata.TagList>
              <List.Item.Detail.Metadata.Label title="Set" text={card.set_name} />
              <List.Item.Detail.Metadata.Label title="Prices" text={formatPrices(card)} />
              <List.Item.Detail.Metadata.Label title="Legal" text={legal.join(", ") || "None"} />
              {restricted.length > 0 && (
                <List.Item.Detail.Metadata.Label title="Restricted" text={restricted.join(", ")} />
              )}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open on Scryfall" url={card.scryfall_uri} />
          <Action.CopyToClipboard title="Copy Card Name" content={card.name} />
          <Action.CopyToClipboard title="Copy for Discord" content={`[[${card.name}]]`} />
          <Action.CopyToClipboard title="Copy Art View for Discord" content={`[[!${card.name}]]`} />
          {text && <Action.CopyToClipboard title="Copy Oracle Text" content={text} />}
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const limit = Number(getPreferenceValues<{ resultLimit?: string }>().resultLimit) || 8;
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>({ cards: [], total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const q = query.trim();
    setError(undefined);
    if (!q) {
      setResult({ cards: [], total: 0 });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setResult(await searchCards(q, controller.signal));
        setIsLoading(false);
      } catch (err) {
        if (isAbortError(err)) return;
        const message = err instanceof ScryfallError ? err.message : "Check your network connection";
        setResult({ cards: [], total: 0 });
        setError(message);
        setIsLoading(false);
        await showToast({ style: Toast.Style.Failure, title: "Scryfall search failed", message });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const q = query.trim();
  const cards = result.cards.slice(0, limit);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={cards.length > 0}
      searchBarPlaceholder="Card name or Scryfall syntax, e.g. t:dragon c:r cmc<=4"
      onSearchTextChange={setQuery}
      throttle
    >
      {!q && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search Scryfall"
          description="Type a card name or Scryfall search syntax."
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Syntax Reference" url={SYNTAX_URL} />
            </ActionPanel>
          }
        />
      )}
      {q && !isLoading && error && (
        <List.EmptyView
          icon={Icon.Warning}
          title="Scryfall search failed"
          description={error}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Scryfall Search" url={searchUrl(q)} />
            </ActionPanel>
          }
        />
      )}
      {q && !isLoading && !error && cards.length === 0 && (
        <List.Section title="No cards found">
          <List.Item
            icon={Icon.Globe01}
            title="Search on Scryfall"
            subtitle={q}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open Scryfall Search" url={searchUrl(q)} />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      {cards.length > 0 && (
        <List.Section title="Cards">
          {cards.map((card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </List.Section>
      )}
      {cards.length > 0 && (
        <List.Section title="More">
          <List.Item
            icon={Icon.Globe01}
            title={`See all ${result.total} results on Scryfall`}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open Scryfall Search" url={searchUrl(q)} />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
    </List>
  );
}
