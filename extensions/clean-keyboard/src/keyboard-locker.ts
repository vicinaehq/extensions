import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { environment } from "@vicinae/api";

// The C helper grabs all keyboard devices exclusively via EVIOCGRAB.
// It reads events directly from the grabbed devices to detect Ctrl+U,
// and also watches stdin for a programmatic unlock signal (timer expiry).
const HELPER_SOURCE = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <sys/ioctl.h>
#include <sys/select.h>
#include <linux/input.h>

#define EVIOCGRAB_VAL 1
#define MAX_DEVICES 64

/* evdev key codes */
#define KEY_LEFTCTRL_CODE  29
#define KEY_RIGHTCTRL_CODE 97
#define KEY_U_CODE         22

static int fds[MAX_DEVICES];
static int nfds = 0;

static void release_all(void) {
    for (int i = 0; i < nfds; i++) {
        ioctl(fds[i], EVIOCGRAB, 0);
        close(fds[i]);
    }
}

static int is_keyboard(int fd) {
    unsigned long evbit = 0;
    ioctl(fd, EVIOCGBIT(0, sizeof(evbit)), &evbit);
    if (!(evbit & (1 << EV_KEY))) return 0;
    /* KEY_A = evdev code 30 — present on all real keyboards */
    unsigned long keybit[KEY_CNT / 8 / sizeof(unsigned long) + 1];
    memset(keybit, 0, sizeof(keybit));
    ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keybit)), keybit);
    int word = 30 / (8 * (int)sizeof(unsigned long));
    int bit  = 30 % (8 * (int)sizeof(unsigned long));
    return (keybit[word] >> bit) & 1;
}

int main(void) {
    struct dirent *de;
    DIR *dir = opendir("/dev/input");
    if (!dir) { perror("opendir /dev/input"); return 1; }

    while ((de = readdir(dir)) != NULL && nfds < MAX_DEVICES) {
        if (strncmp(de->d_name, "event", 5) != 0) continue;
        char devpath[64];
        snprintf(devpath, sizeof(devpath), "/dev/input/%s", de->d_name);
        int fd = open(devpath, O_RDWR | O_NONBLOCK);
        if (fd < 0) continue;
        /* Guard against fds >= FD_SETSIZE which would corrupt fd_set */
        if (fd >= FD_SETSIZE) { close(fd); continue; }
        if (!is_keyboard(fd)) { close(fd); continue; }
        if (ioctl(fd, EVIOCGRAB, EVIOCGRAB_VAL) < 0) { close(fd); continue; }
        fds[nfds++] = fd;
    }
    closedir(dir);

    if (nfds == 0) {
        fprintf(stderr, "no-keyboards\\n");
        return 1;
    }

    printf("locked\\n");
    fflush(stdout);

    int ctrl_down = 0;

    for (;;) {
        /* Build fd_set from all grabbed devices + stdin */
        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(STDIN_FILENO, &rfds);
        int maxfd = STDIN_FILENO;
        for (int i = 0; i < nfds; i++) {
            FD_SET(fds[i], &rfds);
            if (fds[i] > maxfd) maxfd = fds[i];
        }

        struct timeval tv = { .tv_sec = 1, .tv_usec = 0 };
        int r = select(maxfd + 1, &rfds, NULL, NULL, &tv);
        if (r < 0) {
            /* Retry on signal interrupt, exit on real errors */
            if (errno == EINTR) continue;
            break;
        }

        /* Programmatic unlock: data on stdin means timer fired or UI button */
        if (FD_ISSET(STDIN_FILENO, &rfds)) {
            char buf[16];
            ssize_t n = read(STDIN_FILENO, buf, sizeof(buf));
            if (n > 0) break; /* explicit unlock signal */
            /* n == 0 means EOF (parent died) — also exit cleanly */
            if (n == 0) break;
            /* n < 0: EAGAIN/EINTR on stdin — ignore and continue */
        }

        /* Read events from every grabbed keyboard device */
        for (int i = 0; i < nfds; i++) {
            if (!FD_ISSET(fds[i], &rfds)) continue;
            struct input_event ev;
            while (read(fds[i], &ev, sizeof(ev)) == (ssize_t)sizeof(ev)) {
                if (ev.type != EV_KEY) continue;
                int pressed  = (ev.value == 1); /* 1=down, 0=up, 2=repeat */
                int released = (ev.value == 0);
                if (ev.code == KEY_LEFTCTRL_CODE || ev.code == KEY_RIGHTCTRL_CODE) {
                    if (pressed)  ctrl_down = 1;
                    if (released) ctrl_down = 0;
                }
                if (ev.code == KEY_U_CODE && pressed && ctrl_down) {
                    release_all();
                    printf("unlocked\\n");
                    fflush(stdout);
                    return 0;
                }
            }
        }
    }

    release_all();
    printf("unlocked\\n");
    fflush(stdout);
    return 0;
}
`;

function sourceHash(): string {
    return createHash("sha256").update(HELPER_SOURCE).digest("hex");
}

function ensureHelper(): string {
    const supportDir = environment.supportPath;
    const HELPER_BIN = path.join(supportDir, "clean-keyboard-helper");
    const HELPER_SRC = path.join(supportDir, "clean-keyboard-helper.c");
    const HELPER_HASH_FILE = path.join(supportDir, "clean-keyboard-helper.hash");

    if (!fs.existsSync(supportDir)) {
        fs.mkdirSync(supportDir, { recursive: true });
    }

    const currentHash = sourceHash();
    const cachedHash = fs.existsSync(HELPER_HASH_FILE)
        ? fs.readFileSync(HELPER_HASH_FILE, "utf8").trim()
        : "";

    if (!fs.existsSync(HELPER_BIN) || cachedHash !== currentHash) {
        fs.writeFileSync(HELPER_SRC, HELPER_SOURCE);
        try {
            execSync(`gcc -O2 -o "${HELPER_BIN}" "${HELPER_SRC}"`, { stdio: "pipe" });
            fs.writeFileSync(HELPER_HASH_FILE, currentHash);
        } catch {
            throw new Error(
                "Could not compile keyboard helper: gcc is required.\n" +
                "Install it with: sudo dnf install gcc  (or: sudo apt install gcc)"
            );
        }
    }

    return HELPER_BIN;
}

type LockState = {
    process: ReturnType<typeof spawn>;
    durationTimer: ReturnType<typeof setTimeout> | null;
    onDone: () => void;
};

let lockState: LockState | null = null;

export type LockResult =
    | { ok: true }
    | { ok: false; error: string };

export async function lockKeyboard(
    durationSeconds: number | null,
    onDone: () => void
): Promise<LockResult> {
    if (lockState) {
        return { ok: false, error: "Keyboard is already locked" };
    }

    let helperBin: string;
    try {
        helperBin = ensureHelper();
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    return new Promise((resolve) => {
        const proc = spawn(helperBin, [], { stdio: ["pipe", "pipe", "pipe"] });
        let resolved = false;
        let stdoutBuf = "";

        const cleanup = () => {
            if (lockState?.durationTimer) {
                clearTimeout(lockState.durationTimer);
            }
            lockState = null;
            onDone();
        };

        proc.stdout.on("data", (data: Buffer) => {
            // Buffer stdout — chunks can arrive merged or split across events
            stdoutBuf += data.toString();
            const lines = stdoutBuf.split("\n");
            // Keep the incomplete last chunk buffered
            stdoutBuf = lines.pop() ?? "";

            for (const line of lines) {
                const msg = line.trim();
                if (msg === "locked" && !resolved) {
                    resolved = true;

                    let durationTimer: ReturnType<typeof setTimeout> | null = null;
                    if (durationSeconds !== null && isFinite(durationSeconds)) {
                        durationTimer = setTimeout(() => {
                            if (lockState) proc.stdin.write("\n");
                        }, durationSeconds * 1000);
                    }

                    lockState = { process: proc, durationTimer, onDone };
                    resolve({ ok: true });
                } else if (msg === "unlocked") {
                    cleanup();
                }
            }
        });

        proc.stderr.on("data", (data: Buffer) => {
            const msg = data.toString().trim();
            if (!resolved) {
                resolved = true;
                resolve({
                    ok: false,
                    error: msg === "no-keyboards"
                        ? "No accessible keyboard devices found.\n\nRun: sudo usermod -aG input $USER\nThen log out and back in. This is a one-time setup."
                        : `Helper error: ${msg}`,
                });
            }
        });

        proc.on("close", () => {
            if (!resolved) {
                resolved = true;
                resolve({ ok: false, error: "Helper exited unexpectedly before locking" });
            }
            // Only call cleanup if lockState still points to this process
            // (guards against double-cleanup if unlocked cleanly before close fires)
            if (lockState?.process === proc) {
                cleanup();
            }
        });

        proc.on("error", (err) => {
            if (!resolved) {
                resolved = true;
                resolve({ ok: false, error: `Failed to start helper: ${err.message}` });
            }
        });
    });
}

export function unlockKeyboard(): void {
    if (!lockState) return;
    lockState.process.stdin?.write("\n");
    // Don't null lockState here — wait for the "unlocked" line from the process
    // so cleanup() runs exactly once via the stdout handler
}

export function isLocked(): boolean {
    return lockState !== null;
}
