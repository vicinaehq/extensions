import { homedir } from "node:os";

export function friendly(p: string): string {
    const home = homedir();
    if (p === home) return "~";
    if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
    return p;
}

export function unfriendly(p: string): string {
    const home = homedir();
    if (p === "~") return home;
    if (p.startsWith("~/")) return home + p.slice(1);
    return p;
}

export function pathTokens(p: string): string[] {
    const segments = p.split("/").filter((s) => s.length > 0);
    const tokens: string[] = [p];
    for (const s of segments) tokens.push(s);
    for (let i = 0; i < segments.length - 1; i++) {
        tokens.push(segments[i] + "/" + segments[i + 1]);
    }
    return Array.from(new Set(tokens));
}
