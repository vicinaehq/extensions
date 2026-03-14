import { Toast, closeMainWindow, showToast } from "@vicinae/api";
import { useState } from "react";
import z from "zod";
import { octokit } from "../api/githubClient";
import { Assignee, Branch, Issue, Repository } from "../types";

export const usePullRequestForm = () => {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [fromBranch, setFromBranch] = useState<Branch | null>(null);
  const [toBranch, setToBranch] = useState<Branch | null>(null);
  const [linkedIssue, setLinkedIssue] = useState<Issue | null>(null);
  const [autoClose, setAutoClose] = useState(false);
  const [draft, setDraft] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [errors, setErrors] = useState<PullRequestScehmaError | null>(null);

  const handleCreatePr = async () => {
    const validatedPr = prSchema.safeParse({
      repo,
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
    const [owner, repoName] = validatedPr.data.repo.full_name.split("/");

    const loadingToast = await showToast(
      Toast.Style.Animated,
      "Creating pull request...",
    );

    const linkedIssueText = validatedPr.data.autoClose
      ? `Closes #${validatedPr.data.linkedIssue?.number}`
      : `Related to #${validatedPr.data.linkedIssue?.number}`;

    try {
      const prResponse = await octokit.pulls.create({
        owner,
        repo: repoName,
        title: validatedPr.data.title.trim(),
        body: `${validatedPr.data.description || ""}${validatedPr.data.linkedIssue ? `\n\n${linkedIssueText}` : ""}`,
        head: validatedPr.data.fromBranch.name,
        base: validatedPr.data.toBranch.name,
        draft: validatedPr.data.draft,
      });

      if (validatedPr.data.assignee) {
        try {
          await octokit.issues.addAssignees({
            owner,
            repo: repoName,
            issue_number: prResponse.data.number,
            assignees: [validatedPr.data.assignee.login],
          });
        } catch {
          loadingToast.hide();
          await showToast(Toast.Style.Failure, "Failed to assign pull request");
        }
      }
      closeMainWindow();
    } catch (error) {
      console.log(JSON.stringify(error, null, 2));
      loadingToast.hide();
      await showToast(Toast.Style.Failure, "Failed to create pull request");
      return;
    }
  };

  return {
    repo,
    setRepo,
    fromBranch,
    setFromBranch,
    toBranch,
    setToBranch,
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
    },
    "Repository is required",
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
