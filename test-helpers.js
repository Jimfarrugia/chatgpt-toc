// Paste once per tab before running any *.browser-test.js (see BROWSER-TESTS.md).
// Declared with var so pasting the file again does not throw.

var pause = ms => new Promise(resolve => setTimeout(resolve, ms));

var check = (condition, message) => {
  if (!condition) throw new Error(message);
};

var waitFor = async (condition, message, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (!condition() && Date.now() < deadline) await pause(100);
  check(condition(), message);
};

var testRoot = () =>
  [...document.querySelectorAll('main')].find(el => el.getBoundingClientRect().height > 0);

var testScroller = () => testRoot()?.querySelector('.thread-scroll-container');
