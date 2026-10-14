// ==UserScript==
// @name         ChatGPT Conversation TOC (Local)
// @namespace    local.chatgpt-toc
// @version      1.9.6
// @description  Docked message navigation with virtualized turn seeking
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const id = 'cg-toc-fixed';
  const width = 290;

  if (window.__cgTocFixed) {
    window.__cgTocFixed.cleanup();
    return;
  }

  const css = document.createElement('style');
  css.id = `${id}-style`;
  css.textContent = `
    :root { --cg-toc-width: ${width}px; }

    /* Constrain the actual ChatGPT app, not body or #root itself. */
    html.cg-toc-open body > #root > div:first-of-type {
      box-sizing: border-box !important;
      width: calc(100% - var(--cg-toc-width)) !important;
      max-width: calc(100% - var(--cg-toc-width)) !important;
      min-width: 0 !important;
    }

    #cg-toc-fixed {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: var(--cg-toc-width); z-index: 2147483645;
      background: #000; color: #eee;
      border-left: 2px solid #1b1b1b;
      box-sizing: border-box;
      font: 13px/1.5 sans-serif;
      display: flex; flex-direction: column;
    }
    #cg-toc-fixed * { box-sizing: border-box; }
    #cg-toc-fixed button {
      font: inherit; color: inherit; cursor: pointer;
    }
    #cg-toc-fixed .cg-head {
      display: flex; gap: 8px; align-items: center;
      padding: 10px; border-bottom: 1px solid #1b1b1b;
    }
    #cg-toc-fixed .cg-head strong { flex: 1; }
    #cg-toc-fixed .cg-head button {
      width: 30px; height: 28px; flex: 0 0 30px;
      display: inline-flex; align-items: center;
      justify-content: center;
      border: 1px solid #1b1b1b;
      background: transparent; padding: 0;
      border-radius: 5px; font-size: 18px;
    }
    #cg-toc-fixed .cg-head button:hover { background: #1b1b1b; }
    #cg-toc-fixed .cg-head .cg-close { border-width: 2px; }
    #cg-toc-fixed .cg-list {
      overflow-y: auto; flex: 1; min-height: 0;
      padding: 5px 8px 16px;
    }
    #cg-toc-fixed .cg-list hr {
      border: 0; border-top: 1px solid #1b1b1b;
      margin: 6px 8px;
    }
    #cg-toc-fixed .cg-item {
      display: block; width: 100%; border: 0;
      background: none; text-align: left;
      overflow-wrap: anywhere;
      padding: 6px 8px; border-radius: 6px;
      margin: 2px 0;
    }
    #cg-toc-fixed .cg-item:hover,
    #cg-toc-fixed .cg-item:focus-visible { background: #1b1b1b; }
    #cg-toc-fixed .cg-item.cg-seeking {
      background: #1b1b1b;
      outline: 1px solid #333;
    }
    #cg-toc-fixed .cg-user { font-weight: 500; }
    #cg-toc-fixed .cg-ai { padding-left: 16px; color: #ccc; }
    #cg-toc-fixed .cg-section {
      padding-left: 29px; font-size: 12px; color: #b6d3fb;
    }
    #cg-toc-fixed .cg-list.cg-hide-sections .cg-section { display: none; }
    #cg-toc-handle {
      position: fixed; right: var(--cg-toc-width); top: 48%;
      z-index: 2147483646;
      border: 2px solid #1b1b1b;
      padding: 12px 7px;
      background: #1b1b1b; color: #fff;
      border-radius: 6px 0 0 6px;
      cursor: pointer; font: 18px/1 sans-serif;
    }
    html:not(.cg-toc-open) #cg-toc-handle { right: 0; }
    #cg-toc-fixed.cg-hidden { display: none; }
  `;
  document.head.append(css);

  const panel = document.createElement('aside');
  panel.id = id;
  panel.setAttribute('aria-label', 'Messages');

  const head = document.createElement('div');
  head.className = 'cg-head';
  const title = document.createElement('strong');
  title.textContent = 'Messages';

  function iconButton(icon, description) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = icon;
    button.title = description;
    button.setAttribute('aria-label', description);
    return button;
  }

  const headings = iconButton('H', 'Show response heading links');
  headings.setAttribute('aria-pressed', 'false');
  const top = iconButton('↑', 'Load older messages and go to beginning');
  const bottom = iconButton('↓', 'Jump to newest message');
  const close = iconButton('×', 'Remove message panel');
  close.className = 'cg-close';
  head.append(title, headings, top, bottom, close);

  const list = document.createElement('div');
  list.className = 'cg-list';
  list.classList.add('cg-hide-sections');
  panel.append(head, list);

  const handle = document.createElement('button');
  handle.id = 'cg-toc-handle';
  handle.type = 'button';
  handle.setAttribute('aria-controls', id);

  document.body.append(panel, handle);

  function setOpen(open) {
    panel.classList.toggle('cg-hidden', !open);
    document.documentElement.classList.toggle('cg-toc-open', open);
    handle.textContent = open ? '›' : '‹';
    handle.title = open ? 'Collapse message panel' : 'Open message panel';
    handle.setAttribute('aria-label', handle.title);
    handle.setAttribute('aria-expanded', String(open));
  }
  setOpen(true);

  // Persist only labels/metadata, never DOM nodes, across virtualization.
  // Clear when navigating to a different conversation.
  const labelCache = new Map();
  let activeConversation = location.pathname;
  let activeRoot = null;
  let jumpSerial = 0;
  let pendingJump = null;

  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  panel.append(status);

  function messageKey(el, fallback, role) {
    const messageId = (el.getAttribute('data-chatgpt-search-message-ids') ||
      el.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      el.getAttribute('data-message-id') || '').trim().split(/\s+/)[0];
    return messageId ? `${messageId}:${role}` : fallback;
  }

  function conversationRoot() {
    // ChatGPT retains previous conversations as hidden <main> elements.
    return [...document.querySelectorAll('main')].find(el =>
      el.getBoundingClientRect().height > 0 &&
      getComputedStyle(el).visibility !== 'hidden') || null;
  }

  function turns() {
    const root = conversationRoot();
    if (!root) return [];
    const shells = [...root.querySelectorAll(
      'section[data-testid^="conversation-turn-"], ' +
      'article[data-testid^="conversation-turn-"]'
    )];

    if (shells.length) {
      return shells.map(el => {
        const key = el.getAttribute('data-testid');
        const role = el.getAttribute('data-turn') ||
          el.querySelector('[data-message-author-role="user"]')
            ?.getAttribute('data-message-author-role') ||
          el.querySelector('[data-message-author-role="assistant"]')
            ?.getAttribute('data-message-author-role') ||
          labelCache.get(key)?.role || '';
        return { el, role, key: messageKey(el, key, role) };
      }).filter(item => item.role === 'user' || item.role === 'assistant');
    }

    // Fallback for layouts that don't expose persistent shells.
    const root2 = root.querySelector(
      '[data-thread-find-target="conversation"]'
    ) || root;
    const queries = [
      '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]',
      '[data-message-author-role="user"], [data-message-author-role="assistant"]',
      '[data-user-message-bubble], [data-conversation-role="assistant"]'
    ];

    for (const selector of queries) {
      const entries = [...root2.querySelectorAll(selector)].map((el, index) => {
        const key = el.getAttribute('data-chatgpt-search-unit-key') || '';
        const role = key.endsWith(':user') ? 'user' :
          key.endsWith(':assistant') ? 'assistant' :
          el.getAttribute('data-message-author-role') ||
          el.getAttribute('data-turn') ||
          el.getAttribute('data-conversation-role') ||
          (el.hasAttribute('data-user-message-bubble') ? 'user' : '');
        const fallback = key || el.getAttribute('data-turn-key') || `mounted-${role}-${index}`;
        return { el, role, key: messageKey(el, fallback, role) };
      }).filter(item => item.role === 'user' || item.role === 'assistant');
      if (entries.length) return entries;
    }
    return [];
  }

  function preview(el, role) {
    const chosen = role === 'user'
      ? el.querySelector(
          '[data-user-message-bubble], .user-message-bubble-color, ' +
          '.whitespace-pre-wrap, [data-message-author-role="user"]'
        )
      : el.querySelector(
          '.markdown, [data-message-author-role="assistant"]'
        );

    // Empty shells must NOT overwrite cached text.
    const content = (chosen || el).cloneNode(true);
    content.querySelectorAll('.sr-only').forEach(node => node.remove());
    const text = (content.textContent || '')
      .replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 95) + (text.length > 95 ? '…' : '') : '';
  }

  function readHeadings(el) {
    const markdown = el.querySelector('.markdown') || el;
    return [...markdown.querySelectorAll('h1,h2,h3,h4')]
      .filter(heading => !heading.closest('pre,code,.sr-only'))
      .map(heading => (heading.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90))
      .filter(Boolean);
  }

  function rendered(el) {
    // New ChatGPT response components often lack .markdown and role markers.
    // Actual text is a better signal than those old selectors.
    return el.isConnected &&
      el.getClientRects().length > 0 &&
      !!(el.textContent || '').trim();
  }

  function findCurrent(key) {
    const listed = turns().find(item => item.key === key);
    if (listed) return listed;

    // A virtualized shell may survive in the DOM without data-turn or
    // mounted content. Resolve it by ID even if role detection fails.
    const shell = [...(conversationRoot()?.querySelectorAll(
      '[data-testid^="conversation-turn-"]'
    ) || [])].find(el => messageKey(el, el.getAttribute('data-testid'), labelCache.get(key)?.role) === key);
    return shell ? { el: shell, key, role: labelCache.get(key)?.role } : null;
  }

  function hasTurnContent(el) {
    if (!el?.isConnected || el.getBoundingClientRect().height < 10)
      return false;
    const content = el.matches(
      '[data-message-author-role], [data-user-message-bubble]'
    ) ? el : el.querySelector(
      '[data-message-author-role], [data-user-message-bubble], ' +
      '[data-chatgpt-search-unit-key], .markdown'
    );
    return !!preview(content || el, 'assistant');
  }

  function conversationScroller(el = conversationRoot()) {
    // Code blocks have their own overflow containers and bottom buttons.
    const thread = el?.closest('.thread-scroll-container') ||
      conversationRoot()?.querySelector('.thread-scroll-container');
    if (thread) return thread;
    for (let parent = el?.parentElement; parent; parent = parent.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(parent).overflowY) &&
          parent.scrollHeight > parent.clientHeight + 4) return parent;
    }
    return document.scrollingElement;
  }

  function scrollEdges(scroller) {
    const extent = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    return getComputedStyle(scroller).flexDirection === 'column-reverse'
      ? { top: -extent, bottom: 0 } : { top: 0, bottom: extent };
  }

  function turnPosition(el) {
    const scroller = conversationScroller(el);
    return scroller.scrollTop + el.getBoundingClientRect().top -
      (scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top);
  }

  // Repeat alignment after mounting: virtualization can change measured heights.
  function aimAt(el) {
    const scroller = conversationScroller(el);
    const r = el.getBoundingClientRect();
    const baseline = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
    const delta = r.top - baseline - 65;
    if (Math.abs(delta) < 7) return;
    scroller.scrollBy({ top: delta, behavior: 'instant' });
  }

  // Try the last measured position, then sweep upward from the bottom. Ordinary
  // scroll events remount turns; fallback-turn indices are not stable identities.
  // ponytail: O(conversation height) fallback, replace if ChatGPT exposes DOM anchors.
  async function jumpTo(key, headingIndex = -1) {
    stopLoadingTop();
    const serial = ++jumpSerial;
    const pathname = location.pathname;
    const root = conversationRoot();
    pendingJump = { key, headingIndex, serial };
    status.textContent = 'Finding message';
    rebuild();

    const scroller = conversationScroller();
    const deadline = Date.now() + 90000;
    const current = () => !destroyed && serial === jumpSerial &&
      pathname === location.pathname && root === conversationRoot();
    let aligned = 0;
    let sweeping = false;
    let found = false;

    try {
      if (!findCurrent(key) && Number.isFinite(labelCache.get(key)?.position)) {
        scroller.scrollTo({ top: labelCache.get(key).position - 65, behavior: 'instant' });
        await pause(250);
      }
      while (Date.now() < deadline && current()) {
        const item = findCurrent(key);
        if (item) {
          const target = headingIndex < 0 ? item.el :
            [...item.el.querySelectorAll('h1,h2,h3,h4')]
              .filter(h => !h.closest('pre,code,.sr-only'))[headingIndex];
          aimAt(target || item.el);
          if (target && hasTurnContent(item.el)) {
            if (++aligned >= 3) { found = true; return; }
          } else aligned = 0;
          await pause(180);
        } else {
          aligned = 0;
          if (!sweeping) {
            scroller.scrollTo({ top: scrollEdges(scroller).bottom, behavior: 'instant' });
            sweeping = true;
          } else {
            const before = scroller.scrollTop;
            scroller.scrollBy({ top: -Math.max(100, scroller.clientHeight * 0.8), behavior: 'instant' });
            if (Math.abs(scroller.scrollTop - before) < 1) {
              // At the oldest loaded page, allow ChatGPT to prepend history.
              await pause(4500);
              if (!current()) return;
              if (!findCurrent(key) && Math.abs(scroller.scrollTop - scrollEdges(scroller).top) < 2) break;
            }
          }
          await pause(250);
        }
      }
    } finally {
      if (pendingJump?.serial === serial) {
        pendingJump = null;
        if (!destroyed) {
          status.textContent = found ? 'Message reached' : 'Message not found. It may no longer be in this conversation; refresh and try again.';
          rebuild();
        }
      }
    }
  }

  let loadingTop = false;
  let stopTop = false;
  let destroyed = false;
  function stopLoadingTop() {
    if (loadingTop) stopTop = true;
  }

  function addItem(label, key, cls, headingIndex = -1, unresolved = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cg-item ' + cls;
    button.dataset.messageKey = key;
    button.textContent = label;
    if (headingIndex < 0) button.setAttribute('aria-label',
      `${cls === 'cg-user' ? 'Your message' : 'Assistant response'}: ${label}`);
    if (unresolved) button.title = 'Preview appears after this message is rendered';
    if (pendingJump?.key === key && pendingJump.headingIndex === headingIndex) {
      button.classList.add('cg-seeking');
      button.title = 'Finding message';
    }
    button.addEventListener('click', () => { void jumpTo(key, headingIndex); });
    list.append(button);
  }

  function rebuild() {
    if (destroyed) return;
    const root = conversationRoot();
    if (activeConversation !== location.pathname || activeRoot !== root) {
      stopLoadingTop();
      activeConversation = location.pathname;
      activeRoot = root;
      labelCache.clear();
      jumpSerial++;
      pendingJump = null;
      status.textContent = '';
      list.scrollTop = 0;
    }

    // Add or update currently observed turns. Do not remove entries just
    // because ChatGPT has unmounted their DOM nodes while scrolling.
    for (const { el, role, key } of turns()) {
      if (!key) continue;
      const freshSnippet = preview(el, role);
      const existing = labelCache.get(key);
      // Skip empty placeholder shells; they have no useful position yet and
      // would need a made-up order that could batch later messages.
      if (!existing && !freshSnippet) continue;
      const entry = existing || {
        key, role, snippet: '', headings: [], firstSeen: labelCache.size
      };
      entry.role = role;
      if (freshSnippet) entry.snippet = freshSnippet;
      if (el.getBoundingClientRect().height >= 10) {
        // Distance from the end survives prepended history in both normal and
        // reverse-flex layouts; top-relative coordinates do not.
        const scroller = conversationScroller(el);
        entry.position = turnPosition(el);
        entry.endOffset = entry.position - scrollEdges(scroller).bottom;
      }
      if (role === 'assistant') {
        const headings = readHeadings(el);
        if (headings.length) entry.headings = headings;
      }
      labelCache.set(key, entry);
    }

    // One numeric key per message. Role and turn keys must not affect order:
    // ChatGPT reuses those across separately loaded pages of one conversation.
    const all = [...labelCache.values()].sort((a, b) => {
      const aOffset = Number.isFinite(a.endOffset) ? a.endOffset : Infinity;
      const bOffset = Number.isFinite(b.endOffset) ? b.endOffset : Infinity;
      return aOffset - bOffset || a.firstSeen - b.firstSeen;
    });

    list.replaceChildren();
    for (const entry of all) {
      const isUser = entry.role === 'user';
      const label = entry.snippet || '(preview unavailable)';
      addItem(label, entry.key, isUser ? 'cg-user' : 'cg-ai',
              -1, !entry.snippet);
      if (!isUser) {
        entry.headings.forEach((heading, index) =>
          addItem(heading, entry.key, 'cg-section', index));
        list.append(document.createElement('hr'));
      }
    }
  }

  function edgeTurn(edge) {
    return turns()
      .map(({ el }) => el)
      .filter(el => rendered(el))
      .reduce((selected, el) => {
        if (!selected) return el;
        const a = selected.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return edge === 'top'
          ? (b.top < a.top ? el : selected)
          : (b.bottom > a.bottom ? el : selected);
      }, null);
  }

  function turnIdentity(el) {
    return el.getAttribute('data-chatgpt-search-unit-key') ||
      el.getAttribute('data-turn-key') ||
      el.getAttribute('data-testid') ||
      (el.textContent || '').trim().slice(0, 150);
  }

  function isNewOlderTurn(candidate, previous, previousIdentity) {
    if (!candidate || candidate === previous) return false;
    if (previous.isConnected) {
      // DOM order remains reliable even as virtualized heights change.
      return !!(previous.compareDocumentPosition(candidate) &
        Node.DOCUMENT_POSITION_PRECEDING);
    }
    return turnIdentity(candidate) !== previousIdentity;
  }

  function nudgeUp(el) {
    conversationScroller(el).scrollBy({ top: -250, behavior: 'instant' });
  }

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function goToBeginning() {
    if (loadingTop) {
      stopTop = true;
      top.textContent = '…';
      top.title = 'Stopping';
      return;
    }
    loadingTop = true;
    stopTop = false;
    top.textContent = '■';
    top.title = 'Stop loading older messages';
    top.setAttribute('aria-label', top.title);

    const pathname = location.pathname;
    const root = conversationRoot();
    const current = () => !stopTop && !destroyed &&
      pathname === location.pathname && root === conversationRoot();
    const deadline = Date.now() + 90000;
    try {
      for (let round = 0; round < 40; round++) {
        if (!current() || Date.now() >= deadline) break;
        const oldest = edgeTurn('top');
        if (!oldest) break;
        const identity = turnIdentity(oldest);
        oldest.scrollIntoView({ behavior: 'instant', block: 'start' });
        await pause(180);
        if (!current()) break;
        nudgeUp(oldest);

        let advanced = false;
        const waitUntil = Math.min(Date.now() + 4500, deadline);
        while (current() && Date.now() < waitUntil) {
          if (isNewOlderTurn(edgeTurn('top'), oldest, identity)) {
            advanced = true;
            break;
          }
          await pause(250);
        }
        if (!advanced) break;
      }
      if (current()) {
        edgeTurn('top')?.scrollIntoView({
          behavior: 'instant', block: 'start'
        });
      }
    } finally {
      if (!destroyed) {
        loadingTop = false;
        top.textContent = '↑';
        top.title = 'Load older messages and go to beginning';
        top.setAttribute('aria-label', top.title);
        rebuild();
      }
    }
  }

  top.addEventListener('click', () => { jumpSerial++; pendingJump = null; void goToBeginning(); });

  bottom.addEventListener('click', async () => {
    const serial = ++jumpSerial;
    const pathname = location.pathname;
    const root = conversationRoot();
    pendingJump = null;
    stopLoadingTop();

    // Bottom is zero in ChatGPT's reverse-flex scroller, not scrollHeight.
    // Reapply after the virtualizer replaces estimated heights with measurements.
    for (let round = 0; round < 4; round++) {
      if (destroyed || serial !== jumpSerial || pathname !== location.pathname || root !== conversationRoot()) return;
      const scroller = conversationScroller();
      scroller.scrollTo({ top: scrollEdges(scroller).bottom, behavior: 'instant' });
      await pause(180);
    }
    rebuild();
  });

  headings.addEventListener('click', () => {
    const visible = headings.getAttribute('aria-pressed') !== 'true';
    list.classList.toggle('cg-hide-sections', !visible);
    headings.setAttribute('aria-pressed', String(visible));
    headings.title = visible ? 'Hide response heading links' : 'Show response heading links';
    headings.setAttribute('aria-label', headings.title);
  });
  handle.addEventListener('click', () => {
    setOpen(panel.classList.contains('cg-hidden'));
  });

  const cancelOnManualScroll = event => {
    if (event.target?.closest?.('#cg-toc-fixed')) return;
    stopLoadingTop();
    jumpSerial++;
    pendingJump = null;
    schedule();
  };
  window.addEventListener('wheel', cancelOnManualScroll, {
    passive: true, capture: true
  });
  window.addEventListener('touchstart', cancelOnManualScroll, {
    passive: true, capture: true
  });

  let timeout = null;
  function schedule() {
    if (timeout !== null) return;
    timeout = setTimeout(() => {
      timeout = null;
      rebuild();
    }, 400);
  }

  const observer = new MutationObserver(records => {
    if (records.some(r => {
      const node = r.target.nodeType === 1
        ? r.target : r.target.parentElement;
      return !node?.closest('#' + id + ', #cg-toc-handle');
    })) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  let lastUrl = location.href;
  const interval = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      rebuild();
    }
  }, 1500);

  function cleanup() {
    stopLoadingTop();
    jumpSerial++;
    pendingJump = null;
    labelCache.clear();
    destroyed = true;
    observer.disconnect();
    clearInterval(interval);
    clearTimeout(timeout);
    window.removeEventListener('wheel', cancelOnManualScroll, true);
    window.removeEventListener('touchstart', cancelOnManualScroll, true);
    document.documentElement.classList.remove('cg-toc-open');
    panel.remove();
    handle.remove();
    css.remove();
    delete window.__cgTocFixed;
  }

  close.addEventListener('click', cleanup);
  window.__cgTocFixed = { cleanup };
  rebuild();
})();
