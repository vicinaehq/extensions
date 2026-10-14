# Pi for Vicinae

Minimal Vicinae UI for an existing [Pi](https://github.com/earendil-works/pi) installation. Pi keeps ownership of models, authentication, tools, skills, configuration, and session history.

## Requirements

- Vicinae 0.28.1 or newer
- `pi` available on `PATH`
- Optional on Wayland: `wl-clipboard` for image clipboard support

## Run

```sh
npm install
npm run dev
```

Open **Ask**, enter a request, and press Enter. The extension reads the current clipboard once, starts `pi --mode rpc`, and saves a normal persistent Pi session.

For the `? request` flow, open Vicinae Settings, find the **Ask** command in the **Pi** extension, and set its alias to `?`. Vicinae's alias fast-track moves focus to the command argument after the space, so `? explain this` followed by Enter launches the request directly.

Vicinae does not currently let an extension declare its own root-query prefix. Without the alias, use **Ask → Enter → request → Enter**. The command can also be enabled as a fallback; in that case its root query arrives through Vicinae's `fallbackText` API.

## MVP behavior

- Text clipboard is appended to the user request.
- Wayland clipboard images are sent through Pi RPC's native `images` field.
- Only thinking state and compact tool summaries are rendered; tool stdout stays hidden.
- Open in Pi closes the RPC process, then runs `pi --session <session-file>` in the default terminal.
- Cancel sends Pi's RPC `abort` command.
- Interactive prompts from Pi extensions are cancelled because this UI cannot render them yet.
