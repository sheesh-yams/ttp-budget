/**
 * Renders "smart text" — a lightweight markdown-like format — to safe HTML.
 *
 * Supported syntax:
 *   **text**        → <strong>text</strong>
 *   _text_          → <em>text</em>
 *   ++text++        → <u>text</u>
 *   [text](url)     → <a href="url" …>text</a>  (http/https only)
 *   - item          → <ul><li>…</li></ul>  (consecutive lines)
 *   1. item         → <ol><li>…</li></ul>  (consecutive lines)
 *   blank line      → paragraph break
 *
 * Legacy HTML content (from before the SmartText editor was introduced) is
 * detected and passed through without escaping so existing blocks render
 * correctly. New content written through the SmartTextEditor uses the format
 * above and is always escaped before pattern substitution.
 */

function looksLikeHtml(s: string): boolean {
  return /<(p|div|ul|ol|li|br|strong|em|h[1-6])\b/i.test(s)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function applyInline(s: string): string {
  // Bold — must be processed before italic to avoid partial matches on ***
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  s = s.replace(/_([\s\S]+?)_/g, '<em>$1</em>')
  // Underline
  s = s.replace(/\+\+([\s\S]+?)\+\+/g, '<u>$1</u>')
  // Links — only allow http(s) URLs
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) return text
    const safeUrl = trimmed.replace(/&quot;/g, '%22')
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;text-underline-offset:2px">${text}</a>`
  })
  return s
}

export function renderSmartText(raw: string): string {
  // Legacy blocks were saved as HTML — pass them through without re-escaping.
  if (looksLikeHtml(raw)) return raw

  const lines = raw.split('\n')
  let html = ''
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Unordered list — group consecutive `- ` lines
    if (/^- /.test(line)) {
      html += '<ul style="margin:0.25em 0 0.5em;padding-left:1.25em;list-style-type:disc">'
      while (i < lines.length && /^- /.test(lines[i])) {
        html += `<li>${applyInline(escapeHtml(lines[i].slice(2)))}</li>`
        i++
      }
      html += '</ul>'
      continue
    }

    // Ordered list — group consecutive `N. ` lines
    if (/^\d+\. /.test(line)) {
      html += '<ol style="margin:0.25em 0 0.5em;padding-left:1.25em">'
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        html += `<li>${applyInline(escapeHtml(lines[i].replace(/^\d+\. /, '')))}</li>`
        i++
      }
      html += '</ol>'
      continue
    }

    // Regular line (empty line becomes a visual paragraph break)
    html += applyInline(escapeHtml(line)) + '<br>'
    i++
  }

  return html
}

/** Strip smart-text syntax markers for plain-text contexts (e.g. truncated previews). */
export function stripSmartText(raw: string): string {
  // Legacy HTML content — strip tags
  if (looksLikeHtml(raw)) {
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return raw
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/_([\s\S]+?)_/g, '$1')
    .replace(/\+\+([\s\S]+?)\+\+/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^- /gm, '')
    .replace(/^\d+\. /gm, '')
}
