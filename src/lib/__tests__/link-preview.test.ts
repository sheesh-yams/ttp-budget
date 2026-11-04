/** @jest-environment node */
import { normaliseLink, checkUrlShape, isPrivateAddress, youtubeId, extractPreviewImage, isVimeo } from '@/lib/link-preview'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', 'not-an-ip',
  ])('blocks %s', ip => expect(isPrivateAddress(ip)).toBe(true))

  it.each(['8.8.8.8', '172.32.0.1', '151.101.1.69', '2606:4700::6810:84e5'])('allows %s', ip => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

describe('normaliseLink / checkUrlShape', () => {
  it('adds https:// to a bare link', () => {
    expect(normaliseLink('shotdeck.com/browse/stills#/s/1')?.toString()).toBe('https://shotdeck.com/browse/stills#/s/1')
  })
  it.each([
    'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x.jpg', 'data:image/png;base64,AAAA',
    'http://localhost/x', 'http://foo.localhost', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data',
    'http://[::1]/', 'https://user:pw@example.com/', 'https://example.com:8080/', 'http://intranet/', 'http://metadata.internal/',
  ])('refuses %s', raw => expect(normaliseLink(raw)).toBeNull())

  it('accepts a public https link', () => {
    expect(checkUrlShape(new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))).toBe(true)
  })
})

describe('youtubeId / isVimeo', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=84s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/abcDEF12345', 'abcDEF12345'],
    ['https://m.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', null],
  ])('%s → %s', (url, id) => expect(youtubeId(new URL(url))).toBe(id))

  it('spots Vimeo hosts', () => {
    expect(isVimeo(new URL('https://vimeo.com/123'))).toBe(true)
    expect(isVimeo(new URL('https://player.vimeo.com/video/123'))).toBe(true)
    expect(isVimeo(new URL('https://notvimeo.com/123'))).toBe(false)
  })
})

describe('extractPreviewImage', () => {
  const page = new URL('https://film-grab.com/2020/01/01/some-film/')
  it('prefers og:image and resolves relative URLs', () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.x/tw.jpg"><meta property='og:image' content="/wp/still.jpg?a=1&amp;b=2"></head>`
    expect(extractPreviewImage(html, page)).toBe('https://film-grab.com/wp/still.jpg?a=1&b=2')
  })
  it('falls back to twitter:image, then image_src', () => {
    expect(extractPreviewImage('<meta content="https://cdn.x/tw.jpg" name="twitter:image">', page)).toBe('https://cdn.x/tw.jpg')
    expect(extractPreviewImage('<link rel="image_src" href="//cdn.x/i.png">', page)).toBe('https://cdn.x/i.png')
  })
  it('ignores non-http image URLs', () => {
    expect(extractPreviewImage('<meta property="og:image" content="javascript:alert(1)">', page)).toBeNull()
    expect(extractPreviewImage('<p>no meta</p>', page)).toBeNull()
  })
})
