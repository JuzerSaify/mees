const repositoryUrl = 'https://github.com/JuzerSaify/mees'
const metricsApi = '/api/metrics'
const metricsCacheKey = 'mees:public-metrics:v3'
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

function compactNumber(value) {
  return new Intl.NumberFormat('en', {
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? 'compact' : 'standard'
  }).format(value)
}

function readMetricsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(metricsCacheKey) ?? 'null')
    if (
      !cached ||
      !Number.isFinite(cached.stars) ||
      !Number.isFinite(cached.downloads) ||
      Date.now() - Number(cached.checkedAt) > 6 * 60 * 60 * 1000
    ) {
      return null
    }
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
  document.querySelectorAll('[data-download-link]').forEach((element) => {
    element.href = downloadUrl
  })
}

async function loadMetrics() {
  const cached = readMetricsCache()
  if (cached) renderMetrics(cached)

  try {
    const response = await fetch(metricsApi)
    if (!response.ok) throw new Error(`Metrics returned ${response.status}.`)
    const metrics = await response.json()
    if (!Number.isFinite(metrics.stars) || !Number.isFinite(metrics.downloads)) {
      throw new Error('Public metrics were unavailable.')
    }
    const next = {
      stars: metrics.stars,
      downloads: metrics.downloads,
      downloadUrl: metrics.downloadUrl || `${repositoryUrl}/releases/latest`,
      checkedAt: Date.now()
    }
    renderMetrics(next)
    localStorage.setItem(metricsCacheKey, JSON.stringify(next))
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

const menuToggle = document.querySelector('[data-menu-toggle]')
const mobileMenu = document.querySelector('[data-mobile-menu]')

function setMenuOpen(open) {
  if (!menuToggle || !mobileMenu) return
  menuToggle.setAttribute('aria-expanded', String(open))
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  mobileMenu.hidden = !open
  document.body.classList.toggle('menu-open', open)
  if (open) mobileMenu.querySelector('a')?.focus()
}

menuToggle?.addEventListener('click', () => {
  setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true')
})

document.querySelectorAll('[data-mobile-menu] a').forEach((link) => {
  link.addEventListener('click', () => setMenuOpen(false))
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (menuToggle?.getAttribute('aria-expanded') !== 'true') return
  setMenuOpen(false)
  menuToggle.focus()
})

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const targets = document.querySelectorAll('[data-reveal]')
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  )
  document.documentElement.classList.add('reveal-enabled')
  targets.forEach((target) => observer.observe(target))
}

void loadMetrics()
