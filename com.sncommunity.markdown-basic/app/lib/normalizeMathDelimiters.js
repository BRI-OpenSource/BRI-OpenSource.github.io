function normalizeMathDelimiters(text) {
  if (!text) {
    return '';
  }

  return text
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
}

module.exports = normalizeMathDelimiters;
