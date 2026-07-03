/**
 * Renders a simple "smart text" format to safe HTML.
 *
 * Supported syntax:
 *   **text**        → <strong>text</strong>
 *   [text](url)     → <a href="url" …>text</a>  (http/https only)
 *   newline         → <br>
 *
 * HTML is escaped before pattern substitution, so user content cannot
 * inject arbitrary tags.
 */
export function renderSmartText(raw: string): string {
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // Bold ([\s\S] instead of . + s flag for broader tsconfig compatibility)
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')

  // Links — only allow http(s) URLs
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) return text
    const safeUrl = trimmed.replace(/&quot;/g, '%22')
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;text-underline-offset:2px">${text}</a>`
  })

  // Line breaks
  s = s.replace(/\n/g, '<br>')

  return s
}

/** Strip smart-text syntax markers for plain-text contexts (e.g. truncated previews). */
export function stripSmartText(raw: string): string {
  return raw
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}
