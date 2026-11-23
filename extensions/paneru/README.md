# Paneru for Vicinae

Control [Paneru](https://github.com/karinushka/paneru), the scrollable tiling
window manager for macOS, from Vicinae. Every action you can bind in Paneru's
`[bindings]` is available as its own Vicinae command (via `paneru send-cmd`),
so you can search for it, give it an alias, or assign it a Vicinae hotkey.

- **Paneru Commands**: a searchable list of everything, grouped by area, with
  actions to copy the equivalent `paneru send-cmd …` line or binding name.
- **One command per action**: e.g. *Focus Window Left*, *Swap Window Right*,
  *Grow Window Width*, *Toggle Tabbed Stack*, *Move Window to Next Virtual
  Workspace*, *Copy Window Rule*, *Restart Paneru*.
- **Numbered commands** (*Focus Window by Column Number*, *Switch to / Move
  Window to / Send Window to Virtual Workspace…*) take the number as an
  argument.

If Vicinae can't find `paneru`, set **Paneru Binary** in the extension
preferences. By default it searches `PATH`, Homebrew, Cargo and Nix locations.

## Development

```bash
npm install
npm run dev
```

All commands are defined in `src/lib/commands.ts`. The per-command
entrypoints (`src/<name>.ts`) and the `commands` array in `package.json` are
generated from it by `npm run generate`, which `dev` and `build` run
automatically. Don't edit those generated files by hand.
