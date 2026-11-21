# Reference: Siri AI in Spotlight (macOS 27 "Golden Gate")

The flow Ask AI copies. Researched 2026-10-17. Each claim links to its source. Tags:
- **[Apple]**: Apple's own pages (Support, Newsroom, developer.apple.com).
- **[Review]**: hands-on press coverage.
- **[Screenshot]**: seen in an official or press screenshot (listed in section 9).
- **[Unverified]**: only one weak source, or inference.

**Context.** macOS 27 shipped on 14 Sep 2026. Siri AI is still labelled **beta** in 27.0. It is English-first and has daily usage limits. It needs an M1 or later Mac, or a MacBook Neo (A18 Pro). Sources: [Apple Support: Spotlight](https://support.apple.com/guide/mac-help/find-what-you-need-with-spotlight-mchlp1008/mac), [Apple Newsroom, Sep 2026](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/), [Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/).

---

## 1. How a typed query becomes a Siri question

| Behaviour | Detail | Source |
|---|---|---|
| One bar for both | Cmd-Space opens one field labelled **"Search or Ask"**, with a mic icon at the right. Siri no longer has its own typing window. | [Apple]: [Spotlight guide](https://support.apple.com/guide/mac-help/find-what-you-need-with-spotlight-mchlp1008/mac). [Review]: [9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), [MacRumors](https://www.macrumors.com/2026/09/17/new-features-changes-macos-27/), [Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/). [Screenshot] 9to5Mac. |
| Return sends it | Apple: "Enter a question or make a request, then press Return." | [Apple]: [Spotlight guide](https://support.apple.com/guide/mac-help/find-what-you-need-with-spotlight-mchlp1008/mac) |
| "Ask Siri" row | Apple: "click Ask Siri in the list of results below the search field." 9to5Mac says Ask Siri is now the **top** result. In macOS 26 it sat near the bottom. | [Apple]: [Take actions in Spotlight](https://support.apple.com/guide/mac-help/take-actions-and-shortcuts-in-spotlight-mchl4953dfeb/mac). [Review]: [9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), [felloai](https://felloai.com/spotlight-ai-mac/) |
| Automatic routing | MacRumors: the bar "parses what you're asking for" and either searches or hands the text to Siri. MacMost: a plain-language request is recognised as an AI prompt when you press Return. AppleInsider (second-hand, via Gadget Hacks): Spotlight sometimes misses that you meant a question. | [Review]: [MacRumors roundup](https://www.macrumors.com/roundup/macos-27/), [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html), [Gadget Hacks](https://apple.gadgethacks.com/news/macos-golden-gate-siri-ai-tested-shortcuts-steal-show/). The misrouting claim is [Unverified]: that page returned 403, so it comes from a search snippet. |
| **What shows while typing** | When the text reads as a question, a faint **"— Ask Siri"** hint appears right after the cursor. A small **"Show Results"** pill sits under the bar, so ordinary results start hidden. Typing an app or file name shows the normal result list instead. | [Screenshot] [Apple Newsroom image](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/). [Review]: [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html) |
| From the Actions list | Cmd-3 shows Actions. One of them is "Ask a question", "Only available when Siri AI is turned on." | [Apple]: [Take actions in Spotlight](https://support.apple.com/guide/mac-help/take-actions-and-shortcuts-in-spotlight-mchl4953dfeb/mac) |
| Voice | The mic button in the bar, the F5 / mic key, or "Hey Siri". | [Review]: [9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), [AppleWorld.Today](https://appleworld.today/2026/09/how-to-summon-ask-siri-in-macos-27-golden-gate/) |
| Other ways in | An "Ask Siri" item tops every right-click menu and opens a small typing box. You can also select several files in Finder and choose Ask Siri. Visual Intelligence (asking about what's on screen): Shift-Cmd-Space picks a window, Shift-Cmd-6 picks an area, then Ask Siri, Image Search, or a suggested action. | [Apple]: [Mac screen guide](https://support.apple.com/guide/mac-help/siri-ai-mac-screen-iphmk4p88mkuky/mac), [Get started](https://support.apple.com/guide/mac-help/get-started-with-siri-ai-mac88e1mkh19/mac). [Review]: [Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/) |
| Up Arrow recall | Up Arrow steps back through past searches. MacMost says it covers past prompts too, and Return runs one again. | [Apple]: [Spotlight shortcuts](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac). [Review]: [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html) |

No source mentions **Cmd-Return** or **Tab** as the key that asks Siri. Tab still limits search to one app ([Apple shortcuts](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac)).

## 2. How the answer is shown

| Behaviour | Detail | Source |
|---|---|---|
| Grows in place | 9to5Mac: "Siri's answers now expand within Spotlight itself." MacStories: it responds "by expanding to accommodate the conversation." MacMost: the window grows to show the response. allthings.how instead describes a separate Siri window, which conflicts with the others. | [Review]: [9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), [MacStories](https://www.macstories.net/news/macos-27-golden-gate-the-macstories-overview/), [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html), [allthings.how](https://allthings.how/siri-ai-in-macos-27-starting-rich-conversations-from-spotlight/) |
| Floating panel | The bar turns into a **tall floating glass panel**. It is dark in dark mode and see-through over the desktop. Close (**X**) is at the **top-left**. **Expand** (⤢, opens the chat in the Siri app) is at the **top-right**. It has a scrollbar. The bottom holds a composer: **"+" (attach), an "Ask Siri" field, and a mic**. | [Screenshot] [Apple Support images](https://support.apple.com/guide/mac-help/get-started-with-siri-ai-mac88e1mkh19/mac), [Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/) |
| Move and resize | MacStories: "You can move your chat with Siri around the screen and resize it, too." Macwelt says it can be resized by hand and looks carried over from the iPhone. | [Review]: [MacStories](https://www.macstories.net/news/macos-27-golden-gate-the-macstories-overview/), [Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html) |
| Message layout | Your question is a **grey bubble on the right**. The answer is **plain text with no bubble**, straight on the panel background. | [Screenshot] Apple Support, Six Colors |
| Text style | A summary paragraph first. Then **section headings**, then **small uppercase sub-headings**. Bullets **start with a bold phrase**, for example "**Mini Sliders** Beef, pulled pork…". This maps cleanly onto markdown. | [Screenshot] [Apple Support "watch party" image](https://ipcdn-web.apple.com/assets/v2/web/de1e040e-5e5f-4f5f-8817-8ba8e0da2a6e), [9to5Mac avocado image](https://9to5mac.com/wp-content/uploads/sites/6/2026/09/Siri-AI-on-macOS-27.jpg) |
| Sources | Each paragraph gets a **small source chip** underneath, showing a site name and a count, for example "londonfromscratch.co.uk +2" or "The Avocado Factory +4". Macwelt saw Wikipedia linked as a source. MacMost says answers include sources. | [Screenshot] Apple Support, 9to5Mac. [Review]: [Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html), [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html) |
| Rich results | **Personal-data rows**: Six Colors shows a Messages row with an avatar, app badge, contact name, date and snippet. MacMost: answers can include text, images, maps and sources. Macwelt: an image result opened in Preview. On iPhone, Apple shows Siri building a plan in Maps. Other apps can supply their own visuals through Apple's developer framework (App Intents): a title, subtitle and image per item, or a fully custom small view. | [Screenshot] Six Colors. [Review]: [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html), [Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html). [Apple]: [WWDC26 session 343](https://developer.apple.com/videos/play/wwdc2026/343/), [Newsroom, June](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/) |
| Quick answers | Maths, weather, flights, sports scores and dictionary lookups work as before. Cmd-D or Cmd-L jumps to the dictionary result. Cmd-B searches the web in Safari. | [Review]: [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html) |
| Word-by-word appearance | **No source documents this.** Macwelt only says Siri "needed a moment" to process. | **[Unverified]** |
| Tables | Not seen in any Mac screenshot or document. | **[Unverified]** |

## 3. Follow-ups, history and closing

- **Follow-ups happen in the same panel**, through the "Ask Siri" field at the bottom.
  - Siri remembers only the current chat. It keeps no memory between chats ([9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/)).
  - Apple: users can "extend almost any response … into a rich conversation" ([Newsroom, Sep](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/)).
- **Siri app** [Apple]. Every chat lands here, including ones started in Spotlight ([MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html)). Features, from [Apple: Use the Siri app](https://support.apple.com/guide/mac-help/q7ny3g54v9lk/mac):
  - A chat list on the left, shown as a grid or a list.
  - A new-chat button.
  - Search, pin, rename, and delete (one chat or several).
  - Attach photos or files.
  - Chats sync through iCloud to iPhone, iPad, Apple Watch and Vision Pro.
- **Settings** [Apple] ([Use the Siri app](https://support.apple.com/guide/mac-help/q7ny3g54v9lk/mac)):
  - "Opens To": Recent Conversations or A New Conversation.
  - "Keep Conversations": a time limit. Choosing 30 days or 1 year deletes older chats for good.
  - "Preview": how long the chat previews are.
- **Auto titles.** Each chat card shows a time and a short title, such as "San Diego Weather Forecast" or "Fall Party Food Ideas". Some cards also show a preview line or an image. [Screenshot] [9to5Mac](https://9to5mac.com/wp-content/uploads/sites/6/2026/09/Siri-AI-on-macOS-27.jpg)
- **Expand.** The top-right button moves the chat into the Siri app ([9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html)).
- **Closing.**
  - The X button sits at the top-left [Screenshot].
  - Cmd-Space opens and closes Spotlight ([Apple shortcuts](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac)).
  - Apple documents Escape only for backing out of an action ([Apple](https://support.apple.com/guide/mac-help/take-actions-and-shortcuts-in-spotlight-mchl4953dfeb/mac)).
  - **No source says how to start a new chat from inside the panel.** Closing it and typing again is a guess. **[Unverified]**

## 4. Actions, personal data, privacy

- **Rating and copying.** Answers have **thumbs up/down** and a **"…" menu that copies all the text** ([MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html)). No source mentions Share or copying one block at a time. **[Unverified]**
- **Doing things in apps.**
  - Siri acts in apps through Apple's App Intents framework and Shortcuts. Examples: drafting email, editing or sharing photos, creating calendar events, adding a song to the library, and turning highlighted text into a reminder. Sources: [Newsroom, June](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/), [9to5Mac](https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/), [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html).
  - Some actions fail. Asked to mark a restaurant in Maps, Siri only opened Maps ([Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html)).
  - Siri asks before running actions with real side effects ([WWDC26 session 343](https://developer.apple.com/videos/play/wwdc2026/343/)).
- **Personal data.**
  - Siri searches Spotlight's index of the Mac: Mail, Messages, Photos, Calendar, Notes and files ([Newsroom, June](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/), [Get started](https://support.apple.com/guide/mac-help/get-started-with-siri-ai-mac88e1mkh19/mac)).
  - It can't see apps that aren't in that index. Gmail used outside Apple Mail is one example.
  - A known weak result: "here are a bunch of PDFs that might work, good luck" ([Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/)).
- **Attachments.** The "+" button attaches photos or files ([Apple: Siri app](https://support.apple.com/guide/mac-help/q7ny3g54v9lk/mac)). allthings.how says you can also drop files onto the Siri window ([allthings.how](https://allthings.how/siri-ai-in-macos-27-starting-rich-conversations-from-spotlight/)).
- **Continuing on iPhone.** This works through the iCloud-synced Siri app history ([Newsroom, Sep](https://www.apple.com/newsroom/2026/09/siri-ai-a-profoundly-more-capable-and-personal-assistant-is-here/)).
- **Privacy.**
  - Requests run on the Mac or on Apple's private servers, called Private Cloud Compute.
  - Apple: data there is "not stored nor made accessible to Apple or anyone else", and outside experts can check this ([Newsroom, June](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/), [apple.com/apple-intelligence](https://www.apple.com/apple-intelligence/)).
  - Apple says the models were built "in collaboration with Google". Reports that they are based on Gemini, at about $1 billion a year, are **[Unverified]** ([tech-insider](https://tech-insider.org/wwdc-2026-siri-ai-gemini-deal/)).
- **Handing off to ChatGPT.**
  - Turn on the ChatGPT extension in System Settings > Siri.
  - Then right-click the Search or Ask field and choose **Ask ▸ Use ChatGPT**. Typing "ask ChatGPT …" also works.
  - After the answer, **the field goes back to Siri** unless you keep asking follow-ups.
  - Context does not carry over when you switch providers.
  - An optional "Confirm Requests" setting asks before each send.
  - Sources: [MacRumors how-to](https://www.macrumors.com/how-to/make-chatgpt-answer-siri-mac/), [MacRumors 50 features](https://www.macrumors.com/2026/09/17/new-features-changes-macos-27/), [Apple ChatGPT guide](https://support.apple.com/guide/mac-help/use-siri-to-get-answers-from-chatgpt-iph0193a9d54/mac).
  - Claude appears in Apple's code but users can't pick it yet. Gemini is not offered ([MacRumors](https://www.macrumors.com/2026/09/14/siri-can-be-swapped-out-for-chatgpt-claude/)).

## 5. Keyboard shortcuts and accessibility

| Key | What it does | Source |
|---|---|---|
| Cmd-Space | Open or close Search or Ask | [Apple](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac) |
| Return | Ask Siri, or open the selected result | [Apple](https://support.apple.com/guide/mac-help/find-what-you-need-with-spotlight-mchlp1008/mac) |
| Up Arrow | Step back through past searches (MacMost: prompts too) | [Apple](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac), [MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html) |
| Cmd-1 / 2 / 3 / 4 | Show only Apps / Files / Actions / Clipboard | [Apple](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac) |
| Tab, / | Search inside one app; filter results | [Apple](https://support.apple.com/guide/mac-help/spotlight-keyboard-shortcuts-mh26783/mac) |
| Esc | Back out of an action | [Apple](https://support.apple.com/guide/mac-help/take-actions-and-shortcuts-in-spotlight-mchl4953dfeb/mac) |
| Shift-Cmd-Space / Shift-Cmd-6 | Ask about a window / a screen area | [Apple](https://support.apple.com/guide/mac-help/siri-ai-mac-screen-iphmk4p88mkuky/mac) |
| Right-click the field | Ask ▸ pick a provider | [MacRumors](https://www.macrumors.com/how-to/make-chatgpt-answer-siri-mac/) |

**Accessibility.**
- You can talk to Siri and hear it answer.
- On Macs with M3 or later and 12 GB of memory, you can pick a voice and set its speed and expressiveness ([Get started](https://support.apple.com/guide/mac-help/get-started-with-siri-ai-mac88e1mkh19/mac)).
- The whole flow works from the keyboard: type, press Return, then type follow-ups in the bottom field.
- No Apple design guideline (HIG) page and no VoiceOver details were found. **[Unverified]**

## 6. When it fails

- **Turned off or not eligible.**
  - With Siri AI off, the bar goes back to plain Spotlight ([MacMost](https://macmost.com/how-to-use-the-combined-spotlight-and-siri-ai-menu-in-macos-golden-gate.html)).
  - Siri AI is not available in China. In the EU it is missing on iPhone, iPad and Watch, but the Mac is fine ([Newsroom](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)).
  - During the beta there was a **waitlist**. Macwelt waited 28 hours ([Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html)).
- **Daily usage limits.**
  - Limits vary by feature and by load, and "Expanded access … will be available for a fee in the future" ([Apple Support](https://support.apple.com/guide/mac-help/find-what-you-need-with-spotlight-mchlp1008/mac)).
  - **The exact message shown when you hit the limit is not documented.** **[Unverified]**
- **Search index not ready.** Siri answers from Spotlight's index, so results are thin while the Mac is still indexing ([Apple Mac Help, search summary](https://support.apple.com/bg-bg/guide/mac-help/mchl4e4b758d/mac)). **[Unverified wording]**
- **Weak answers.**
  - A vague list of files ([Six Colors](https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/)).
  - An out-of-date image ([Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html)).
  - Needing the airport named before it found restaurants near one ([Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html)).
- **Offline and refusal screens.** Not documented. **[Unverified]**

## 7. Numbers

- **Speed.** Apple gives no figure. Macwelt: Siri "needed a moment" ([Macwelt](https://www.macwelt.de/article/3162809/macos-27-golden-gate-macbook-neo.html)).
- **Panel size.** No official size.
  - In Apple's screenshots the panel is taller than it is wide, roughly 3 to 4 units wide per 4 tall. It is narrower than half the screen.
  - The Six Colors capture is 680×971 pixels at double resolution. That is about 340×485 points. **[Screenshot, estimate]**
- **Disk space.** 30.98 GB before the AI models download, 42.92 GB after ([Neoteo](https://www.neoteo.com/en/macos-27-golden-gate-review-ai-costs-storage)). **[Unverified]**

---

## 8. Gap list: what Ask AI in Vicinae could copy

Vicinae gives us a List view, a Detail view (markdown plus a metadata side panel), Forms, an actions menu, toasts (small pop-up notices) and fallback commands. It has no custom HTML. Ranked by impact:

1. **Answer in place.** Return in the main search runs the fallback and opens a Detail view with the markdown answer. This is already the core flow. Keep it the default.
2. **Apple's answer layout.** Ask the model for a summary paragraph, then `##` headings, then bullets that start with a bold phrase (`- **Phrase** rest`). This copies Apple's look and renders natively in Detail.
3. **Sources under each paragraph.** Add a short line of markdown links under each paragraph, like `[domain](url) +2`. Put the full list in the metadata panel as links. This builds trust.
4. **Follow-up input.** Apple keeps an "Ask Siri" field under the answer. In Vicinae, add a "Follow up" action (Cmd-Enter) that opens a Form or reuses the search bar. Keep the whole thread in one Detail view: each question as a `> quote`, each answer below it.
5. **"Ask" hint while typing.** Apple shows "— Ask Siri" after your text. The Vicinae version: put the "Ask AI: <query>" fallback item at the top when the text looks like a question. Triggers could be ending in `?`, or starting with who, what, how or why.
6. **History plus "open elsewhere".** Copy the Siri app with an "Ask AI History" List command. Each thread gets an auto title, a time and a preview, with pin, rename, delete and search. Apple's expand button becomes an action: "Open in History", or "Continue in ChatGPT/Claude on the web".
7. **Actions on the answer.** Copy answer (Cmd-C), copy the last code block, paste into the front app, thumbs up/down (logged locally), and regenerate. Add "Ask with another provider", like Apple's Ask ▸ ChatGPT. Like Apple, switch back to the default provider after one answer.
8. **Recent questions.** With an empty search field, show a "Recent questions" section. This matches Up Arrow recall.
9. **Clear failure messages.** Show a toast or Detail view for offline, no API key, rate or usage limit (for example "daily limit reached, resets at …"), and refusal. Apple leaves these vague, so clear text is a cheap win.
10. **Personal-data rows.** Siri shows Messages and Mail rows. A realistic version: when an answer cites local files, list them with icon, path and date. Only worth it if Ask AI gains local search.
11. **Attachments.** Vicinae Forms have a file picker. "Ask about file…", using a picked file or the clipboard, is doable.
12. **Matching settings.** Extension preferences for "Opens to: recent chat / new chat" and "Keep chats: 30 days / 1 year / forever".

**What Vicinae cannot copy:** the floating, resizable glass panel; faint hint text inside the main search bar; custom cards; maps; voice; and selecting part of the screen (that would need a separate screenshot tool).

---

## 9. Reference images

All of these loaded (HTTP 200) on 2026-10-17.

1. **Apple Newsroom: Spotlight bar with the faint "— Ask Siri" hint and the "Show Results" pill**
   Image: https://www.apple.com/newsroom/images/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/article/Apple-Siri-AI-Spotlight-integration-260608_big.jpg.large.jpg
   Source page: https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/
2. **Apple Support: answer panel ("watch party" menu) with X, expand, a source chip, headings, bold bullets and the bottom input**
   Image: https://ipcdn-web.apple.com/assets/v2/web/de1e040e-5e5f-4f5f-8817-8ba8e0da2a6e
   Source page: https://support.apple.com/guide/mac-help/get-started-with-siri-ai-mac88e1mkh19/mac
3. **Apple Support: answer panel floating over Preview (superhydrophobicity question)**
   Image: https://ipcdn-web.apple.com/assets/v2/web/4facdf05-a15d-4014-b389-783769ed4976
   Source page: https://support.apple.com/guide/mac-help/get-started-with-siri-ai-mac88e1mkh19/mac
4. **9to5Mac: empty "Search or Ask" bar** (press, not Apple)
   Image: https://9to5mac.com/wp-content/uploads/sites/6/2026/09/Search-of-Ask-Siri-AI-Beta-macOS-27.jpg
   Source page: https://9to5mac.com/2026/09/17/macos-27-golden-gate-siri-ai-top-features-apples-assistant-finally-comes-to-life-video/

Extra images:
- **Six Colors:** a personal-data answer with a Messages row. https://i0.wp.com/sixcolors.com/wp-content/uploads/2026/09/gg-ask-siri-6c-1.jpg?ssl=1 (page: https://sixcolors.com/post/2026/09/macos-27-golden-gate-review-bridging-the-tahoe-gap/)
- **9to5Mac:** the Siri app with a grid of chat cards and an answer with sources. https://9to5mac.com/wp-content/uploads/sites/6/2026/09/Siri-AI-on-macOS-27.jpg (same 9to5Mac page)
- **MacStories:** Siri in Spotlight, credited to Apple. https://cdn.macstories.net/images/uploads/2026/06/08/shortcut-upload-1780959955538-d10026f6bc.png (page: https://www.macstories.net/news/macos-27-golden-gate-the-macstories-overview/). Loads; not viewed.

## 10. Still open (no source found)

- Does the answer appear word by word as it is generated?
- What does Escape do inside a Siri chat?
- How do you start a new chat from inside the Spotlight panel?
- What exactly do the usage-limit, offline and refusal messages say?
- Can answers contain tables or code blocks?
- Is there an Apple design guideline (HIG) page for Siri AI?
- Not reviewed: AppleInsider's review, Gadget Hacks, futurezone.at and The Mac Observer how-to (all HTTP 403). No review from The Verge or Ars Technica turned up in searches.
- Not watched: the MacRumors hands-on video at https://www.youtube.com/watch?v=DtjbdKI_goY.
