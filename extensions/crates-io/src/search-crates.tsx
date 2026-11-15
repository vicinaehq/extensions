/**
 * Crate search command: debounced crates.io list with copy/open/symbol actions.
 *
 * Empty query shows popular crates; typed queries split into exact-match and
 * relevance sections. The default action (preference) takes Enter while the
 * rest keep explicit shortcuts, and the detail pane enriches asynchronously,
 * reporting enrichment failures as a toast.
 */
import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  Toast,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Crate,
  CrateDetails,
  getCachedCrateDetails,
  getCachedCrates,
  getCrateDetails,
  getCrates,
  toError,
} from "./api";
import CrateDetail from "./crate-detail";
import { crateIcon } from "./icons";
import Symbols from "./symbols";

/** Row actions; values double as the `defaultOpenAction` preference. */
export enum CrateActions {
  COPY_TO_CLIPBOARD = "copyToClipboard",
  COPY_NAME = "copyName",
  VIEW_ON_CRATES_IO = "viewOnCratesIo",
  OPEN_CRATE_DOCUMENTATION = "openCrateDocumentation",
  OPEN_HOMEPAGE = "openHomepage",
  OPEN_REPOSITORY = "openRepository",
  VIEW_SYMBOLS = "viewSymbols",
  TOGGLE_DETAILS = "toggleDetails",
}

interface Preferences {
  defaultOpenAction: CrateActions;
}

type ActionGroup = "open" | "copy" | "view";

/** `Keyboard.Shortcut.Common.*` members are already `Shortcut` shaped. */
type ActionShortcut = Keyboard.Shortcut;

/** One row action plus its panel section; a falsy `node` hides it. */
export interface ActionEntry {
  /** Stable action id, matched against the default-action preference. */
  id: CrateActions;
  group: ActionGroup;
  node: ReactNode;
}

function getShortcut(action: CrateActions): ActionShortcut {
  switch (action) {
    case CrateActions.COPY_TO_CLIPBOARD:
      return Keyboard.Shortcut.Common.Copy;
    case CrateActions.COPY_NAME:
      return Keyboard.Shortcut.Common.CopyName;
    case CrateActions.VIEW_ON_CRATES_IO:
      return Keyboard.Shortcut.Common.Open;
    case CrateActions.OPEN_CRATE_DOCUMENTATION:
      return { modifiers: ["ctrl", "shift"], key: "o" };
    case CrateActions.OPEN_HOMEPAGE:
      return { modifiers: ["ctrl", "shift"], key: "h" };
    case CrateActions.OPEN_REPOSITORY:
      return { modifiers: ["ctrl", "shift"], key: "r" };
    case CrateActions.VIEW_SYMBOLS:
      return { modifiers: ["ctrl"], key: "i" };
    case CrateActions.TOGGLE_DETAILS:
      return { modifiers: ["cmd"], key: "d" };
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

export function dependencyLine(crate: Crate): string {
  return `${crate.name} = "${crate.maxStableVersion || crate.version}"`;
}

export function crateAccessories(
  crate: Crate,
): Array<{ tag: { value: string }; tooltip?: string }> {
  const version = crate.maxStableVersion || crate.version;
  return [
    {
      tag: { value: `v${version}` },
      tooltip:
        crate.newestVersion !== version ? `Newest version: v${crate.newestVersion}` : undefined,
    },
  ];
}

/**
 * Resolve the Enter action from the actions present on a row.
 *
 * A preferred open action may be missing when the crate has no URL for it;
 * fall back to the always-available crates.io page so Enter keeps opening
 * instead of silently copying.
 */
export function resolvePrimaryAction(
  present: ActionEntry[],
  defaultOpenAction: CrateActions,
): ActionEntry | undefined {
  return (
    present.find((entry) => entry.id === defaultOpenAction) ??
    present.find((entry) => entry.id === CrateActions.VIEW_ON_CRATES_IO) ??
    present[0]
  );
}

/** Actions for `crate`, grouped; the preferred default action leads (Enter). */
function getActions(
  crate: Crate,
  defaultOpenAction: CrateActions,
  showDetails: boolean,
  onToggleDetails: () => void,
): ReactNode {
  const { name, documentationURL, homepageURL, repositoryURL } = crate;
  const shortcut = (action: CrateActions) => getShortcut(action);

  const entries: ActionEntry[] = [
    {
      id: CrateActions.COPY_TO_CLIPBOARD,
      group: "copy",
      node: (
        <Action.CopyToClipboard
          key={CrateActions.COPY_TO_CLIPBOARD}
          content={dependencyLine(crate)}
          title="Copy Dependency Line"
          shortcut={shortcut(CrateActions.COPY_TO_CLIPBOARD)}
        />
      ),
    },
    {
      id: CrateActions.COPY_NAME,
      group: "copy",
      node: (
        <Action.CopyToClipboard
          key={CrateActions.COPY_NAME}
          content={name}
          title="Copy Crate Name"
          shortcut={shortcut(CrateActions.COPY_NAME)}
        />
      ),
    },
    {
      id: CrateActions.VIEW_ON_CRATES_IO,
      group: "open",
      node: (
        <Action.OpenInBrowser
          key={CrateActions.VIEW_ON_CRATES_IO}
          url={`https://crates.io/crates/${name}`}
          title="View on crates.io"
          icon={Icon.Link}
          shortcut={shortcut(CrateActions.VIEW_ON_CRATES_IO)}
        />
      ),
    },
    {
      id: CrateActions.OPEN_CRATE_DOCUMENTATION,
      group: "open",
      node: documentationURL && (
        <Action.OpenInBrowser
          key={CrateActions.OPEN_CRATE_DOCUMENTATION}
          url={documentationURL}
          title="Open Documentation"
          icon={Icon.Book}
          shortcut={shortcut(CrateActions.OPEN_CRATE_DOCUMENTATION)}
        />
      ),
    },
    {
      id: CrateActions.OPEN_HOMEPAGE,
      group: "open",
      node: homepageURL && (
        <Action.OpenInBrowser
          key={CrateActions.OPEN_HOMEPAGE}
          url={homepageURL}
          title="Open Homepage"
          icon={Icon.Link}
          shortcut={shortcut(CrateActions.OPEN_HOMEPAGE)}
        />
      ),
    },
    {
      id: CrateActions.OPEN_REPOSITORY,
      group: "open",
      node: repositoryURL && (
        <Action.OpenInBrowser
          key={CrateActions.OPEN_REPOSITORY}
          url={repositoryURL}
          title="Open Repository"
          icon={Icon.Link}
          shortcut={shortcut(CrateActions.OPEN_REPOSITORY)}
        />
      ),
    },
    {
      id: CrateActions.VIEW_SYMBOLS,
      group: "view",
      node: (
        <Action.Push
          key={CrateActions.VIEW_SYMBOLS}
          title="View Symbols"
          target={<Symbols crate={crate} />}
          icon={Icon.Code}
          shortcut={shortcut(CrateActions.VIEW_SYMBOLS)}
        />
      ),
    },
    {
      id: CrateActions.TOGGLE_DETAILS,
      group: "view",
      node: (
        <Action
          key={CrateActions.TOGGLE_DETAILS}
          title={showDetails ? "Hide Details" : "Show Details"}
          icon={showDetails ? Icon.AppWindowSidebarRight : Icon.AppWindowSidebarLeft}
          shortcut={shortcut(CrateActions.TOGGLE_DETAILS)}
          onAction={onToggleDetails}
        />
      ),
    },
  ];

  const present = entries.filter((entry) => !!entry.node);
  const primary = resolvePrimaryAction(present, defaultOpenAction);
  const rest = present.filter((entry) => entry !== primary);
  const inGroup = (group: ActionGroup) =>
    rest.filter((entry) => entry.group === group).map((entry) => entry.node);

  const open = inGroup("open");
  const copy = inGroup("copy");
  const view = inGroup("view");

  return (
    <ActionPanel>
      <ActionPanel.Section>{primary?.node}</ActionPanel.Section>
      {open.length > 0 && <ActionPanel.Section title="Open">{open}</ActionPanel.Section>}
      {copy.length > 0 && <ActionPanel.Section title="Copy">{copy}</ActionPanel.Section>}
      {view.length > 0 && <ActionPanel.Section title="View">{view}</ActionPanel.Section>}
    </ActionPanel>
  );
}

const DETAILS_FAILURE_TITLE = "Couldn't load crate details";

export default function Command() {
  const [crates, setCrates] = useState<Crate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchText, setSearchText] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CrateDetails>>({});
  const requestId = useRef(0);
  const lastRequest = useRef<AbortController | null>(null);
  /** Reused failure toast; concurrent toasts are undefined behavior. */
  const detailsToast = useRef<Toast | null>(null);

  const { defaultOpenAction }: Preferences = getPreferenceValues<Preferences>();

  /** Fetch `query`, dropping (and aborting) stale responses. */
  const search = useCallback(async (query: string) => {
    const current = ++requestId.current;
    lastRequest.current?.abort();
    lastRequest.current = null;

    // Cache hits are synchronous: no spinner, no flicker.
    const cached = getCachedCrates(query);
    if (cached) {
      setCrates(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    lastRequest.current = controller;
    setLoading(true);
    setError(null);

    try {
      const results = await getCrates(query, controller.signal);
      if (requestId.current === current) {
        setCrates(results);
      }
    } catch (e) {
      if (requestId.current === current && !isAbortError(e)) {
        setCrates([]);
        setError(toError(e));
      }
    } finally {
      if (requestId.current === current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (searchText.trim() === "") {
      void search("");
      return;
    }
    const timer = setTimeout(() => void search(searchText), 300);
    return () => {
      clearTimeout(timer);
      lastRequest.current?.abort();
    };
  }, [searchText, search]);

  const reportDetailsFailure = useCallback((error: Error) => {
    const shown = detailsToast.current;
    if (shown) {
      // Vicinae's `message` setter pushes no update of its own, so set it
      // before the setter that does.
      shown.message = error.message;
      shown.title = DETAILS_FAILURE_TITLE;
      return;
    }
    void showToast({
      style: Toast.Style.Failure,
      title: DETAILS_FAILURE_TITLE,
      message: error.message,
    })
      .then((toast) => {
        detailsToast.current = toast;
      })
      .catch(() => undefined); // feedback must never break the command
  }, []);

  useEffect(() => {
    if (!showDetails || !selectedId) return;

    const cached = getCachedCrateDetails(selectedId);
    if (cached) {
      setDetails((prev) => ({ ...prev, [selectedId]: cached }));
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    getCrateDetails(selectedId, controller.signal)
      .then((fetched) => {
        if (!cancelled) setDetails((prev) => ({ ...prev, [selectedId]: fetched }));
      })
      .catch((failure) => {
        // Enrichment is best-effort: the row keeps its core fields, so the
        // failure is reported as a toast instead of replacing the pane.
        if (!cancelled && !isAbortError(failure)) reportDetailsFailure(toError(failure));
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedId, showDetails, reportDetailsFailure]);

  const isBrowsing = searchText.trim() === "";

  const renderItem = (crate: Crate) => {
    const key = crate.id ?? crate.name;
    return (
      <List.Item
        id={key}
        key={key}
        icon={crateIcon}
        title={crate.name}
        keywords={[key]}
        accessories={crateAccessories(crate)}
        detail={showDetails ? <CrateDetail crate={crate} details={details[key]} /> : undefined}
        actions={getActions(crate, defaultOpenAction, showDetails, () =>
          setShowDetails((value) => !value),
        )}
      />
    );
  };

  const exactMatches = crates.filter((crate) => crate.exactMatch);
  const otherMatches = crates.filter((crate) => !crate.exactMatch);

  return (
    <List
      isLoading={loading}
      isShowingDetail={showDetails}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedId}
      searchBarPlaceholder="Search crates.io..."
    >
      {!loading && (
        <List.EmptyView
          title={
            error ? "Failed to load crates" : isBrowsing ? "Search crates.io" : "No crates found"
          }
          description={
            error
              ? error.message
              : isBrowsing
                ? "Start typing to search the registry"
                : "Try a different search term"
          }
          icon={error ? Icon.XMarkCircle : Icon.MagnifyingGlass}
          actions={
            error ? (
              <ActionPanel>
                <Action
                  title="Retry"
                  icon={Icon.ArrowClockwise}
                  onAction={() => void search(searchText)}
                />
              </ActionPanel>
            ) : undefined
          }
        />
      )}
      {isBrowsing ? (
        crates.length > 0 && (
          <List.Section title="Popular Crates">{crates.map(renderItem)}</List.Section>
        )
      ) : (
        <>
          {exactMatches.length > 0 && (
            <List.Section title="Exact Match">{exactMatches.map(renderItem)}</List.Section>
          )}
          {otherMatches.length > 0 && (
            <List.Section title="Results">{otherMatches.map(renderItem)}</List.Section>
          )}
        </>
      )}
    </List>
  );
}
