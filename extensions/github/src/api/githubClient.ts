import { Octokit } from "@octokit/rest";
import { getPreferenceValues } from "@vicinae/api";

let octokit: Octokit | null = null;
let authToken: string | null = null;

export function initializeGitHubClient() {
  const token = getPreferenceValues<{ personalAccessToken: string }>().personalAccessToken;

  if (!token) {
    throw new Error("GitHub personal access token is required. Please configure it in extension preferences.");
  }

  authToken = token;
  octokit = new Octokit({ auth: token });
}

export function getGitHubClient() {
  if (!octokit) {
    initializeGitHubClient();
  }

  if (!octokit) {
    throw new Error("GitHub client not initialized");
  }

  return { octokit, token: authToken };
}