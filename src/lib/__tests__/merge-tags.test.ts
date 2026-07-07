import { resolveMergeTags, resolveMergeTagsPlain, unresolvedTagNames } from '@/lib/merge-tags'
import { renderSmartText } from '@/lib/smart-text'

describe('resolveMergeTags — HTML escaping (XSS hardening)', () => {
  it('escapes HTML in scalar merge values', () => {
    const out = resolveMergeTags('Hello {{client.name}}', {
      client: { name: '<img src=x onerror=alert(1)>' },
    })
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('escapes quotes and ampersands in values', () => {
    const out = resolveMergeTags('{{workspace.name}}', {
      workspace: { name: `Ben & "Jerry's"` },
    })
    expect(out).toBe('Ben &amp; &quot;Jerry&#39;s&quot;')
  })

  it('escapes deliverable titles but keeps the list structure', () => {
    const out = resolveMergeTags('{{deliverables.list}}', {
      deliverables: [{ title: '<script>evil()</script>', quantity: 2 }],
    })
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('× 2')
  })

  it('escapes an unknown tag key containing HTML in the warning span', () => {
    const out = resolveMergeTags('{{<img src=x>}}', {})
    expect(out).not.toContain('<img src=x>')
    expect(out).toContain('&lt;img src=x&gt;')
  })

  it('full pipeline (renderSmartText → resolveMergeTags) neutralizes injection', () => {
    // The production call order: render the author body first, then inject values.
    const html = resolveMergeTags(renderSmartText('Agreement for {{client.name}}'), {
      client: { name: '<img src=x onerror=alert(document.cookie)>' },
    })
    // The tag is escaped to inert text — no live element can be created.
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('does not double-escape a plain author body run through the pipeline', () => {
    const html = resolveMergeTags(renderSmartText('Terms & conditions apply'), {})
    // A single escape from renderSmartText, not a second pass.
    expect(html).toContain('&amp; conditions')
    expect(html).not.toContain('&amp;amp;')
  })
})

describe('resolveMergeTags — warnUnresolved option (client-facing degrade)', () => {
  it('shows a warning mark for unresolved tags by default (editor)', () => {
    const out = resolveMergeTags('Prepared for {{workspace.legalName}}', {})
    expect(out).toContain('<mark')
    expect(out).toContain('workspace.legalName')
  })

  it('renders unresolved known tags as empty when warnUnresolved is false (public)', () => {
    const out = resolveMergeTags('Prepared for {{workspace.legalName}}.', {}, { warnUnresolved: false })
    expect(out).not.toContain('<mark')
    expect(out).not.toContain('{{')
    expect(out).toBe('Prepared for .')
  })

  it('renders unknown tags as empty when warnUnresolved is false', () => {
    const out = resolveMergeTags('X{{totally.bogus}}Y', {}, { warnUnresolved: false })
    expect(out).toBe('XY')
  })

  it('still escapes resolved values when warnings are off', () => {
    const out = resolveMergeTags('{{client.name}}', { client: { name: '<b>hi</b>' } }, { warnUnresolved: false })
    expect(out).toBe('&lt;b&gt;hi&lt;/b&gt;')
  })
})

describe('resolveMergeTagsPlain — PDF / plain-text resolution', () => {
  it('substitutes values verbatim without HTML escaping', () => {
    const out = resolveMergeTagsPlain('For {{client.name}} — {{proposal.total}}', {
      client:   { name: 'Acme & Co' },
      proposal: { total: '$12,500' },
    })
    expect(out).toBe('For Acme & Co — $12,500')
  })

  it('leaves unresolved tags as literal {{tag}} (no warning markup)', () => {
    const out = resolveMergeTagsPlain('Hi {{workspace.legalName}}', {})
    expect(out).toBe('Hi {{workspace.legalName}}')
  })

  it('renders deliverables as a dash list', () => {
    const out = resolveMergeTagsPlain('{{deliverables.list}}', {
      deliverables: [{ title: 'Hero film', quantity: 1 }, { title: 'Social cut', quantity: 3 }],
    })
    expect(out).toBe('- Hero film\n- Social cut × 3')
  })
})

describe('unresolvedTagNames — editor warning source', () => {
  it('lists both missing-known and unknown tags', () => {
    const names = unresolvedTagNames('{{workspace.legalName}} {{bogus.tag}} {{client.name}}', {
      client: { name: 'Acme' },
    })
    expect(names).toContain('workspace.legalName')
    expect(names).toContain('bogus.tag')
    expect(names).not.toContain('client.name')
  })

  it('returns nothing when all tags resolve', () => {
    const names = unresolvedTagNames('{{client.name}}', { client: { name: 'Acme' } })
    expect(names).toHaveLength(0)
  })
})
