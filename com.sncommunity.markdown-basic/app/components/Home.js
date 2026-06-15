import React from 'react';
import ComponentRelay from '@standardnotes/component-relay';
const MarkdownIt = require('markdown-it');
const texmath = require('markdown-it-texmath');
const katex = require('katex');
const normalizeMathDelimiters = require('../lib/normalizeMathDelimiters');

const EditMode = 0;
const SplitMode = 1;
const PreviewMode = 2;

export default class Home extends React.Component {

  constructor(props) {
    super(props);

    this.modes = [
      { mode: EditMode, label: 'Edit', css: 'edit' },
      { mode: SplitMode, label: 'Split', css: 'split' },
      { mode: PreviewMode, label: 'Preview', css: 'preview' },
    ];

    this.state = { mode: this.modes[0] };
  }

  componentDidMount() {
    this.simpleMarkdown = document.getElementById('simple-markdown');
    this.editor = document.getElementById('editor');
    this.preview = document.getElementById('preview');

    this.configureMarkdown();
    this.connectToBridge();
    this.updatePreviewText();
    this.addChangeListener();

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

  modeStorageKey(note) {
    if (!note || !note.uuid) {
      return null;
    }

    return `snlatex.mode.${note.uuid}`;
  }

  modeStorage() {
    try {
      return window.localStorage;
    } catch (_error) {
      return null;
    }
  }

  loadStoredMode(note) {
    const key = this.modeStorageKey(note);
    const storage = this.modeStorage();
    if (!key || !storage) {
      return EditMode;
    }

    try {
      const value = storage.getItem(key);
      const modeValue = value === null ? EditMode : Number(value);
      return this.modes.some((mode) => mode.mode === modeValue) ? modeValue : EditMode;
    } catch (_error) {
      return EditMode;
    }
  }

  storeMode(mode) {
    const key = this.modeStorageKey(this.note);
    const storage = this.modeStorage();
    if (!key || !storage) {
      return;
    }

    try {
      storage.setItem(key, String(mode.mode));
    } catch (_error) {
      // Local mode persistence is best-effort; note content must never depend on it.
    }
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
    this.storeMode(mode);
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
      this.note = note;

      this.setModeFromModeValue(this.loadStoredMode(note));

      // Only update UI on non-metadata updates.
      if (note.isMetadataUpdate) {
        return;
      }

      this.editor.value = note.content.text;
      this.preview.innerHTML = this.renderMarkdown(note.content.text);

      document.getElementById('editor').setAttribute(
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

  updatePreviewText() {
    const text = this.editor.value || '';
    this.preview.innerHTML = this.renderMarkdown(text);
    return text;
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
      this.editor.style.width = (colLeft - safetyOffset) + 'px';

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
          <div className="segmented-buttons-container sk-segmented-buttons">
            <div className="buttons">
              {this.modes.map(mode =>
                <div key={mode} onClick={() => this.changeMode(mode)} className={`sk-button button ${this.state.mode == mode ? 'selected info' : 'sk-secondary-contrast'}`}>
                  <div className="sk-label">
                    {mode.label}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div id="editor-container" className={this.state.mode.css}>
          <textarea dir="auto" id="editor" className={this.state.mode.css}></textarea>
          <div id="column-resizer" className={this.state.mode.css}></div>
          <div id="preview" className={this.state.mode.css}></div>
        </div>
      </div>
    );
  }
}
