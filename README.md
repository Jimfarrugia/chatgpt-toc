# ChatGPT Conversation TOC

A userscript that adds a docked table of contents to ChatGPT conversations for
quickly navigating and seeking between messages, including in very long chats
where ChatGPT virtualizes the message list.

## Installation

### Firefox (Violentmonkey)

1. Install the [Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/)
   add-on.
2. Open `chatgpt-toc.js` (or its raw URL in the repository) — Violentmonkey
   detects userscripts automatically and offers to install it.
   Alternatively, click the Violentmonkey icon → **+** → **New**, paste the
   contents of `chatgpt-toc.js`, and save.
3. Open or reload a conversation on [chatgpt.com](https://chatgpt.com/). The
   TOC panel appears docked on the right.

### Chrome (Tampermonkey)

Same steps, using the equivalent
[Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
extension: **Create a new script**, paste `chatgpt-toc.js`, save, then reload
ChatGPT.

> **Note:** the script has only been properly tested with Firefox. There may be
> unaddressed issues in Chrome and other Chromium-based browsers.

## Contributing

Contributions are welcome. Feel free to open a pull request, or report any
problems with the script by creating a GitHub issue.
