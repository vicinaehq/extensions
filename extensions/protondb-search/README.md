# ProtonDB Search

Search Steam games and check their Linux compatibility on ProtonDB directly in Vicinae.

## Features

- Real-time Steam search with ProtonDB compatibility ratings
- Featured games shown before you search
- Detailed game view with Steam metadata, pricing, genres, and requirements
- Persistent query cache so repeated opens load faster
- Quick actions for ProtonDB, Steam Store, Steam app, and copy workflows

## Actions

| Action | Shortcut | Description |
| --- | --- | --- |
| Show Details | `⌘D` | Open the selected game's detail view |
| Open on ProtonDB | `⌃O` | Open the ProtonDB report page in your browser |
| Open on Steam | `⌃⇧O` | Open the Steam Store page in your browser |
| Open in Steam | `⌘⇧O` | Open the game directly in the Steam desktop app |
| Copy ProtonDB URL | `⌃.` | Copy the ProtonDB app URL |
| Copy Compatibility Info | `⌃⇧.` | Copy the current ProtonDB rating summary |

## Data Sources

- Steam Community search API
- Steam Store app details API
- ProtonDB report summaries API

## Development

```sh
npm install
npm run dev
```

To build the production bundle:

```sh
npm run build
```
