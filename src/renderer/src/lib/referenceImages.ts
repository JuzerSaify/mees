import type {
  AgentReferenceImage,
  ReferenceVisualSummary
} from '../../../shared/types'

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

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

function analyzeBitmap(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  id: string,
  name: string
): ReferenceVisualSummary {
  const scale = Math.min(1, 56 / Math.max(bitmap.width, bitmap.height))
  const sampleWidth = Math.max(1, Math.round(bitmap.width * scale))
  const sampleHeight = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = sampleWidth
  canvas.height = sampleHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('The reference image could not be measured.')
  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight)
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data
  const buckets = new Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >()
  const luminance = new Float32Array(sampleWidth * sampleHeight)
  let luminanceTotal = 0
  let saturationTotal = 0
  let transparentPixels = 0
  let sampled = 0

  for (let index = 0; index < sampleWidth * sampleHeight; index += 1) {
    const offset = index * 4
    const alpha = pixels[offset + 3] ?? 0
    const red = pixels[offset] ?? 0
    const green = pixels[offset + 1] ?? 0
    const blue = pixels[offset + 2] ?? 0
    const value =
      (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    luminance[index] = value
    if (alpha < 245) transparentPixels += 1
    if (alpha < 24) continue
    luminanceTotal += value
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum
    const key = `${red >> 4}|${green >> 4}|${blue >> 4}`
    const bucket = buckets.get(key) ?? {
      count: 0,
      red: 0,
      green: 0,
      blue: 0
    }
    bucket.count += 1
    bucket.red += red
    bucket.green += green
    bucket.blue += blue
    buckets.set(key, bucket)
    sampled += 1
  }

  const palette = [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((bucket) =>
      toHex(
        bucket.red / bucket.count,
        bucket.green / bucket.count,
        bucket.blue / bucket.count
      )
    )
  let edgeCount = 0
  let edgeSamples = 0
  for (let y = 1; y < sampleHeight; y += 1) {
    for (let x = 1; x < sampleWidth; x += 1) {
      const index = y * sampleWidth + x
      const horizontal = Math.abs(
        (luminance[index] ?? 0) - (luminance[index - 1] ?? 0)
      )
      const vertical = Math.abs(
        (luminance[index] ?? 0) -
          (luminance[index - sampleWidth] ?? 0)
      )
      if (horizontal + vertical > 0.13) edgeCount += 1
      edgeSamples += 1
    }
  }
  const averageLuminance = sampled ? luminanceTotal / sampled : 0
  let variance = 0
  for (let index = 0; index < luminance.length; index += 1) {
    const alpha = pixels[index * 4 + 3] ?? 0
    if (alpha < 24) continue
    variance += ((luminance[index] ?? 0) - averageLuminance) ** 2
  }
  variance = sampled ? variance / sampled : 0
  return {
    imageId: id,
    name,
    width,
    height,
    aspectRatio: Math.round((width / height) * 100) / 100,
    palette,
    averageLuminance: Math.round(averageLuminance * 100) / 100,
    contrast: Math.round(Math.min(1, Math.sqrt(variance) * 2.8) * 100) / 100,
    colorfulness:
      Math.round((sampled ? saturationTotal / sampled : 0) * 100) / 100,
    edgeDensity:
      Math.round((edgeSamples ? edgeCount / edgeSamples : 0) * 100) / 100,
    transparent:
      transparentPixels / Math.max(1, sampleWidth * sampleHeight) > 0.02
  }
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
    const id = crypto.randomUUID()
    const name = file.name.slice(0, 120) || 'Reference image'
    const preparedWidth = Math.max(1, Math.round(bitmap.width * scale))
    const preparedHeight = Math.max(1, Math.round(bitmap.height * scale))
    return {
      id,
      name,
      mimeType: 'image/webp',
      width: preparedWidth,
      height: preparedHeight,
      dataUrl,
      visualSummary: analyzeBitmap(
        bitmap,
        preparedWidth,
        preparedHeight,
        id,
        name
      )
    }
  } finally {
    bitmap.close()
  }
}
