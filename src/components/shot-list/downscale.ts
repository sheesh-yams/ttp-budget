// Browser-side: turn a picked / pasted / dropped image into a JPEG no larger
// than 2000px on its long side. Keeps uploads small and gives react-pdf a
// format it can embed (it can't read WebP).

const MAX_SIDE = 2000

export async function downscaleToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas')
    ctx.fillStyle = '#fff' // transparent PNGs → white, not black
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode'))), 'image/jpeg', 0.85))
  } finally {
    bitmap.close()
  }
}
