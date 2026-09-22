import { Action, ActionPanel, Icon, List, Toast, showToast, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createOpenCodeService, type OpenCodeService } from "../lib/opencode/client";
import type { Endpoint } from "../lib/opencode/discovery";
import { mapOpenCodeError, type OpenCodeError } from "../lib/opencode/errors";
import type { Config } from "../lib/config";
import { sessionStatus, statusLabel, type SessionStatusKind } from "../lib/session-status";
import { relativeTime, timeBucket, TIME_BUCKETS } from "../lib/time";
import type { SessionActive, SessionInfo } from "../lib/opencode/types";
import { useLiveEvents } from "../lib/live-events";
import { DeleteSessionAction, OpenSessionAction, showActionError } from "./actions";
import { PromptForm, RenameSessionForm } from "./prompt-form";
import { SessionTranscriptView } from "./session-transcript";
import { OpenCodeErrorView } from "./error-state";

const BASE_PAGE_SIZE = 100;
const SEARCH_PAGE_SIZE = 50;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 250;

function statusAccessory(kind: SessionStatusKind): List.Item.Accessory {
  const color: Record<SessionStatusKind, string> = {
    working: "#f5a623",
    waiting: "#e0405c",
    idle: "#7a7a7a",
    failed: "#e0405c",
  };
  return { tag: { value: statusLabel(kind), color: color[kind] } };
}

function statusIcon(kind: SessionStatusKind) {
  switch (kind) {
    case "working":
      return Icon.CircleProgress;
    case "waiting":
      return Icon.Warning;
    case "failed":
      return Icon.XMarkCircle;
    case "idle":
      return Icon.SpeechBubble;
  }
}

/** Abbreviate the home directory so rows stay short: /home/me/work -> ~/work */
export function tildify(directory: string | undefined): string | undefined {
  if (!directory) return undefined;
  const home = process.env["HOME"];
  // Match the home directory itself or a full path segment below it, never
  // a directory that merely starts with the same characters.
  if (home && home !== "/" && (directory === home || directory.startsWith(`${home}/`))) {
    return `~${directory.slice(home.length)}`;
  }
  return directory;
}

/** Stop a working session through the official interrupt endpoint. */
function StopSessionAction(props: {
  readonly sessionID: string;
  readonly service: OpenCodeService;
  readonly onChanged: () => void;
}): ReactNode {
  return (
    <Action
      title="Stop"
      icon="circle-disabled"
      shortcut={{ modifiers: ["cmd"], key: "." }}
      onAction={() => {
        void (async () => {
          try {
            await props.service.interrupt(props.sessionID);
            await showToast({ style: Toast.Style.Success, title: "Session stopped" });
            props.onChanged();
          } catch (error) {
            await showActionError(error, "Failed to stop OpenCode");
          }
        })();
      }}
    />
  );
}

function SessionActions(props: {
  readonly session: SessionInfo;
  readonly status: SessionStatusKind;
  readonly config: Config;
  readonly endpoint: Endpoint;
  readonly service: OpenCodeService;
  readonly onChanged: () => void;
}): ReactNode {
  const { push } = useNavigation();
  const directory = props.session.location?.directory;
  const resumeCommand = directory
    ? `cd ${directory} && ${props.config.openCodePath || "opencode"} --session ${props.session.id}`
    : `${props.config.openCodePath || "opencode"} --session ${props.session.id}`;
  return (
    <ActionPanel>
      <OpenSessionAction
        sessionID={props.session.id}
        directory={directory}
        config={props.config}
        title="Resume in Terminal"
      />
      <Action
        title="View Transcript"
        icon="eye"
        shortcut={{ modifiers: ["cmd"], key: "t" }}
        onAction={() =>
          push(
            <SessionTranscriptView
              endpoint={props.endpoint}
              config={props.config}
              session={props.session}
            />,
          )
        }
      />
      <Action
        title="Send Prompt"
        icon="text"
        shortcut={{ modifiers: ["cmd"], key: "return" }}
        onAction={() =>
          push(<PromptForm endpoint={props.endpoint} config={props.config} session={props.session} />)
        }
      />
      {props.status === "working" ? (
        <StopSessionAction
          sessionID={props.session.id}
          service={props.service}
          onChanged={props.onChanged}
        />
      ) : null}
      <Action
        title="Rename"
        icon="text"
        shortcut="edit"
        onAction={() =>
          push(
            <RenameSessionForm
              endpoint={props.endpoint}
              session={props.session}
              onRenamed={props.onChanged}
            />,
          )
        }
      />
      <Action.CopyToClipboard title="Copy Session ID" shortcut="copy" content={props.session.id} />
      <Action.CopyToClipboard
        title="Copy Resume Command"
        content={resumeCommand}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
      />
      {directory ? (
        <Action.CopyToClipboard
          title="Copy Directory"
          content={directory}
          shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
        />
      ) : null}
      <DeleteSessionAction
        sessionID={props.session.id}
        sessionTitle={props.session.title || props.session.id}
        onDelete={async () => {
          await props.service.deleteSession(props.session.id);
          props.onChanged();
        }}
      />
    </ActionPanel>
  );
}

function SessionRow(props: {
  readonly session: SessionInfo;
  readonly statusInputs: { active: Record<string, SessionActive>; waiting: ReadonlySet<string> };
  readonly config: Config;
  readonly endpoint: Endpoint;
  readonly service: OpenCodeService;
  readonly onChanged: () => void;
}): ReactNode {
  const { session } = props;
  const status = sessionStatus(session, props.statusInputs);
  const directory = session.location?.directory;
  const subtitle = tildify(directory);
  // Idle is the normal state for most sessions, so it gets no badge; only
  // Working, Waiting for Input, and Failed are worth surfacing.
  const accessories: List.Item.Accessory[] = [];
  if (status !== "idle") accessories.push(statusAccessory(status));
  accessories.push({ text: relativeTime(session.time.updated) });
  return (
    <List.Item
      id={session.id}
      title={session.title || "Untitled session"}
      {...(subtitle ? { subtitle } : {})}
      icon={statusIcon(status)}
      keywords={[directory ?? "", session.agent ?? "", session.model?.id ?? ""]}
      accessories={accessories}
      actions={
        <SessionActions
          session={session}
          status={status}
          config={props.config}
          endpoint={props.endpoint}
          service={props.service}
          onChanged={props.onChanged}
        />
      }
    />
  );
}

/**
 * Shared session browser. Used by the OpenCode Sessions command and pushed
 * from the Projects view with a project filter. One source of truth: the
 * OpenCode server. Local filtering gives instant feedback while the
 * (debounced) server search covers sessions beyond the loaded pages.
 */
export function SessionListView(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly projectID?: string;
  readonly navigationTitle: string;
}): ReactNode {
  const [searchText, setSearchText] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchActive, setSearchActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [active, setActive] = useState<Record<string, SessionActive>>({});
  const [waiting, setWaiting] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<OpenCodeError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [directoryFilter, setDirectoryFilter] = useState<string>("all");

  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  const query = searchText.trim();
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const controllerRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusInputs = useMemo(() => ({ active, waiting }), [active, waiting]);

  const reloadFor = useCallback(
    async (targetQuery: string, signal?: AbortSignal) => {
      setIsLoading(true);
      try {
        if (targetQuery.length >= SEARCH_MIN_LENGTH) {
          const page = await service.sessions({
            limit: SEARCH_PAGE_SIZE,
            search: targetQuery,
            ...(props.projectID ? { projectID: props.projectID } : {}),
          });
          if (signal?.aborted) return;
          setSessions(page.data);
          setCursor(undefined);
          setSearchActive(true);
        } else {
          const page = await service.sessions({
            limit: BASE_PAGE_SIZE,
            ...(props.projectID ? { projectID: props.projectID } : {}),
          });
          if (signal?.aborted) return;
          setSessions(page.data);
          setCursor(page.next ?? undefined);
          setSearchActive(false);
        }
        const [activeMap, permissions, forms] = await Promise.all([
          service.activeSessions().catch(() => ({})),
          service.pendingPermissions().catch(() => new Set<string>()),
          service.pendingForms().catch(() => new Set<string>()),
        ]);
        if (signal?.aborted) return;
        setActive(activeMap);
        setWaiting(new Set([...permissions, ...forms]));
        setError(null);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(mapOpenCodeError(caught));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [service, props.projectID],
  );

  const loadLatest = useCallback(
    (targetQuery: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      void reloadFor(targetQuery, controller.signal);
    },
    [reloadFor],
  );

  const refreshCallback = useCallback(() => {
    loadLatest(queryRef.current);
  }, [loadLatest]);

  useEffect(() => {
    loadLatest(queryRef.current);
    return () => controllerRef.current?.abort();
  }, [loadLatest, reloadKey]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      loadLatest(queryRef.current);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [searchText, loadLatest]);

  // Live refresh through the official event stream while this view is mounted.
  useLiveEvents(service, refreshCallback);

  // Projects that exist among the loaded sessions, newest activity first.
  const directories = useMemo(() => {
    const last = new Map<string, number>();
    for (const session of sessions) {
      const directory = session.location?.directory;
      if (!directory) continue;
      const current = last.get(directory) ?? 0;
      if (session.time.updated > current) last.set(directory, session.time.updated);
    }
    return [...last.entries()].sort((a, b) => b[1] - a[1]).map(([directory]) => directory);
  }, [sessions]);

  // The list stays flat during server search; grouping there would fight
  // the relevance order OpenCode already decided.
  const visible = useMemo(
    () =>
      directoryFilter === "all"
        ? sessions
        : sessions.filter((session) => session.location?.directory === directoryFilter),
    [sessions, directoryFilter],
  );

  const grouped = useMemo(() => {
    const byBucket = new Map<string, SessionInfo[]>();
    for (const session of visible) {
      const bucket = timeBucket(session.time.updated);
      const bucketItems = byBucket.get(bucket) ?? [];
      bucketItems.push(session);
      byBucket.set(bucket, bucketItems);
    }
    return TIME_BUCKETS.filter((bucket) => byBucket.has(bucket)).map((bucket) => ({
      bucket,
      items: byBucket.get(bucket) as SessionInfo[],
    }));
  }, [visible]);

  if (error) {
    return <OpenCodeErrorView error={error} config={props.config} onRetry={() => setReloadKey((v) => v + 1)} />;
  }

  const loadMore = async () => {
    if (!cursor || isLoading || searchActive) return;
    setIsLoading(true);
    try {
      const page = await service.sessions({
        limit: BASE_PAGE_SIZE,
        cursor,
        ...(props.projectID ? { projectID: props.projectID } : {}),
      });
      setSessions((previous) => [
        ...previous,
        ...page.data.filter((session) => !previous.some((existing) => existing.id === session.id)),
      ]);
      setCursor(page.next ?? undefined);
    } catch (caught) {
      await showActionError(caught, "Failed to load more sessions");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <List
      isLoading={isLoading}
      filtering
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search sessions"
      navigationTitle={props.navigationTitle}
      searchBarAccessory={
        directories.length > 1 ? (
          <List.Dropdown
            tooltip="Project"
            value={directoryFilter}
            onChange={(value) => setDirectoryFilter(value)}
          >
            <List.Dropdown.Item title="All Projects" value="all" />
            {directories.map((directory) => (
              <List.Dropdown.Item key={directory} title={tildify(directory) ?? directory} value={directory} />
            ))}
          </List.Dropdown>
        ) : undefined
      }
      pagination={{ hasMore: !!cursor && !searchActive, onLoadMore: () => void loadMore() }}
    >
      {sessions.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.SpeechBubble}
          title={searchActive ? `No sessions match "${query}"` : "No sessions yet"}
          description={
            searchActive
              ? "Try a different search."
              : "Create a session with OpenCode Ask or OpenCode New Session."
          }
        />
      ) : directoryFilter !== "all" && visible.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.SpeechBubble}
          title="No sessions in this project"
          description="Pick another project in the dropdown above."
        />
      ) : searchActive ? (
        visible.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            statusInputs={statusInputs}
            config={props.config}
            endpoint={props.endpoint}
            service={service}
            onChanged={() => setReloadKey((v) => v + 1)}
          />
        ))
      ) : (
        grouped.map(({ bucket, items }) => (
          <List.Section key={bucket} title={bucket} subtitle={items.length > 0 ? `${items.length}` : ""}>
            {items.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                statusInputs={statusInputs}
                config={props.config}
                endpoint={props.endpoint}
                service={service}
                onChanged={() => setReloadKey((v) => v + 1)}
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}
