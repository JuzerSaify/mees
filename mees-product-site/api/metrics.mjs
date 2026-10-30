const API_ROOT = 'https://api.github.com/repos/JuzerSaify/mees'
const RELEASE_FALLBACK =
  'https://github.com/JuzerSaify/mees/releases/latest'

async function githubJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mees-public-site',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`)
  return response.json()
}

export default async function handler(_request, response) {
  response.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=86400'
  )

  const [repositoryResult, releasesResult] = await Promise.allSettled([
    githubJson(API_ROOT),
    githubJson(`${API_ROOT}/releases?per_page=20`)
  ])
  const releases =
    releasesResult.status === 'fulfilled' && Array.isArray(releasesResult.value)
      ? releasesResult.value
      : []
  const installers = releases.flatMap((release) =>
    (release.assets || [])
      .filter((asset) => /^Mees-Setup-.*\.exe$/i.test(asset.name))
      .map((asset) => ({ asset, release }))
  )
  const downloads = installers.reduce(
    (total, item) => total + Number(item.asset.download_count || 0),
    0
  )
  const latestInstaller =
    installers.find(
      (item) => item.release.tag_name === releases[0]?.tag_name
    )?.asset || installers[0]?.asset
  const stars =
    repositoryResult.status === 'fulfilled'
      ? Number(repositoryResult.value.stargazers_count || 0)
      : 0

  response.status(200).json({
    stars,
    downloads,
    downloadUrl: latestInstaller?.browser_download_url || RELEASE_FALLBACK,
    source:
      repositoryResult.status === 'fulfilled' &&
      releasesResult.status === 'fulfilled'
        ? 'github'
        : installers.length
          ? 'partial'
          : 'fallback'
  })
}
