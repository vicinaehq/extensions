# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## Architecture

This is a monorepo for **Vicinae extensions**. Each extension is a standalone application in the `extensions/` directory that follows the Vicinae extension schema.

### Extension Structure

Each extension in `extensions/` contains:
- `package.json` - Must follow the Vicinae extension schema (`$schema: "https://raw.githubusercontent.com/vicinaehq/vicinae/refs/heads/main/extra/schemas/extension.json"`)
- `src/` - TypeScript/TSX source files
  - Command files (e.g., `port-killer.tsx`, `case-converter.tsx`) export a React component as default
- `tsconfig.json` - TypeScript configuration
- `README.md` - Extension documentation
- `extension_icon.png` - Extension icon

### Key Concepts

1. **Extension Metadata**: The `package.json` defines:
   - `commands[]` - Extension commands with mode ("view" for UI, "no-view" for background)
   - `preferences[]` - User-configurable settings (checkboxes, textfields, dropdowns)
   - `scripts` - Should use `vici build` and `vici develop` commands

2. **Vicinae API**: Extensions import from `@vicinae/api` which provides:
   - UI components: `List`, `Action`, `ActionPanel`, `Icon`, etc.
   - System APIs: `Clipboard`, `showToast`, `showHUD`, `getSelectedText`, `getFrontmostApplication`
   - React hooks and utilities

3. **Command Files**: Each command exports a React component that renders the UI using Vicinae components.

## Development Workflow

### Working on Individual Extensions

```bash
# Navigate to an extension directory
cd extensions/<extension-name>

# Install dependencies
bun install

# Development mode with hot reload
bun run dev
# or
bunx vici develop

# Build for production
bun run build
# or
bunx vici build
```

### Building & Deploying Extensions

From the root directory:

```bash
# Deploy all extensions (builds and uploads to store)
make deploy
# or
bun scripts/deploy.ts extensions

# Deploy a single extension
make deploy-single EXT=port-killer
# or
bun scripts/deploy-extension.ts port-killer

# Deploy multiple specific extensions
bun scripts/deploy-extension.ts port-killer case-converter
```

The deploy scripts:
1. Install dependencies with `bun install`
2. Build with `bunx vici build --out dist/<extension-name>`
3. Create a zip archive of the built extension
4. Upload to the extension store via API

Environment variables for deployment:
- `STORE_BASE_URL` - Extension store URL (default: `http://localhost:3000`)
- `STORE_API_SECRET` - API authentication token (required for production)

### Validation

Before submitting a PR or deploying, validate your extension:

```bash
# Validate a single extension (with GitHub user check)
make validate EXT=port-killer
# or
bun scripts/validate-extension.ts port-killer

# Validate multiple extensions
bun scripts/validate-extension.ts port-killer case-converter

# Skip GitHub API validation (faster for local dev)
bun scripts/validate-extension.ts port-killer --skip-github-check
```

The validator checks:
- **Schema validation**: Uses the Zod schema from `schemas/manifest.ts` to validate all fields
- **GitHub users**: Verifies that author, contributors, and pastContributors are real GitHub users
- **Icon files**: Checks that icon files exist in the `assets/` directory (for extension, commands, and tools)
- **Entry points**: Verifies command and tool entry point files exist in `src/`
- **Directory structure**: Ensures `src/` directory exists

### Utility Scripts

- `scripts/deploy.ts` - Deploy all extensions in a directory
- `scripts/deploy-extension.ts` - Deploy specific extension(s) by name
- `scripts/validate-extension.ts` - Validate extension package.json and structure
- `scripts/zip-utils.ts` - Helper functions for creating zip archives from folders

## CI/CD

The repository uses GitHub Actions for automated testing and deployment:

### PR Checks (`.github/workflows/pr-check.yml`)
- Triggers on pull requests that modify `extensions/`
- Detects which extensions changed
- **Validates** each extension (schema, author, required fields)
- **Builds** only the changed extensions in parallel
- Uploads build artifacts for verification
- Each extension is tested independently (fail-fast disabled)

### Automatic Deployment (`.github/workflows/deploy.yml`)
- Triggers when code is merged to `main` branch
- Detects which extensions changed since the previous commit
- **Validates** each extension before deployment
- **Deploys** only the changed extensions in parallel
- Posts commit comments on success/failure
- Requires GitHub secrets to be configured:
  - `STORE_API_SECRET` (required) - API token for extension store
  - `STORE_BASE_URL` (optional) - Defaults to localhost for testing

Note: Both workflows use `GITHUB_TOKEN` (automatically provided) for GitHub API calls during validation.

### Setting up GitHub Secrets

In your repository settings, add:
```
Settings → Secrets and variables → Actions → New repository secret
```
- Name: `STORE_API_SECRET`
- Value: Your extension store API token

## Extension Examples

### Simple Extension (port-killer)
- Single command that displays a list view
- Uses Node.js child_process to run system commands (`ss -tulnp`)
- Demonstrates: List rendering, ActionPanel, state management with React hooks

### Complex Extension (case-converter)
- Multiple preferences for user configuration
- Cache API for storing pinned/recent items
- Clipboard and selection text integration
- Demonstrates: Preferences, Cache, advanced UI patterns

### System Integration Extension (swww-switcher)
- Integrates with external Linux tools (swww, imagemagick)
- Image processing and display
- Multiple commands (grid view and no-view command)
- Demonstrates: System command execution, image handling, complex preferences

## Bun APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```
