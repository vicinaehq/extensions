/**
 * docs.rs symbol browser for one crate.
 *
 * Groups symbols by index category with a dropdown filter; a default-on
 * detail pane shows the selected symbol's docs.rs page (declaration,
 * description, impls). Empty and error states link out to docs.rs for
 * versions that were never built.
 */
import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  Crate,
  SymbolDetails,
  SymbolItem,
  getCachedSymbolDetails,
  getSymbolDetails,
  toError,
  useCrateSymbols,
} from "./api";
import { symbolIcon } from "./icons";
import SymbolDetail from "./symbol-detail";

const ALL_CATEGORIES = "All";

interface DetailState {
  details?: SymbolDetails;
  error?: string;
}

export default function Symbols({ crate }: { crate: Crate }) {
  const [symbols, loading, error] = useCrateSymbols(crate);
  const [filter, setFilter] = useState<string>(ALL_CATEGORIES);
  const [showDetails, setShowDetails] = useState(true);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailState>>({});

  const grouped = useMemo(() => {
    const byCategory: { [category: string]: SymbolItem[] } = {};
    for (const symbol of symbols ?? []) {
      if (!byCategory[symbol.category]) {
        byCategory[symbol.category] = [];
      }
      byCategory[symbol.category].push(symbol);
    }
    return byCategory;
  }, [symbols]);

  const categories = useMemo(() => Object.keys(grouped), [grouped]);

  useEffect(() => {
    if (!showDetails || !selectedUrl) return;

    const cached = getCachedSymbolDetails(selectedUrl);
    if (cached) {
      setDetails((prev) => ({ ...prev, [selectedUrl]: { details: cached } }));
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    getSymbolDetails(selectedUrl, controller.signal)
      .then((fetched) => {
        if (!cancelled) setDetails((prev) => ({ ...prev, [selectedUrl]: { details: fetched } }));
      })
      .catch((failure) => {
        if (!cancelled) {
          setDetails((prev) => ({ ...prev, [selectedUrl]: { error: toError(failure).message } }));
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedUrl, showDetails]);

  const renderItem = (symbol: SymbolItem) => {
    const state = details[symbol.docsrs_url];
    return (
      <SymbolItemComponent
        key={symbol.docsrs_url}
        symbol={symbol}
        details={state?.details}
        error={state?.error}
        loading={symbol.docsrs_url === selectedUrl && !state}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails((value) => !value)}
      />
    );
  };

  return (
    <List
      isLoading={loading}
      isShowingDetail={showDetails}
      navigationTitle={`${crate.name} — Symbols`}
      searchBarPlaceholder="Filter symbols by name"
      onSelectionChange={setSelectedUrl}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter By Category"
          storeValue={false}
          value={filter}
          onChange={setFilter}
        >
          <List.Dropdown.Section title="Categories">
            <List.Dropdown.Item key={ALL_CATEGORIES} title="All" value={ALL_CATEGORIES} />
            {categories.map((category) => (
              <List.Dropdown.Item key={category} title={category} value={category} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {!loading && (
        <List.EmptyView
          title={error ? "Couldn't load symbols" : "No symbols found"}
          description={
            error
              ? error.message
              : "docs.rs may not have built this version, or the filter matched nothing."
          }
          icon={error ? Icon.XMarkCircle : Icon.Book}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open in docs.rs"
                url={`https://docs.rs/${crate.id ?? crate.name}`}
              />
            </ActionPanel>
          }
        />
      )}
      {Object.entries(grouped)
        .filter(([category]) => filter === ALL_CATEGORIES || category === filter)
        .map(([category, categorySymbols]) => (
          <List.Section title={category} key={category}>
            {categorySymbols.map(renderItem)}
          </List.Section>
        ))}
    </List>
  );
}

function SymbolItemComponent({
  symbol,
  details,
  error,
  loading,
  showDetails,
  onToggleDetails,
}: {
  symbol: SymbolItem;
  details?: SymbolDetails;
  error?: string;
  loading: boolean;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <List.Item
      id={symbol.docsrs_url}
      icon={symbolIcon}
      title={symbol.name}
      subtitle={symbol.full_name === symbol.name ? undefined : symbol.full_name}
      detail={
        showDetails ? (
          <SymbolDetail symbol={symbol} details={details} error={error} loading={loading} />
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open in docs.rs" url={symbol.docsrs_url} />
          <Action.CopyToClipboard title="Copy Symbol Name" content={symbol.name} />
          <ActionPanel.Section title="View">
            <Action
              title={showDetails ? "Hide Details" : "Show Details"}
              icon={showDetails ? Icon.AppWindowSidebarRight : Icon.AppWindowSidebarLeft}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              onAction={onToggleDetails}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
