const repository = {
  owner: 'JuzerSaify',
  name: 'mees'
}

const repositoryUrl = `https://github.com/${repository.owner}/${repository.name}`
const releasesApi = `https://api.github.com/repos/${repository.owner}/${repository.name}/releases?per_page=100`
const repositoryApi = `https://api.github.com/repos/${repository.owner}/${repository.name}`
const metricsCacheKey = 'mees:github-metrics:v1'

const viewDefinitions = {
  studio: {
    alt: 'The Mees studio with a complete website and the agent panel visible',
    caption: 'Northline Archive, a website built and reviewed in Mees.',
    image: 'assets/studio.png',
    label: 'Studio canvas'
  },
  agent: {
    alt: 'The Mees agent timeline expanded beside a generated website',
    caption: 'Research, tool use, writing and review stay visible beside the artifact.',
    image: 'assets/agent.png',
    label: 'Live agent'
  },
  review: {
    alt: 'Mees showing browser review and artifact health in the design inspector',
    caption: 'The design inspector reports structural and runtime findings after browser review.',
    image: 'assets/review.png',
    label: 'Browser review'
  },
  reference: {
    alt: 'Mees comparing a reference image with the live artifact',
    caption: 'Reference images stay beside the build with measured visual context.',
    image: 'assets/reference.png',
    label: 'Reference comparison'
  }
}

const stage = document.querySelector('[data-studio-frame]')
const stageImage = document.querySelector('[data-stage-image]')
const stageLabel = document.querySelector('#stage-view-label')
const stageCaption = document.querySelector('#stage-caption')
const stageTabs = Array.from(document.querySelectorAll('.stage-tab'))
const stageTriggers = Array.from(document.querySelectorAll('[data-stage-view]'))
let activeView = 'studio'
let viewSequence = 0

function compactNumber(value) {
  return new Intl.NumberFormat('en', {
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? 'compact' : 'standard'
  }).format(value)
}

function updateStageTabs(nextView) {
  stageTabs.forEach((tab, index) => {
    const selected = tab.dataset.stageView === nextView
    tab.classList.toggle('is-active', selected)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    if (selected) stage.setAttribute('data-view', tab.dataset.stageView)
    if (!selected) tab.blur()
    if (selected) tab.dataset.index = String(index)
  })
}

async function selectStageView(nextView) {
  const definition = viewDefinitions[nextView]
  if (!definition || !stage || !stageImage || nextView === activeView) return
  const sequence = viewSequence + 1
  viewSequence = sequence
  activeView = nextView
  updateStageTabs(nextView)
  stage.classList.add('is-changing')

  const preload = new Image()
  preload.src = definition.image
  await preload.decode().catch(() => undefined)
  if (sequence !== viewSequence) return

  stageImage.src = definition.image
  stageImage.alt = definition.alt
  if (stageLabel) stageLabel.textContent = definition.label
  if (stageCaption) stageCaption.textContent = definition.caption
  requestAnimationFrame(() => stage.classList.remove('is-changing'))
}

stageTriggers.forEach((trigger) => {
  trigger.addEventListener('click', () => {
    const nextView = trigger.dataset.stageView
    if (nextView) void selectStageView(nextView)
  })
})

stageTabs.forEach((tab, index) => {
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + stageTabs.length) % stageTabs.length
    const nextTab = stageTabs[nextIndex]
    nextTab.focus()
    void selectStageView(nextTab.dataset.stageView)
  })
})

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(() => {
    Object.values(viewDefinitions).forEach((definition) => {
      const image = new Image()
      image.src = definition.image
    })
  })
}

function readCachedMetrics() {
  try {
    const cached = JSON.parse(localStorage.getItem(metricsCacheKey) || 'null')
    if (!cached || typeof cached.stars !== 'number') return null
    return cached
  } catch {
    return null
  }
}

function renderMetrics({ stars, downloads, downloadUrl }) {
  document.querySelectorAll('[data-github-stars]').forEach((element) => {
    element.textContent = compactNumber(stars)
    element.title = `${stars.toLocaleString('en')} GitHub stars`
  })
  document.querySelectorAll('[data-download-count]').forEach((element) => {
    element.textContent = compactNumber(downloads)
    element.title = `${downloads.toLocaleString('en')} Windows downloads`
  })
  document.querySelectorAll('[data-download-link]').forEach((link) => {
    link.href = downloadUrl
  })
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!response.ok) {
    throw new Error(`GitHub request failed with ${response.status}.`)
  }
  return response.json()
}

async function loadGithubMetrics() {
  const cached = readCachedMetrics()
  if (cached) renderMetrics(cached)

  try {
    const [repo, releases] = await Promise.all([
      fetchJson(repositoryApi),
      fetchJson(releasesApi)
    ])
    if (!Array.isArray(releases)) throw new Error('GitHub releases were unavailable.')

    const windowsAssets = releases.flatMap((release) =>
      (release.assets || [])
        .filter((asset) => /\.exe$/i.test(asset.name))
        .map((asset) => ({ asset, release }))
    )
    const downloads = windowsAssets.reduce(
      (total, { asset }) => total + Number(asset.download_count || 0),
      0
    )
    const directDownload =
      windowsAssets.find(
        ({ release }) => release.tag_name === releases[0]?.tag_name
      )?.asset.browser_download_url ?? `${repositoryUrl}/releases/latest`

    const metrics = {
      stars: Number(repo.stargazers_count || 0),
      downloads,
      downloadUrl: directDownload,
      checkedAt: Date.now()
    }
    renderMetrics(metrics)
    localStorage.setItem(metricsCacheKey, JSON.stringify(metrics))
  } catch {
    if (!cached) {
      renderMetrics({
        stars: 0,
        downloads: 0,
        downloadUrl: `${repositoryUrl}/releases/latest`
      })
    }
  }
}

void loadGithubMetrics()

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void loadGithubMetrics()
})
