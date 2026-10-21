import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { resolveImagePath, imageUrl, baseOf, IMAGE_SCHEME } from '../shared/imageLinks.js';

marked.setOptions({ gfm: true, breaks: false });

const escapeAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The folder the text being rendered lives in: relative image links resolve against it and load
// over notera-file:// (main/images.js). Set per render, since marked's renderer is shared.
let imageBase = null;
marked.use({
  renderer: {
    image({ href, title, text, tokens }) {
      if (tokens) text = this.parser.parseInline(tokens, this.parser.textRenderer);
      const abs = resolveImagePath(href, imageBase);
      const src = abs ? imageUrl(abs) : href;
      let out = `<img src="${escapeAttr(src)}" alt="${escapeAttr(text)}" data-file="${escapeAttr(baseOf(abs || href))}"`;
      if (title) out += ` title="${escapeAttr(title)}"`;
      return out + '>';
    }
  }
});

// DOMPurify's own list of schemes an attribute may point at, plus the one images load over.
const ALLOWED_URI_REGEXP = new RegExp(`^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|${IMAGE_SCHEME}):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))`, 'i');

/**
 * @param {string} text
 * @param {{ baseDir?: string | null }} [opts] the folder of the file, for its relative image links
 */
export function renderMarkdown(text, { baseDir = null } = {}) {
  imageBase = baseDir;
  try {
    const html = marked.parse(text, { async: false });
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'], ALLOWED_URI_REGEXP });
  } finally {
    imageBase = null;
  }
}

export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}
