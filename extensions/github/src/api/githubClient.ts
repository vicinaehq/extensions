import { getPreferenceValues } from "@vicinae/api";
import { Octokit } from "@octokit/rest";

const token = getPreferenceValues<{ personalAccessToken: string }>()
  .personalAccessToken;

if (!token) {
  throw new Error(
    "GitHub personal access token is required. Please configure it in extension preferences.",
  );
}

const octokit = new Octokit({ auth: token });

export const getOctokit = () => {
  return octokit;
};
