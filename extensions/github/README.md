# GitHub Extension for Vicinae

A Vicinae extension that provides GitHub integration, allowing you to work with issues, pull requests, search repositories, and stay on top of notifications. This extension is ported from the official Raycast GitHub extension.

## Features

- **Issues & Pull Requests**: View the issues and pull requests that matter to you
- **Workflow Runs**: Inspect recent workflow runs for your repositories
- **Repository Search**: Search through your public and private repositories

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
- **Number of Search Results**: Number of results to fetch when searching repositories (default: 50)
- **Default Issue Filter**: Default filter for issues and pull requests: My Issues, Assigned to Me, Mentioning Me, or All Issues

## Commands

| Command | Description |
| --- | --- |
| My Issues | View issues involving you and filter them by scope or repository. |
| Workflow Runs | View recent workflow runs for a selected repository. |
| Create Issue | Create a new issue in one of your repositories. |
| Create Pull Request | Create a new pull request in one of your repositories. |
| My Pull Requests | View pull requests involving you and filter them by scope or repository. |
| My Repositories | Browse your repositories. |
| Search Repositories | Search your public and private repositories by name. |

## Open from the Terminal

The Create Pull Request and Create Issue commands accept a `path` argument. When the provided directory is inside a git repository with a GitHub `origin` remote, Vicinae uses that local git context to infer the repository. Pull requests also prefill the source branch, target branch, and fork base repository when available.

You can add a small shell helper to open the command for the current directory:

```bash
ghpr() {
   vicinae 'vicinae://extensions/knoopx/github/createPullRequest?arguments={"path":"'"$(pwd)"'"}'
}

ghi() {
   vicinae 'vicinae://extensions/knoopx/github/createIssue?arguments={"path":"'"$(pwd)"'"}'
}
```

## Development

This extension uses the GitHub REST API via Octokit and React Query for data fetching and caching.

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

## License

MIT