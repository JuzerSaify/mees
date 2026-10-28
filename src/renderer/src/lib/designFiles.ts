import type { DesignMode } from '../../../shared/types'

export type GeneratedFileKind = 'html' | 'svg' | 'css' | 'js' | 'image'

export interface GeneratedFile {
  path: string
  kind: GeneratedFileKind
  content: string
  byteLength: number
}

function extensionForMime(mime: string): string {
  if (/svg/i.test(mime)) return 'svg'
  if (/png/i.test(mime)) return 'png'
  if (/webp/i.test(mime)) return 'webp'
  if (/gif/i.test(mime)) return 'gif'
  if (/x-icon|vnd\.microsoft\.icon/i.test(mime)) return 'ico'
  return 'jpg'
}

function remoteExtension(value: string): string {
  try {
    const pathname = new URL(value).pathname
    const match = /\.([a-z0-9]{2,5})$/i.exec(pathname)
    return match?.[1]?.toLocaleLowerCase('en') || 'image'
  } catch {
    return 'image'
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function createGeneratedFileManifest(
  designHtml: string,
  designMode: DesignMode = 'website'
): GeneratedFile[] {
  if (!designHtml.trim()) return []

  const documentNode = new DOMParser().parseFromString(designHtml, 'text/html')
  const files: GeneratedFile[] = [
    {
      path:
        designMode === 'logo'
          ? 'logo.svg'
          : designMode === 'vector'
            ? 'artwork.svg'
            : designMode === 'motion'
              ? 'motion.html'
              : 'index.html',
      kind: designMode === 'logo' || designMode === 'vector' ? 'svg' : 'html',
      content: designHtml,
      byteLength: byteLength(designHtml)
    }
  ]

  const css = Array.from(documentNode.querySelectorAll('style'))
    .map((element) => element.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
  if (css) {
    files.push({
      path: 'styles.css',
      kind: 'css',
      content: css,
      byteLength: byteLength(css)
    })
  }

  const scripts = Array.from(documentNode.querySelectorAll('script:not([src])'))
    .map((element) => element.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
  if (scripts) {
    files.push({
      path: 'app.js',
      kind: 'js',
      content: scripts,
      byteLength: byteLength(scripts)
    })
  }

  Array.from(documentNode.querySelectorAll('img[src]')).forEach(
    (image, index) => {
      const source = image.getAttribute('src')?.trim() ?? ''
      if (!source) return
      const dataMatch = /^data:([^;,]+)[;,]/i.exec(source)
      const extension = dataMatch
        ? extensionForMime(dataMatch[1] ?? '')
        : remoteExtension(source)
      files.push({
        path: `assets/image-${String(index + 1).padStart(2, '0')}.${extension}`,
        kind: 'image',
        content: source,
        byteLength: byteLength(source)
      })
    }
  )

  return files
}
