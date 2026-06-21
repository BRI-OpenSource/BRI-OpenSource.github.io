const FENCE_PATTERN = /^\s{0,3}(```|~~~)/;
const MATH_BLOCK_DELIMITER_PATTERN = /^\s*\$\$\s*$/;
const MARKDOWN_BLOCK_PATTERN = /^\s{0,3}(?:#{1,6}\s|[-+*]\s|\d+\.\s|>\s|\|)/;
const LATEX_COMMAND_PATTERN = /\\(?:frac|tfrac|dfrac|sqrt|sum|prod|int|oint|lim|partial|nabla|Gamma|Delta|Lambda|Omega|Sigma|alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|mu|nu|rho|sigma|tau|phi|varphi|pi|psi|chi|eta|kappa|xi|zeta|left|right|cdot|times|qquad|quad|equiv|approx|leq|geq|neq|to|mapsto|infty|mathrm|mathbf|mathbb|mathcal|text|begin|end)\b/;
const SCRIPT_PATTERN = /[A-Za-z0-9)}](?:[_^](?:\{[^}\n]+\}|\\?[A-Za-z]+|[0-9]))/;
const OPERATOR_PATTERN = /(?:=|\\equiv|\\approx|\\leq|\\geq|\\neq|\\to|\\mapsto|\\propto|[+\-*/])/;
const EXPLICIT_MATH_DELIMITER_PATTERN = /(?:\\\(|\\\)|\\\[|\\\]|\$[^$\n]+\$)/;
const LATEX_COMMAND_NAME_PATTERN = /\\[A-Za-z]+/g;
const PROSE_WORD_PATTERN = /\b[A-Za-z]{3,}\b/g;
const MARKDOWN_BOLD_IN_MATH_PATTERN = /\*\*([^*\n]+?)\*\*/g;

function normalizeMarkdownBoldInMath(text) {
  return text.replace(MARKDOWN_BOLD_IN_MATH_PATTERN, (_match, value) => {
    return `\\mathbf{${value.trim()}}`;
  });
}

function normalizeMarkdownBoldInDelimitedMath(text) {
  return text
    .replace(/(^|\n)([ \t]*)\$\$([\s\S]*?)(^|\n)([ \t]*)\$\$/gm, (_match, openLine, openIndent, body, closeLine, closeIndent) => {
      return `${openLine}${openIndent}$$${normalizeMarkdownBoldInMath(body)}${closeLine}${closeIndent}$$`;
    })
    .replace(/(^|[\s([{])\\\(([^\n]+?)\\\)(?=$|[\s.,;:)}\]])/g, (_match, prefix, body) => {
      return `${prefix}\\(${normalizeMarkdownBoldInMath(body)}\\)`;
    })
    .replace(/(^|[\s([{])\\\[([^\n]+?)\\\](?=$|[\s.,;:)}\]])/g, (_match, prefix, body) => {
      return `${prefix}\\[${normalizeMarkdownBoldInMath(body)}\\]`;
    })
    .replace(/(^|[\s([{])\$(?!\$)([^$\n]+?)\$(?!\$)(?=$|[\s.,;:)}\]])/g, (_match, prefix, body) => {
      return `${prefix}$${normalizeMarkdownBoldInMath(body)}$`;
    });
}

function normalizeExplicitMathDelimiters(text) {
  const normalizedDelimiters = text
    .replace(/(^|\n)([ \t]*)\\\$\\\$([\s\S]*?)(^|\n)([ \t]*)\\\$\\\$/gm, (_match, openLine, openIndent, body, closeLine, closeIndent) => {
      return `${openLine}${openIndent}$$${body}${closeLine}${closeIndent}$$`;
    })
    .replace(/(^|\n)([ \t]*)\\\\\[([\s\S]*?)(^|\n)([ \t]*)\\\\\]/gm, (_match, openLine, openIndent, body, closeLine, closeIndent) => {
      return `${openLine}${openIndent}$$${body}${closeLine}${closeIndent}$$`;
    })
    .replace(/(^|\n)([ \t]*)\\\[([\s\S]*?)(^|\n)([ \t]*)\\\]/gm, (_match, openLine, openIndent, body, closeLine, closeIndent) => {
      return `${openLine}${openIndent}$$${body}${closeLine}${closeIndent}$$`;
    })
    .replace(/(^|[\s([{])\\\$([^$\n]+?)\\\$(?=$|[\s.,;:)}\]])/g, (_match, prefix, body) => {
      return `${prefix}$${body}$`;
    })
    .replace(/(^|[\s([{])\$[ \t]+([^$\n]*?\S)[ \t]+\$(?!\$)/g, (_match, prefix, body) => {
      return `${prefix}$${body}$`;
    })
    .replace(/(^|[\s([{])\\\\\(([^\n]+?)\\\\\)(?=$|[\s.,;:)}\]])/g, (_match, prefix, body) => {
      return `${prefix}\\(${body}\\)`;
    });

  return normalizeMarkdownBoldInDelimitedMath(normalizedDelimiters);
}

function hasExplicitMathDelimiter(line) {
  return EXPLICIT_MATH_DELIMITER_PATTERN.test(line);
}

function proseWordCount(line) {
  const proseCandidate = line
    .replace(LATEX_COMMAND_NAME_PATTERN, ' ')
    .replace(/\\./g, ' ')
    .replace(/[_^{}()[\],.;:+=*\/$|<>-]+/g, ' ');
  const words = proseCandidate.match(PROSE_WORD_PATTERN);
  return words ? words.length : 0;
}

function hasProseSentenceShape(line) {
  return proseWordCount(line) >= 2;
}

function isProbableStandaloneTexLine(line, continuingBlock) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.includes('`') || MARKDOWN_BLOCK_PATTERN.test(trimmed)) {
    return false;
  }

  // Bare TeX auto-wrapping is for equation-shaped lines, not prose with a symbol in it.
  if (hasProseSentenceShape(trimmed)) {
    return false;
  }

  const hasLatexCommand = LATEX_COMMAND_PATTERN.test(trimmed);
  const hasScript = SCRIPT_PATTERN.test(trimmed);
  const hasOperator = OPERATOR_PATTERN.test(trimmed);

  if (continuingBlock && hasLatexCommand) {
    return true;
  }

  return (hasLatexCommand && (hasScript || hasOperator)) || (hasScript && hasOperator);
}

function wrapStandaloneTexBlocks(text) {
  const lines = text.split('\n');
  const normalized = [];
  let pendingTexLines = [];
  let inFence = false;
  let inMathBlock = false;

  function flushPendingTexBlock() {
    if (!pendingTexLines.length) {
      return;
    }

    normalized.push('$$');
    for (const line of pendingTexLines) {
      normalized.push(normalizeMarkdownBoldInMath(line.trim()));
    }
    normalized.push('$$');
    pendingTexLines = [];
  }

  for (const line of lines) {
    if (FENCE_PATTERN.test(line)) {
      flushPendingTexBlock();
      normalized.push(line);
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      normalized.push(line);
      continue;
    }

    if (MATH_BLOCK_DELIMITER_PATTERN.test(line)) {
      flushPendingTexBlock();
      normalized.push(line);
      inMathBlock = !inMathBlock;
      continue;
    }

    if (inMathBlock) {
      normalized.push(normalizeMarkdownBoldInMath(line));
      continue;
    }

    if (hasExplicitMathDelimiter(line)) {
      flushPendingTexBlock();
      normalized.push(line);
      continue;
    }

    if (isProbableStandaloneTexLine(line, pendingTexLines.length > 0)) {
      pendingTexLines.push(line);
      continue;
    }

    flushPendingTexBlock();
    normalized.push(line);
  }

  flushPendingTexBlock();
  return normalized.join('\n');
}

function normalizeMathDelimiters(text) {
  if (!text) {
    return '';
  }

  return wrapStandaloneTexBlocks(normalizeExplicitMathDelimiters(text));
}

module.exports = normalizeMathDelimiters;
