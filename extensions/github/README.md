# GitHub Extension for Vicinae

A Vicinae extension that provides GitHub integration, allowing you to work with issues, pull requests, search repositories, and stay on top of notifications. This extension is ported from the official Raycast GitHub extension.

## Features

- **Issues & Pull Requests**: View and manage issues and PRs created by you, assigned to you, or mentioning you
- **Repository Search**: Search through your public and private repositories with advanced filtering and sorting

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

## Setup

### GitHub Personal Access Token

To use this extension, you need a GitHub Personal Access Token:

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Create a new token with the following scopes:
   - `notifications`
   - `repo`
   - `project`
   - `read:org`
   - `read:user`

3. In Vicinae, open the GitHub extension preferences and enter your token

## Preferences

Customize the extension behavior through these preferences:

- **GitHub Token**: Your personal access token (required)
- **Default Search Terms**: Default search query for issues/PRs (default: "author:@me")
- **Number of Search Results**: Number of results to fetch (default: 50)
- **Default Issue Filter**: Filter to apply when opening issues
  - My Issues
  - Assigned to Me
  - Mentioning Me
  - All Issues
- **Default Repository Filter**: Filter for repositories
  - All Repositories
  - My Repositories

## Commands

### Issues
Lists issues and pull requests relevant to you:
- Issues/PRs you created (`author:@me`)
- Issues/PRs assigned to you
- Issues/PRs where you're mentioned

Supports filtering and searching by title, number, or assignee.

### Search Repositories
Search through your repositories by name with support for filtering (all vs. my repositories) and sorting options.

## Development

This extension uses the GitHub REST API via Octokit and GraphQL for efficient data fetching.

### Development Mode

Run the extension in development mode:
```bash
npm run dev
```

### Building

Build the production bundle:
```bash
npm run build
```

## Dependencies

- `@octokit/rest`: GitHub REST API client
- `@vicinae/api`: Vicinae API
- `date-fns`: Date utilities
- `graphql-request`: GraphQL client
- `lodash`: Utility functions

## License

MIT