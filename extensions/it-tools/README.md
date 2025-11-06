# IT Tools

> Access 375+ developer and IT tools directly from Vicinae

Browse and quickly open a comprehensive collection of IT tools including encoders, decoders, converters, formatters, generators, and utilities for everyday development tasks.

This tool is built on top of https://github.com/sharevb/it-tools, which is a fork of the original [IT-Tools repo](https://github.com/CorentinTh/it-tools).

## Features

- **375+ Tools**: Access a vast collection of developer utilities
- **Quick Search**: Find tools instantly with keyword-based search
- **Flexible Configuration**: Use the public IT-tools.tech or your own self-hosted instance
- **One-Click Access**: Open any tool directly in your browser
- **Copy URLs**: Quickly copy tool URLs to your clipboard

## Tool Categories

This extension provides access to tools in various categories:

- **Converters**: Base64, Hex, Binary, Unicode, and more
- **Encoders/Decoders**: URL, HTML, JWT, QR Code, and others
- **Generators**: UUID, Hash, Password, Lorem Ipsum, and more
- **Formatters**: JSON, XML, SQL, CSS, and others
- **Text Tools**: Case converter, diff checker, regex tester, and more
- **Network Tools**: IP analyzer, CIDR calculator, DNS lookup, and more
- **Crypto**: Hash generators, encryption/decryption tools
- **Math**: Base converter, number converter, calculator
- **Date & Time**: Unix timestamp, date converter, timezone tools
- **And many more...**

## Usage

1. Open Vicinae
2. Type "IT Tools" to find the command
3. Press `Enter` to open the tools list
4. Search for the tool you need
5. Press `Enter` to open the tool in your browser
6. Or press `Cmd/Ctrl + C` to copy the tool URL

## Configuration

### Base URL

By default, this extension uses the public IT-tools instance at `https://it-tools.tech`. You can configure a custom base URL in the extension preferences if you're running your own IT-tools instance.

## Development & Contribution

Follow the [Vicinae extensions guidelines](https://github.com/vicinaehq/extensions).

## Updating Tools List

The tools list is maintained in `src/tools-data.json`. To update it with the latest tools from IT-Tools:

1. Visit the IT-Tools homepage
2. Open browser console
3. Run the extraction script (see below) in your console.
4. Update `src/tools-data.json` with the results

```js
(() => {
  const items = [...document.querySelectorAll(".grid-wrapper > .grid > a")].map(a => {
    const nameEl = a.querySelector(".text-lg") || a.querySelector("[class*='text-lg']");
    const descEl = a.querySelector(".line-clamp-2") || a.querySelector("[class*='line-clamp']");
    const svgEl = a.querySelector("svg");

    const name = nameEl?.textContent?.trim() ?? "";
    const description = descEl?.textContent?.trim() ?? "";
    const path = new URL(a.getAttribute("href") || a.href, location.origin).pathname.replace(/^\/|\/$/g, "");
    const icon = (svgEl && `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgEl.outerHTML.trim())}`) || "";

    return { name, path, description, icon };
  });

  return items;
})();
```
