# Nix Extension

Search and browse Nix packages, options, flakes, and Home-Manager options from the official NixOS repositories.

## Features

### NixOS Packages

- Search Nix packages by name, description, or programs
- View package details including version, platforms, maintainers, and licenses
- Open package homepage
- View source code on GitHub
- Copy package name or description to clipboard

### NixOS Options

- Search NixOS configuration options
- View option details including type, default value, and examples
- View source code for options
- Copy option name, description, or default value to clipboard

### NixOS Flake Packages

- Search packages from Nix flakes
- View flake details including repository, package name, platforms, maintainers, and licenses
- Open repository on GitHub
- Copy flake name, package name, or description to clipboard

### Home-Manager Options

- Search Home-Manager configuration options
- View option details including type, default value, and examples
- View source code for options
- Copy option name, description, or default value to clipboard

### NixOS Packages Pull Requests

- Search NixOS Packages Pull Requests by title or number
- View pull request details including title, author, status, branches, created/updated dates, and description
- Open pull request on GitHub
- Copy pull request number to clipboard

## Usage

The extension provides four separate commands:

- **NixOS Packages**: Search and browse Nix packages
- **NixOS Options**: Search NixOS configuration options
- **NixOS Flake Packages**: Search packages from Nix flakes
- **Home-Manager Options**: Search Home-Manager configuration options
- **NixOS Packages Pull Requests**: Search NixOS Packages Pull Requests

Type in the search bar to find items. Use the action panel to access various actions like opening links, viewing source code, or copying information to clipboard.

## API

This extension uses the official NixOS search API at https://search.nixos.org/ and Home-Manager options data from https://home-manager-options.extranix.com/ and github APIs
