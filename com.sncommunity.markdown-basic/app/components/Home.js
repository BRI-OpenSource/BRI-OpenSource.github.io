import React from 'react';
import ComponentRelay from '@standardnotes/component-relay';
const MarkdownIt = require('markdown-it');
const texmath = require('markdown-it-texmath');
const katex = require('katex');
const normalizeMathDelimiters = require('../lib/normalizeMathDelimiters');

const EditMode = 0;
const SplitMode = 1;
const PreviewMode = 2;
const SearchHighlightClass = 'search-highlight';

export default class Home extends React.Component {

  constructor(props) {
    super(props);

    this.modes = [
      { mode: EditMode, label: 'Edit', css: 'edit' },
      { mode: SplitMode, label: 'Split', css: 'split' },
      { mode: PreviewMode, label: 'Preview', css: 'preview' },
    ];

    this.state = {
      mode: this.modes[0],
      searchQuery: '',
    };
    this.modeInitializedForNoteUuid = null;
  }

  componentDidMount() {
    this.simpleMarkdown = document.getElementById('simple-markdown');
    this.editorPane = document.getElementById('editor-pane');
    this.editor = document.getElementById('editor');
    this.editorHighlights = document.getElementById('editor-highlights');
    this.preview = document.getElementById('preview');

    this.configureMarkdown();
    this.connectToBridge();
    this.updatePreviewText();
    this.addChangeListener();
    this.addEditorScrollListener();

    this.configureResizer();
    this.addTabHandler();
  }

  setModeFromModeValue(value) {
    for (let mode of this.modes) {
      if (mode.mode == value) {
        this.setState({ mode });
        return;
      }
    }
  }

  defaultModeForNote(note) {
    const text = note && note.content ? note.content.text : '';
    return text && text.trim().length > 0 ? PreviewMode : EditMode;
  }

  scrollRatioForElement(element) {
    if (!element) {
      return 0;
    }

    const maxScrollTop = element.scrollHeight - element.clientHeight;
    if (maxScrollTop <= 0) {
      return 0;
    }

    const ratio = element.scrollTop / maxScrollTop;
    if (!Number.isFinite(ratio)) {
      return 0;
    }

    return Math.min(1, Math.max(0, ratio));
  }

  scrollSourceForModeChange(nextMode) {
    if (this.state.mode && this.state.mode.mode === SplitMode) {
      return nextMode.mode === PreviewMode ? this.preview : this.editor;
    }

    if (this.state.mode && this.state.mode.mode === PreviewMode) {
      return this.preview;
    }

    return this.editor;
  }

  scrollTargetsForMode(mode) {
    if (mode.mode === SplitMode) {
      return [this.editor, this.preview];
    }

    if (mode.mode === PreviewMode) {
      return [this.preview];
    }

    return [this.editor];
  }

  applyScrollRatioToMode(mode, ratio) {
    const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;

    for (const target of this.scrollTargetsForMode(mode)) {
      if (!target) {
        continue;
      }

      const maxScrollTop = target.scrollHeight - target.clientHeight;
      target.scrollTop = maxScrollTop > 0 ? maxScrollTop * safeRatio : 0;
    }

    this.syncEditorHighlightsScroll();
  }

  applyScrollRatioAfterLayout(mode, ratio) {
    const apply = () => this.applyScrollRatioToMode(mode, ratio);

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(apply);
    } else {
      window.setTimeout(apply, 0);
    }
  }

  changeMode(mode) {
    const scrollRatio = this.scrollRatioForElement(this.scrollSourceForModeChange(mode));

    this.setState({ mode }, () => {
      this.updatePreviewText();
      this.applyScrollRatioAfterLayout(mode, scrollRatio);
    });
  }

  handleModeKeyDown(event, mode) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.changeMode(mode);
    }
  }

  configureMarkdown() {
    const markdownitOptions = {
      // automatically render raw links as anchors.
      linkify: true,
      // Convert '\n' in paragraphs into <br>
      breaks: true
    };

    this.markdown = MarkdownIt(markdownitOptions)
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

    // Remember old renderer, if overriden, or proxy to default renderer
    const defaultRender = this.markdown.renderer.rules.link_open || ((tokens, idx, options, env, self) => {
      return self.renderToken(tokens, idx, options);
    });

    this.markdown.renderer.rules.link_open = ((tokens, idx, options, env, self) => {
      // If you are sure other plugins can't add `target` - drop check below
      const aIndex = tokens[idx].attrIndex('target');

      if (aIndex < 0) {
        tokens[idx].attrPush(['target', '_blank']); // add new attribute
      } else {
        tokens[idx].attrs[aIndex][1] = '_blank';    // replace value of existing attr
      }

      // pass token to default renderer.
      return defaultRender(tokens, idx, options, env, self);
    });
  }

  connectToBridge() {
    this.componentRelay = new ComponentRelay({
      targetWindow: window,
      onReady: () => {
        const { platform } = this.componentRelay;
        this.setState({ platform });
      },
      handleRequestForContentHeight: () => {
        return undefined
      },
    });

    this.componentRelay.streamContextItem((note) => {
      const noteUuid = note && note.uuid;
      this.note = note;

      // Only update UI on non-metadata updates.
      if (note.isMetadataUpdate) {
        return;
      }

      if (this.modeInitializedForNoteUuid !== noteUuid) {
        this.setModeFromModeValue(this.defaultModeForNote(note));
        this.modeInitializedForNoteUuid = noteUuid;
      }

      this.editor.value = note.content.text;
      this.updatePreviewText();

      this.editor.setAttribute(
        'spellcheck',
        JSON.stringify(note.content.spellcheck)
      );
    });
  }

  truncateString(string, limit = 80) {
    if (!string) {
      return null;
    }
    if (string.length <= limit) {
      return string;
    } else {
      return string.substring(0, limit) + '...';
    }
  }

  renderMarkdown(text) {
    return this.markdown.render(normalizeMathDelimiters(text));
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  searchQuery() {
    return (this.state.searchQuery || '').trim();
  }

  hasSearchQuery() {
    return this.searchQuery().length > 0;
  }

  highlightPlainText(text, query) {
    const pattern = new RegExp(this.escapeRegExp(query), 'gi');
    let result = '';
    let lastIndex = 0;
    let match = pattern.exec(text);

    while (match) {
      result += this.escapeHtml(text.slice(lastIndex, match.index));
      result += `<mark class="${SearchHighlightClass}">${this.escapeHtml(match[0])}</mark>`;
      lastIndex = pattern.lastIndex;
      match = pattern.exec(text);
    }

    result += this.escapeHtml(text.slice(lastIndex));
    return result;
  }

  updateEditorHighlights(text) {
    if (!this.editor || !this.editorHighlights) {
      return;
    }

    const query = this.searchQuery();
    const hasQuery = query.length > 0;
    this.editor.classList.toggle('has-search-query', hasQuery);
    this.editorHighlights.classList.toggle('active', hasQuery);

    if (!hasQuery) {
      this.editorHighlights.innerHTML = '';
      return;
    }

    const displayText = text.endsWith('\n') ? `${text} ` : text;
    this.editorHighlights.innerHTML = this.highlightPlainText(displayText, query);
    this.syncEditorHighlightsScroll();
  }

  syncEditorHighlightsScroll() {
    if (!this.editor || !this.editorHighlights) {
      return;
    }

    this.editorHighlights.scrollTop = this.editor.scrollTop;
    this.editorHighlights.scrollLeft = this.editor.scrollLeft;
  }

  addEditorScrollListener() {
    this.editor.addEventListener('scroll', () => {
      this.syncEditorHighlightsScroll();
    });
  }

  shouldHighlightPreviewNode(node) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue || !node.nodeValue.trim()) {
      return false;
    }

    if (parent.closest(`.${SearchHighlightClass}, script, style, textarea, .katex-mathml`)) {
      return false;
    }

    return true;
  }

  highlightPreviewTextNode(node, pattern) {
    const text = node.nodeValue;
    pattern.lastIndex = 0;
    const firstMatch = pattern.exec(text);

    if (!firstMatch) {
      return;
    }

    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match = pattern.exec(text);

    while (match) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const mark = document.createElement('mark');
      mark.className = SearchHighlightClass;
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = pattern.lastIndex;
      match = pattern.exec(text);
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode.replaceChild(fragment, node);
  }

  highlightPreviewMatches() {
    const query = this.searchQuery();
    if (!query || !this.preview) {
      return;
    }

    const pattern = new RegExp(this.escapeRegExp(query), 'gi');
    const walker = document.createTreeWalker(this.preview, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        return this.shouldHighlightPreviewNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let node = walker.nextNode();

    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }

    for (const textNode of nodes) {
      this.highlightPreviewTextNode(textNode, pattern);
    }
  }

  renderPreviewText(text) {
    this.preview.innerHTML = this.renderMarkdown(text);
    this.highlightPreviewMatches();
  }

  updatePreviewText() {
    const text = this.editor.value || '';
    this.renderPreviewText(text);
    this.updateEditorHighlights(text);
    return text;
  }

  handleSearchChange(event) {
    this.setState({ searchQuery: event.target.value }, () => {
      this.updatePreviewText();
    });
  }

  addChangeListener() {
    document.getElementById('editor').addEventListener('input', () => {
      if (this.note) {
        // Be sure to capture this object as a variable, as this.note may be reassigned in `streamContextItem`, so by the time
        // you modify it in the presave block, it may not be the same object anymore, so the presave values will not be applied to
        // the right object, and it will save incorrectly.
        let note = this.note;

        this.componentRelay.saveItemWithPresave(note, () => {
          note.content.text = this.updatePreviewText();
          note.content.preview_plain = this.truncateString(this.preview.textContent || this.preview.innerText);
          note.content.preview_html = null;
        });
      }
    });
  }

  removeSelection() {
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    } else if (document.selection) {
      document.selection.empty();
    }
  }

  configureResizer() {
    let pressed = false;
    const columnResizer = document.getElementById('column-resizer');
    const resizerWidth = columnResizer.offsetWidth;
    const safetyOffset = 15;

    columnResizer.addEventListener('mousedown', () => {
      pressed = true;
      columnResizer.classList.add('dragging');
      this.editor.classList.add('no-selection');
    });

    document.addEventListener('mousemove', (event) => {
      if (!pressed) {
        return;
      }

      let x = event.clientX;
      if (x < resizerWidth / 2 + safetyOffset) {
        x = resizerWidth / 2 + safetyOffset;
      } else if (x > this.simpleMarkdown.offsetWidth - resizerWidth - safetyOffset) {
        x = this.simpleMarkdown.offsetWidth - resizerWidth - safetyOffset;
      }

      const colLeft = x - resizerWidth / 2;
      columnResizer.style.left = colLeft + 'px';
      this.editorPane.style.width = (colLeft - safetyOffset) + 'px';

      this.removeSelection();
    });

    document.addEventListener('mouseup', () => {
      if (pressed) {
        pressed = false;
        columnResizer.classList.remove('dragging');
        this.editor.classList.remove('no-selection');
      }
    });
  }

  addTabHandler() {
    // Tab handler
    this.editor.addEventListener('keydown', (event) => {
      if (!event.shiftKey && event.which == 9) {
        event.preventDefault();

        // Using document.execCommand gives us undo support
        if (!document.execCommand('insertText', false, '\t')) {
          // document.execCommand works great on Chrome/Safari but not Firefox
          const start = this.selectionStart;
          const end = this.selectionEnd;
          const spaces = '    ';

          // Insert 4 spaces
          this.value = this.value.substring(0, start)
            + spaces + this.value.substring(end);

          // Place cursor 4 spaces away from where
          // the tab key was pressed
          this.selectionStart = this.selectionEnd = start + 4;
        }
      }
    });
  }

  render() {
    return (
      <div id="simple-markdown" className={`sn-component ${this.state.platform}`}>
        <div id="header">
          <div className="toolbar">
            <div className="segmented-buttons-container sk-segmented-buttons">
              <div className="buttons">
                {this.modes.map(mode =>
                  <div
                    key={mode.mode}
                    onClick={() => this.changeMode(mode)}
                    onKeyDown={(event) => this.handleModeKeyDown(event, mode)}
                    className={`sk-button button ${this.state.mode == mode ? 'selected info' : 'sk-secondary-contrast'}`}
                    role="button"
                    tabIndex="0"
                    aria-pressed={this.state.mode == mode}
                  >
                    <div className="sk-label">
                      {mode.label}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="search-container">
              <input
                id="note-search"
                className="search-input"
                type="search"
                aria-label="Search note text"
                placeholder="Search"
                autoComplete="off"
                value={this.state.searchQuery}
                onChange={(event) => this.handleSearchChange(event)}
              />
            </div>
          </div>
        </div>

        <div id="editor-container" className={this.state.mode.css}>
          <div id="editor-pane" className={this.state.mode.css}>
            <div dir="auto" id="editor-highlights" className={this.state.mode.css} aria-hidden="true"></div>
            <textarea dir="auto" id="editor" className={this.state.mode.css}></textarea>
          </div>
          <div id="column-resizer" className={this.state.mode.css}></div>
          <div id="preview" className={this.state.mode.css}></div>
        </div>
      </div>
    );
  }
}
