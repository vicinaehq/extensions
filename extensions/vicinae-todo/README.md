# Todo List for Vicinae

A todo-list extension for [Vicinae](https://vicinae.com) with natural-language
quick add, due dates, subtasks, and optional two-way sync with Google Tasks.

## Commands

- **Manage Todos** — list view with Overdue / Today / Upcoming / No Date /
  Completed sections. Complete (`Enter`), edit (`⌘E`), add subtask (`⌘S`),
  snooze to tomorrow (`⌘T`) or next week (`⌘⇧T`), new todo (`⌘N`),
  delete (`⌃X`), sync (`⌘R`).
- **Add Todo** — quick add with natural language: `buy milk tomorrow`,
  `pay rent on jun 20`, `finish slides by monday`. Times work too, in any
  common format: `report due 22nd june 12pm`, `12 pm`, `12:00`, `1200hrs`,
  `1200 hrs`, or a bare `1200`. The date/time phrases are parsed and stripped
  from the title.

  A bare 4-digit number only counts as a time when it sits next to the date
  phrase or at the end of the input — `buy 1500 nails tomorrow` keeps
  `1500 nails` in the title, while `submit report tomorrow 1500` means 3 PM.
  Bare `19xx`/`20xx` read as years; use `1930hrs` or `19:30` for evening
  times.

## Development

```sh
npm install
npm run dev    # hot-reloads into the running Vicinae instance
npm run build  # installs into ~/.local/share/vicinae/extensions
```

## Google Tasks sync (optional)

Sync is two-way (last write wins) against a dedicated Google Tasks list
(default name: `Vicinae`). Because this extension isn't a published Google
app, you bring your own (free) OAuth credential — a one-time ~5 minute setup:

1. Go to <https://console.cloud.google.com/> and create a project
   (e.g. `vicinae-todo`).
2. **APIs & Services → Library** → search for **Google Tasks API** → Enable.
3. **APIs & Services → OAuth consent screen** → configure; choose
   **External**, fill in the required fields, and add your own Google account
   under **Test users** (the app can stay in *Testing* mode).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   application type **Desktop app**.
5. In **Manage Todos**, open the action panel and run **Configure Google
   Sync** (`⌘⇧G`), then paste the **Client ID** and **Client Secret** there.
   (Vicinae's settings window does not yet expose optional extension
   preferences, so configuration happens inside the extension; values are
   kept in Vicinae's local database.)

Then run **Sync with Google Tasks** (`⌘R`) inside Manage Todos. Your browser
opens a Google consent screen once; the extension catches the redirect on a
temporary `127.0.0.1` loopback server (standard OAuth PKCE for desktop apps —
no third-party services involved). Tokens are stored in Vicinae's local
storage. After the first sign-in, the list also syncs automatically when
opened if the last sync is more than two minutes old.

### Sync model notes

- The Google Tasks **API** stores due **dates** only — [it cannot read or
  write a time of day](https://developers.google.com/tasks/reference/rest/v1/tasks)
  — and has no priorities or tags. Due dates sync; times stay local to the
  extension (they survive remote edits and are only cleared if the due date
  is cleared on Google's side).
- Subtasks sync natively (one level deep, matching Google Tasks).
- Deletions propagate both ways; conflicts resolve to the most recent edit.
