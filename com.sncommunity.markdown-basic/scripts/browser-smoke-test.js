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
  '',
  'Display bracket:',
  '\\[',
  '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
  '\\]',
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
    iframe { width: 900px; height: 520px; border: 0; }
  </style>
</head>
<body>
  <iframe id="plugin" src="/dist/index.html"></iframe>
  <script>
    const noteText = ${JSON.stringify(noteText)};
    const iframe = document.getElementById('plugin');
    window.pluginMessages = [];

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
            item: {
              uuid: 'note-1',
              clientData: { mode: 0 },
              isMetadataUpdate: false,
              content: {
                text: noteText,
                spellcheck: true
              }
            }
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
      iframe.contentWindow.postMessage({
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
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const editorRect = editor.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
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

    return {
      mode: document.getElementById('editor-container').className,
      editorValue: editor.value,
      katexCount: preview.querySelectorAll('.katex').length,
      previewText: preview.textContent,
      previewHtml: preview.innerHTML,
      plainTextOutsideKatex: plainTextOutsideKatex(preview),
      editor: {
        width: editorRect.width,
        height: editorRect.height,
        scrollHeight: editor.scrollHeight,
        clientHeight: editor.clientHeight,
        overflowY: editorStyle.overflowY,
      },
      preview: {
        width: previewRect.width,
        height: previewRect.height,
        scrollHeight: preview.scrollHeight,
        clientHeight: preview.clientHeight,
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

async function appendEditorText(frame, text) {
  await frame.evaluate((textToAppend) => {
    const editor = document.getElementById('editor');
    editor.value += textToAppend;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await new Promise((resolve) => setTimeout(resolve, 350));
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

  assert(state.preview.width > 100, `${label} preview should be visible`);
  assert(state.preview.height > 100, `${label} preview should have height`);
  assert(state.preview.scrollHeight > state.preview.clientHeight, `${label} preview should be scrollable`);
  assert(state.preview.overflowY === 'auto' || state.preview.overflowY === 'scroll', `${label} preview overflow should allow scrolling`);
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
    await frame.waitForSelector('#preview .katex', { timeout: 10000 });
    const saveCountBeforeModeClicks = await saveItemMessageCount(page);

    await clickMode(frame, 'Split');
    const split = await paneState(frame);
    assertPreviewHasMath(split, 'Split mode');
    assert(split.editor.width > 100, 'Split mode editor should be visible');
    assert(split.editor.scrollHeight > split.editor.clientHeight, 'Split mode editor should be scrollable');
    assert(split.editor.overflowY === 'auto' || split.editor.overflowY === 'scroll', 'Split mode editor overflow should allow scrolling');

    await clickMode(frame, 'Preview');
    const preview = await paneState(frame);
    assertPreviewHasMath(preview, 'Preview mode');

    await clickMode(frame, 'Edit');
    const edit = await paneState(frame);
    assert(edit.editor.width > 100, 'Edit mode editor should be visible');
    assert(edit.editor.scrollHeight > edit.editor.clientHeight, 'Edit mode editor should be scrollable');
    assert(edit.editor.overflowY === 'auto' || edit.editor.overflowY === 'scroll', 'Edit mode editor overflow should allow scrolling');

    const saveCountAfterModeClicks = await saveItemMessageCount(page);
    assert.strictEqual(saveCountAfterModeClicks, saveCountBeforeModeClicks, 'Mode switches should not send save-items messages');

    await appendEditorText(frame, '\nActual text edit: $y^2$');
    const saveCountAfterTextEdit = await saveItemMessageCount(page);
    assert(saveCountAfterTextEdit > saveCountAfterModeClicks, 'Text input should still send save-items messages');

    console.log('Browser smoke test passed: built plugin renders KaTeX, mode switches stay local, text edits save, and panes are scrollable.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
