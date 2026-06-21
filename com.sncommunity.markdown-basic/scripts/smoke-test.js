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
    ['standalone symbolic assignment line', 'Q_EM = 137'],
    ['standalone symbolic assignment with bold answer', 'Q_EM = **141**'],
    ['standalone Einstein tensor line', 'G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}'],
    ['standalone Ricci tensor line', 'R_{\\mu\\nu} - \\tfrac{1}{2} R, g_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}'],
    ['standalone multiline Christoffel block', '\\Gamma^{\\lambda}_{\\mu\\nu} = \\tfrac{1}{2} g^{\\lambda\\sigma}\\left(\\partial_\\mu g_{\\nu\\sigma} +\n\\partial_\\nu g_{\\mu\\sigma} - \\partial_\\sigma g_{\\mu\\nu}\\right)'],
  ];

  for (const [label, input] of samples) {
    const html = markdown.render(normalizeMathDelimiters(input));
    assertRenderedKatex(html, label);
    assert(!html.includes(`<p>${input}`), `${label} should not remain a raw Markdown paragraph`);
  }

  const mathBoldSamples = [
    ['standalone bold answer', 'Q_EM = **141**'],
    ['inline bracket bold answer', '\\(x = **141**\\)'],
    ['display dollar bold answer', '$$\nx = **141**\n$$'],
    ['inline dollar bold answer', '$x = **141**$'],
  ];

  for (const [label, input] of mathBoldSamples) {
    const normalized = normalizeMathDelimiters(input);
    expectIncludes(normalized, '\\mathbf{141}', `${label} normalized math`);
    assert(!normalized.includes('**141**'), `${label} should remove Markdown bold markers before KaTeX`);
    const html = markdown.render(normalized);
    assertRenderedKatex(html, label);
    assert(!html.includes('**141**'), `${label} should not leave raw Markdown bold markers in rendered math`);
    assert(!html.includes('<mo>∗</mo>'), `${label} should not render bold markers as star operators`);
  }

  const proseSamples = [
    [
      'bold bare assignment in prose',
      'This establishes that the effective monopole strength in the twist channel is **Q_EM = 137**.',
      '<strong>Q_EM = 137</strong>',
    ],
    [
      'bare assignment in prose',
      'The charge value Q_EM = 137 remains dimensionless.',
      'The charge value Q_EM = 137 remains dimensionless.',
    ],
    [
      'bare tensor fragment in prose',
      'The field equation G_{\\mu\\nu} = 0 applies in vacuum.',
      'The field equation G_{\\mu\\nu} = 0 applies in vacuum.',
    ],
  ];

  for (const [label, input, expectedHtml] of proseSamples) {
    const normalized = normalizeMathDelimiters(input);
    assert.strictEqual(normalized, input, `${label} should not be normalized into display math`);
    const html = markdown.render(normalized);
    assert(!html.includes('class="katex"'), `${label} should not render as KaTeX`);
    assert(!html.includes('<section><eqn>'), `${label} should not render as a display math block`);
    expectIncludes(html, expectedHtml, label);
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

  const scrollPaneSelector = '#editor,\n#preview';
  const scrollPane = blockFor(scss, scrollPaneSelector);
  expectIncludes(scrollPane, 'overflow: auto;', 'shared editor/preview CSS');
  expectIncludes(scrollPane, 'scrollbar-width: thin;', 'shared editor/preview CSS');

  const sharedIndex = scss.indexOf(scrollPaneSelector);
  const editorPane = blockFor(scss, '#editor-pane {');
  expectIncludes(editorPane, 'position: relative;', 'editor pane CSS');
  expectIncludes(editorPane, 'overflow: hidden;', 'editor pane CSS');
  expectIncludes(editorPane, '&.split', 'editor pane CSS');
  expectIncludes(editorPane, 'width: calc(50% - 4px);', 'editor pane split CSS');
  expectIncludes(editorPane, '&.preview', 'editor pane CSS');
  expectIncludes(editorPane, 'width: 0 !important;', 'editor pane preview CSS');
  expectIncludes(editorPane, 'flex-basis: 0;', 'editor pane preview CSS');
  expectIncludes(editorPane, 'visibility: hidden;', 'editor pane preview CSS');
  assert(!/&\.preview\s*\{[^}]*display:\s*none/s.test(editorPane), 'editor pane preview mode should not use display:none');

  const mirroredEditorSelector = '#editor,\n#editor-highlights';
  const mirroredEditor = blockFor(scss, mirroredEditorSelector, scss.indexOf(mirroredEditorSelector) + mirroredEditorSelector.length);
  expectIncludes(mirroredEditor, 'position: absolute;', 'mirrored editor CSS');
  expectIncludes(mirroredEditor, 'white-space: pre-wrap;', 'mirrored editor CSS');
  expectIncludes(mirroredEditor, 'overflow-wrap: break-word;', 'mirrored editor CSS');

  const editor = blockFor(scss, '#editor {', sharedIndex + scrollPaneSelector.length);
  expectIncludes(editor, 'background-color: transparent;', 'editor CSS');
  expectIncludes(editor, '&.has-search-query', 'editor search CSS');
  expectIncludes(editor, 'caret-color: var(--sn-stylekit-editor-foreground-color);', 'editor search CSS');

  const editorHighlightsSelector = '#editor-highlights {';
  const editorHighlights = blockFor(scss, editorHighlightsSelector, scss.indexOf(editorHighlightsSelector) + editorHighlightsSelector.length);
  expectIncludes(editorHighlights, 'pointer-events: none;', 'editor highlight CSS');
  expectIncludes(editorHighlights, 'visibility: hidden;', 'editor highlight CSS');
  expectIncludes(editorHighlights, '&.active', 'editor highlight CSS');
  expectIncludes(editorHighlights, '&.selection-only', 'editor selection highlight CSS');

  const preview = blockFor(scss, '#preview {', sharedIndex + scrollPaneSelector.length);
  expectIncludes(preview, '&.split', 'preview CSS');
  expectIncludes(preview, 'width: calc(50% - 4px);', 'preview split CSS');
  expectIncludes(preview, '&.preview', 'preview CSS');
  expectIncludes(preview, 'width: 100% !important;', 'preview mode CSS');
  expectIncludes(preview, 'overflow: auto;', 'preview CSS');
  expectIncludes(preview, 'overflow-x: hidden;', 'preview CSS');
  expectIncludes(preview, 'overflow-y: auto;', 'preview CSS');
  expectIncludes(preview, 'flex: 1;', 'preview CSS');
  assert(!/&\.edit\s*\{[^}]*display:\s*none/s.test(preview), 'preview edit mode should not use display:none');

  const highlightSelector = '#editor-highlights,\n#preview';
  const highlightCss = blockFor(scss, highlightSelector, scss.indexOf(highlightSelector) + highlightSelector.length);
  const highlightMark = blockFor(highlightCss, '.search-highlight {');
  expectIncludes(highlightMark, 'background-color: rgba(255, 221, 87, 0.48);', 'search highlight CSS');
  expectIncludes(highlightMark, 'color: inherit;', 'search highlight CSS');
  const selectionMark = blockFor(highlightCss, '.selection-highlight {');
  expectIncludes(selectionMark, 'background-color: rgba(112, 88, 255, 0.34);', 'selection highlight CSS');
  expectIncludes(selectionMark, 'color: inherit;', 'selection highlight CSS');
  expectIncludes(highlightCss, '.search-highlight.selection-highlight', 'overlapping search/selection highlight CSS');

  const toolbar = blockFor(scss, '.toolbar {');
  expectIncludes(toolbar, 'justify-content: space-between;', 'toolbar CSS');
  expectIncludes(toolbar, 'gap: 8px;', 'toolbar CSS');
  expectIncludes(toolbar, 'flex-wrap: nowrap;', 'toolbar CSS');

  const segmentedButtons = blockFor(scss, '.segmented-buttons-container {');
  expectIncludes(segmentedButtons, 'justify-content: flex-start;', 'mode buttons alignment CSS');

  const modeButtons = blockFor(scss, '.buttons {');
  expectIncludes(modeButtons, 'overflow: hidden;', 'mode buttons CSS');
  expectIncludes(modeButtons, 'border-radius: 999px;', 'mode buttons CSS');
  expectIncludes(modeButtons, '-webkit-backdrop-filter: blur(12px);', 'mode buttons CSS');
  expectIncludes(modeButtons, 'backdrop-filter: blur(12px);', 'mode buttons CSS');

  const modeButton = blockFor(modeButtons, '.button {');
  expectIncludes(modeButton, 'margin-right: 0;', 'mode button CSS');
  expectIncludes(modeButton, 'border-right: 1px solid var(--sn-component-inner-border-color);', 'mode button CSS');
  expectIncludes(modeButton, '&:first-child', 'mode button CSS');
  expectIncludes(modeButton, '&:last-child', 'mode button CSS');

  const searchContainer = blockFor(scss, '.search-container {');
  expectIncludes(searchContainer, 'justify-content: flex-end;', 'search container CSS');
  expectIncludes(searchContainer, 'flex: 1 1 140px;', 'search container CSS');

  const searchField = blockFor(scss, '.search-field {');
  expectIncludes(searchField, 'position: relative;', 'search field CSS');
  expectIncludes(searchField, 'width: min(220px, 100%);', 'search field CSS');

  const searchIcon = blockFor(scss, '.search-icon {');
  expectIncludes(searchIcon, 'position: absolute;', 'search icon CSS');
  expectIncludes(searchIcon, 'pointer-events: none;', 'search icon CSS');
  expectIncludes(searchIcon, 'transform: translateY(-50%);', 'search icon CSS');

  const searchInput = blockFor(scss, '.search-input {');
  expectIncludes(searchInput, 'border-radius: 999px;', 'search input CSS');
  expectIncludes(searchInput, 'width: 100%;', 'search input CSS');
  expectIncludes(searchInput, 'padding: 4px 12px 4px 34px;', 'search input CSS');
  expectIncludes(searchInput, 'border: 1px solid var(--sn-component-inner-border-color);', 'search input CSS');
  expectIncludes(searchInput, 'box-shadow: inset 0 0 0 1px rgba(112, 88, 255, 0.08);', 'search input CSS');

  const mobileHeader = blockFor(scss, '@media (max-width: 520px)');
  const mobileToolbar = blockFor(mobileHeader, '.toolbar {');
  expectIncludes(mobileToolbar, 'gap: 6px;', 'mobile toolbar CSS');
  assert(!mobileToolbar.includes('flex-wrap: wrap;'), 'mobile toolbar should not force search onto a second row');
  const mobileSearchContainer = blockFor(mobileHeader, '.search-container {');
  expectIncludes(mobileSearchContainer, 'flex: 1 1 92px;', 'mobile search container CSS');

  const previewH1 = blockFor(preview, 'h1 {');
  expectIncludes(previewH1, 'font-size: 1.65em;', 'preview h1 CSS');

  const previewH2 = blockFor(preview, 'h2 {');
  expectIncludes(previewH2, 'font-size: 1.45em;', 'preview h2 CSS');

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
  expectIncludes(mathScroller, '-ms-overflow-style: none;', 'math scroller CSS');
  expectIncludes(mathScroller, 'scrollbar-width: none;', 'math scroller CSS');
  const webkitMathScroller = blockFor(mathScroller, '&::-webkit-scrollbar');
  expectIncludes(webkitMathScroller, 'display: none;', 'math scroller WebKit scrollbar CSS');

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
