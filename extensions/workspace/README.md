<p align="center">
  <img src="./.github/assets/icon.png" width="200" height="200" />
</p>

# Workspace

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

Search, pin, and open projects from every folder you work in.

Workspace is a [Vicinae](https://vicinae.com) extension. Add workspace folders and it lists every project inside, with git status, per-workspace opening app, and a JSON backup of your setup.

## Screenshots

![Pinned and recent projects with git status](./.github/assets/screenshot-1.png)

[See more screenshots](./.github/assets/)

## Features

- Search projects
- Pin projects and keep recent ones at the top
- Git branch, dirty files, and ahead/behind
- Import and export settings as JSON

## Getting started

1. Run **Manage Workspaces** and add the folders that contain your projects.
2. Set a default app (and a terminal, if you want) in **Workspace Settings**.
3. Open **Workspace**, search, and hit enter.

Pin the `Workspace` command in Vicinae if you want the fastest loop.

## Commands

- **Workspace** – Search and open projects
- **Manage Workspaces** – Add, remove, and reorder workspace folders
- **Workspace Settings** – Apps, git status, backup, and reset

## Installation

Install and start [Vicinae](https://docs.vicinae.com/), then:

```bash
git clone https://github.com/tiagem/workspace-vicinae.git
cd workspace-vicinae
npm install
npm run build
```

Use `npm run dev` while Vicinae is running if you are working on the extension.

See the [Vicinae extension docs](https://docs.vicinae.com/extensions/create) for more detail.
