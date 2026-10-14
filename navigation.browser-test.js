// Run with test-helpers.js pasted first, in the actual ChatGPT tab with the current userscript injected and a long conversation open.
// Returns a report; never sends messages or accesses conversation APIs.
(async () => {
  const panel = document.querySelector('#cg-toc-fixed');
  const scroller = testScroller();
  const report = [];
  let bottomChecks = 0;
  function units(role) {
    return [...scroller.querySelectorAll(`[data-chatgpt-search-unit-key$=":${role}"]`)];
  }
  function identity(el) {
    return el.getAttribute('data-chatgpt-search-message-ids').trim().split(/\s+/)[0];
  }
  function find(id) {
    return [...scroller.querySelectorAll('[data-chatgpt-search-message-ids]')]
      .find(el => identity(el) === id);
  }
  async function bottom() {
    panel.querySelector('button[aria-label="Jump to newest message"]').click();
    await pause(1000);
    const expected = getComputedStyle(scroller).flexDirection === 'column-reverse'
      ? 0 : scroller.scrollHeight - scroller.clientHeight;
    check(Math.abs(scroller.scrollTop - expected) < 2, 'Bottom was not reached');
    bottomChecks++;
  }
  async function top() {
    const button = panel.querySelector('[aria-label="Load older messages and go to beginning"]');
    button.click();
    await waitFor(() => button.textContent === '↑', 'Top timed out', 95000);
    await pause(500);
  }
  async function jump(selector, index, id) {
    check(!find(id), `Target ${id} must be unloaded before this test`);
    panel.querySelectorAll(selector)[index].click();
    await waitFor(() => !panel.querySelector('.cg-seeking'), 'Jump timed out', 95000);
    check(panel.querySelector('[role="status"]').textContent === 'Message reached', 'Jump reported failure');
    const target = find(id);
    check(target && target.textContent.trim(), 'Target did not remount');
    const rect = target.getBoundingClientRect();
    check(rect.top >= 0 && rect.top < scroller.clientHeight - 100, 'Target is not visible');
    report.push({ id, top: rect.top, scrollTop: scroller.scrollTop });
  }
  check(panel && scroller, 'Open ChatGPT and inject the userscript first');
  await top();
  const firstUser = identity(units('user')[0]);
  const firstAI = identity(units('assistant')[0]);
  await bottom();
  const lastUser = identity(units('user').at(-1));
  const lastAI = identity(units('assistant').at(-1));
  const keys = [...panel.querySelectorAll('.cg-user,.cg-ai')].map(el => el.dataset.messageKey);
  for (let round = 0; round < 3; round++) {
    await jump('.cg-user', 0, firstUser);
    await bottom();
    await jump('.cg-ai', 0, firstAI);
    await jump('.cg-user', panel.querySelectorAll('.cg-user').length - 1, lastUser);
    await top();
    await jump('.cg-ai', panel.querySelectorAll('.cg-ai').length - 1, lastAI);
    await bottom();
  }
  const sweep = [];
  for (let start = 0, end = keys.length - 1; start <= end; start++, end--) {
    sweep.push(keys[start]);
    if (start !== end) sweep.push(keys[end]);
  }
  let unloaded = 0;
  for (const key of sweep) {
    const id = key.slice(0, key.lastIndexOf(':'));
    if (!find(id)) unloaded++;
    const button = [...panel.querySelectorAll('.cg-user,.cg-ai')].find(el => el.dataset.messageKey === key);
    check(button, 'Cached message disappeared');
    button.click();
    await waitFor(() => !panel.querySelector('.cg-seeking'), 'Sweep jump timed out', 95000);
    check(panel.querySelector('[role="status"]').textContent === 'Message reached', 'Sweep jump reported failure');
    const target = find(id);
    check(target && target.getBoundingClientRect().top >= 0 && target.getBoundingClientRect().top < scroller.clientHeight - 100, 'Sweep target is not visible');
  }
  await bottom();
  const section = panel.querySelector('.cg-section');
  check(section, 'No headings discovered');
  const headingToggle = panel.querySelector('.cg-head button');
  check(headingToggle.textContent === 'H' && headingToggle.nextElementSibling.title.includes('Load older'), 'Heading toggle is not left of navigation buttons');
  check(getComputedStyle(section).display === 'none' && headingToggle.getAttribute('aria-pressed') === 'false', 'Heading links were not hidden by default');
  headingToggle.click();
  check(getComputedStyle(section).display !== 'none', 'Heading links did not show');
  check(panel.querySelector('.cg-user'), 'Message navigation was hidden with headings');
  headingToggle.click();
  check(getComputedStyle(section).display === 'none', 'Heading links did not hide');
  headingToggle.click();
  const headingKey = section.dataset.messageKey;
  const headingText = section.textContent;
  section.click();
  await waitFor(() => !panel.querySelector('.cg-seeking'), 'Heading jump timed out', 95000);
  const headingTurn = find(headingKey.slice(0, headingKey.lastIndexOf(':')));
  const heading = [...headingTurn.querySelectorAll('h1,h2,h3,h4')].find(el => el.textContent.trim() === headingText);
  check(heading && Math.abs(heading.getBoundingClientRect().top - 65) < 8, 'Heading is not aligned');
  headingToggle.click();
  const handle = document.querySelector('#cg-toc-handle');
  handle.click();
  check(getComputedStyle(panel).display === 'none', 'Panel did not collapse');
  handle.click();
  check(document.documentElement.classList.contains('cg-toc-open'), 'Dock did not reopen');
  check(getComputedStyle(panel).backgroundColor === 'rgb(0, 0, 0)', 'Panel colour changed');
  check(panel.getBoundingClientRect().width === 290, 'Panel width changed');
  await bottom();
  const labels = [...panel.querySelectorAll('.cg-user,.cg-ai')].map(el => el.textContent);
  check(panel.querySelectorAll('.cg-list hr').length === panel.querySelectorAll('.cg-ai').length, 'Response dividers are missing');
  check([...panel.querySelectorAll('.cg-list hr')].every(el => el.previousElementSibling.matches('.cg-ai,.cg-section')), 'Divider appeared after a prompt');
  check(new Set(keys).size === keys.length, 'Duplicate cached message identities');
  const finalKeys = [...panel.querySelectorAll('.cg-user,.cg-ai')].map(el => el.dataset.messageKey);
  check(JSON.stringify(keys) === JSON.stringify(finalKeys.filter(key => keys.includes(key))), 'Previously discovered messages were lost or reordered');
  check(!labels.some(label => label === 'ChatGPT said:'), 'Unloaded shell overwrote a cached preview');
  return { repeatedJumps: report.length, sweepJumps: sweep.length, sweepUnloadedTargets: unloaded, bottomChecks, headingPassed: true, panelPassed: true, messages: labels.length, scrollHeight: scroller.scrollHeight, report };
})();
