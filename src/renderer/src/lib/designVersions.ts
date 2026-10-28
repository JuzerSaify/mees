import type { DesignVersion } from '../../../shared/types'

const MAX_DESIGN_VERSIONS = 8

export function addDesignVersion(
  versions: DesignVersion[] | undefined,
  designHtml: string,
  revision: number,
  label?: string
): DesignVersion[] {
  if (!designHtml.trim()) return versions ?? []
  const existing = versions ?? []
  if (existing.some((version) => version.designHtml === designHtml)) return existing

  const nextVersion: DesignVersion = {
    id: crypto.randomUUID(),
    label: label ?? `Draft ${Math.max(1, revision)}`,
    designHtml,
    createdAt: new Date().toISOString(),
    revision
  }

  return [...existing, nextVersion].slice(-MAX_DESIGN_VERSIONS)
}

export function pruneDesignVersions(versions: DesignVersion[]): DesignVersion[] {
  return versions.slice(-MAX_DESIGN_VERSIONS)
}
