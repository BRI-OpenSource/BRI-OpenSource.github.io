const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '..');

const noteText = [
  '# Browser Smoke Test',
  '',
  'Inline dollar: $E = mc^2$',
  'Spaced inline dollar: $ F = ma $',
  'Escaped inline dollar: \\$G = H\\$',
  '',
  'Display dollar:',
  '$$',
  'a^2 + b^2 = c^2',
  '$$',
  '',
  'Escaped display dollar:',
  '\\$\\$',
  'e^{i\\pi} + 1 = 0',
  '\\$\\$',
  '',
  'Inline bracket: \\(\\alpha + \\beta\\)',
  'Double escaped inline bracket: \\\\(\\gamma + \\delta\\\\)',
  'The cross-coupling term \\(\\gamma\\) exists because the jitterbug transformation locks rotation and contraction together.',
  'A central mass sources these fields through its geometric slip \\(\\Delta = 34.25\\).',
  'Since \\(L_0(r) \\propto -K/r\\), we can read the radial behavior.',
  'We look for static, spherically symmetric background solutions \\(\\partial_t = 0\\).',
  'This establishes that the effective monopole strength in the twist channel is **Q_EM = 137**.',
  'The bare tensor fragment G_{\\mu\\nu} = 0 should remain prose when it appears inside a sentence.',
  'Q_EM = **1493.5895634458918**',
  '',
  'Long inline equation: \\(\\Gamma^{\\lambda}_{\\mu\\nu} + R^{\\rho}_{\\sigma\\mu\\nu} + \\nabla_\\alpha \\nabla_\\beta \\nabla_\\gamma \\nabla_\\delta \\Phi_{\\lambda\\rho\\sigma\\mu\\nu} + \\Lambda g_{\\mu\\nu} + \\frac{8\\pi G}{c^4}T_{\\mu\\nu} + \\mathcal{A}_{\\alpha\\beta\\gamma\\delta} + \\mathcal{B}^{\\lambda\\rho}_{\\sigma\\mu\\nu} + \\sum_{n=1}^{100} \\frac{n^2 + \\alpha_n}{n^3 + \\beta_n} + \\prod_{k=1}^{20} \\left(1 + \\frac{x_k}{r^2}\\right) = 0\\) should scroll locally.',
  '',
  'Display bracket:',
  '\\[',
  '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
  '\\]',
  '',
  'Long display equation:',
  '$$',
  '\\Gamma^{\\lambda}_{\\mu\\nu} = \\tfrac{1}{2} g^{\\lambda\\sigma}\\left( \\partial_\\mu g_{\\nu\\sigma} + \\partial_\\nu g_{\\mu\\sigma} - \\partial_\\sigma g_{\\mu\\nu} \\right) + R^{\\rho}_{\\sigma\\mu\\nu} + \\nabla_\\alpha \\nabla_\\beta \\nabla_\\gamma \\nabla_\\delta \\Phi_{\\lambda\\rho\\sigma\\mu\\nu} + \\Lambda g_{\\mu\\nu} + \\frac{8\\pi G}{c^4}T_{\\mu\\nu} + \\mathcal{A}_{\\alpha\\beta\\gamma\\delta} + \\mathcal{B}^{\\lambda\\rho}_{\\sigma\\mu\\nu} + \\sum_{n=1}^{100} \\frac{n^2 + \\alpha_n}{n^3 + \\beta_n} + \\prod_{k=1}^{20} \\left(1 + \\frac{x_k}{r^2}\\right) + \\int_0^\\infty e^{-\\omega r} \\, d\\omega + \\operatorname{diag}(g_{00}, g_{11}, g_{22}, g_{33})',
  '$$',
  '',
  'Double escaped display bracket:',
  '\\\\[',
  '\\sum_{n=1}^{10} n = 55',
  '\\\\]',
  '',
  'Bare Einstein tensor:',
  'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}',
  '',
  'Bare Ricci tensor:',
  'R_{\\mu\\nu} \\equiv R^{\\alpha}{}_{\\mu\\alpha\\nu}, \\qquad R = g^{\\mu\\nu} R_{\\mu\\nu}',
  '',
  'Bare Christoffel block:',
  '\\Gamma^{\\lambda}_{\\mu\\nu} = \\tfrac{1}{2} g^{\\lambda\\sigma}\\left(',
  '\\partial_\\mu g_{\\nu\\sigma} + \\partial_\\nu g_{\\mu\\sigma} - \\partial_\\sigma g_{\\mu\\nu}',
  '\\right)',
  '',
  ...Array.from({ length: 80 }, (_, index) => `Scrollable line ${index + 1}: $x_${index + 1}^2$`),
].join('\n');

const emptyNoteText = '';

function findChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('No Chrome or Edge executable found for browser smoke test. Set PUPPETEER_EXECUTABLE_PATH.');
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  if (filePath.endsWith('.woff')) return 'font/woff';
  if (filePath.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

function harnessHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { width: 100%; height: 100%; margin: 0; }
    iframe { width: min(900px, 100vw); height: 520px; border: 0; }
  </style>
</head>
<body>
  <iframe id="plugin" src="/dist/index.html"></iframe>
  <script>
    const notes = {
      'note-1': {
        uuid: 'note-1',
        isMetadataUpdate: false,
        content: {
          text: ${JSON.stringify(noteText)},
          spellcheck: true
        }
      },
      'note-2': {
        uuid: 'note-2',
        isMetadataUpdate: false,
        content: {
          text: ${JSON.stringify(emptyNoteText)},
          spellcheck: false
        }
      }
    };

    let currentNoteId = 'note-1';
    let iframe = document.getElementById('plugin');
    window.pluginMessages = [];

    window.setCurrentNoteId = (noteId) => {
      if (!notes[noteId]) {
        throw new Error('Unknown smoke note: ' + noteId);
      }
      currentNoteId = noteId;
    };

    window.reloadPluginForNote = (noteId) => {
      window.setCurrentNoteId(noteId);
      return new Promise((resolve) => {
        const nextIframe = document.createElement('iframe');
        nextIframe.id = 'plugin';
        nextIframe.src = '/dist/index.html?reload=' + Date.now() + '-' + Math.random();
        nextIframe.addEventListener('load', () => {
          iframe = nextIframe;
          registerComponent(nextIframe);
          resolve();
        }, { once: true });
        iframe.replaceWith(nextIframe);
      });
    };

    function currentNote() {
      return JSON.parse(JSON.stringify(notes[currentNoteId]));
    }

    function registerComponent(targetIframe) {
      targetIframe.contentWindow.postMessage({
        action: 'component-registered',
        sessionKey: 'browser-smoke-session',
        componentData: {},
        data: {
          environment: 'web',
          platform: 'web',
          uuid: 'component-1',
          activeThemeUrls: []
        }
      }, window.location.origin);
    }

    window.addEventListener('message', (event) => {
      const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      window.pluginMessages.push(message);

      if (!message || message.api !== 'component') {
        return;
      }

      if (message.action === 'stream-context-item') {
        event.source.postMessage({
          action: 'reply',
          original: { messageId: message.messageId },
          data: {
            item: currentNote()
          }
        }, event.origin);
      }

      if (message.action === 'save-items') {
        event.source.postMessage({
          action: 'reply',
          original: { messageId: message.messageId },
          data: {}
        }, event.origin);
      }
    });

    iframe.addEventListener('load', () => {
      registerComponent(iframe);
    });
  </script>
</body>
</html>`;
}

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(harnessHtml());
      return;
    }

    const relativePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      response.writeHead(200, { 'Content-Type': contentType(filePath) });
      response.end(data);
    });
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

async function paneState(frame) {
  return frame.evaluate(() => {
    const editorPane = document.getElementById('editor-pane');
    const editor = document.getElementById('editor');
    const editorHighlights = document.getElementById('editor-highlights');
    const preview = document.getElementById('preview');
    const search = document.getElementById('note-search');
    const modeButtons = document.querySelector('.segmented-buttons-container');
    const header = document.getElementById('header');
    const editorPaneRect = editorPane.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const editorHighlightsRect = editorHighlights.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const modeButtonsRect = modeButtons.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const editorPaneStyle = getComputedStyle(editorPane);
    const editorStyle = getComputedStyle(editor);
    const previewStyle = getComputedStyle(preview);

    function plainTextOutsideKatex(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (parent && parent.closest('.katex')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const parts = [];
      let node = walker.nextNode();

      while (node) {
        parts.push(node.textContent);
        node = walker.nextNode();
      }

      return parts.join('\n');
    }

    function mathScrollerState(root) {
      return Array.from(root.querySelectorAll('.katex-display, eq > .katex')).map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          selector: element.classList.contains('katex-display') ? '.katex-display' : 'eq > .katex',
          width: rect.width,
          scrollLeft: element.scrollLeft,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          overflowX: style.overflowX,
        };
      });
    }

    return {
      mode: document.getElementById('editor-container').className,
      editorValue: editor.value,
      katexCount: preview.querySelectorAll('.katex').length,
      previewText: preview.textContent,
      previewHtml: preview.innerHTML,
      plainTextOutsideKatex: plainTextOutsideKatex(preview),
      mathScrollers: mathScrollerState(preview),
      editorHighlightCount: editorHighlights.querySelectorAll('mark.search-highlight').length,
      previewHighlightCount: preview.querySelectorAll('mark.search-highlight').length,
      editorHasSearchClass: editor.classList.contains('has-search-query'),
      editorHighlightActive: editorHighlights.classList.contains('active'),
      header: {
        left: headerRect.left,
        right: headerRect.right,
        width: headerRect.width,
        bottom: headerRect.bottom,
      },
      modeButtons: {
        left: modeButtonsRect.left,
        right: modeButtonsRect.right,
        width: modeButtonsRect.width,
        top: modeButtonsRect.top,
        bottom: modeButtonsRect.bottom,
      },
      search: {
        value: search.value,
        left: searchRect.left,
        right: searchRect.right,
        width: searchRect.width,
        top: searchRect.top,
        bottom: searchRect.bottom,
      },
      editorPane: {
        width: editorPaneRect.width,
        height: editorPaneRect.height,
        overflow: editorPaneStyle.overflow,
        visibility: editorPaneStyle.visibility,
      },
      editorHighlights: {
        width: editorHighlightsRect.width,
        height: editorHighlightsRect.height,
        scrollTop: editorHighlights.scrollTop,
        scrollLeft: editorHighlights.scrollLeft,
      },
      editor: {
        width: editorRect.width,
        height: editorRect.height,
        scrollTop: editor.scrollTop,
        scrollHeight: editor.scrollHeight,
        clientHeight: editor.clientHeight,
        overflowY: editorStyle.overflowY,
      },
      preview: {
        width: previewRect.width,
        height: previewRect.height,
        scrollTop: preview.scrollTop,
        scrollHeight: preview.scrollHeight,
        scrollWidth: preview.scrollWidth,
        clientHeight: preview.clientHeight,
        clientWidth: preview.clientWidth,
        overflowX: previewStyle.overflowX,
        overflowY: previewStyle.overflowY,
      },
    };
  });
}

async function clickMode(frame, label) {
  await frame.evaluate((targetLabel) => {
    const button = Array.from(document.querySelectorAll('.button'))
      .find((element) => element.textContent.trim() === targetLabel);
    if (!button) {
      throw new Error(`Missing mode button: ${targetLabel}`);
    }
    button.click();
  }, label);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

async function saveItemMessageCount(page) {
  return page.evaluate(() => {
    return window.pluginMessages.filter((message) => message && message.action === 'save-items').length;
  });
}

async function setStaleStoredModeForNote(page, noteId, modeValue) {
  await page.evaluate(({ targetNoteId, targetModeValue }) => {
    window.localStorage.setItem(`snlatex.mode.${targetNoteId}`, String(targetModeValue));
  }, { targetNoteId: noteId, targetModeValue: modeValue });
}

async function reloadPluginForNote(page, noteId) {
  await page.evaluate((targetNoteId) => window.reloadPluginForNote(targetNoteId), noteId);
  const iframe = await page.waitForSelector('#plugin');
  const frame = await iframe.contentFrame();
  await frame.waitForSelector('#editor-container', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  return frame;
}

async function waitForEditorValue(frame, expectedText) {
  await frame.waitForFunction((text) => {
    return document.getElementById('editor').value === text;
  }, { timeout: 10000 }, expectedText);
}

async function waitForEditorSpellcheck(frame, expectedValue) {
  await frame.waitForFunction((value) => {
    return document.getElementById('editor').getAttribute('spellcheck') === value;
  }, { timeout: 10000 }, expectedValue);
}

async function appendEditorText(frame, text) {
  await frame.evaluate((textToAppend) => {
    const editor = document.getElementById('editor');
    editor.value += textToAppend;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

async function setSearchQuery(frame, query) {
  await frame.evaluate((nextQuery) => {
    const search = document.getElementById('note-search');
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    valueSetter.call(search, nextQuery);
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

function paneScrollRatio(pane) {
  const maxScrollTop = pane.scrollHeight - pane.clientHeight;
  if (maxScrollTop <= 0) {
    return 0;
  }

  return pane.scrollTop / maxScrollTop;
}

function assertScrollRatioClose(pane, expected, label, tolerance = 0.08) {
  const actual = paneScrollRatio(pane);
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label} should preserve scroll ratio near ${expected.toFixed(2)}, got ${actual.toFixed(2)}`
  );
}

async function setPaneScroll(frame, paneId, ratio) {
  await frame.evaluate(({ targetPaneId, targetRatio }) => {
    const pane = document.getElementById(targetPaneId);
    const maxScrollTop = pane.scrollHeight - pane.clientHeight;
    pane.scrollTop = maxScrollTop > 0 ? maxScrollTop * targetRatio : 0;
    pane.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, { targetPaneId: paneId, targetRatio: ratio });
  await new Promise((resolve) => setTimeout(resolve, 100));
}

function assertPreviewHasMath(state, label) {
  const expectedMathCount = 90;
  const rawMathNeedles = [
    'G_{\\\\mu\\\\nu}',
    '\\\\frac{8\\\\pi G}',
    '\\\\Gamma^{\\\\lambda}_{\\\\mu\\\\nu}',
    '\\\\partial_\\\\mu',
    '\\\\gamma',
    '\\\\Delta = 34.25',
    '\\\\propto',
    '\\\\partial_t',
  ];

  assert(state.katexCount >= expectedMathCount, `${label} should render every expected KaTeX node, got ${state.katexCount}`);
  assert(!state.previewHtml.includes('katex-error'), `${label} should not render KaTeX errors`);
  assert(!state.previewText.includes('$E = mc^2$'), `${label} should not show raw inline dollar math`);
  assert(!state.previewText.includes('$ F = ma $'), `${label} should not show raw spaced inline dollar math`);
  assert(!state.previewText.includes('\\$G = H\\$'), `${label} should not show raw escaped inline dollar math`);
  assert(!state.previewHtml.includes('\\\\['), `${label} should not contain raw opening bracket display delimiter`);
  assert(!state.previewHtml.includes('\\\\]'), `${label} should not contain raw closing bracket display delimiter`);

  for (const needle of rawMathNeedles) {
    assert(!state.plainTextOutsideKatex.includes(needle), `${label} should not leave raw TeX outside KaTeX: ${needle}`);
  }

  assert(state.previewHtml.includes('<strong>Q_EM = 137</strong>'), `${label} should keep bold prose math-like text as Markdown`);
  assert(!state.previewHtml.includes('annotation encoding="application/x-tex">This establishes'), `${label} should not feed the prose assignment sentence to KaTeX`);
  assert(state.plainTextOutsideKatex.includes('This establishes that the effective monopole strength'), `${label} should keep the assignment sentence outside KaTeX`);
  assert(state.plainTextOutsideKatex.includes('Q_EM = 137'), `${label} should keep the assignment value outside KaTeX`);
  assert(state.plainTextOutsideKatex.includes('The bare tensor fragment'), `${label} should keep bare tensor prose outside KaTeX`);
  assert(state.previewHtml.includes('\\mathbf{1493.5895634458918}'), `${label} should convert bold math answers to TeX bold`);
  assert(!state.previewHtml.includes('**1493.5895634458918**'), `${label} should not leave raw bold markers in math annotations`);
  assert(!state.previewHtml.includes('<mo>∗</mo><mo>∗</mo><mn>1493.5895634458918'), `${label} should not render bold markers as star operators`);

  assert(state.preview.width > 100, `${label} preview should be visible`);
  assert(state.preview.height > 100, `${label} preview should have height`);
  assert(state.preview.scrollHeight > state.preview.clientHeight, `${label} preview should be scrollable`);
  assert(state.preview.overflowY === 'auto' || state.preview.overflowY === 'scroll', `${label} preview overflow should allow vertical scrolling`);
}

function assertNoPreviewHorizontalOverflow(state, label) {
  assert(
    state.preview.scrollWidth <= state.preview.clientWidth + 1,
    `${label} preview should not have page-level horizontal overflow: scrollWidth ${state.preview.scrollWidth}, clientWidth ${state.preview.clientWidth}`
  );
  assert(
    state.preview.overflowX === 'hidden' || state.preview.overflowX === 'clip',
    `${label} preview overflow-x should hide page-level horizontal scrolling, got ${state.preview.overflowX}`
  );
}

function overflowingMathScroller(state, selector) {
  return state.mathScrollers.find((item) => {
    return item.selector === selector && item.scrollWidth > item.clientWidth + 1;
  });
}

function assertLocalMathScroller(state, label, selector) {
  const scroller = overflowingMathScroller(state, selector);
  assert(scroller, `${label} should have an oversized ${selector} math item with local horizontal overflow`);
  assert(
    scroller.overflowX === 'auto' || scroller.overflowX === 'scroll',
    `${label} oversized ${selector} math item should allow horizontal scrolling, got ${scroller.overflowX}`
  );
}

async function scrollFirstOverflowingMath(frame, selector) {
  return frame.evaluate((targetSelector) => {
    const scroller = Array.from(document.querySelectorAll(`#preview ${targetSelector}`))
      .find((element) => element.scrollWidth > element.clientWidth + 1);

    if (!scroller) {
      return null;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollLeft = maxScrollLeft;

    return {
      selector: targetSelector,
      scrollLeft: scroller.scrollLeft,
      maxScrollLeft,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
    };
  }, selector);
}

function assertMathCanScroll(scrollState, label, selector) {
  assert(scrollState, `${label} should find an overflowing ${selector} math item`);
  assert(scrollState.maxScrollLeft > 0, `${label} ${selector} should have horizontal scroll distance`);
  assert(scrollState.scrollLeft > 0, `${label} ${selector} should scroll horizontally when moved`);
}

function assertMathOverflowBehavior(state, label) {
  assertNoPreviewHorizontalOverflow(state, label);
  assertLocalMathScroller(state, label, '.katex-display');
  assertLocalMathScroller(state, label, 'eq > .katex');
}

function assertToolbarSearchLayout(state, label) {
  assert(state.modeButtons.width > 100, `${label} should show the mode controls`);
  assert(state.search.width > 70, `${label} should show the search input`);
  assert(state.modeButtons.left < state.search.left, `${label} should place mode controls left of search`);
  assert(Math.abs(state.modeButtons.top - state.search.top) <= 4, `${label} search should stay on the mode-control row`);
  assert(state.search.right <= state.header.right + 1, `${label} search input should stay inside the header`);
  assert(state.search.bottom <= state.header.bottom + 1, `${label} search input should stay inside the header vertically`);
}

function assertPreviewEditorHidden(state, label) {
  assert.strictEqual(state.mode, 'preview', `${label} should be in preview mode`);
  assert(state.editorPane.width <= 1, `${label} editor pane should have no visible width in preview mode`);
  assert.strictEqual(state.editorPane.overflow, 'hidden', `${label} editor pane should clip hidden editor layers`);
  assert.strictEqual(state.editorPane.visibility, 'hidden', `${label} editor pane should not paint hidden editor text`);
}

function assertSearchHighlights(state, label, options) {
  assert.strictEqual(state.search.value, 'effective', `${label} search input should keep the query`);
  assert(state.editorHighlightCount > 0, `${label} should render editor search highlights`);
  assert(state.editorHasSearchClass, `${label} editor should enter search-highlight mode`);
  assert(state.editorHighlightActive, `${label} editor highlight layer should be active`);

  if (options.editorVisible) {
    assert(state.editor.width > 100, `${label} editor should be visible`);
    assert(state.editorHighlights.width > 100, `${label} editor highlights should be visible`);
  }

  if (options.previewVisible) {
    assert(state.preview.width > 100, `${label} preview should be visible`);
    assert(state.previewHighlightCount > 0, `${label} should render preview search highlights`);
  }
}

function assertSearchCleared(state, label) {
  assert.strictEqual(state.search.value, '', `${label} search input should be empty`);
  assert.strictEqual(state.editorHighlightCount, 0, `${label} should clear editor highlights`);
  assert.strictEqual(state.previewHighlightCount, 0, `${label} should clear preview highlights`);
  assert(!state.editorHasSearchClass, `${label} editor should leave search-highlight mode`);
  assert(!state.editorHighlightActive, `${label} editor highlight layer should be inactive`);
}

async function assertMathScrollsLocally(frame, label) {
  assertMathCanScroll(await scrollFirstOverflowingMath(frame, '.katex-display'), label, '.katex-display');
  assertMathCanScroll(await scrollFirstOverflowingMath(frame, 'eq > .katex'), label, 'eq > .katex');
}

(async () => {
  const server = createServer();
  const port = await listen(server);
  const browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 620 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

    const frame = await page.waitForFrame((candidate) => candidate.url().includes('/dist/index.html'));
    await waitForEditorValue(frame, noteText);
    await frame.waitForSelector('#preview .katex', { timeout: 10000 });
    const initialPreview = await paneState(frame);
    assert.strictEqual(initialPreview.mode, 'preview', 'Non-empty note should default to Preview mode');
    assertPreviewHasMath(initialPreview, 'Initial Preview mode');
    assertMathOverflowBehavior(initialPreview, 'Initial Preview mode');
    await assertMathScrollsLocally(frame, 'Initial Preview mode');

    const saveCountBeforeSearch = await saveItemMessageCount(page);
    await setSearchQuery(frame, 'effective');
    const searchedPreview = await paneState(frame);
    assertToolbarSearchLayout(searchedPreview, 'Preview mode search');
    assertSearchHighlights(searchedPreview, 'Preview mode search', { editorVisible: false, previewVisible: true });
    const saveCountAfterSearch = await saveItemMessageCount(page);
    assert.strictEqual(saveCountAfterSearch, saveCountBeforeSearch, 'Search input should not send save-items messages');

    await clickMode(frame, 'Edit');
    const searchedEdit = await paneState(frame);
    assertSearchHighlights(searchedEdit, 'Edit mode search', { editorVisible: true, previewVisible: false });

    await clickMode(frame, 'Split');
    const searchedSplit = await paneState(frame);
    assertSearchHighlights(searchedSplit, 'Split mode search', { editorVisible: true, previewVisible: true });

    await setSearchQuery(frame, '');
    const clearedSearch = await paneState(frame);
    assertSearchCleared(clearedSearch, 'Cleared search');
    const saveCountBeforeModeClicks = await saveItemMessageCount(page);

    await clickMode(frame, 'Edit');
    const initialEdit = await paneState(frame);
    assert(initialEdit.editor.width > 100, 'Edit mode editor should be visible after switching from default Preview');
    assert(initialEdit.editor.scrollHeight > initialEdit.editor.clientHeight, 'Edit mode editor should be scrollable after switching from default Preview');
    assert(initialEdit.editor.overflowY === 'auto' || initialEdit.editor.overflowY === 'scroll', 'Edit mode editor overflow should allow scrolling after switching from default Preview');

    const editSourceRatio = 0.58;
    await setPaneScroll(frame, 'editor', editSourceRatio);

    await clickMode(frame, 'Preview');
    const preview = await paneState(frame);
    assertPreviewHasMath(preview, 'Preview mode');
    assertMathOverflowBehavior(preview, 'Preview mode');
    await assertMathScrollsLocally(frame, 'Preview mode');
    assertScrollRatioClose(preview.preview, editSourceRatio, 'Edit to Preview');

    const previewSourceRatio = 0.34;
    await setPaneScroll(frame, 'preview', previewSourceRatio);

    await clickMode(frame, 'Split');
    const split = await paneState(frame);
    assertPreviewHasMath(split, 'Split mode');
    assertMathOverflowBehavior(split, 'Split mode');
    await assertMathScrollsLocally(frame, 'Split mode');
    assert(split.editor.width > 100, 'Split mode editor should be visible');
    assert(split.editor.scrollHeight > split.editor.clientHeight, 'Split mode editor should be scrollable');
    assert(split.editor.overflowY === 'auto' || split.editor.overflowY === 'scroll', 'Split mode editor overflow should allow scrolling');
    assertScrollRatioClose(split.editor, previewSourceRatio, 'Preview to Split editor');
    assertScrollRatioClose(split.preview, previewSourceRatio, 'Preview to Split preview');

    await setPaneScroll(frame, 'editor', 0.82);
    const independentSplit = await paneState(frame);
    assertScrollRatioClose(independentSplit.editor, 0.82, 'Split editor manual scroll');
    assertScrollRatioClose(independentSplit.preview, previewSourceRatio, 'Split preview independent scroll');

    await clickMode(frame, 'Edit');
    const edit = await paneState(frame);
    assert(edit.editor.width > 100, 'Edit mode editor should be visible');
    assert(edit.editor.scrollHeight > edit.editor.clientHeight, 'Edit mode editor should be scrollable');
    assert(edit.editor.overflowY === 'auto' || edit.editor.overflowY === 'scroll', 'Edit mode editor overflow should allow scrolling');
    assertScrollRatioClose(edit.editor, 0.82, 'Split to Edit');

    const saveCountAfterModeClicks = await saveItemMessageCount(page);
    assert.strictEqual(saveCountAfterModeClicks, saveCountBeforeModeClicks, 'Mode switches should not send save-items messages');

    await appendEditorText(frame, '\nActual text edit: $y^2$');
    const saveCountAfterTextEdit = await saveItemMessageCount(page);
    assert(saveCountAfterTextEdit > saveCountAfterModeClicks, 'Text input should still send save-items messages');

    await clickMode(frame, 'Preview');
    const saveCountAfterFinalModeClick = await saveItemMessageCount(page);
    assert.strictEqual(saveCountAfterFinalModeClick, saveCountAfterTextEdit, 'Final mode click should not send save-items messages');

    const desktopFinalPreview = await paneState(frame);
    assertToolbarSearchLayout(desktopFinalPreview, 'Desktop final Preview mode');
    assertPreviewEditorHidden(desktopFinalPreview, 'Desktop final Preview mode');

    await page.setViewport({ width: 430, height: 780 });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const mobilePreview = await paneState(frame);
    assertToolbarSearchLayout(mobilePreview, 'Narrow Preview mode');
    assertPreviewEditorHidden(mobilePreview, 'Narrow Preview mode');

    await page.setViewport({ width: 1000, height: 620 });
    await new Promise((resolve) => setTimeout(resolve, 350));

    await setStaleStoredModeForNote(page, 'note-1', 0);
    const restoredFrame = await reloadPluginForNote(page, 'note-1');
    await waitForEditorValue(restoredFrame, noteText);
    const restored = await paneState(restoredFrame);
    assert.strictEqual(restored.mode, 'preview', 'Reopened non-empty note should default to Preview even when stale local mode says Edit');
    assertPreviewHasMath(restored, 'Reopened default Preview mode');
    assertMathOverflowBehavior(restored, 'Reopened default Preview mode');
    await assertMathScrollsLocally(restoredFrame, 'Reopened default Preview mode');

    await setStaleStoredModeForNote(page, 'note-2', 2);
    const emptyFrame = await reloadPluginForNote(page, 'note-2');
    await waitForEditorSpellcheck(emptyFrame, 'false');
    const empty = await paneState(emptyFrame);
    assert.strictEqual(empty.editorValue, emptyNoteText, 'Empty note should load empty editor text');
    assert.strictEqual(empty.mode, 'edit', 'Empty note should default to Edit even when stale local mode says Preview');

    const saveCountAfterDefaultModeLoads = await saveItemMessageCount(page);
    assert.strictEqual(saveCountAfterDefaultModeLoads, saveCountAfterFinalModeClick, 'Default mode selection should not send save-items messages');

    console.log('Browser smoke test passed: built plugin renders KaTeX, search highlights, mode switches stay local, text edits save, panes are scrollable, oversized math scrolls locally, and content-based default modes work.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
