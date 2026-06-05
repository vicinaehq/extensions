import type { RequestInterface } from "@octokit/types";
import { RequestError } from "@octokit/request-error";
import { octokit } from "./githubClient";
import { showToast, Toast } from "@vicinae/api";

export const octokitPaginate = async <R extends RequestInterface>(
  request: R,
  parameters?: Parameters<R>[0],
) => {
  try {
    const rest = await octokit.paginate(request, parameters);
    return rest;
  } catch (error) {
    if (error instanceof RequestError) {
      showToast({
        title: error.message,
        style: Toast.Style.Failure,
      });
    }
    return [];
  }
};
