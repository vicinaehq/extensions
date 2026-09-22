import { Action, ActionPanel, Detail, Icon, List, Toast, showToast, useNavigation } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { join } from "node:path";
import type { Config } from "./lib/config";
import { useOpenCodeCommand } from "./components/command-gate";
import { createOpenCodeService, type OpenCodeService } from "./lib/opencode/client";
import type { Endpoint } from "./lib/opencode/discovery";
import type { Project, VcsInfo } from "./lib/opencode/types";
import {
  checkGit,
  createGitRunner,
  formatChangeStat,
  listChangedFiles,
  loadFileDiff,
  MAX_DIFF_LINES,
  type ChangedFile,
  type FileDiff,
  type GitRunner,
  type ReviewScope,
} from "./lib/git";
import { buildExplainPrompt, buildReviewPrompt } from "./lib/prompts";
import { ProjectPickerList, basename } from "./components/project-picker";
import { OpenTUIAction, OpenTerminalAction, SentView } from "./components/actions";

const SCOPE_LABEL: Record<ReviewScope, string> = {
  working: "Working Tree",
  staged: "Staged",
  branch: "Branch",
};

const EMPTY_MESSAGE: Record<ReviewScope, string> = {
  working: "The working tree is clean.",
  staged: "Nothing is staged.",
  branch: "No commits ahead of the base branch.",
};

async function requestReview(
  service: OpenCodeService,
  directory: string,
  prompt: string,
): Promise<string> {
  const session = await service.createSession({ directory });
  await service.sendPrompt(session.id, prompt);
  return session.id;
}

function useReviewSender(props: {
  readonly endpoint: Endpoint;
  readonly directory: string;
}): {
  readonly busy: boolean;
  readonly sent: string | undefined;
  readonly send: (prompt: string) => void;
  readonly reset: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | undefined>(undefined);
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);

  const send = useCallback(
    (prompt: string) => {
      if (busy) return;
      setBusy(true);
      void (async () => {
        try {
          setSent(await requestReview(service, props.directory, prompt));
        } catch (error) {
          setSent(undefined);
          await showToast({
            style: Toast.Style.Failure,
            title: "Failed to request review",
            message: error instanceof Error ? error.message : "Failed to request review.",
          });
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, service, props.directory],
  );

  return {
    busy,
    sent,
    send,
    reset: useCallback(() => setSent(undefined), []),
  };
}

function FileDiffView(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly project: Project;
  readonly scope: ReviewScope;
  readonly file: ChangedFile;
  readonly branch: VcsInfo["branch"] | undefined;
}): ReactNode {
  const runner = useMemo(() => createGitRunner(props.project.canonical), [props.project.canonical]);
  const [diff, setDiff] = useState<FileDiff | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const sender = useReviewSender({ endpoint: props.endpoint, directory: props.project.canonical });

  useEffect(() => {
    let cancelled = false;
    void loadFileDiff(runner, props.scope, props.file, props.branch?.default)
      .then((loaded) => {
        if (!cancelled) setDiff(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [runner, props.scope, props.file, props.branch]);

  if (sender.sent) {
    return (
      <SentView
        title="Review requested"
        description={`OpenCode will review \`${props.file.path}\`. Open the session to follow along.`}
        sessionID={sender.sent}
        directory={props.project.canonical}
        config={props.config}
        againTitle="Back to Diff"
        onAgain={sender.reset}
      />
    );
  }

  const markdown =
    diff === undefined && !failed
      ? "Loading diff…"
      : [
          `## \`${props.file.path}\``,
          "",
          diff && diff.diff
            ? ["```diff", diff.diff, "```"].join("\n")
            : "_No textual diff for this file._",
          ...(diff?.truncated
            ? ["", `_Showing the first ${MAX_DIFF_LINES} lines. Open the terminal for the full diff._`]
            : []),
        ].join("\n");

  return (
    <Detail
      navigationTitle={props.file.path}
      markdown={failed ? "Could not load the diff for this file." : markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="File" text={props.file.path} />
          <Detail.Metadata.Label title="Scope" text={SCOPE_LABEL[props.scope]} />
          <Detail.Metadata.Label title="Changes" text={formatChangeStat(props.file)} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Review This File with OpenCode"
            icon={Icon.CodeBlock}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={() =>
              sender.send(buildReviewPrompt(props.scope, props.branch, props.file.path))
            }
          />
          <Action
            title="Explain This File with OpenCode"
            icon={Icon.QuestionMarkCircle}
            shortcut={{ modifiers: ["cmd"], key: "e" }}
            onAction={() =>
              sender.send(buildExplainPrompt(props.scope, props.branch, props.file.path))
            }
          />
          {diff && diff.diff ? (
            <Action.CopyToClipboard
              title="Copy Diff"
              shortcut="copy"
              content={diff.diff}
            />
          ) : null}
          <OpenTerminalAction directory={props.project.canonical} />
        </ActionPanel>
      }
    />
  );
}

/**
 * Review: read the actual repository diff in Vicinae first, then
 * route review work to OpenCode. The diff is rendered per file with syntax
 * highlighting. OpenCode does the reviewing. This extension only shows the result.
 */
function ReviewScopeStep(props: {
  readonly endpoint: Endpoint;
  readonly config: Config;
  readonly project: Project;
}): ReactNode {
  const { pop, push } = useNavigation();
  const [vcs, setVcs] = useState<VcsInfo | null | undefined>(undefined);
  const [gitOK, setGitOK] = useState<boolean | undefined>(undefined);
  const [scope, setScope] = useState<ReviewScope>("working");
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesFailed, setFilesFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const service = useMemo(() => createOpenCodeService(props.endpoint), [props.endpoint]);
  const runner = useMemo<GitRunner>(
    () => createGitRunner(props.project.canonical),
    [props.project.canonical],
  );
  const sender = useReviewSender({ endpoint: props.endpoint, directory: props.project.canonical });

  useEffect(() => {
    let cancelled = false;
    void service
      .vcs(props.project.canonical)
      .then((info) => {
        if (!cancelled) setVcs(info);
      })
      .catch(() => {
        if (!cancelled) setVcs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [props.project.canonical, service]);

  useEffect(() => {
    let cancelled = false;
    void checkGit(runner).then((ok) => {
      if (!cancelled) setGitOK(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [runner]);

  const base = vcs?.branch.default;
  const branchAvailable = base !== undefined;
  const projectTitle = `OpenCode Review · ${basename(props.project.canonical)}`;

  useEffect(() => {
    if (gitOK !== true) return;
    const activeScope: ReviewScope = scope === "branch" && !branchAvailable ? "working" : scope;
    if (activeScope !== scope) {
      setScope(activeScope);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    setFilesFailed(false);
    void listChangedFiles(runner, activeScope, base)
      .then((loaded) => {
        if (cancelled) return;
        setFiles(loaded);
        setFilesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFilesFailed(true);
        setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runner, scope, base, branchAvailable, gitOK, reloadKey]);

  if (sender.sent) {
    return (
      <SentView
        title="Review requested"
        description={`OpenCode will review the ${SCOPE_LABEL[scope].toLowerCase()} changes. Open the session to follow along.`}
        sessionID={sender.sent}
        directory={props.project.canonical}
        config={props.config}
        againTitle="Back to Changes"
        onAgain={sender.reset}
      />
    );
  }

  if (vcs === null) {
    return (
      <List navigationTitle={projectTitle}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Not a git repository"
          description={`${basename(props.project.canonical)} has no version control OpenCode can inspect.`}
          actions={
            <ActionPanel>
              <Action
                title="Pick a Different Project"
                icon="folder"
                shortcut={{ modifiers: ["cmd"], key: "p" }}
                onAction={pop}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (gitOK === false) {
    return (
      <List navigationTitle={projectTitle}>
        <List.EmptyView
          icon={Icon.Warning}
          title="Git is not available"
          description="Install git to read local changes for review."
          actions={
            <ActionPanel>
              <Action
                title="Pick a Different Project"
                icon="folder"
                shortcut={{ modifiers: ["cmd"], key: "p" }}
                onAction={pop}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const branch = vcs?.branch;
  const showEmpty = !filesLoading && !filesFailed && files.length === 0;

  return (
    <List
      isLoading={sender.busy || filesLoading || vcs === undefined || gitOK === undefined}
      filtering
      searchBarPlaceholder="Search changed files"
      navigationTitle={projectTitle}
      searchBarAccessory={
        <List.Dropdown tooltip="Scope" value={scope} onChange={(value) => setScope(value as ReviewScope)}>
          <List.Dropdown.Item title="Working Tree" value="working" />
          <List.Dropdown.Item title="Staged" value="staged" />
          {branchAvailable ? <List.Dropdown.Item title="Branch" value="branch" /> : null}
        </List.Dropdown>
      }
      actions={
        <ActionPanel>
          <Action
            title={`Review ${SCOPE_LABEL[scope]} with OpenCode`}
            icon={Icon.CodeBlock}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={() => sender.send(buildReviewPrompt(scope, branch))}
          />
          <Action
            title={`Explain ${SCOPE_LABEL[scope]} with OpenCode`}
            icon={Icon.QuestionMarkCircle}
            shortcut={{ modifiers: ["cmd"], key: "e" }}
            onAction={() => sender.send(buildExplainPrompt(scope, branch))}
          />
          <OpenTUIAction directory={props.project.canonical} config={props.config} />
        </ActionPanel>
      }
    >
      {showEmpty ? (
        <List.EmptyView
          icon={Icon.Checkmark}
          title={EMPTY_MESSAGE[scope]}
          description="Pick a file above once changes appear, or request a branch review."
        />
      ) : filesFailed ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Could not read git changes"
          description="The repository could not be read locally."
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon="rotate-clockwise"
                shortcut="refresh"
                onAction={() => setReloadKey((value) => value + 1)}
              />
            </ActionPanel>
          }
        />
      ) : (
        files.map((file) => (
          <List.Item
            key={file.path}
            title={file.path}
            icon={{ fileIcon: join(props.project.canonical, file.path) }}
            accessories={[{ text: formatChangeStat(file) }]}
            actions={
              <ActionPanel>
                <Action
                  title="Show Diff"
                  icon={Icon.CodeBlock}
                  onAction={() =>
                    push(
                      <FileDiffView
                        endpoint={props.endpoint}
                        config={props.config}
                        project={props.project}
                        scope={scope}
                        file={file}
                        branch={branch}
                      />,
                    )
                  }
                />
                <Action
                  title="Review This File with OpenCode"
                  icon={Icon.Stars}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() => sender.send(buildReviewPrompt(scope, branch, file.path))}
                />
                <OpenTUIAction directory={props.project.canonical} config={props.config} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

export default function ReviewChangesCommand(): ReactNode {
  const command = useOpenCodeCommand();
  const { push } = useNavigation();

  if (!command.ready) return command.view;
  const endpoint = command.endpoint;
  return (
    <ProjectPickerList
      endpoint={endpoint}
      onPick={(picked) => push(<ReviewScopeStep endpoint={endpoint} config={command.config} project={picked} />)}
      navigationTitle="OpenCode Review"
    />
  );
}
