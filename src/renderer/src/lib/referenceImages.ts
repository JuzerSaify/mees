import type { AgentReferenceImage } from '../../../shared/types'

export const MAX_REFERENCE_IMAGES = 4
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_LONG_EDGE = 1_800
const OUTPUT_TYPE = 'image/webp'

export function isSupportedReferenceImage(file: File): boolean {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
}

async function encodeReferenceImage(
  bitmap: ImageBitmap,
  maxLongEdge: number,
  quality: number
): Promise<string> {
  const scale = Math.min(
    1,
    maxLongEdge / Math.max(bitmap.width, bitmap.height)
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The image could not be prepared.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return canvas.toDataURL(OUTPUT_TYPE, quality)
}

export async function prepareReferenceImage(
  file: File
): Promise<AgentReferenceImage> {
  if (!isSupportedReferenceImage(file)) {
    throw new Error('Use a PNG, JPEG, or WebP reference image.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Keep each reference image under 20 MB.')
  }
  const bitmap = await createImageBitmap(file)
  try {
    let maxLongEdge = MAX_LONG_EDGE
    let quality = 0.9
    let dataUrl = await encodeReferenceImage(bitmap, maxLongEdge, quality)
    if (dataUrl.length > 3_200_000) {
      maxLongEdge = 1_280
      quality = 0.82
      dataUrl = await encodeReferenceImage(bitmap, maxLongEdge, quality)
    }
    const scale = Math.min(
      1,
      maxLongEdge / Math.max(bitmap.width, bitmap.height)
    )
    return {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 120) || 'Reference image',
      mimeType: 'image/webp',
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
      dataUrl
    }
  } finally {
    bitmap.close()
  }
}
