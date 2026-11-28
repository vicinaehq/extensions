# AI Web Search for Vicinae (Omarchy Edition)

A Spotlight / Siri-style AI web search extension for [Vicinae](https://vicinae.com/) tailored to [Omarchy Linux](https://omarchy.org/). It retrieves live web results and images via [Tavily](https://tavily.com/), synthesizes cited Markdown answers inline inside Vicinae using either Vicinae's configured AI (`AI.ask`, including Antigravity/Claude/Codex/Ollama/Groq) or a direct Groq API key, supports multi-turn follow-up conversations, and persists chat history locally.

---

## Features

- **Zero-click instant answers:** Opens directly into a full-width `<Detail>` panel when launched from Vicinae's root fallback, streaming the drafted answer with inline `[1]`, `[2]` citations.
- **Metadata rail:** Shows live status (`Searching` / `Thinking` / `Ready`), turn count, image count, and clickable `[1]..[N]` source domain links.
- **Follow-up conversations:** Context-aware follow-up queries that carry prior Q&A turns to the LLM and expand short/pronoun follow-ups for Tavily search.
- **Images & sources on demand:** Up to 2 clean thumbnails below the answer, a 3-column `<Grid>` image gallery (`Ctrl + I`), and a searchable source snippets list (`Ctrl + S`).
- **Persistent chat history:** Saves conversations atomically to `chats.json` inside Vicinae's extension support directory (`environment.supportPath`, capped at 50 threads).
- **Performance:** Batches streaming tokens every 50 ms to avoid excessive IPC/UI re-renders and writes history atomically via temp file + rename.

---

## Commands & Keyboard Shortcuts

### Commands
- **`AI Web Search` (`ask`)** — Main command (recommended as Vicinae's primary root fallback). Opens the active answer view when passed fallback text, or shows the prompt bar + recent chats when opened directly.
- **`AI Search History` (`history`)** — Browse, filter, preview, resume, or delete saved conversations.

### Shortcuts inside `AI Web Search`
| Shortcut | Action |
| :--- | :--- |
| `Enter` | Ask a follow-up question |
| `Ctrl + I` | Open 3-column image gallery (`ImagesGallery`) |
| `Ctrl + S` | Open full source snippets (`SourcesList`) |
| `Ctrl + H` | Open saved chat history (`ChatHistoryView`) |
| `Ctrl + R` | Regenerate the current answer |
| `Ctrl + N` | Start a new search thread |
| `Ctrl + C` | Copy the latest answer |

### Shortcuts in Chat History
| Shortcut | Action |
| :--- | :--- |
| `Enter` | Resume selected chat |
| `Ctrl + X` | Delete selected chat (with confirmation) |
| `Ctrl + Shift + X` | Clear all chat history (with confirmation) |

---

## Installation & Configuration

### 1. Build and install the extension

Requirements: Node.js (>= 20) and Vicinae (`vicinae-bin`).

```bash
npm install
npm run lint
npm run build
```

`vici build` compiles the TypeScript extension and installs the production bundle directly into `~/.local/share/vicinae/extensions/ai-web-search`. If Vicinae is already running, restart it to register newly added commands:

```bash
systemctl --user restart vicinae.service
```

### 2. Configure API keys & AI model

Open Vicinae Settings (`Ctrl + ,`) → **Extensions** → **AI Web Search**:

- **Tavily API Key** *(required)*: Your `tvly-...` key for web search and images.
- **Groq API Key** *(optional)*: Your `gsk_...` key. When set, the extension streams directly from Groq (`https://api.groq.com/openai/v1/chat/completions`) using **Groq Model** (defaults to `llama-3.3-70b-versatile`).
- **Using Vicinae AI (`AI.ask`) instead:** Leave **Groq API Key** blank and configure a provider (e.g. **Antigravity**, **Groq**, **OpenAI**, or **Ollama**) in Vicinae Settings → **AI**.
- **Search Depth / Max Sources / Include Images:** Optional dropdowns and checkbox controlling Tavily search depth (`basic` / `advanced`), result count (`3` / `5` / `8`), and image fetching.

### 3. Set as root fallback

In `~/.config/vicinae/settings.json`, add `@deecube/ai-web-search:ask` to `"fallbacks"` (or configure it in Vicinae via **Manage Fallback Commands**):

```json
{
  "fallbacks": [
    "@deecube/ai-web-search:ask",
    "files:search"
  ]
}
```

---

## Omarchy OS Integration (Optional)

To match Omarchy's window chrome, keybindings, and dynamic theme switching:

1. **Hyprland keybindings** (`~/.config/hypr/bindings.lua`):
   ```lua
   o.rebind("SUPER + SPACE", "Vicinae", "vicinae toggle")
   o.rebind("SUPER + ALT + SPACE", "Omarchy menu", { menu = "root" })
   ```
   Validate with `hyprctl reload && hyprctl configerrors`.

2. **Vicinae UI alignment** (`~/.config/vicinae/settings.json`):
   ```json
   {
     "theme": {
       "light": { "name": "omarchy", "icon_theme": "auto" },
       "dark": { "name": "omarchy", "icon_theme": "auto" }
     },
     "font": {
       "normal": { "family": "JetBrainsMono Nerd Font" }
     },
     "launcher_window": {
       "opacity": 0.95,
       "material": "none",
       "blur": { "enabled": false },
       "rounding": 0,
       "client_side_decorations": {
         "enabled": true,
         "border_width": 2,
         "shadow_size": 0
       }
     }
   }
   ```

3. **Dynamic theme sync:** Place `vicinae.toml.tpl` in `~/.config/omarchy/themed/` and install a `theme-set` hook (`omarchy hook install theme-set <script>`) that copies `~/.local/state/omarchy/current/theme/vicinae.toml` to `~/.local/share/vicinae/themes/omarchy.toml` and runs `vicinae theme set omarchy`.

---

## Project Architecture

```text
src/
├── types.ts        # Shared TypeScript interfaces (ChatThread, ConversationTurn, Preferences)
├── storage.ts      # Atomic JSON chat persistence in environment.supportPath (chats.json)
├── api.ts          # Tavily search client, follow-up query rewriter, Groq/AI.ask streaming + 50ms batching
├── use-chat.ts     # React state/controller hook managing turns, aborts, and persistence
├── components.tsx  # Shared Detail, PromptInput, ImagesGallery, SourcesList, and History components
├── ask.tsx         # Entrypoint for `AI Web Search`
└── history.tsx     # Entrypoint for `AI Search History`
```

### Development Checks

```bash
npm run lint          # Validate package.json manifest with vici lint
npx tsc --noEmit      # Run strict TypeScript typecheck
npm run build         # Bundle and install to ~/.local/share/vicinae/extensions/ai-web-search
```
