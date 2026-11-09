# Nix Search for Vicinae

Search Nixpkgs from Vicinae using the package index behind [search.nixos.org](https://search.nixos.org). Results include package descriptions and available metadata, with quick actions for common Nix commands.

## Features

- Search Nixpkgs packages on unstable or a stable channel
- Inspect version, license, programs, platforms, maintainers, and source location
- Install, run, or open a temporary shell for a package
- Copy common install commands or open the package homepage and web result
- Debounced requests with cancellation when the query changes

## Development

```sh
npm install
npm run dev
```