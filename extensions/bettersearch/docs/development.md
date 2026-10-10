# Development

## Setup

```bash
git clone https://github.com/selfxplanatorium/bettersearch-vicinae
cd bettersearch-vicinae
npm install
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Builds in development mode and reloads on change. Vicinae must be running. |
| `npm run build` | Type-checks and builds into Vicinae's extension folder. |
| `npm run build:universal` | The same build, with native binaries for every supported platform. |
| `npm run lint` | Validates the manifest with `vici lint`. |
| `npm run typecheck` | Runs `tsc --noEmit`. Run a build first, because it generates `vicinae-env.d.ts`. |

To build somewhere other than Vicinae's extension folder, run `npx vici build -o <folder>`.

## Project layout

```
assets/
  icon.svg, icon.png      Extension icon (the PNG is rendered from the SVG)
  daemon/
    daemon.mjs            Background index server
    package.json          Its only dependency: @ff-labs/fff-node
    package-lock.json     Locks every platform's native packages
docs/                     Documentation
scripts/
  install-daemon.mjs      postinstall: installs the daemon's dependencies
src/
  search-files.tsx        Command entry points (file name = command name in package.json)
  search-file-contents.tsx
  manage-index.tsx
  lib/                    Shared code, see docs/architecture.md
```

## Talking to the daemon directly

The protocol is one JSON object per line, so a few lines of Node are enough for testing:

```js
import net from "node:net";

const socket = net.connect(`${process.env.XDG_RUNTIME_DIR}/vicinae-bettersearch-${process.getuid()}.sock`);
socket.on("connect", () =>
	socket.write(`${JSON.stringify({ id: 1, method: "grep", params: { query: "TODO", mode: "plain", pageSize: 5 } })}\n`),
);
socket.on("data", (data) => {
	console.log(JSON.parse(data.toString()));
	socket.end();
});
```

The methods are listed in [architecture.md](architecture.md#protocol).

## Changing the daemon

Each command compares a hash of the installed `daemon.mjs` with the hash reported by the running daemon, and replaces the daemon if they differ. After a rebuild, the next search runs the new code.

## Updating fff

```bash
cd assets/daemon
npm install @ff-labs/fff-node@latest
```

Commit the updated `package-lock.json`. It must keep entries for every platform's native package, which npm writes by default. `build:universal` fails if one is missing.

## Regenerating the icon

```bash
rsvg-convert -w 512 -h 512 assets/icon.svg -o assets/icon.png
```
