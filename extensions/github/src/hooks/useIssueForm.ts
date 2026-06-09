import { Toast, closeMainWindow, showToast } from "@vicinae/api";
import { useState } from "react";
import z from "zod";
import { octokit } from "../api/githubClient";
import { Assignee, Label, Repository } from "../types";
import { useGetInferredRepo } from "./useGetInferredRepo";

export const useIssueForm = (path?: string) => {
  const inferredRepo = useGetInferredRepo(path);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState<Label | null>(null);
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [errors, setErrors] = useState<z.ZodError<IssueSchemaType> | null>(
    null,
  );
  const repo = selectedRepo || inferredRepo || null;

  const handleCreateIssue = async () => {
    setErrors(null);
    const validatedRepo = issueSchema.safeParse({
      title,
      description,
      label,
      assignee,
      repo,
    });

    if (!validatedRepo.success) {
      setErrors(validatedRepo.error);
      return;
    }

    const [owner, repoName] = validatedRepo.data.repo.full_name.split("/");

    const loadingToast = await showToast(
      Toast.Style.Animated,
      "Creating issue...",
    );
    try {
      await octokit.issues.create({
        owner,
        repo: repoName,
        title: validatedRepo.data.title.trim(),
        body: validatedRepo.data.description,
        assignees: validatedRepo.data.assignee?.login
          ? [validatedRepo.data.assignee.login]
          : undefined,
        labels: validatedRepo.data.label
          ? [validatedRepo.data.label.name]
          : undefined,
      });
      closeMainWindow();
    } catch {
      loadingToast.hide();
      await showToast(Toast.Style.Failure, "Failed to create issue");
      return;
    }
  };

  return {
    repo,
    setRepo: setSelectedRepo,
    title,
    setTitle,
    description,
    setDescription,
    label,
    setLabel,
    assignee,
    setAssignee,
    handleCreateIssue,
    errors: errors ? z.flattenError(errors) : null,
  };
};

const issueSchema = z.object({
  title: z.string().min(1, "Issue title is required"),
  description: z.string().optional(),
  label: z
    .object({
      name: z.string(),
    })
    .nullable(),
  assignee: z
    .object({
      login: z.string(),
    })
    .nullable(),
  repo: z.object(
    {
      full_name: z.templateLiteral([z.string(), "/", z.string()]),
    },
    "Repository is required",
  ),
});

type IssueSchemaType = z.infer<typeof issueSchema>;
