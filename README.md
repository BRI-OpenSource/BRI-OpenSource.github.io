# SNLATEX Markdown Editor

SNLATEX is a public Standard Notes editor plugin for writing Markdown with live preview and KaTeX-powered LaTeX math rendering.

It is based on the Standard Notes community Basic Markdown editor and adds support for common math syntax used by AI tools and technical notes, including inline math and display math.

## Install

Import this extension URL in Standard Notes:

```text
https://bri-opensource.github.io/ext.json
```

The manifest points Standard Notes to the hosted plugin component:

```text
https://bri-opensource.github.io/com.sncommunity.markdown-basic/dist/index.html
```

## Features

- Markdown editing with Edit, Split, and Preview modes.
- Live rendered preview for normal Markdown content.
- KaTeX rendering for inline and display math.
- Support for dollar and bracket math delimiters.
- Independent scrolling in Edit, Split, and Preview modes.
- Static hosting through GitHub Pages.

## Math Syntax

Inline math:

```text
$E = mc^2$
\(E = mc^2\)
```

Display math:

```text
$$
a^2 + b^2 = c^2
$$

\[
a^2 + b^2 = c^2
\]
```

## Repository Layout

- `ext.json` is the Standard Notes extension manifest.
- `com.sncommunity.markdown-basic/app/` contains the source editor component.
- `com.sncommunity.markdown-basic/dist/` contains the built assets served by GitHub Pages.
- `com.sncommunity.markdown-basic/package.json` contains the build dependencies and scripts.

## Development

From the plugin package directory:

```text
cd com.sncommunity.markdown-basic
npm install
npm run build
```

The built files in `dist/` are intentionally committed because Standard Notes loads the hosted component directly from GitHub Pages.

## License

This project preserves the upstream Standard Notes community plugin license. See `com.sncommunity.markdown-basic/LICENSE`.
