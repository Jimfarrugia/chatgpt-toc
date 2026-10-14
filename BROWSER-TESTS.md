# Navigation and ordering fixes — v1.9.6

## Installation and regression check

Replace the existing Violentmonkey script with `chatgpt-toc.js`.
With a long ChatGPT conversation open and the script running, execute
`navigation.browser-test.js` in that tab's DevTools console. Its promise returns
a report or rejects on failure. It changes scrolling and panel visibility only.
The test requires sufficiently distant first/latest messages to be unmounted.

For conversation switching, execute `conversation-switch.browser-test.js`, then
call `await testConversationSwitch('/c/ANOTHER_EXISTING_CHAT_ID')` with a chat
available in the sidebar. It switches via ChatGPT's sidebar links, tests cache
isolation and navigation, and returns to the starting conversation without reload.

For ordering, run `ordering.browser-test.js` in a long conversation. It loads
older history with Top, builds ground truth by scanning the conversation top to
bottom and recording each message's first DOM appearance, then compares the
panel order with that. ChatGPT's own fallback-turn indices are page-local and
are not used as a reference. It does not assume every conversation alternates
user and assistant messages.

## Long-conversation ordering — v1.9.6

Reproduced in the supplied “Workflow complexity review” chat. The failing
versions sorted by a per-page turn index with a role tie-breaker: when two turns
carried the same index, every prompt was placed before every response, producing
the reported runs of prompts followed by runs of responses. v1.9.5 replaced the
index with a shared turn key, but its comparator still consulted role-derived
unit order and was not a valid total order, so `Array.sort` could still return a
batched result depending on cache insertion order.

v1.9.6 gives each message exactly one numeric key: its measured distance from the
end of the conversation. That value only depends on the content below a message,
so it is unaffected by older history being prepended, and it never consults role
or turn identity. Empty placeholder shells are skipped rather than cached with a
fabricated position.

Actual OpenCode Desktop browser results on 2026-10-14:

- Two independent fresh loads, each followed by Top and a full top-to-bottom DOM
  scan: all 58 discovered messages matched the native DOM order exactly, and the
  role sequence alternated throughout.
- The bundled `ordering.browser-test.js` passed with `afterTop: 58`,
  `messages: 58`, `domOrder: 58`, `matched: true`.
- Navigation regression: 58/58 message jumps, including 52 unloaded targets;
  12 repeated early/latest jumps; nine Bottom checks; headings, H toggle,
  heading jump, collapse/reopen, and cache ordering passed.
- Four conversation switches passed without reload, including message clicks,
  Bottom, cache isolation, and cancellation of navigation from the old chat.
- Styling, normal prompt font weight, hidden-by-default headings, and dividers
  after responses were preserved. JavaScript syntax checks passed.

The earlier v1.9.5 entry below is kept for history; its ordering approach was
superseded by v1.9.6 for the reason above.

## Long-conversation ordering — v1.9.5 (superseded)

Reproduced on 2026-10-14 in the supplied “Workflow complexity review” chat.
After Top, v1.9.4 had 50 cached entries, including repeated runs of five prompts
followed by five responses.

The cached turn numbers came from different loaded pages. Older history can
mount without any overlap with the previous window, so the old shared-index
shift was not applied. Different turns then had identical cached indices, and
the role tie-breaker placed all their prompts before all their responses.

The update removes that inferred renumbering. It groups units by the stable
DOM `data-turn-key`, orders groups by their measured distance from the scrollable
end (which survives prepending), and uses each unit's local index within its
group. The existing absolute-position hints remain for message navigation.

Actual OpenCode Desktop browser results:

- Fresh load and Top: all 50 initially discovered entries remained paired.
- Full DOM-order check: 58 discovered messages matched the native chronological
  sequence through three complete down/up/down sweeps.
- Navigation regression: 58/58 message jumps, including 52 unloaded targets;
  12 repeated early/latest jumps; nine Bottom checks; headings, H toggle,
  collapse/reopen, and cache ordering passed.
- Four conversation switches passed without reload, including message clicks,
  Bottom, cache isolation, and cancellation of navigation from the old chat.
- Styling, normal prompt font weight, hidden-by-default headings, and dividers
  after responses were preserved. JavaScript syntax checks passed.

This conversation uses normal positive scroll offsets, with approximately
123,136 px of content. Verification remains in Desktop's Chromium browser;
no Firefox/Violentmonkey verification is claimed.

## Conversation switching — v1.9.2

Reproduced the v1.9.1 failure: after switching conversations, ChatGPT retained
the previous `<main>` and scroll container with zero rendered height. The first
global selectors still selected that hidden conversation. All 11 panel entries
belonged to it, while the visible conversation contained six different messages.
Clearing the cache on URL changes simply rediscovered the hidden old messages.

All discovery, shell lookup, and scrolling now use the visible conversation's
`<main>`. Cache reset and cancellation share that root identity and pathname.
Top, message seeking, and Bottom stop when either changes, so old asynchronous
work cannot scroll the newly opened conversation. The URL polling fallback no
longer independently clears a cache already rebuilt for the new conversation.

Actual OpenCode Desktop browser checks on 2026-10-13:

- Eight SPA switches between two existing conversations passed without reload
  or userscript reinjection. One run began with all 44 messages cached.
- No hidden-conversation message IDs leaked into the active panel.
- Message navigation and Bottom passed after every switch, including switching
  while Top or a message jump was running. The same panel survived throughout.
- Long-conversation regression passed again: 44-message sweep (37 unloaded
  targets), 12 repeated bidirectional jumps, nine Bottom checks, heading
  navigation, Top, cache ordering, and panel collapse/reopen.
- Source and both browser checks passed JavaScript syntax validation.

These checks still use OpenCode Desktop's Chromium browser, not Firefox.

## Root causes

- ChatGPT removes entire older turns. This layout does not retain the
  `conversation-turn-*` shells assumed by the old seeker. The fallback seeker
  only understood those numbered keys, so `fallback-turn-*` targets never moved
  the conversation. Their numbers also change when older history is prepended.
- The generic `group/scroll-to-bottom` selector matched a hidden **code block**
  button first. Clicking the actual conversation button worked.
- The earlier tested layout used `main .thread-scroll-container` with `column-reverse`:
  bottom is `scrollTop = 0`, and older positions are negative. Nested code panes
  are separate scrollers. A last mounted message is not necessarily the endpoint.
- Partially unloaded assistant units sometimes retain only the screen-reader
  heading “ChatGPT said:”. That text must not replace a cached message preview.

The update uses DOM-exposed message IDs, adjusts cached ordering when history
indices shift, tries cached coordinates, and falls back to a viewport-sized
upward sweep. Ordinary programmatic scrolling remounted messages; no trusted
wheel event was necessary. Bottom navigation targets the conversation scroller
directly and reapplies the endpoint after virtualization settles.

## Original navigation browser results — v1.9.1

Tested on 2026-10-13 in OpenCode Desktop 2.0.18, Electron 44.4.5 / Chromium 152.
The conversation had 44 discovered messages and approximately 36,389 px of
scrollable content in a 911 px viewport.

| Check | Result |
| --- | --- |
| Original cached early-message click from bottom | Failed: still unloaded, `scrollTop = 0` after 13 seconds |
| Original ↓ from near beginning | Failed: conversation offset unchanged |
| Repeated unloaded early/latest user and assistant jumps | 12/12 passed; targets aligned at 65 px |
| Alternating first/last sweep through every discovered message | 44/44 passed; 37 targets unloaded before click |
| Conversation bottom | 9/9 checks passed at `scrollTop = 0` |
| Scrolling fallback with cached-position shortcut disabled | Passed in approximately 10.8 seconds, then returned to bottom |
| Heading navigation | Passed, heading aligned at 65 px |
| ↑ Top, caching, chronological ordering | Passed during repeated navigation |
| Collapse/reopen, black panel, 290 px width | Passed |
| Docked app width | 1006 px open, 1296 px collapsed, 1006 px reopened |
| JavaScript syntax checks | Passed |

No conversation APIs, authentication tokens, dependencies, or account changes
were used. Firefox Playwright could not authenticate through Google, so these
are **not Firefox/Violentmonkey test results**. That verification remains needed.

The fallback is linear in conversation height and stops after 90 seconds, or
after reaching the oldest loaded boundary and waiting 4.5 seconds for older
history. It reports failure through an accessible status rather than claiming
success. Extremely long chats, slow history loading, removed branches, or a
future ChatGPT DOM change can require another attempt; this is not an unlimited
random-access API. Another navigation click or manual scrolling cancels a seek.
