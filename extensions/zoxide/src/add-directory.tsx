import { LaunchProps, getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { friendly } from "./lib/path";
import type { Preferences } from "./lib/types";
import { addPath } from "./lib/zoxide";

interface AddDirectoryArgs {
    path: string;
}

export default async function AddDirectory(props: LaunchProps<{ arguments: AddDirectoryArgs }>) {
    const prefs = getPreferenceValues<Preferences>();
    const path = props.arguments?.path?.trim() ?? "";

    if (!path) {
        await showToast({
            style: Toast.Style.Failure,
            title: "No path provided",
            message: "Pass an absolute path as the argument.",
        });
        return;
    }

    try {
        await addPath(path, prefs.extraPath);
        await showToast({
            style: Toast.Style.Success,
            title: "Added to zoxide",
            message: friendly(path),
        });
    } catch (e) {
        await showToast({
            style: Toast.Style.Failure,
            title: "zoxide add failed",
            message: e instanceof Error ? e.message : String(e),
        });
    }
}
