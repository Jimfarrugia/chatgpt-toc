# Navigation and ordering fixes — v1.9.7

## Installation and regression check

Replace the existing Violentmonkey script with `chatgpt-toc.js`.
With a long ChatGPT conversation open and the script running, paste
`test-helpers.js` into that tab's DevTools console once, then execute
`navigation.browser-test.js` in the same console. Its promise returns
a report or rejects on failure. It changes scrolling and panel visibility only.
The test requires sufficiently distant first/latest messages to be unmounted.

For conversation switching, execute `conversation-switch.browser-test.js` (the
helpers stay loaded in the same console), then
call `await testConversationSwitch('/c/ANOTHER_EXISTING_CHAT_ID')` with a chat
available in the sidebar. It switches via ChatGPT's sidebar links, tests cache
isolation and navigation, and returns to the starting conversation without reload.

For ordering, run `ordering.browser-test.js` in a long conversation. It loads
older history with Top, builds ground truth by scanning the conversation top to
bottom and recording each message's first DOM appearance, then compares the
panel order with that. ChatGPT's own fallback-turn indices are page-local and
are not used as a reference. It does not assume every conversation alternates
user and assistant messages. Top is best-effort and can stop before the first
message; the test clicks it twice and retries are safe when a run still fails.

## Long-conversation ordering — v1.9.7

v1.9.6 ordered messages by measured distance from the end of the conversation.
That value drifts as virtualization replaces estimated heights with measured
ones, so cached values taken at different times are not comparable: on the
“ChatGPT Minimap Alternatives” conversation, a full top-to-bottom scan left
turn 9's pair sorted before turn 8's.

v1.9.7 orders by observed DOM adjacency instead. Turns mounted together appear
in chronological DOM order, which does not depend on heights or on prepended
history. Each rebuild records the adjacency of the turns it can see; the panel
order is the topological order of those observations, and measured distances
from the end only interleave clusters that were never mounted together. The
adjacency map is cleared with the label cache on conversation switches.

Actual OpenCode Desktop browser results on 2026-10-14 (Electron 44.4.5 /
Chromium 152):

- Ordering: the “ChatGPT Minimap Alternatives” conversation (44 messages)
  passed `ordering.browser-test.js` twice in a row (`afterTop: 44`,
  `messages: 44`, `domOrder: 44`), including a full top-to-bottom scan between
  runs.
- Navigation: passed on the settled conversation (12 repeated early/latest
  jumps; 19 fold targets, all unloaded before the click; nine Bottom checks;
  headings, H toggle, collapse/reopen, and panel checks). After the ordering
  change, a seek smoke re-verified the first prompt, first response, middle
  message, and latest message at 65 px alignment, and Bottom within 2 px.
- Conversation switching: four SPA switches passed without reload, with cache
  isolation, Bottom, and message navigation after each.
- JavaScript syntax checks passed.

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

The current code uses DOM-exposed message IDs, tries cached coordinates, and
falls back to a viewport-sized upward sweep. Ordinary programmatic scrolling
remounted messages; no trusted wheel event was necessary. Bottom navigation
targets the conversation scroller directly and reapplies the endpoint after
virtualization settles.

## Caveats

- Verified in OpenCode Desktop's Chromium browser only; Firefox Playwright
  could not authenticate through Google, so Firefox/Violentmonkey verification
  remains needed.
- No conversation APIs, authentication tokens, dependencies, or account changes
  are used.
- The seek fallback is linear in conversation height and stops after 90 seconds,
  or after reaching the oldest loaded boundary and waiting 4.5 seconds for older
  history. It reports failure through an accessible status rather than claiming
  success. Extremely long chats, slow history loading, removed branches, or a
  future ChatGPT DOM change can require another attempt; this is not an
  unlimited random-access API. Another navigation click or manual scrolling
  cancels a seek.
