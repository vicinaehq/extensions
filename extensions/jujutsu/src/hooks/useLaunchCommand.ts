import type { ComponentType, ReactNode } from "react";
import { LaunchProps, LaunchType, useNavigation } from "@vicinae/api";
import { launchCommand } from "../utils/helpers";

export function useLaunchCommand(repoPath: string) {
  const { push } = useNavigation();
  
  const launch = (Component: ComponentType<LaunchProps<any>>) => {
    launchCommand(push, Component, { "repo-path": repoPath });
  };
  
  return { launch, push };
}
