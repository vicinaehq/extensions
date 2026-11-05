# Changelog

## [Initial Release] - 2026-06-12

- Manage Todos command: Overdue / Today / Upcoming / No Date / Completed sections
- Natural-language quick add (`buy milk tomorrow`, `pay rent on jun 20`)
- Time-of-day support in quick add (`12pm`, `12:00`, `1200hrs`, bare `1200`); times are local-only since the Google Tasks API can't store them
- Subtasks, snooze to tomorrow / next week, due dates
- Optional two-way Google Tasks sync (bring-your-own Google OAuth desktop client, PKCE loopback flow)
- In-app Configure Google Sync form
