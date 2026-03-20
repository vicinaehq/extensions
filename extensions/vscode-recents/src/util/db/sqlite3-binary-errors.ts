export const SQLITE3_NOT_FOUND_MESSAGE =
    "The sqlite3 binary was not found. Install it to use this backend (e.g. sudo apt install sqlite3), or switch to the sql.js backend in extension preferences.";

export function isSqlite3BinaryNotFound(error: unknown): boolean {
    const err = error as NodeJS.ErrnoException;
    return (
        err?.code === "ENOENT" || (typeof err?.message === "string" && err.message.includes("spawn") && err.message.includes("ENOENT"))
    );
}
