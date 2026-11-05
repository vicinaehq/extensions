# Tennis Score Snapshots

Browse in-play tennis score snapshots from [Live Tennis API](https://livetennisapi.com) in Vicinae. Search players and tournaments, inspect set scores, points and serve, and copy a score with its timestamp.

## Setup

1. Create a **free** Live Tennis API key at [livetennisapi.com](https://livetennisapi.com). No paid plan is required.
2. Enter it in the extension's password preference.
3. Open **Tennis Score Snapshots**.

These are periodic snapshots, not point-by-point updates. While open, the command checks every 15 minutes. Opening it again or choosing **Refresh Scores** uses the same saved request limit. Every snapshot shows when it was fetched; a failed refresh keeps the previous snapshot visibly marked as saved. Missing scores remain unavailable, rather than becoming 0–0.

The extension requests only `GET /matches?status=live&limit=200`, authenticating with the `X-API-Key` header. It never fetches additional pages: if more than 200 matches are available, it labels the snapshot as partial. Search filters the fetched matches locally.

## Free-tier request budget

The minimum interval is fixed in code at **900 seconds**, including failed requests: at most **96 attempts per day**, below the free tier's 100/day allowance. Request history survives closing and reopening Vicinae. A process lock prevents overlapping command instances from spending separate requests. HTTP 429 `Retry-After` may lengthen the interval.

Use a dedicated key for this extension on one installation. Other applications or computers sharing the key consume the same API quota and cannot share this installation's request history. The extension stores snapshots and request history in Vicinae LocalStorage; lock names contain a hash, never the API key. It has no analytics.

## Development

```sh
npm ci --legacy-peer-deps
npm test
npm run typecheck
npm run lint
npm run build
```

From the repository root, also run `bun scripts/validate-extension.ts live-tennis`. Tests use synthetic responses and exercise persistent throttling, concurrent processes, errors, nullable scores and player-major set ordering. They do not require an API key.
