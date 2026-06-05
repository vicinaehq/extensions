---
name: extension-reviewer
description: Use when reviewing a vicinae extension for inclusion in the in-app store. Checks for native commands used where a vicinae API exists, unsafe process spawning, unauditable binary assets, obfuscated code, and obvious deceptions.
---

# Extension Reviewer

This document helps you review a vicinae extension.

The goal is to catch smells: native commands used where vicinae has a portable API, security risks, unauditable assets, obfuscated code, and similar issues.

## Threat model

vicinae extensions are usually installed from the in-app store, and we only list extensions in the store after they have been reviewed against this document. Users can also install extensions manually by building them, but they have to go out of their way to do so.

Extensions run on the host system as the current user, with full permissions. That is what makes them useful. Because of this, some things you would normally worry about in a sandboxed setting do not apply here. Treat extensions as running in a trusted environment.

What this means in practice:

- You don't need to worry about sanitizing user input in general. Only flag it when unsanitized input could cause destructive side effects, like a shell injection that deletes files or runs commands the user did not intend.
- You are not trying to protect the extension from its own user.

Everything in the checklist below is in scope.

## vicinae APIs vs native commands

Extension authors often reach for a command they already know instead of the equivalent vicinae API. Native commands tend to be less portable across desktop environments, so prefer the vicinae API when one exists.

Common things to watch for:

- `xdg-open` and `gtk-launch` can almost always be replaced by an `Action.OpenInBrowser` action, or a direct call to `open` from `@vicinae/api`.
- Window manager commands like `wmctrl`, `xdotool` or `hyprctl` should be replaced by the vicinae `WindowManagement` API, unless the extension genuinely needs something WM-specific.

## Review checklist

Flag any of the following when you see them.

### Network

- Remote services. List every remote host or API the extension talks to. Connecting to remote services is fine, but the reviewer has to confirm that each endpoint is legitimate for what the extension claims to do.

### Process spawning

- Calls like `spawnSync`, `exec`, `execFile` and friends. Note what is being spawned and why.
- Long-running child processes that outlive the extension's vicinae-controlled lifetime. Extensions should not leave orphaned processes behind.

### Assets

- Binary assets in the repo are not allowed, since we cannot audit them.
- Binaries downloaded from the internet and executed at runtime. This is not always wrong (some extensions legitimately depend on an upstream CLI) but it is always worth flagging and checking the justification.
- Junk files that do not belong in the extension, like editor scratch files, `.DS_Store`, stray build output, and so on.

### Code quality

- Obfuscated or minified code is not accepted.
- Dead code paths or commented-out blocks left over from development.

### Obvious deceptions

Most extensions are submitted in good faith, but keep an eye out for anything that looks like it is trying to hide what the code actually does. A few examples:

- A function or variable name that does not match what the code is doing (for instance, a `formatDate` that opens a network socket).
- Logic buried behind layers of indirection, dynamic `require`/`import`, `eval`, `Function()`, or base64-encoded strings that get decoded and executed.
- A README or extension description that does not line up with what the code actually does.
- Data being sent to a remote host that was not mentioned in the extension description.

If something feels off, trust that instinct and dig in before approving.
