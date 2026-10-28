import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type {
  AgentReferenceImage,
  AppProject,
  DesignVersion
} from '../shared/types'

export const ASSET_PROTOCOL = 'mees-asset'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/avif': 'avif'
}

const EXTENSION_MIMES: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSIONS).map(([mime, extension]) => [
    extension,
    mime
  ])
)
EXTENSION_MIMES.jpg = 'image/jpeg'

export interface StoredAsset {
  token: string
  fileName: string
  contentType: string
  byteLength: number
}

function normalizeContentType(value: string): string {
  return value.trim().toLocaleLowerCase('en').split(';')[0] ?? ''
}

function extensionFor(contentType: string): string | null {
  return MIME_EXTENSIONS[normalizeContentType(contentType)] ?? null
}

export function isAssetUrl(value: string): boolean {
  return value.startsWith(`${ASSET_PROTOCOL}://asset/`)
}

export function assetFileNameFromUrl(value: string): string | null {
  if (!isAssetUrl(value)) return null
  try {
    const file = basename(new URL(value).pathname)
    return /^[a-f0-9]{64}\.[a-z0-9]{2,5}$/i.test(file) ? file : null
  } catch {
    return null
  }
}

export class AssetStore {
  readonly directory: string
  private initialized = false

  constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'assets')
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await mkdir(this.directory, { recursive: true })
    this.initialized = true
  }

  async saveDataUrl(
    dataUrl: string,
    role: 'asset' | 'reference' | 'screenshot' | 'derived' = 'asset'
  ): Promise<StoredAsset | null> {
    const match =
      /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
        dataUrl.trim()
      )
    if (!match?.[1] || !match[2]) return null
    const contentType = normalizeContentType(match[1])
    const extension = extensionFor(contentType)
    if (!extension) return null
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
    if (bytes.byteLength === 0 || bytes.byteLength > 24 * 1024 * 1024) {
      return null
    }
    return this.saveBytes(bytes, contentType, role)
  }

  async saveBytes(
    bytes: Uint8Array,
    contentType: string,
    _role: 'asset' | 'reference' | 'screenshot' | 'derived' = 'asset'
  ): Promise<StoredAsset> {
    await this.init()
    const normalizedType = normalizeContentType(contentType)
    const extension = extensionFor(normalizedType)
    if (!extension) {
      throw new Error(`Unsupported stored asset type: ${contentType}`)
    }
    if (bytes.byteLength === 0 || bytes.byteLength > 24 * 1024 * 1024) {
      throw new Error('The asset is empty or larger than 24 MB.')
    }
    const digest = createHash('sha256').update(bytes).digest('hex')
    const fileName = `${digest}.${extension}`
    const filePath = join(this.directory, fileName)
    try {
      await readFile(filePath)
    } catch {
      await writeFile(filePath, bytes, { mode: 0o600 })
    }
    return {
      token: `${ASSET_PROTOCOL}://asset/${fileName}`,
      fileName,
      contentType: normalizedType,
      byteLength: bytes.byteLength
    }
  }

  async read(fileName: string): Promise<{
    bytes: Buffer
    contentType: string
  } | null> {
    const safeName = basename(fileName)
    if (
      safeName !== fileName ||
      !/^[a-f0-9]{64}\.[a-z0-9]{2,5}$/i.test(safeName)
    ) {
      return null
    }
    const extension = safeName.split('.').pop()?.toLocaleLowerCase('en') ?? ''
    const contentType = EXTENSION_MIMES[extension]
    if (!contentType) return null
    try {
      return {
        bytes: await readFile(join(this.directory, safeName)),
        contentType
      }
    } catch {
      return null
    }
  }

  async toDataUrl(token: string): Promise<string | null> {
    const fileName = assetFileNameFromUrl(token)
    if (!fileName) return null
    const asset = await this.read(fileName)
    if (!asset) return null
    return `data:${asset.contentType};base64,${asset.bytes.toString('base64')}`
  }

  async assetizeHtml(html: string): Promise<string> {
    const sources = Array.from(
      new Set(
        html.match(
          /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi
        ) ?? []
      )
    )
    if (sources.length === 0) return html
    let next = html
    for (const source of sources) {
      const stored = await this.saveDataUrl(source)
      if (stored) next = next.split(source).join(stored.token)
    }
    return next
  }

  async hydrateHtml(html: string): Promise<string> {
    const tokens = Array.from(
      new Set(
        html.match(
          /mees-asset:\/\/asset\/[a-f0-9]{64}\.[a-z0-9]{2,5}/gi
        ) ?? []
      )
    )
    let next = html
    for (const token of tokens) {
      const dataUrl = await this.toDataUrl(token)
      if (dataUrl) next = next.split(token).join(dataUrl)
    }
    return next
  }

  private async assetizeReference(
    image: AgentReferenceImage
  ): Promise<AgentReferenceImage> {
    if (!image.dataUrl.startsWith('data:')) return image
    const stored = await this.saveDataUrl(image.dataUrl, 'reference')
    return stored ? { ...image, dataUrl: stored.token } : image
  }

  async assetizeVersion(version: DesignVersion): Promise<DesignVersion> {
    return {
      ...version,
      designHtml: await this.assetizeHtml(version.designHtml)
    }
  }

  async assetizeProject(project: AppProject): Promise<AppProject> {
    const messages = await Promise.all(
      project.messages.map(async (message) => {
        const referenceImages = message.referenceImages
          ? await Promise.all(
              message.referenceImages.map((image) =>
                this.assetizeReference(image)
              )
            )
          : undefined
        return {
          ...message,
          ...(referenceImages?.length ? { referenceImages } : {})
        }
      })
    )
    const versions = await Promise.all(
      (project.versions ?? []).map((version) =>
        this.assetizeVersion(version)
      )
    )
    return {
      ...project,
      messages,
      versions,
      designHtml: await this.assetizeHtml(project.designHtml)
    }
  }

}
