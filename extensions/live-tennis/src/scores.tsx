import {
  Action,
  ActionPanel,
  Detail,
  environment,
  getPreferenceValues,
  Icon,
  List,
  LocalStorage,
  openExtensionPreferences,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import path from "node:path";
import { INTERVAL_MS, loadSnapshot, Result, Store } from "./snapshot";
import { Match, pointScore, setScores } from "./scores-data";

const store: Store = {
  get: (key) => LocalStorage.getItem<string>(key),
  set: (key, value) => LocalStorage.setItem(key, value),
};

const time = (value: number) => new Date(value).toLocaleString();

function MatchDetail({
  match,
  fetchedAt,
}: {
  match: Match;
  fetchedAt: number;
}) {
  const score = match.score;
  const server = score?.server
    ? match.players[score.server === 1 ? "p1" : "p2"].name
    : "Unknown";
  return (
    <List.Item.Detail
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Player 1"
            text={match.players.p1.name}
          />
          <Detail.Metadata.Label
            title="Player 2"
            text={match.players.p2.name}
          />
          <Detail.Metadata.Label title="Tournament" text={match.tournament} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Set scores" text={setScores(score)} />
          <Detail.Metadata.Label
            title="Sets won"
            text={
              score?.sets.length
                ? `${score.sets[0] ?? "—"}–${score.sets[1] ?? "—"}`
                : "Unavailable"
            }
          />
          <Detail.Metadata.Label title="Points" text={pointScore(score)} />
          <Detail.Metadata.Label title="Serving" text={server} />
          {score?.is_tiebreak && (
            <Detail.Metadata.Label
              title="Tiebreak"
              text="In progress (may be a match tiebreak)"
            />
          )}
          {match.event_status && (
            <Detail.Metadata.Label
              title="Feed status"
              text={match.event_status}
            />
          )}
          {score?.stale && (
            <Detail.Metadata.Label
              title="Feed freshness"
              text="Marked stale by the source"
            />
          )}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Snapshot fetched"
            text={time(fetchedAt)}
          />
          <Detail.Metadata.Label
            title="Refresh cadence"
            text="At most every 15 minutes"
          />
        </Detail.Metadata>
      }
    />
  );
}

export default function Scores() {
  const { apiKey } = getPreferenceValues<{ apiKey: string }>();
  const [result, setResult] = useState<Result>();
  const [failure, setFailure] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let active = true;
    let pending: ReturnType<typeof setTimeout> | undefined;
    setResult(undefined);
    const refresh = async () => {
      setLoading(true);
      if (!apiKey?.trim()) {
        setFailure("Set your free API key in extension preferences.");
        setLoading(false);
        return;
      }
      try {
        const next = await loadSnapshot(apiKey, {
          store,
          directory: path.join(environment.supportPath, "request-locks"),
        });
        if (!active) return;
        setResult(next);
        setFailure(undefined);
        if (next.pending) pending = setTimeout(() => void refresh(), 1_000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown storage error";
        console.error(
          "Could not load saved tennis scores:",
          apiKey ? message.replaceAll(apiKey, "[redacted]") : message,
        );
        if (active)
          setFailure(
            "Could not read or save scores. Reopen the command and check Vicinae's logs if this persists.",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(pending);
    };
  }, [apiKey, revision]);

  const snapshot = result?.snapshot;
  const error = failure ?? result?.error;
  const refreshActions = (
    <ActionPanel>
      <Action
        title="Refresh Scores"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={() => setRevision((n) => n + 1)}
      />
      <Action
        title="Open Extension Preferences"
        icon={Icon.Cog}
        onAction={openExtensionPreferences}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={loading || result?.pending}
      isShowingDetail={showDetails}
      navigationTitle="Tennis Score Snapshots · 15-minute updates"
      searchBarPlaceholder="Search players or tournaments in this snapshot"
      actions={refreshActions}
    >
      <List.EmptyView
        icon={Icon.TennisBall}
        title={
          loading || result?.pending
            ? "Loading score snapshot…"
            : snapshot?.matches.length
              ? "No matching players or tournaments"
              : snapshot
                ? "No in-play matches in this snapshot"
                : "No score snapshot available yet"
        }
        description={
          snapshot
            ? `Fetched ${time(snapshot.fetchedAt)}. Refreshing also uses the 15-minute request limit.`
            : result
              ? `Next allowed refresh: ${time(result.retryAt)}.`
              : "A free Live Tennis API key is required."
        }
        actions={refreshActions}
      />
      {error && (
        <List.Section title="Update unavailable">
          <List.Item
            title={error}
            icon={Icon.Exclamationmark}
            detail={
              <List.Item.Detail
                markdown={`${error}\n\n${result ? `Next allowed refresh: ${time(result.retryAt)}.` : ""}\n\n${snapshot ? "The saved snapshot below may be outdated." : ""}`}
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title={
                    showDetails ? "Hide Error Details" : "Show Error Details"
                  }
                  icon={Icon.Info01}
                  onAction={() => setShowDetails((value) => !value)}
                />
                <Action
                  title="Refresh Scores"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={() => setRevision((n) => n + 1)}
                />
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Cog}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      {snapshot?.hasMore && (
        <List.Section title="Partial snapshot">
          <List.Item
            title="More matches are available"
            subtitle="Only the first page is fetched to limit API requests"
            icon={Icon.Info01}
            actions={refreshActions}
          />
        </List.Section>
      )}
      {snapshot && (
        <List.Section
          title={`${error ? "Saved" : "Score"} snapshot · ${time(snapshot.fetchedAt)}`}
          subtitle={`${snapshot.matches.length} matches`}
        >
          {snapshot.matches.map((match) => (
            <List.Item
              key={match.id}
              title={`${match.players.p1.name} vs ${match.players.p2.name}`}
              subtitle={showDetails ? undefined : match.tournament}
              keywords={[match.tournament]}
              icon={Icon.TennisBall}
              accessories={
                showDetails ? [] : [{ text: setScores(match.score) }]
              }
              detail={
                <MatchDetail match={match} fetchedAt={snapshot.fetchedAt} />
              }
              actions={
                <ActionPanel>
                  <Action
                    title={showDetails ? "Hide Details" : "Show Details"}
                    icon={Icon.Eye}
                    onAction={() => setShowDetails((value) => !value)}
                  />
                  <Action.CopyToClipboard
                    title="Copy Score Snapshot"
                    content={`${match.players.p1.name} vs ${match.players.p2.name}\n${match.tournament}\n${setScores(match.score)} · Points: ${pointScore(match.score)}\nSnapshot fetched ${time(snapshot.fetchedAt)}`}
                  />
                  <Action
                    title="Refresh Scores"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={() => setRevision((n) => n + 1)}
                  />
                  <Action
                    title="Open Extension Preferences"
                    icon={Icon.Cog}
                    onAction={openExtensionPreferences}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
