import { resolveMergeTags } from '@/lib/merge-tags'
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
