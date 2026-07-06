/**
 * merge-tags.ts — resolves {{merge_tags}} in contract block bodies
 *
 * All resolution is done at render time, never stored. The raw body with
 * {{tags}} is what lives in the DB; the resolved string is only for display.
 *
 * Unresolvable tags are returned wrapped in a <mark> span so the UI can
 * highlight them as warnings.
 */

export interface MergeTagContext {
  workspace?:    { name?: string; legalName?: string }
  client?:       { name?: string; company?: string }
  project?:      { name?: string }
  proposal?:     { total?: string; validThrough?: string }
  deliverables?: { title: string; quantity?: number }[]
}

const SENTINEL = '\x00'

/**
 * Escape HTML special characters. Every merge value is untrusted (client /
 * project / workspace names are user-entered) and is substituted straight into
 * an HTML string that ends up in dangerouslySetInnerHTML, so it MUST be escaped
 * before injection or a name like `<img src=x onerror=…>` becomes stored XSS on
 * the public proposal / contract pages. See resolveMergeTags call sites, which
 * run this over already-rendered smart-text HTML (renderSmartText first).
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function resolveMergeTags(body: string, ctx: MergeTagContext): string {
  // The <ul>/<li> structure here is trusted HTML we build; the titles inside
  // it are untrusted and are escaped individually.
  const deliverablesList = ctx.deliverables?.length
    ? `<ul>${ctx.deliverables.map(d => `<li>${escapeHtml(d.title)}${d.quantity && d.quantity > 1 ? ` × ${d.quantity}` : ''}</li>`).join('')}</ul>`
    : undefined

  const replacements: Record<string, string | undefined> = {
    'client.name':        ctx.client?.name,
    'client.company':     ctx.client?.company,
    'project.name':       ctx.project?.name,
    'workspace.name':     ctx.workspace?.name,
    'workspace.legalName': ctx.workspace?.legalName ?? ctx.workspace?.name,
    'proposal.total':     ctx.proposal?.total,
    'proposal.validThrough': ctx.proposal?.validThrough,
    'deliverables.list':  deliverablesList,
    'payment.schedule':   undefined,  // rendered separately in Phase 3
  }

  // Values that are already trusted HTML we constructed above — never escaped.
  // Everything else is user data and is escaped before substitution.
  const RAW_HTML_KEYS = new Set(['deliverables.list'])

  return body.replace(/\{\{([^}]+)\}\}/g, (match, tag: string) => {
    const key     = tag.trim()
    const safeKey = escapeHtml(key)
    if (key in replacements) {
      const val = replacements[key]
      if (val !== undefined && val !== '') {
        return RAW_HTML_KEYS.has(key) ? val : escapeHtml(val)
      }
      // Known tag but value not available (e.g. client has no company)
      return `<mark class="bg-yellow-100 text-yellow-800 rounded px-0.5" title="No value available">⚠ ${SENTINEL}{{${safeKey}}}${SENTINEL}</mark>`
    }
    // Unknown tag
    return `<mark class="bg-red-100 text-red-800 rounded px-0.5" title="Unknown merge tag">⚠ ${SENTINEL}{{${safeKey}}}${SENTINEL}</mark>`
  })
}

/** Returns true if the resolved body contains any unresolved tags. */
export function hasUnresolvedTags(resolved: string): boolean {
  return resolved.includes(SENTINEL)
}

/** Returns tag names that could not be resolved (for warnings/blocking). */
export function unresolvedTagNames(body: string, ctx: MergeTagContext): string[] {
  const resolved = resolveMergeTags(body, ctx)
  const matches  = resolved.match(new RegExp(`${SENTINEL}\\{\\{([^}]+)\\}\\}${SENTINEL}`, 'g')) ?? []
  return matches.map(m => m.replace(/\x00/g, '').replace(/^\{\{/, '').replace(/\}\}$/, ''))
}
