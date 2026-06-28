import { detectEmbed } from '../embed-detection'

// ─── Frame.io ────────────────────────────────────────────────────────────────

describe('Frame.io', () => {
  test('app.frame.io presentation URL', () => {
    const r = detectEmbed('https://app.frame.io/presentations/abc123')
    expect(r).toMatchObject({ provider: 'FRAME_IO', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toBe('https://app.frame.io/presentations/abc123')
  })

  test('f.io short link', () => {
    const r = detectEmbed('https://f.io/xyz789')
    expect(r).toMatchObject({ provider: 'FRAME_IO', renderMode: 'IFRAME' })
  })

  test('next.frame.io v4 share', () => {
    const r = detectEmbed('https://next.frame.io/share/token123')
    expect(r).toMatchObject({ provider: 'FRAME_IO', renderMode: 'IFRAME' })
  })
})

// ─── Shade ────────────────────────────────────────────────────────────────────

describe('Shade', () => {
  test('shade.inc root', () => {
    const r = detectEmbed('https://shade.inc/project/abc')
    expect(r).toMatchObject({ provider: 'SHADE', renderMode: 'IFRAME' })
  })

  test('subdomain of shade.inc', () => {
    const r = detectEmbed('https://review.shade.inc/project/abc')
    expect(r).toMatchObject({ provider: 'SHADE', renderMode: 'IFRAME' })
  })
})

// ─── YouTube ──────────────────────────────────────────────────────────────────

describe('YouTube', () => {
  test('standard watch URL', () => {
    const r = detectEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r).toMatchObject({ provider: 'YOUTUBE', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  test('youtu.be short link', () => {
    const r = detectEmbed('https://youtu.be/dQw4w9WgXcQ')
    expect(r).toMatchObject({ provider: 'YOUTUBE', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toContain('embed/dQw4w9WgXcQ')
  })

  test('already a nocookie embed URL', () => {
    const r = detectEmbed('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(r).toMatchObject({ provider: 'YOUTUBE', renderMode: 'IFRAME' })
  })

  test('youtube.com without video id falls back to GENERIC_LINK', () => {
    const r = detectEmbed('https://www.youtube.com/channel/UC1234')
    expect(r).toMatchObject({ provider: 'GENERIC_LINK', renderMode: 'EXTERNAL_ONLY' })
  })
})

// ─── Vimeo ────────────────────────────────────────────────────────────────────

describe('Vimeo', () => {
  test('standard vimeo.com/{id}', () => {
    const r = detectEmbed('https://vimeo.com/123456789')
    expect(r).toMatchObject({ provider: 'VIMEO', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toBe('https://player.vimeo.com/video/123456789')
  })

  test('www.vimeo.com/{id}', () => {
    const r = detectEmbed('https://www.vimeo.com/123456789')
    expect(r).toMatchObject({ provider: 'VIMEO', renderMode: 'IFRAME' })
  })

  test('already a player.vimeo.com embed URL', () => {
    const r = detectEmbed('https://player.vimeo.com/video/123456789')
    expect(r).toMatchObject({ provider: 'VIMEO', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toBe('https://player.vimeo.com/video/123456789')
  })

  test('vimeo.com without video id falls back to GENERIC_LINK', () => {
    const r = detectEmbed('https://vimeo.com/')
    expect(r).toMatchObject({ provider: 'GENERIC_LINK', renderMode: 'EXTERNAL_ONLY' })
  })
})

// ─── Google Drive ─────────────────────────────────────────────────────────────

describe('Google Drive', () => {
  test('file URL → GDRIVE_FILE / IFRAME with /preview suffix', () => {
    const r = detectEmbed('https://drive.google.com/file/d/1ABC/view')
    expect(r).toMatchObject({ provider: 'GDRIVE_FILE', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toContain('/preview')
    expect(r.canonicalUrl).not.toContain('/view')
  })

  test('file URL without trailing action', () => {
    const r = detectEmbed('https://drive.google.com/file/d/1ABC')
    expect(r).toMatchObject({ provider: 'GDRIVE_FILE', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toContain('/preview')
  })

  test('folder URL → GDRIVE_FOLDER / EXTERNAL_ONLY', () => {
    const r = detectEmbed('https://drive.google.com/drive/folders/1XYZ')
    expect(r).toMatchObject({ provider: 'GDRIVE_FOLDER', renderMode: 'EXTERNAL_ONLY' })
  })
})

// ─── Dropbox ──────────────────────────────────────────────────────────────────

describe('Dropbox', () => {
  test('shared file link → DROPBOX_FILE / EXTERNAL_ONLY', () => {
    const r = detectEmbed('https://www.dropbox.com/s/abc123/file.zip?dl=0')
    expect(r).toMatchObject({ provider: 'DROPBOX_FILE', renderMode: 'EXTERNAL_ONLY' })
  })

  test('scl shared file link → DROPBOX_FILE / EXTERNAL_ONLY', () => {
    const r = detectEmbed('https://www.dropbox.com/scl/fi/abc123/file.zip')
    expect(r).toMatchObject({ provider: 'DROPBOX_FILE', renderMode: 'EXTERNAL_ONLY' })
  })

  test('folder link → DROPBOX_FOLDER / EXTERNAL_ONLY', () => {
    const r = detectEmbed('https://www.dropbox.com/sh/abc123/folder')
    expect(r).toMatchObject({ provider: 'DROPBOX_FOLDER', renderMode: 'EXTERNAL_ONLY' })
  })
})

// ─── Direct media ─────────────────────────────────────────────────────────────

describe('Direct media', () => {
  test('.jpg → DIRECT_IMAGE / NATIVE_MEDIA', () => {
    const r = detectEmbed('https://example.com/assets/photo.jpg')
    expect(r).toMatchObject({ provider: 'DIRECT_IMAGE', renderMode: 'NATIVE_MEDIA' })
  })

  test('.png', () => {
    const r = detectEmbed('https://cdn.example.com/img.png')
    expect(r).toMatchObject({ provider: 'DIRECT_IMAGE', renderMode: 'NATIVE_MEDIA' })
  })

  test('.webp', () => {
    const r = detectEmbed('https://cdn.example.com/img.webp')
    expect(r).toMatchObject({ provider: 'DIRECT_IMAGE', renderMode: 'NATIVE_MEDIA' })
  })

  test('.gif', () => {
    const r = detectEmbed('https://cdn.example.com/anim.gif')
    expect(r).toMatchObject({ provider: 'DIRECT_IMAGE', renderMode: 'NATIVE_MEDIA' })
  })

  test('.mp4 → DIRECT_VIDEO / NATIVE_MEDIA', () => {
    const r = detectEmbed('https://example.com/video.mp4')
    expect(r).toMatchObject({ provider: 'DIRECT_VIDEO', renderMode: 'NATIVE_MEDIA' })
  })

  test('.webm', () => {
    const r = detectEmbed('https://example.com/video.webm')
    expect(r).toMatchObject({ provider: 'DIRECT_VIDEO', renderMode: 'NATIVE_MEDIA' })
  })

  test('.mov', () => {
    const r = detectEmbed('https://example.com/video.mov')
    expect(r).toMatchObject({ provider: 'DIRECT_VIDEO', renderMode: 'NATIVE_MEDIA' })
  })
})

// ─── GENERIC_LINK fallback ────────────────────────────────────────────────────

describe('Generic / unknown URLs', () => {
  test('unknown hostname → GENERIC_LINK / EXTERNAL_ONLY', () => {
    const r = detectEmbed('https://some-random-site.com/share/project')
    expect(r).toMatchObject({ provider: 'GENERIC_LINK', renderMode: 'EXTERNAL_ONLY' })
  })

  test('preserves the original URL as canonicalUrl', () => {
    const url = 'https://some-random-site.com/share/project?token=abc'
    const r = detectEmbed(url)
    if ('error' in r) throw new Error(r.error)
    expect(r.canonicalUrl).toBe(url)
  })
})

// ─── iframe HTML — happy paths ────────────────────────────────────────────────

describe('iframe HTML — happy path', () => {
  test('Frame.io iframe with extra attributes', () => {
    const html = `<iframe src="https://app.frame.io/presentations/abc123" width="640" height="360" allowfullscreen data-custom="should-be-stripped"></iframe>`
    const r = detectEmbed(html)
    expect(r).toMatchObject({ provider: 'FRAME_IO', renderMode: 'IFRAME' })
    if ('error' in r) throw new Error(r.error)
    expect(r.embedHtml).toBeDefined()
    expect(r.embedHtml).not.toContain('data-custom')
    expect(r.embedHtml).toContain('allowfullscreen')
  })

  test('Vimeo iframe uses canonical player.vimeo.com src', () => {
    const html = `<iframe src="https://vimeo.com/123456789" width="800" height="450"></iframe>`
    const r = detectEmbed(html)
    if ('error' in r) throw new Error(r.error)
    expect(r.provider).toBe('VIMEO')
    expect(r.embedHtml).toContain('player.vimeo.com/video/123456789')
  })

  test('YouTube iframe preserves allowed attrs and converts to nocookie', () => {
    const html = `<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" allow="autoplay" width="560" height="315"></iframe>`
    const r = detectEmbed(html)
    if ('error' in r) throw new Error(r.error)
    expect(r.provider).toBe('YOUTUBE')
    expect(r.embedHtml).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(r.embedHtml).toContain('allow=')
  })

  test('only src/width/height/allow/allowfullscreen/referrerpolicy are kept', () => {
    const html = `<iframe src="https://app.frame.io/presentations/abc" width="640" height="360" allow="autoplay" allowfullscreen referrerpolicy="strict-origin" class="evil" onload="evil()" id="frame1"></iframe>`
    const r = detectEmbed(html)
    if ('error' in r) throw new Error(r.error)
    expect(r.embedHtml).not.toContain('class=')
    expect(r.embedHtml).not.toContain('onload=')
    expect(r.embedHtml).not.toContain('id=')
    expect(r.embedHtml).toContain('referrerpolicy=')
  })
})

// ─── iframe HTML — security / rejection ───────────────────────────────────────

describe('iframe HTML — security', () => {
  test('iframe with disallowed src is rejected', () => {
    const html = `<iframe src="https://evil-site.com/track" width="1" height="1"></iframe>`
    const r = detectEmbed(html)
    expect('error' in r).toBe(true)
  })

  test('iframe with javascript: src is rejected', () => {
    const html = `<iframe src="javascript:alert(1)"></iframe>`
    const r = detectEmbed(html)
    expect('error' in r).toBe(true)
  })

  test('iframe with data: src is rejected', () => {
    const html = `<iframe src="data:text/html,<script>alert(1)</script>"></iframe>`
    const r = detectEmbed(html)
    expect('error' in r).toBe(true)
  })

  test('iframe with srcdoc attribute — srcdoc stripped, src used for classification', () => {
    const html = `<iframe src="https://app.frame.io/presentations/abc" srcdoc="<script>evil()</script>"></iframe>`
    const r = detectEmbed(html)
    if ('error' in r) throw new Error(r.error)
    expect(r.embedHtml).not.toContain('srcdoc')
  })

  test('<script> tags alongside iframe are stripped', () => {
    const html = `<script>alert('xss')</script><iframe src="https://app.frame.io/presentations/abc"></iframe>`
    const r = detectEmbed(html)
    if ('error' in r) throw new Error(r.error)
    expect(r.embedHtml).not.toContain('<script')
    expect(r.embedHtml).not.toContain('alert')
  })

  test('no <iframe> in input returns error', () => {
    const r = detectEmbed('<div>not an embed</div>')
    expect('error' in r).toBe(true)
  })
})
