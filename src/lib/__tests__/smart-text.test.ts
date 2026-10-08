import { renderSmartText } from '@/lib/smart-text'

describe('smart text links', () => {
  it('keeps underscores in a URL intact (no <em> inside the href)', () => {
    const html = renderSmartText('See [the rate card](https://x.com/crew_rate_card) for _details_.')
    expect(html).toContain('href="https://x.com/crew_rate_card"')
    expect(html).toContain('<em>details</em>')
    expect(html).not.toMatch(/href="[^"]*<em>/)
  })
  it('still formats link text and links inside bold', () => {
    expect(renderSmartText('[**Terms**](https://a.com)')).toContain('<strong>Terms</strong></a>')
    expect(renderSmartText('**[Terms](https://a.com/a_b)**')).toMatch(/<strong><a href="https:\/\/a\.com\/a_b"[^>]*>Terms<\/a><\/strong>/)
  })
  it('drops non-http links to their text', () => {
    expect(renderSmartText('[click](javascript:alert(1))')).not.toContain('<a ')
  })
})
