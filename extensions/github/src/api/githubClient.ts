import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { getPreferenceValues } from "@vicinae/api";
import { Octokit } from "@octokit/rest";
import type { GitHubPreferencesMinimal } from "../types";

export type GitHubAuthentication =
  | {
      status: "authenticated";
      source: "github-cli" | "personal-access-token";
    }
  | {
      status: "unauthenticated";
      githubCliStatus: "not-installed" | "not-authenticated";
    };

let octokit: Octokit | undefined;
let authenticationPromise: Promise<GitHubAuthentication> | undefined;

const executablePath = [
  process.env.PATH,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/snap/bin",
  join(homedir(), ".local", "bin"),
  join(homedir(), ".nix-profile", "bin"),
  "/run/current-system/sw/bin",
  "/home/linuxbrew/.linuxbrew/bin",
]
  .filter(Boolean)
  .join(delimiter);

const getGitHubCliToken = (): Promise<
  | { token: string; status: "authenticated" }
  | { status: "not-installed" | "not-authenticated" }
> =>
  new Promise((resolve) => {
    execFile(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      {
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, PATH: executablePath },
      },
      (error, stdout) => {
        if (!error) {
          const token = stdout.trim();
          if (token) {
            resolve({ token, status: "authenticated" });
            return;
          }
        }

        resolve({
          status:
            error && "code" in error && error.code === "ENOENT"
              ? "not-installed"
              : "not-authenticated",
        });
      },
    );
  });

const resolveAuthentication = async (): Promise<GitHubAuthentication> => {
  const githubCli = await getGitHubCliToken();
  if (githubCli.status === "authenticated") {
    octokit = new Octokit({ auth: githubCli.token });
    return { status: "authenticated", source: "github-cli" };
  }

  const { personalAccessToken } =
    getPreferenceValues<GitHubPreferencesMinimal>();
  const token = personalAccessToken?.trim();
  if (token) {
    octokit = new Octokit({ auth: token });
    return { status: "authenticated", source: "personal-access-token" };
  }

  octokit = undefined;
  return {
    status: "unauthenticated",
    githubCliStatus: githubCli.status,
  };
};

export const authenticateWithGitHub = (force = false) => {
  if (force) {
    octokit = undefined;
    authenticationPromise = undefined;
  }

  authenticationPromise ||= resolveAuthentication();
  return authenticationPromise;
};

export const getOctokit = () => {
  if (!octokit) {
    throw new Error("GitHub authentication has not been initialized.");
  }

  return octokit;
};
