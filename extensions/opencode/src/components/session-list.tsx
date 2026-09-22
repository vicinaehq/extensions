import { Action, ActionPanel, Icon, List, Toast, showToast, sendDesktopNotification, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createOpenCodeService, type OpenCodeService } from "../lib/opencode/client";
import type { Endpoint } from "../lib/opencode/discovery";
import { mapOpenCodeError, type OpenCodeError } from "../lib/opencode/errors";
import type { Config } from "../lib/config";
import { sessionStatus, statusLabel, type SessionStatusKind } from "../lib/session-status";
import { relativeTime } from "../lib/time";
import type { SessionActive, SessionInfo } from "../lib/opencode/types";
import { useLiveEvents } from "../lib/live-events";
import { DeleteSessionAction, OpenSessionAction, showActionError } from "./actions";
import { PromptForm, RenameSessionForm } from "./prompt-form";
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

function sessionDetailMarkdown(session: SessionInfo): string {
  const lines = [
    `**${session.title || "Untitled session"}**`,
    "",
    `- Directory: \`${session.location?.directory ?? "unknown"}\``,
    `- Agent: ${session.agent ?? "default"}`,
    `- Model: ${session.model ? `${session.model.providerID}/${session.model.id}` : "default"}`,
    `- Updated: ${relativeTime(session.time.updated) ?? "unknown"}`,
  ];
  if (session.outcome) lines.push(`- Last outcome: ${session.outcome}`);
  if (session.cost) lines.push(`- Cost: $${session.cost.toFixed(4)}`);
  if (session.tokens) lines.push(`- Tokens: ${Math.round(session.tokens.input + session.tokens.output)}`);
  lines.push("", `Session ID: \`${session.id}\``);
  return lines.join("\n");
}

/** Wait for a running session to finish, then report completion. */
function WaitForCompletionAction(props: {
  readonly sessionID: string;
  readonly service: OpenCodeService;
  readonly notifyOnCompletion: boolean;
  readonly onChanged: () => void;
}): ReactNode {
  return (
    <Action
      title="Wait for Completion"
      icon="hourglass"
      shortcut={{ modifiers: ["cmd"], key: "." }}
      onAction={() => {
        void (async () => {
          const toast = await showToast({ style: Toast.Style.Animated, title: "Waiting for OpenCode" });
          try {
            await props.service.wait(props.sessionID);
            await showToast({ style: Toast.Style.Success, title: "OpenCode session finished" });
            if (props.notifyOnCompletion) {
              await sendDesktopNotification({
                title: "OpenCode session finished",
                body: "The session you were waiting on has finished.",
              });
            }
            props.onChanged();
          } catch (error) {
            await showActionError(error, "Wait failed");
          } finally {
            void toast.hide();
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
  return (
    <ActionPanel>
      <OpenSessionAction
        sessionID={props.session.id}
        directory={props.session.location?.directory}
        config={props.config}
        title="Resume in Terminal"
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
        <WaitForCompletionAction
          sessionID={props.session.id}
          service={props.service}
          notifyOnCompletion={props.config.notifyOnCompletion}
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
      <Action.CopyToClipboard
        title="Copy Session ID"
        shortcut="copy"
        content={props.session.id}
      />
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
      isShowingDetail
      filtering
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search sessions"
      navigationTitle={props.navigationTitle}
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
      ) : (
        sessions.map((session) => {
          const status = sessionStatus(session, statusInputs);
          return (
            <List.Item
              key={session.id}
              id={session.id}
              title={session.title || "Untitled session"}
              icon={statusIcon(status)}
              keywords={[session.location?.directory ?? "", session.agent ?? "", session.model?.id ?? ""]}
              accessories={[statusAccessory(status), { text: relativeTime(session.time.updated) }]}
              detail={<List.Item.Detail markdown={sessionDetailMarkdown(session)} />}
              actions={
                <SessionActions
                  session={session}
                  status={status}
                  config={props.config}
                  endpoint={props.endpoint}
                  service={service}
                  onChanged={() => setReloadKey((v) => v + 1)}
                />
              }
            />
          );
        })
      )}
    </List>
  );
}
