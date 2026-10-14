// In ChatGPT's console: await testConversationSwitch('/c/ANOTHER_EXISTING_CHAT_ID')
// Uses sidebar links (SPA navigation), never reloads or changes chat content.
async function testConversationSwitch(otherPath) {
  const originalPath = location.pathname;
  const panel = document.querySelector('#cg-toc-fixed');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const root = () => [...document.querySelectorAll('main')].find(el => el.getBoundingClientRect().height > 0);
  const scroller = () => root()?.querySelector('.thread-scroll-container');
  function check(condition, message) {
    if (!condition) throw new Error(message);
  }
  async function waitFor(condition, message) {
    const deadline = Date.now() + 15000;
    while (!condition() && Date.now() < deadline) await pause(100);
    check(condition(), message);
  }
  function keys(scope) {
    return [...scope.querySelectorAll('[data-chatgpt-search-message-ids]')].map(el =>
      el.getAttribute('data-chatgpt-search-message-ids').trim().split(/\s+/)[0]);
  }
  function navigate(path) {
    const link = [...document.querySelectorAll('a[href]')].find(el => el.getAttribute('href') === path);
    if (link) link.click();
    else if (path === originalPath) history.back(); // Return from our own sidebar navigation.
    else throw new Error('Conversation must be available in the sidebar');
  }
  const show = [...document.querySelectorAll('button[aria-label="Show sidebar"]')]
    .find(el => el.getBoundingClientRect().height === 36);
  check(panel && originalPath !== otherPath, 'Open the script and choose a different existing conversation');
  if (show) { show.click(); await pause(350); }
  let switches = 0;
  try {
    for (const path of [otherPath, originalPath, otherPath, originalPath]) {
      // Exercise cancellation of both Top and message navigation across routes.
      const item = panel.querySelector('.cg-user');
      if (switches % 2 && item) item.click();
      else panel.querySelector('[aria-label="Load older messages and go to beginning"]').click();
      const previous = root();
      navigate(path);
      await waitFor(() => location.pathname === path && root() !== previous && scroller()?.clientHeight > 0, 'Conversation did not switch');
      await waitFor(() => panel.querySelector('[aria-label="Load older messages and go to beginning"]') && panel.querySelector('.cg-user'), 'Panel did not recover');
      await pause(1800);
      const visible = root();
      const mounted = new Set(keys(visible));
      const hidden = [...document.querySelectorAll('main')].filter(el => el !== visible).flatMap(keys);
      const cached = [...panel.querySelectorAll('.cg-user,.cg-ai')].map(el => el.dataset.messageKey.split(':')[0]);
      check(cached.length && cached.some(key => mounted.has(key)), 'Panel ignored active conversation');
      check(!cached.some(key => hidden.includes(key) && !mounted.has(key)), 'Hidden conversation leaked into cache');
      const thread = scroller();
      thread.scrollBy({ top: -thread.clientHeight, behavior: 'instant' });
      panel.querySelector('[aria-label="Jump to newest message"]').click();
      await pause(1000);
      const bottom = getComputedStyle(thread).flexDirection === 'column-reverse' ? 0 : thread.scrollHeight - thread.clientHeight;
      check(Math.abs(thread.scrollTop - bottom) < 2, 'Bottom failed after switch');
      panel.querySelector('.cg-user').click();
      await waitFor(() => !panel.querySelector('.cg-seeking'), 'Message navigation stalled after switch');
      check(panel.querySelector('[role="status"]').textContent === 'Message reached', 'Message navigation failed after switch');
      check(panel === document.querySelector('#cg-toc-fixed'), 'Script was remounted instead of surviving SPA navigation');
      switches++;
    }
    return { switches, cacheIsolation: true, bottom: true, messageNavigation: true, samePanel: true };
  } finally {
    if (location.pathname !== originalPath) {
      navigate(originalPath);
      await waitFor(() => location.pathname === originalPath, 'Could not restore starting conversation');
    }
    if (show) {
      [...document.querySelectorAll('button[aria-label="Hide sidebar"]')]
        .find(el => el.getBoundingClientRect().height === 36)?.click();
    }
  }
}
