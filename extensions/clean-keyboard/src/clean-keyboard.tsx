import { Action, ActionPanel, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { lockKeyboard, unlockKeyboard, isLocked } from "./keyboard-locker";

interface Duration {
    display: string;
    seconds: number | null;
    icon: string;
}

const DURATIONS: Duration[] = [
    { display: "15 seconds", seconds: 15, icon: "🪥" },
    { display: "30 seconds", seconds: 30, icon: "🧽" },
    { display: "1 minute", seconds: 60, icon: "🧼" },
    { display: "2 minutes", seconds: 120, icon: "🚿" },
    { display: "5 minutes", seconds: 300, icon: "🛁" },
    { display: "1 hour", seconds: 3600, icon: "🧹" },
    { display: "24 hours", seconds: 86400, icon: "🫧" },
    { display: "Forever", seconds: null, icon: "🤯" },
];

export default function Command() {
    const [running, setRunning] = useState(false);
    // timeLeft tracks display only — actual unlock timing is owned by the helper
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [icon, setIcon] = useState("🧼");
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            // Release the grab if the extension is closed while locked
            if (isLocked()) unlockKeyboard();
        };
    }, []);

    const stopTick = () => {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    };

    const startTick = (seconds: number) => {
        stopTick();
        setTimeLeft(seconds);
        tickRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev === null || prev <= 1) {
                    stopTick();
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // Called by the locker when the helper exits (timer expired or Ctrl+U)
    const onHelperDone = () => {
        stopTick();
        setRunning(false);
        setTimeLeft(null);
    };

    const handleLock = async (duration: Duration) => {
        const toast = await showToast({
            style: Toast.Style.Animated,
            title: "Locking keyboard…",
        });

        const result = await lockKeyboard(duration.seconds, onHelperDone);

        if (!result.ok) {
            toast.style = Toast.Style.Failure;
            toast.title = "Failed to lock keyboard";
            toast.message = result.error;
            return;
        }

        toast.style = Toast.Style.Success;
        toast.title = "Keyboard locked";
        toast.message = "Press Ctrl+U to unlock at any time";

        setIcon(duration.icon);
        setRunning(true);
        if (duration.seconds !== null) startTick(duration.seconds);
    };

    const handleUnlock = () => {
        // Signal the helper — UI state update happens via onHelperDone callback
        // when the helper confirms it has released all grabs
        unlockKeyboard();
    };

    if (running) {
        const subtitle = timeLeft !== null
            ? `Cleaning for ${timeLeft}s… — Press Ctrl+U to unlock`
            : "Cleaning forever… — Press Ctrl+U to unlock";

        return (
            <List navigationTitle="Clean Keyboard">
                <List.EmptyView
                    icon={icon}
                    title="Keyboard locked"
                    description={subtitle}
                    actions={
                        <ActionPanel>
                            <Action
                                title="Unlock Keyboard"
                                icon={Icon.LockUnlocked}
                                shortcut={{ modifiers: ["ctrl"], key: "u" }}
                                onAction={handleUnlock}
                            />
                        </ActionPanel>
                    }
                />
            </List>
        );
    }

    return (
        <List navigationTitle="Clean Keyboard" searchBarPlaceholder="Lock keyboard for…">
            <List.Section title="Duration">
                {DURATIONS.map((d) => (
                    <List.Item
                        key={d.display}
                        title={d.display}
                        icon={d.icon}
                        actions={
                            <ActionPanel>
                                <Action
                                    title="Lock Keyboard"
                                    icon={Icon.Lock}
                                    onAction={() => handleLock(d)}
                                />
                            </ActionPanel>
                        }
                    />
                ))}
            </List.Section>
        </List>
    );
}
