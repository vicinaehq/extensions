import {
  Arguments,
  clearSearchBar,
  LaunchProps,
  showToast,
  Toast,
} from "@vicinae/api";
import { request } from "undici";
import { dsearch_port } from "./preferences";
import { getErrorMessage } from "./error_handling";

const REINDEX_ENDPOINT = `http://localhost:${dsearch_port}/reindex`;
const SYNC_ENDPOINT = `http://localhost:${dsearch_port}/sync`;

async function postAndEnsureSuccess(endpoint: string) {
  const response = await request(endpoint, { method: "POST" });
  const body = await response.body.text();
  if (response.statusCode !== 200 || body.trim().toLowerCase() === "error") {
    throw new Error(
      `HTTP ${response.statusCode}${body ? `: ${body.trim()}` : ""}`,
    );
  }
}

/** Triggers quick/full indexing through the DMS backend based on the selected command argument. */
export default async function dsearchIndex(
  props: LaunchProps<{ arguments: Arguments }>,
) {
  if (!props.arguments.reindex_mode) {
    return;
  }
  if (props.arguments.reindex_mode === "quick") {
    const toast = await showToast(
      Toast.Style.Animated,
      "Starting Quick Indexing...",
    );
    try {
      await postAndEnsureSuccess(SYNC_ENDPOINT);
      toast.style = Toast.Style.Success;
      toast.title = "Quick reindexing started successfully";
    } catch (error) {
      console.error("Error during quick reindexing:", error);
      toast.style = Toast.Style.Failure;
      toast.title = `Quick reindexing failed: ${getErrorMessage(error)}`;
    }
  } else if (props.arguments.reindex_mode === "full") {
    const toast = await showToast(
      Toast.Style.Animated,
      "Starting Full Indexing...",
    );
    try {
      await postAndEnsureSuccess(REINDEX_ENDPOINT);
      toast.style = Toast.Style.Success;
      toast.title = "Full reindexing started successfully";
    } catch (error) {
      console.error("Error during full reindexing:", error);
      toast.style = Toast.Style.Failure;
      toast.title = `Full reindexing failed: ${getErrorMessage(error)}`; //TODO: Can get quite long...and disappears very quickly.
    }
  }
  clearSearchBar();
  return;
}
