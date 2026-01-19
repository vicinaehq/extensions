import type { ComponentType, ReactNode, ReactElement } from "react";
import { LaunchProps, LaunchType, showToast, Toast, type KeyModifier, type KeyEquivalent } from "@vicinae/api";

export const SHORTCUTS: Record<string, { modifiers: KeyModifier[]; key: KeyEquivalent }> = {
  VIEW_STATUS: { modifiers: ["ctrl"], key: "s" },
  VIEW_LOG: { modifiers: ["ctrl"], key: "l" },
  VIEW_DIFF: { modifiers: ["ctrl"], key: "d" },
  EDIT_DESCRIPTION: { modifiers: ["ctrl"], key: "e" },
  NEW_CHANGE: { modifiers: ["ctrl"], key: "n" },
  MANAGE_BOOKMARKS: { modifiers: ["ctrl"], key: "b" },
  COPY_REPO_PATH: { modifiers: ["ctrl"], key: "c" },
  COPY_ID: { modifiers: ["ctrl"], key: "c" },
  COPY_ID_SHIFT: { modifiers: ["ctrl", "shift"], key: "c" },
  CONFIRM: { modifiers: ["ctrl"], key: "enter" },
  DELETE: { modifiers: ["ctrl"], key: "delete" },
  SQUASH: { modifiers: ["ctrl", "shift"], key: "q" },
  SPLIT: { modifiers: ["ctrl", "shift"], key: "t" },
  RESOLVE: { modifiers: ["ctrl", "shift"], key: "r" },
  UNDO: { modifiers: ["ctrl"], key: "z" },
  PULL_PUSH: { modifiers: ["ctrl", "shift"], key: "s" },
  PULL_ONLY: { modifiers: ["ctrl", "shift"], key: "p" },
  PUSH_ONLY: { modifiers: ["ctrl", "shift"], key: "u" },
  TIME_TRAVEL: { modifiers: ["ctrl", "shift"], key: "e" },
  PUSH_BOOKMARK: { modifiers: ["ctrl"], key: "p" },
  TRACK_REMOTE: { modifiers: ["ctrl"], key: "t" },
  FORGET_BOOKMARK: { modifiers: ["ctrl"], key: "f" },
  DELETE_BOOKMARK: { modifiers: ["ctrl"], key: "delete" },
  PUSH_ALL_BOOKMARKS: { modifiers: ["ctrl", "shift"], key: "p" },
  CREATE_BOOKMARK: { modifiers: ["ctrl"], key: "n" },
} as const;

export const launchCommand = (push: (node: ReactNode) => void, Component: ComponentType<LaunchProps<any>>, args: LaunchProps<any>["arguments"]) => {
  push(<Component launchType={LaunchType.UserInitiated} arguments={args} />);
};

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function withSuccessToast(operation: () => Promise<void>, successTitle: string): () => Promise<void> {
  return async () => {
    try {
      await operation();
      await showToast({ title: successTitle, style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Operation failed",
        message: getErrorMessage(error),
        style: Toast.Style.Failure
      });
    }
  };
}

export function withRepoPathValidation<P extends object>(
  Component: ComponentType<P>,
  repoPath: string | undefined,
  validationError: ReactNode
): ReactElement | null {
  if (!repoPath) {
    return <>{validationError}</>;
  }
  return <Component {...(undefined as unknown as P)} />;
}

export function withErrorHandling<T extends unknown[]>(
  operation: (...args: T) => Promise<void>,
  successTitle: string
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await operation(...args);
      await showToast({ title: successTitle, style: Toast.Style.Success });
    } catch (error) {
      await showToast({
        title: "Operation failed",
        message: getErrorMessage(error),
        style: Toast.Style.Failure
      });
    }
  };
}
