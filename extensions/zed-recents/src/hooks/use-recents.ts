import { Alert, Toast, confirmAlert, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";
import type { RecentProject } from "../types";
import { loadRecents, removeRecent } from "../zed-db";

export function useRecents() {
    const [items, setItems] = useState<RecentProject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [diagnostics, setDiagnostics] = useState<string | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setIsLoading(true);
                const res = await loadRecents();
                if (cancelled) return;
                setItems(res.items);
                setDiagnostics(res.diagnostics);
            } catch (err) {
                if (cancelled) return;
                setItems([]);
                setDiagnostics(String(err));
                await showToast({ style: Toast.Style.Failure, title: "Failed to load recents", message: String(err) });
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const removeItem = useCallback(async (item: RecentProject) => {
        const confirmed = await confirmAlert({
            title: `Remove "${item.label}"?`,
            message: "This will remove it from the recent projects list.",
            primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
        });
        if (!confirmed) return;
        try {
            await removeRecent(item.path);
            setItems((prev) => prev.filter((i) => i.path !== item.path));
            await showToast({ style: Toast.Style.Success, title: "Removed from recents" });
        } catch (err) {
            await showToast({ style: Toast.Style.Failure, title: "Failed to remove", message: String(err) });
        }
    }, []);

    return { projects: items, isLoading, diagnostics, removeItem };
}
