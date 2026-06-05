import { useExec } from "@raycast/utils";
import { List, Detail } from "@vicinae/api";
import { ReactNode } from "react";
import { noOmarchyEnv } from "../config/error";

export const OmarchyCheck = ({ children }: { children: ReactNode }) => {
  const { isLoading, error } = useExec(
    "/bin/sh",
    ["-c", "command -v omarchy-menu"],
    {
      execute: true,
    },
  );
  if (isLoading) return <List isLoading={true} />;
  if (error) return <Detail markdown={noOmarchyEnv} />;
  return children;
};
