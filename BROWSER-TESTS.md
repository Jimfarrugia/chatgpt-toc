# Navigation and ordering fixes — v1.9.6

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
