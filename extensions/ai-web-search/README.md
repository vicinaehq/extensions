# AI Web Search for Vicinae

A Spotlight / Siri-style AI web search and on-screen context extension for [Vicinae](https://vicinae.com/). Retrieves live web results and images via [Tavily](https://tavily.com/), synthesizes cited Markdown answers inline inside Vicinae using Vicinae AI (`AI.ask`) or a direct Groq API key, supports multi-turn follow-up conversations, and persists chat history locally.

---

## Features

- **Zero-click instant answers (`AI Web Search`):** Opens directly into a full-width `<Detail>` panel when launched from Vicinae's root fallback, streaming the drafted answer with inline `[1]`, `[2]` citations and a clickable source metadata rail.
- **Follow-up conversations:** Context-aware follow-up queries that carry prior Q&A turns to the LLM and expand short/pronoun follow-ups for Tavily search.
- **Images & sources on demand:** Clean thumbnails below the answer, a 3-column `<Grid>` image gallery (`Ctrl + I`), and a searchable source snippets list (`Ctrl + S`).
- **Persistent chat history (`AI Search History`):** Saves conversations atomically to `chats.json` inside `environment.supportPath` (`0700`/`0600` permissions, capped at 50 threads).
- **On-demand screen context (`Ask Screen`):** Captures active window context and selection/OCR (via `omafind context` on Omarchy Linux, or clipboard fallback elsewhere) with sensitive-window blocking and secret redaction.

---

## Commands & Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Enter` | Ask a follow-up question |
| `Ctrl + I` | Open 3-column image gallery |
| `Ctrl + S` | Open full source snippets |
| `Ctrl + H` | Open saved chat history |
| `Ctrl + R` | Regenerate current answer |
| `Ctrl + N` | Start a new search thread |
| `Ctrl + C` | Copy the latest answer |

---

## Configuration

Open Vicinae Settings (`Ctrl + ,`) → **Extensions** → **AI Web Search**:

- **Tavily API Key** *(required)*: Your `tvly-...` key for web search and images.
- **Groq API Key** *(optional)*: Your `gsk_...` key. Leave blank to use whichever model you configured in Vicinae Settings → **AI**.
- **Groq Model**: Defaults to `llama-3.3-70b-versatile`.
- **Search Depth / Max Sources / Include Images**: Control Tavily search depth, source count, and image fetching.

---

## Development

```bash
npm install
npm run lint
npx tsc --noEmit
npm run build
```
