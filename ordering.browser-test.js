// Run with test-helpers.js pasted first, in a long ChatGPT conversation with
// the current userscript injected.
// Uses only rendered DOM and scrolling; returns a report or throws on failure.
//
// Ground truth is built by scanning the conversation top to bottom and
// recording each message in the order it first appears in the DOM. ChatGPT's
// own fallback-turn indices are page-local and must not be used for ordering.
(async () => {
  const panel = document.querySelector('#cg-toc-fixed');
  const root = testRoot();
  const scroller = testScroller();
  function cachedKeys() {
    return [...panel.querySelectorAll('.cg-user,.cg-ai')].map(el => el.dataset.messageKey);
  }
  function edges() {
    const extent = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    return getComputedStyle(scroller).flexDirection === 'column-reverse'
      ? { top: -extent, bottom: 0 } : { top: 0, bottom: extent };
  }
  // Walk top -> bottom, keeping the first occurrence of each message ID.
  async function domOrder() {
    const seen = new Set();
    const order = [];
    const grab = () => {
      for (const el of root.querySelectorAll('[data-chatgpt-search-unit-key]')) {
        const id = el.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/)[0];
        const key = el.getAttribute('data-chatgpt-search-unit-key');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        order.push(`${id}:${key.endsWith(':user') ? 'user' : 'assistant'}`);
      }
    };
    scroller.scrollTo({ top: edges().top, behavior: 'instant' });
    await pause(900);
    grab();
    for (let step = 0; step < 900; step++) {
      const before = scroller.scrollTop;
      scroller.scrollBy({ top: scroller.clientHeight * 0.5, behavior: 'instant' });
      grab();
      await pause(55);
      if (Math.abs(scroller.scrollTop - before) < 1) break;
    }
    await pause(600);
    grab();
    return order;
  }
  function compare() {
    const cached = cachedKeys();
    const dom = domOrderSeen.filter(key => cached.includes(key));
    check(JSON.stringify(cached) === JSON.stringify(dom),
      `Panel order differs from DOM order at index ${cached.findIndex((k, i) => k !== dom[i])}`);
    check(new Set(cached).size === cached.length, 'Duplicate messages');
    check(cached.every(key => domOrderSeen.includes(key)), 'A cached message was never seen in the DOM');
    return cached;
  }
  let domOrderSeen = [];
  check(panel && scroller, 'Open ChatGPT and inject the script first');
  const top = panel.querySelector('[aria-label="Load older messages and go to beginning"]');
  check(top, 'Wait for any previous Top operation to finish');
  // Top is best-effort; a second pass picks up history a stalled load missed.
  for (let attempt = 0; attempt < 2; attempt++) {
    top.click();
    await waitFor(() => top.textContent === '↑', 'Top timed out', 95000);
  }
  await pause(500);
  domOrderSeen = await domOrder();
  const afterTop = compare().length;
  for (let round = 0; round < 2; round++) {
    // Re-derive ground truth after scrolling, then re-check cached order.
    domOrderSeen = await domOrder();
    compare();
    panel.querySelector('[aria-label="Jump to newest message"]').click();
    await pause(900);
    check(Math.abs(scroller.scrollTop - edges().bottom) < 2, 'Bottom was not reached');
  }
  check(panel.querySelectorAll('.cg-list hr').length === panel.querySelectorAll('.cg-ai').length,
    'Response dividers changed');
  return { afterTop, messages: cachedKeys().length, domOrder: domOrderSeen.length, matched: true, bottom: true };
})();
