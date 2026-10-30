import sharp from 'sharp'

export interface ImageAssetInput {
  bytes: Buffer
  contentType: string
}

export interface PaletteAnalysis {
  colors: Array<{ hex: string; share: number }>
  averageLuminance: number
  contrast: number
  colorfulness: number
}

export interface VectorizedAsset {
  svg: string
  width: number
  height: number
  colors: string[]
}

function hex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`
}

function colorDistance(
  left: [number, number, number],
  right: [number, number, number]
): number {
  const red = left[0] - right[0]
  const green = left[1] - right[1]
  const blue = left[2] - right[2]
  return red * red + green * green + blue * blue
}

async function imagePixels(
  input: ImageAssetInput,
  size = 64
): Promise<{
  data: Buffer
  width: number
  height: number
  channels: 3 | 4
}> {
  const { data, info } = await sharp(input.bytes)
    .rotate()
    .resize({
      width: size,
      height: size,
      fit: 'inside',
      withoutEnlargement: true
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels === 4 ? 4 : 3
  }
}

export async function extractPalette(
  input: ImageAssetInput,
  colorLimit = 6
): Promise<PaletteAnalysis> {
  const pixels = await imagePixels(input, 64)
  const buckets = new Map<
    string,
    { count: number; red: number; green: number; blue: number }
  >()
  let luminanceTotal = 0
  let luminanceSquared = 0
  let saturationTotal = 0
  let sampled = 0

  for (let offset = 0; offset < pixels.data.length; offset += pixels.channels) {
    const alpha = pixels.channels === 4 ? (pixels.data[offset + 3] ?? 0) : 255
    if (alpha < 24) continue
    const red = pixels.data[offset] ?? 0
    const green = pixels.data[offset + 1] ?? 0
    const blue = pixels.data[offset + 2] ?? 0
    const bucketKey = `${red >> 4}|${green >> 4}|${blue >> 4}`
    const bucket = buckets.get(bucketKey) ?? {
      count: 0,
      red: 0,
      green: 0,
      blue: 0
    }
    bucket.count += 1
    bucket.red += red
    bucket.green += green
    bucket.blue += blue
    buckets.set(bucketKey, bucket)
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
    luminanceTotal += luminance
    luminanceSquared += luminance * luminance
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    saturationTotal += maximum === 0 ? 0 : (maximum - minimum) / maximum
    sampled += 1
  }

  const sorted = [...buckets.values()].sort(
    (left, right) => right.count - left.count
  )
  const colors: PaletteAnalysis['colors'] = []
  for (const bucket of sorted) {
    if (colors.length >= Math.max(2, Math.min(8, colorLimit))) break
    const red = bucket.red / bucket.count
    const green = bucket.green / bucket.count
    const blue = bucket.blue / bucket.count
    const candidate = hex(red, green, blue)
    if (
      colors.some(
        (entry) =>
          colorDistance(
            [
              Number.parseInt(entry.hex.slice(1, 3), 16),
              Number.parseInt(entry.hex.slice(3, 5), 16),
              Number.parseInt(entry.hex.slice(5, 7), 16)
            ],
            [red, green, blue]
          ) < 900
      )
    ) {
      continue
    }
    colors.push({
      hex: candidate,
      share: sampled ? Math.round((bucket.count / sampled) * 1000) / 10 : 0
    })
  }
  const averageLuminance = sampled ? luminanceTotal / sampled : 0
  const variance = sampled
    ? Math.max(0, luminanceSquared / sampled - averageLuminance ** 2)
    : 0
  return {
    colors,
    averageLuminance: Math.round(averageLuminance * 1000) / 1000,
    contrast: Math.round(Math.min(1, Math.sqrt(variance) * 2.8) * 1000) / 1000,
    colorfulness: Math.round((sampled ? saturationTotal / sampled : 0) * 1000) / 1000
  }
}

export async function cropAsset(
  input: ImageAssetInput,
  options: {
    width: number
    height: number
    focus?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  }
): Promise<{ bytes: Buffer; contentType: 'image/webp'; width: number; height: number }> {
  const position =
    options.focus === 'top'
      ? 'north'
      : options.focus === 'bottom'
        ? 'south'
        : options.focus === 'left'
          ? 'west'
          : options.focus === 'right'
            ? 'east'
            : 'centre'
  const { data, info } = await sharp(input.bytes)
    .rotate()
    .resize(options.width, options.height, {
      fit: 'cover',
      position
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer({ resolveWithObject: true })
  return {
    bytes: data,
    contentType: 'image/webp',
    width: info.width,
    height: info.height
  }
}

export async function optimizeAsset(
  input: ImageAssetInput,
  options: { maxWidth: number; quality: number }
): Promise<{ bytes: Buffer; contentType: 'image/webp'; width: number; height: number }> {
  const { data, info } = await sharp(input.bytes)
    .rotate()
    .resize({
      width: options.maxWidth,
      withoutEnlargement: true
    })
    .webp({
      quality: Math.max(45, Math.min(96, options.quality)),
      effort: 5
    })
    .toBuffer({ resolveWithObject: true })
  return {
    bytes: data,
    contentType: 'image/webp',
    width: info.width,
    height: info.height
  }
}

function nearestPaletteColor(
  red: number,
  green: number,
  blue: number,
  palette: Array<[number, number, number]>
): number {
  let nearest = 0
  let distance = Number.POSITIVE_INFINITY
  palette.forEach((color, index) => {
    const candidate = colorDistance([red, green, blue], color)
    if (candidate < distance) {
      nearest = index
      distance = candidate
    }
  })
  return nearest
}

export async function vectorizeAsset(
  input: ImageAssetInput,
  options: {
    title: string
    width?: number
    colorLimit?: number
  }
): Promise<VectorizedAsset> {
  const palette = await extractPalette(input, options.colorLimit ?? 5)
  const rgbPalette = palette.colors.map(
    (entry) =>
      [
        Number.parseInt(entry.hex.slice(1, 3), 16),
        Number.parseInt(entry.hex.slice(3, 5), 16),
        Number.parseInt(entry.hex.slice(5, 7), 16)
      ] as [number, number, number]
  )
  if (rgbPalette.length === 0) rgbPalette.push([17, 17, 17])
  const targetWidth = Math.max(24, Math.min(120, options.width ?? 72))
  const { data, info } = await sharp(input.bytes)
    .rotate()
    .resize({
      width: targetWidth,
      withoutEnlargement: true
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const colorIndexes = new Uint8Array(info.width * info.height)
  for (let pixel = 0; pixel < colorIndexes.length; pixel += 1) {
    const offset = pixel * info.channels
    const alpha = info.channels === 4 ? (data[offset + 3] ?? 0) : 255
    colorIndexes[pixel] = alpha < 20
      ? 255
      : nearestPaletteColor(
          data[offset] ?? 0,
          data[offset + 1] ?? 0,
          data[offset + 2] ?? 0,
          rgbPalette
        )
  }
  const paths = palette.colors.map(() => [] as string[])
  for (let y = 0; y < info.height; y += 1) {
    let start = 0
    let current = colorIndexes[y * info.width] ?? 255
    for (let x = 1; x <= info.width; x += 1) {
      const next =
        x < info.width ? colorIndexes[y * info.width + x] ?? 255 : 255
      if (next === current) continue
      if (current !== 255 && x - start > 0) {
        paths[current]?.push(`M${start} ${y}h${x - start}v1H${start}z`)
      }
      start = x
      current = next
    }
  }
  const pathMarkup = paths
    .map(
      (segments, index) =>
        segments.length
          ? `<path fill="${palette.colors[index]?.hex ?? '#111111'}" d="${segments.join('')}"/>`
          : ''
    )
    .join('')
  const title = options.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 140)
  return {
    width: info.width,
    height: info.height,
    colors: palette.colors.map((entry) => entry.hex),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${info.width} ${info.height}" shape-rendering="crispEdges"><title>${title}</title><desc>Posterized vector approximation traced from a supplied raster image.</desc>${pathMarkup}</svg>`
  }
}
