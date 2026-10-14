import { Toast, closeMainWindow, showToast } from "@vicinae/api";
import { useState } from "react";
import z from "zod";
import { octokit } from "../api/githubClient";
import { Assignee, Branch, Issue, Repository } from "../types";
import { useGetBranches } from "./useGetBranches";
import { useGetGitContext } from "./useGetGitContext";
import { useGetInferredRepo } from "./useGetInferredRepo";
import { useGetRepositoryDetails } from "./useGetRepositoryDetails";

export const usePullRequestForm = (path?: string) => {
  const gitContext = useGetGitContext(path);
  const inferredRepo = useGetInferredRepo(path);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [selectedBaseRepo, setSelectedBaseRepo] = useState<Repository | null>(
    null,
  );
  const [selectedFromBranch, setSelectedFromBranch] = useState<Branch | null>(
    null,
  );
  const [selectedToBranch, setSelectedToBranch] = useState<Branch | null>(null);
  const [linkedIssue, setLinkedIssue] = useState<Issue | null>(null);
  const [autoClose, setAutoClose] = useState(false);
  const [draft, setDraft] = useState(false);
  const [title, setTitle] = useState(gitContext?.latestCommitTitle || "");
  const [description, setDescription] = useState(
    gitContext?.latestCommitDescription || "",
  );
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [errors, setErrors] = useState<PullRequestScehmaError | null>(null);

  const repo = selectedRepo || inferredRepo || null;

  const { data: repoDetails } = useGetRepositoryDetails(repo);
  const defaultBaseRepo =
    repoDetails?.fork && repoDetails.parent ? repoDetails.parent : repo;
  const baseRepo = selectedBaseRepo || defaultBaseRepo || null;

  const { data: fromBranches = [] } = useGetBranches(repo);
  const inferredFromBranch = fromBranches.find(
    (branch) => branch.name === gitContext?.branch,
  );
  const fromBranch = selectedFromBranch || inferredFromBranch || null;

  const { data: toBranches = [] } = useGetBranches(baseRepo);
  const inferredToBranch = toBranches.find(
    (branch) => branch.name === baseRepo?.default_branch,
  );
  const toBranch = selectedToBranch || inferredToBranch || null;

  const setRepo = (nextRepo: Repository | null) => {
    setSelectedRepo(nextRepo);
    setSelectedBaseRepo(null);
    setSelectedFromBranch(null);
    setSelectedToBranch(null);
    setLinkedIssue(null);
    setAssignee(null);
    setErrors(null);
  };

  const setBaseRepo = (nextBaseRepo: Repository | null) => {
    setSelectedBaseRepo(nextBaseRepo);
    setSelectedFromBranch(null);
    setSelectedToBranch(null);
    setLinkedIssue(null);
    setAssignee(null);
    setErrors(null);
  };

  const handleCreatePr = async () => {
    const validatedPr = prSchema.safeParse({
      repo,
      baseRepo,
      fromBranch,
      toBranch,
      draft,
      title,
      description,
      assignee,
      linkedIssue,
      autoClose,
    });

    if (!validatedPr.success) {
      setErrors(validatedPr.error);
      return;
    }

    setErrors(null);
    const [baseOwner, baseRepoName] =
      validatedPr.data.baseRepo.full_name.split("/");
    const isCrossRepoPr =
      validatedPr.data.repo.full_name !== validatedPr.data.baseRepo.full_name;

    const loadingToast = await showToast(
      Toast.Style.Animated,
      "Creating pull request...",
    );

    const linkedIssueReference = `${validatedPr.data.baseRepo.full_name}#${validatedPr.data.linkedIssue?.number}`;
    const linkedIssueText = validatedPr.data.autoClose
      ? `Closes ${linkedIssueReference}`
      : `Related to ${linkedIssueReference}`;

    const head = isCrossRepoPr
      ? `${validatedPr.data.repo.owner.login}:${validatedPr.data.fromBranch.name}`
      : validatedPr.data.fromBranch.name;

    try {
      const prResponse = await octokit.pulls.create({
        owner: baseOwner,
        repo: baseRepoName,
        title: validatedPr.data.title.trim(),
        body: `${validatedPr.data.description || ""}${validatedPr.data.linkedIssue ? `\n\n${linkedIssueText}` : ""}`,
        head,
        ...(isCrossRepoPr &&
        validatedPr.data.repo.owner.login ===
          validatedPr.data.baseRepo.owner.login
          ? { head_repo: validatedPr.data.repo.name }
          : {}),
        base: validatedPr.data.toBranch.name,
        draft: validatedPr.data.draft,
      });

      if (validatedPr.data.assignee) {
        try {
          await octokit.issues.addAssignees({
            owner: baseOwner,
            repo: baseRepoName,
            issue_number: prResponse.data.number,
            assignees: [validatedPr.data.assignee.login],
          });
        } catch {
          loadingToast.hide();
          await showToast(Toast.Style.Failure, "Failed to assign pull request");
        }
      }
      closeMainWindow();
    } catch {
      loadingToast.hide();
      await showToast(Toast.Style.Failure, "Failed to create pull request");
      return;
    }
  };

  return {
    repo,
    setRepo,
    baseRepo,
    setBaseRepo,
    fromBranch,
    setSelectedFromBranch,
    toBranch,
    setSelectedToBranch,
    draft,
    setDraft,
    title,
    setTitle,
    description,
    linkedIssue,
    setLinkedIssue,
    autoClose,
    setAutoClose,
    setDescription,
    assignee,
    setAssignee,
    handleCreatePr,
    errors: errors ? z.flattenError(errors) : null,
  };
};

const prSchema = z.object({
  repo: z.object(
    {
      full_name: z.templateLiteral([z.string(), "/", z.string()]),
      name: z.string().min(1),
      owner: z.object({
        login: z.string().min(1),
      }),
    },
    "Repository is required",
  ),
  baseRepo: z.object(
    {
      full_name: z.templateLiteral([z.string(), "/", z.string()]),
      name: z.string().min(1),
      owner: z.object({
        login: z.string().min(1),
      }),
    },
    "Base repository is required",
  ),
  fromBranch: z.object(
    {
      name: z.string().min(1, "Source branch is required"),
    },
    "Source branch is required",
  ),
  toBranch: z.object(
    {
      name: z.string().min(1, "Target branch is required"),
    },
    "Target branch is required",
  ),
  draft: z.boolean(),
  title: z.string().min(1, "PR title is required"),
  description: z.string().optional(),
  assignee: z
    .object({
      login: z.string(),
    })
    .nullable(),
  linkedIssue: z
    .object({
      number: z.number(),
      title: z.string(),
    })
    .nullable(),
  autoClose: z.boolean(),
});

type PullRequestSchemaType = z.infer<typeof prSchema>;
type PullRequestScehmaError = z.ZodError<PullRequestSchemaType>;
