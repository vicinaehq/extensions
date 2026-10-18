# Vault unlock and lock policy

Design doc. No code yet.

## Summary

The master password is a required preference that the extension can read but never write, so a changed Keysmith password leaves the extension permanently broken and the user with no way back. This doc moves the password out of preferences into an in-app unlock step, caches the derived key instead of the password, and lets the user choose when that cache dies.

## Problem

`package.json` declares `masterPassword` as `required` and typed `password`. Vicinae stores it in its settings database. Both commands read it with `getPreferenceValues()` (`src/copy-code.tsx:84`, `src/add-account.tsx:145`). The `@vicinae/api` surface is `getPreferenceValues` and `openExtensionPreferences`, and there is no `setPreferenceValues`. The value goes in and never comes out. Rotation is impossible from inside the extension.

Three defects fall out of that.

No re-prompt on failure. `copy-code.tsx:88` catches a decrypt failure and renders an error view whose only action is Reload, which reruns the same stale password.

Silent corruption on add. `addKeysmithAccount` (`src/lib/keysmith.ts:165`) derives a key from whatever string it is handed and encrypts without verifying it. With a stale preference password it appends an entry encrypted under a key Keysmith does not have. The written account can never be decrypted and the UI reports success.

Ambiguous failures. I tested `crypto_secretbox_open_easy` against the installed `libsodium-wrappers-sumo@0.8.4`: it throws `wrong secret key for the given ciphertext` rather than returning null. That throws out of the loop in `listKeysmithAccounts`, so a non-empty vault with a bad password does show an error, just a raw libsodium string. But the guard `if (!raw) continue` at `src/lib/keysmith.ts:147` is dead code, and against a vault with only a `[master-key]` section the loop never runs, so a bad password renders the "No OTP Accounts" empty state. Wrong password and empty vault look identical in that case.

## Goals

- A changed Keysmith password is recoverable without reinstalling the extension.
- The extension never writes an account under an unverified key.
- The user decides how long the unlock material lives, from "ask every time" to "survive reboot".
- No new subprocesses or network access.

## Non-goals

- Rotating the password inside Keysmith. That is Keysmith's job.
- Protecting the cached material against an attacker who already reads Vicinae's data directory. We can only raise the cost.

## Current flow

1. Vicinae prompts for `masterPassword` and `configPath` at install.
2. Command reads both preferences.
3. `readConfig` parses `Keysmith.conf`.
4. `deriveKey` runs Argon2id over the `[master-key]` parameters.
5. Each account's `secret` is opened with `crypto_secretbox_open_easy`.
6. Codes are computed in memory.

Step 4 is expensive by design. The Keysmith defaults are `memory=268435456` and `cpu=3`, so every command launch pays a quarter gigabyte Argon2id run. Caching the key removes that cost as a side effect.

## Design

### Unlock states

The command view has two states.

- Locked. Render the unlock form.
- Unlocked. Render the list, holding the derived key in memory.

The unlock form is the same component in both the first-run case and the re-prompt case. Differences are only the heading and the inline error text.

### What gets cached

Cache the derived key, not the password. The key is scoped to one salt and one vault, it cannot unlock Keysmith itself or anything else, and reusing it skips the Argon2id run on later opens.

One `LocalStorage` entry under `keysmith.unlock`, a JSON string:

```json
{
  "v": 1,
  "key": "<base64, 32 bytes>",
  "salt": "<base64, matching master-key.salt at write time>",
  "bootId": "<contents of /proc/sys/kernel/random/boot_id>",
  "daemonStart": "<field 22 of /proc/<vicinae pid>/stat>"
}
```

The salt is stored so a Keysmith password change invalidates the cache on its own. `LocalStorage` values are `string | number | boolean`, so the JSON goes in as one string.

### Lock policies

| Policy | Prompts | Cache lives for | Invalidated when |
| --- | --- | --- | --- |
| Every time | on every command launch | nothing on disk | n/a |
| On logout | once per login session | the session | `daemonStart` changes |
| On reboot | once per boot | until reboot | `bootId` changes |

"Every time" keeps the key in React state only. It is the closest match to Keysmith's own behavior, where you unlock the vault whenever you want a code.

"On logout" reads the Vicinae daemon's start time from `/proc`. Vicinae runs as a per-session service, so a new daemon start means a new login session. This is more robust than an in-memory nonce, because the daemon outlives the extension worker and survives command-level recycling. If step 1 under "Verify first" shows the worker is long-lived and the daemon parent is not readable, fall back to an in-memory nonce mirrored into `LocalStorage`.

"On reboot" compares `bootId`. Same-boot cache hits are silent.

In all three cases, a cached key is only trusted if the on-disk `salt` still matches `[master-key].salt`. A mismatch means the password changed and the cache is dropped without a decrypt attempt.

### Unlock flow

First run. No cache and no policy stored. The form asks for the password and the lock policy together. On submit, `unlockVault` runs. On success the policy is written, and the key is cached or discarded according to it.

Later opens. Read the cache. If the policy allows it and `salt`, `bootId`, and `daemonStart` all still match, go straight to the list. Otherwise drop the cache and show the form.

Re-prompt on failure. When `unlockVault` returns `invalid-password`, keep the form mounted, set the field's `error` to "That password did not unlock your Keysmith vault. Try again.", and reset the field. Do not fall through to the list. This is the entire fix for the rotation bug.

### Verification contract

Replace "did the loop throw" with an explicit result.

```ts
export type UnlockOutcome =
  | { status: "ok"; key: Uint8Array; saltB64: string }
  | { status: "invalid-password" }
  | { status: "nothing-to-verify" };
```

Rules:

- `unlockVault` derives the key, then opens the first account section it finds. A successful open means the password is right.
- `crypto_secretbox_open_easy` throwing maps to `invalid-password`. Catch it here, not at the caller.
- A vault with only a `[master-key]` section returns `nothing-to-verify`. The UI accepts the key and warns that it could not be confirmed. This is the honest version of today's empty-list ambiguity.
- I/O and parse failures keep throwing. They are not auth failures.

`addKeysmithAccount` takes an already-derived, verified key instead of a password, and refuses to write when verification has not happened. That removes the corruption path.

### Manifest and preferences

- Remove `masterPassword` from `package.json`. With it gone, Vicinae stops prompting at install and the first-run form becomes the onboarding.
- Keep `configPath`. It is not a secret.
- Do not add a `lockPolicy` preference. The first-run form owns the policy, and a preference would create a second source of truth that the form cannot write.

### UI surfaces

- Unlock form. Password field and submit action. On first run the form shows the current lock policy and the action panel offers the choices. Vicinae's native dropdown always renders a search field, so the policy uses actions instead.
- Vault settings, pushed from the list with `Action.Push`: current policy, change policy, Lock now.
- Lock now clears the cache and returns to the locked state. Useful for the "on reboot" and "on logout" users who want to lock early.
- List error view keeps the unused Reload action and adds Unlock.

## Module layout

- `src/lib/vault.ts` is new. Policy type, cache read/write/clear, `bootId()`, `daemonStart()`, `unlockVault`.
- `src/lib/keysmith.ts` changes. `deriveKey` returns the key and the salt it used. `listKeysmithAccounts` and `addKeysmithAccount` take a key, not a password.
- `src/components/unlock-form.tsx` is new.
- `src/components/vault-settings.tsx` is new.
- `src/copy-code.tsx` gates on unlock state.
- `src/add-account.tsx` reads the key from the same gate before writing.

`src/components/` does not exist yet. It is new structure, not a reorganization of what is there.

## Migration

Users on the current build have `masterPassword` set. After the manifest change they get the unlock form on first launch. To avoid a cold start, read the old preference once on first run and prefill the password field, then stop reading it forever after.

One thing to check: dropping a preference from the manifest may or may not purge its stored value. If it lingers, the plaintext password stays in Vicinae's settings database, which is the thing we are trying to get away from. If it lingers, the README needs a line telling users to clear it, and the extension should treat the old preference as untrusted after migration.

## Security notes

- The cached key at rest is only as private as Vicinae's database. Database encryption is opt-in via sqlcipher, so on a default install the cache is a plaintext key on disk. The README should say so next to the existing security section. Users who do not want that should pick "Every time".
- "On logout" is really "until the Vicinae daemon restarts". Real session detection needs D-Bus or `loginctl`, which breaks the no-subprocess promise.
- Locking clears the cache file. A copy of the key may still sit in whatever heap the worker holds until the process exits. Say so rather than implying a guarantee.
- The derived key opens this vault and nothing else. It cannot be replayed against Keysmith, since Keysmith derives its own key from the typed password.

## Verify first

Four things to confirm on a real Vicinae install before writing the caching layer.

1. Does the extension worker persist across command launches, and what is its parent process? This decides whether "on logout" uses `daemonStart` or an in-memory nonce.
2. Is `LocalStorage` encrypted on this machine, and does that track the sqlcipher setting?
3. Does `/proc/<vicinae pid>/stat` field 22 exist and change on daemon restart?
4. Does removing `masterPassword` from the manifest purge the stored value?

## Implementation order

Each step is a commit that stands alone.

1. Verification contract and typed errors. `unlockVault`, key-taking `listKeysmithAccounts` and `addKeysmithAccount`, `invalid-password` mapped at the source. No UI change. This alone fixes the corruption bug and the raw libsodium message.
2. Cache layer. `src/lib/vault.ts`, the three policies, the staleness checks. Still no UI change, exercised from the existing error path.
3. Unlock form and first-run onboarding. Remove `masterPassword` from the manifest. Gate both commands on unlock state.
4. Vault settings view. Change policy, Lock now.
5. README updates. New onboarding, lock policies, the at-rest caveat, the migration note.

## Open questions

- Default policy for first run. "On reboot" is convenient, "Every time" is the safest, "On logout" sits between. I lean "On logout", since it keeps day-to-day use frictionless without surviving a reboot.
- Should the unlock field offer a "remember for this session" inline shortcut, or is the policy dropdown enough?
