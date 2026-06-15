const fs = require('fs');
const path = require('path');
const assert = require('assert');
const MarkdownIt = require('markdown-it');
const texmath = require('markdown-it-texmath');
const katex = require('katex');
const normalizeMathDelimiters = require('../app/lib/normalizeMathDelimiters');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function expectIncludes(text, needle, label) {
  assert(
    text.includes(needle),
    `${label} should include ${needle}`
  );
}

function assertRenderedKatex(html, label) {
  expectIncludes(html, 'class="katex"', label);
  assert(!html.includes('katex-error'), `${label} should not render a KaTeX error`);
}

function blockFor(source, selector, fromIndex = 0) {
  const selectorIndex = source.indexOf(selector, fromIndex);
  assert(selectorIndex !== -1, `Missing CSS selector ${selector}`);

  const start = source.indexOf('{', selectorIndex);
  assert(start !== -1, `Missing opening brace for ${selector}`);

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') {
      depth += 1;
    } else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start + 1, i);
      }
    }
  }

  throw new Error(`Missing closing brace for ${selector}`);
}

function assertKatexRendering() {
  const markdown = MarkdownIt({
    linkify: true,
    breaks: true,
  })
    .use(require('markdown-it-footnote'))
    .use(require('markdown-it-task-lists'))
    .use(texmath, {
      engine: katex,
      delimiters: ['dollars', 'brackets'],
      katexOptions: {
        throwOnError: false,
        strict: false,
        trust: false,
      },
    })
    .use(require('markdown-it-highlightjs'));

  const samples = [
    ['inline dollar math', 'Inline $E = mc^2$ done'],
    ['display dollar math', '$$\na^2 + b^2 = c^2\n$$'],
    ['inline bracket math', '\\(E = mc^2\\)'],
    ['inline bracket greek command in sentence', 'The cross-coupling term \\(\\gamma\\) exists because...'],
    ['inline bracket Delta command in sentence', 'A central mass sources these fields through its geometric slip \\(\\Delta = 34.25\\).'],
    ['inline bracket proportional command in sentence', 'Since \\(L_0(r) \\propto -K/r\\), we...'],
    ['inline bracket partial command in sentence', 'We consider static solutions \\(\\partial_t = 0\\).'],
    ['single-line display bracket math', '\\[a^2 + b^2 = c^2\\]'],
    ['multiline display bracket math', '\\[\na^2 + b^2 = c^2\n\\]'],
    ['spaced inline dollar math', 'Inline $ E = mc^2 $ done'],
    ['escaped inline dollar math', 'Inline \\$F = ma\\$ done'],
    ['escaped display dollar math', '\\$\\$\na^2 + b^2 = c^2\n\\$\\$'],
    ['double escaped inline bracket math', '\\\\(E = mc^2\\\\)'],
    ['double escaped display bracket math', '\\\\[\na^2 + b^2 = c^2\n\\\\]'],
    ['standalone Einstein tensor line', 'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}'],
    ['standalone Ricci tensor line', 'R_{\\mu\\nu} - \\tfrac{1}{2} R, g_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}'],
    ['standalone multiline Christoffel block', '\\Gamma^{\\lambda}_{\\mu\\nu} = \\tfrac{1}{2} g^{\\lambda\\sigma}\\left(\\partial_\\mu g_{\\nu\\sigma} +\n\\partial_\\nu g_{\\mu\\sigma} - \\partial_\\sigma g_{\\mu\\nu}\\right)'],
  ];

  for (const [label, input] of samples) {
    const html = markdown.render(normalizeMathDelimiters(input));
    assertRenderedKatex(html, label);
    assert(!html.includes(`<p>${input}`), `${label} should not remain a raw Markdown paragraph`);
  }

  const fencedHtml = markdown.render(normalizeMathDelimiters('```text\n\\frac{1}{2}\n```'));
  assert(!fencedHtml.includes('class="katex'), 'fenced TeX should not be auto-rendered as math');
}

function assertCacheVersions() {
  const pkg = JSON.parse(read('package.json'));
  const version = pkg.version;
  assert(/^\d+\.\d+\.\d+$/.test(version), 'package version should be semver-like');
  expectIncludes(pkg.scripts.smoke, 'node scripts/smoke-test.js', 'package smoke script');
  expectIncludes(pkg.scripts.smoke, 'node scripts/browser-smoke-test.js', 'package smoke script');

  const lock = JSON.parse(read('package-lock.json'));
  assert.strictEqual(lock.version, version, 'package-lock root version should match package.json');
  assert.strictEqual(lock.packages[''].version, version, 'package-lock package version should match package.json');

  const ext = JSON.parse(readRepo('ext.json'));
  assert.strictEqual(ext.version, version, 'ext.json version should match package.json');
  expectIncludes(ext.url, `?v=${version}`, 'ext.json component URL');

  const appIndex = read('app/index.html');
  expectIncludes(appIndex, `dist.css?v=${version}`, 'app/index.html');
  expectIncludes(appIndex, `dist.js?v=${version}`, 'app/index.html');

  const distIndex = read('dist/index.html');
  expectIncludes(distIndex, `dist.css?v=${version}`, 'dist/index.html');
  expectIncludes(distIndex, `dist.js?v=${version}`, 'dist/index.html');

  const readme = readRepo('README.md');
  expectIncludes(readme, `ext.json?v=${version}`, 'README.md');
  expectIncludes(readme, `index.html?v=${version}`, 'README.md');
}

function assertScrollbarCss() {
  const scss = read('app/stylesheets/main.scss');

  const rootWrapper = blockFor(scss, 'body > div,\nbody > div > div');
  expectIncludes(rootWrapper, 'height: 100%;', 'root wrapper CSS');
  expectIncludes(rootWrapper, 'min-height: 0;', 'root wrapper CSS');
  assert(
    !/body\s*>\s*div\s*>\s*div\s*\{[^}]*display:\s*flex/s.test(scss),
    'root wrapper must not force display:flex on the React wrapper'
  );

  const sharedSelector = '#editor,\n#preview';
  const sharedPane = blockFor(scss, sharedSelector);
  expectIncludes(sharedPane, 'overflow: auto;', 'shared editor/preview CSS');
  expectIncludes(sharedPane, 'scrollbar-width: thin;', 'shared editor/preview CSS');

  const sharedIndex = scss.indexOf(sharedSelector);
  const editor = blockFor(scss, '#editor {', sharedIndex + sharedSelector.length);
  expectIncludes(editor, '&.split', 'editor CSS');
  expectIncludes(editor, 'width: calc(50% - 4px);', 'editor split CSS');
  expectIncludes(editor, '&.preview', 'editor CSS');
  expectIncludes(editor, 'width: 0 !important;', 'editor preview CSS');
  assert(!/&\.preview\s*\{[^}]*display:\s*none/s.test(editor), 'editor preview mode should not use display:none');

  const preview = blockFor(scss, '#preview {', sharedIndex + sharedSelector.length);
  expectIncludes(preview, '&.split', 'preview CSS');
  expectIncludes(preview, 'width: calc(50% - 4px);', 'preview split CSS');
  expectIncludes(preview, '&.preview', 'preview CSS');
  expectIncludes(preview, 'width: 100% !important;', 'preview mode CSS');
  expectIncludes(preview, 'overflow: auto;', 'preview CSS');
  expectIncludes(preview, 'overflow-x: hidden;', 'preview CSS');
  expectIncludes(preview, 'overflow-y: auto;', 'preview CSS');
  expectIncludes(preview, 'flex: 1;', 'preview CSS');
  assert(!/&\.edit\s*\{[^}]*display:\s*none/s.test(preview), 'preview edit mode should not use display:none');

  const mathWrapperSelector = 'section,\n  eq,\n  eqn';
  const mathWrapper = blockFor(preview, mathWrapperSelector);
  expectIncludes(mathWrapper, 'max-width: 100%;', 'math wrapper CSS');

  const inlineWrapper = blockFor(preview, 'eq {');
  expectIncludes(inlineWrapper, 'display: inline-block;', 'inline math wrapper CSS');
  expectIncludes(inlineWrapper, 'vertical-align: middle;', 'inline math wrapper CSS');

  const blockWrapper = blockFor(preview, 'eqn {', preview.indexOf(mathWrapperSelector) + mathWrapperSelector.length);
  expectIncludes(blockWrapper, 'display: block;', 'display math wrapper CSS');

  const mathScrollerSelector = 'eq > .katex,\n  .katex-display';
  const mathScroller = blockFor(preview, mathScrollerSelector);
  expectIncludes(mathScroller, 'max-width: 100%;', 'math scroller CSS');
  expectIncludes(mathScroller, 'overflow-x: auto;', 'math scroller CSS');
  expectIncludes(mathScroller, 'overflow-y: hidden;', 'math scroller CSS');
  expectIncludes(mathScroller, 'scrollbar-width: thin;', 'math scroller CSS');

  const displayMath = blockFor(preview, '.katex-display {', preview.indexOf(mathScrollerSelector) + mathScrollerSelector.length);
  expectIncludes(displayMath, 'text-align: left;', 'display math scroller CSS');

  const displayKatex = blockFor(preview, '.katex-display > .katex');
  expectIncludes(displayKatex, 'display: inline-block;', 'display KaTeX CSS');
  expectIncludes(displayKatex, 'min-width: 100%;', 'display KaTeX CSS');
  expectIncludes(displayKatex, 'text-align: center;', 'display KaTeX CSS');
}

assertKatexRendering();
assertCacheVersions();
assertScrollbarCss();

console.log('Smoke test passed: KaTeX rendering, cache versions, and scrollbar CSS invariants are valid.');
