const repository = {
  owner: 'JuzerSaify',
  name: 'mees'
}

const repositoryUrl = `https://github.com/${repository.owner}/${repository.name}`
const metricsApi = '/api/metrics'
const metricsCacheKey = 'mees:public-metrics:v2'

const directionData = {
  coastal: {
    brand: 'Fieldwork',
    context: 'Atlantic archive',
    title: 'Read the coast.',
    description:
      'A living archive of the Atlantic edge, told through land, weather and the people who keep watch.',
    coordinate: 'N / 04',
    index: ['Shoreline', 'Weather', 'Oral history'],
    canvasName: 'Fieldwork / Atlantic archive',
    logoWordmark: 'Fieldwork',
    vectorName: 'Atlantic contour',
    motionCaption: 'A measured drift, not a loop.'
  },
  civic: {
    brand: 'Assembly',
    context: 'Civic index',
    title: 'A city keeps time.',
    description:
      'A public index for the routes, rooms and records that make a city legible.',
    coordinate: 'C / 12',
    index: ['Routes', 'Rooms', 'Recorded'],
    canvasName: 'Assembly / Civic index',
    logoWordmark: 'Assembly',
    vectorName: 'Civic field',
    motionCaption: 'A city moves in intervals.'
  },
  signal: {
    brand: 'Signal house',
    context: 'Independent studio',
    title: 'Make the room turn.',
    description:
      'An identity and living portfolio for work that changes the temperature of a space.',
    coordinate: 'S / 01',
    index: ['Identity', 'Motion', 'Direction'],
    canvasName: 'Signal house / Independent studio',
    logoWordmark: 'Signal',
    vectorName: 'Signal form',
    motionCaption: 'One idea, held in motion.'
  }
}

const modeDescriptions = {
  website: 'Responsive website rendered in the live canvas',
  logo: 'Standalone SVG mark rendered at three scales',
  vector: 'Editable vector artwork rendered in the live canvas',
  motion: 'Silent, code-built motion rendered in the live canvas'
}

const liveUi = document.querySelector('[data-live-ui]')
const directionButtons = Array.from(
  document.querySelectorAll('[data-direction-button]')
)
const modeButtons = Array.from(document.querySelectorAll('[data-mode-button]'))
const artifactViews = Array.from(document.querySelectorAll('[data-artifact]'))
const modeDescription = document.querySelector('[data-mode-description]')
const runState = document.querySelector('.run-state')
const runStatus = document.querySelector('[data-run-status]')
const runSteps = Array.from(document.querySelectorAll('[data-run-step]'))
const motionArtifact = document.querySelector('[data-motion-artifact]')
const motionToggle = document.querySelector('[data-motion-toggle]')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
let runSequence = 0
let runTimers = []

function updateDirection(direction) {
  const data = directionData[direction]
  if (!liveUi || !data) return

  liveUi.dataset.direction = direction
  directionButtons.forEach((button) => {
    const active = button.dataset.directionButton === direction
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  })

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value
    })
  }

  setText('[data-artifact-brand]', data.brand)
  setText('[data-artifact-context]', data.context)
  setText('[data-artifact-title]', data.title)
  setText('[data-artifact-description]', data.description)
  setText('[data-artifact-coordinate]', data.coordinate)
  setText('[data-artifact-index-one]', data.index[0])
  setText('[data-artifact-index-two]', data.index[1])
  setText('[data-artifact-index-three]', data.index[2])
  setText('[data-canvas-name]', data.canvasName)
  setText('[data-logo-wordmark]', data.logoWordmark)
  setText('[data-vector-name]', data.vectorName)
  setText('[data-motion-caption]', data.motionCaption)
}

function clearRunTimers() {
  runTimers.forEach((timer) => window.clearTimeout(timer))
  runTimers = []
}

function setRunState(label, state) {
  runStatus.textContent = label
  runState.classList.toggle('is-working', state === 'working')
}

function resetRunSteps() {
  runSteps.forEach((step) => {
    step.classList.remove('is-active', 'is-complete')
    step.querySelector('[data-step-state]').textContent = 'Waiting'
  })
}

function activateStep(index) {
  runSteps.forEach((step, stepIndex) => {
    step.classList.toggle('is-active', stepIndex === index)
    step.classList.toggle('is-complete', stepIndex < index)
    step.querySelector('[data-step-state]').textContent =
      stepIndex < index ? 'Done' : stepIndex === index ? 'Working' : 'Waiting'
  })
}

function completeRun(label = 'Ready') {
  runSteps.forEach((step) => {
    step.classList.remove('is-active')
    step.classList.add('is-complete')
    step.querySelector('[data-step-state]').textContent = 'Done'
  })
  setRunState(label, 'ready')
}

function runWorkingSequence() {
  if (runSteps.length === 0) return
  if (reducedMotion.matches) {
    completeRun('Updated')
    return
  }

  clearRunTimers()
  const sequence = ++runSequence
  resetRunSteps()
  setRunState('Directing', 'working')

  runSteps.forEach((_, index) => {
    runTimers.push(
      window.setTimeout(() => {
        if (sequence !== runSequence) return
        activateStep(index)
        const labels = [
          'Reading the brief',
          'Finding a direction',
          'Composing the canvas',
          'Reviewing the result'
        ]
        setRunState(labels[index], 'working')
      }, index * 310)
    )
  })

  runTimers.push(
    window.setTimeout(() => {
      if (sequence !== runSequence) return
      completeRun('Ready')
    }, runSteps.length * 310 + 360)
  )
}

function setMode(mode, options = {}) {
  if (!liveUi || !directionData[options.direction ?? liveUi.dataset.direction]) {
    return
  }

  if (options.direction) updateDirection(options.direction)
  liveUi.dataset.mode = mode

  modeButtons.forEach((button) => {
    const active = button.dataset.modeButton === mode
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  })

  artifactViews.forEach((view) => {
    const active = view.dataset.artifact === mode
    view.classList.toggle('is-active', active)
    view.hidden = !active
  })

  if (modeDescription) modeDescription.textContent = modeDescriptions[mode]

  if (motionArtifact && motionToggle) {
    const canPlay = mode === 'motion' && !reducedMotion.matches
    motionArtifact.classList.toggle('is-playing', canPlay)
    motionToggle.setAttribute('aria-pressed', String(canPlay))
    motionToggle.textContent = canPlay ? 'Pause' : reducedMotion.matches ? 'Static preview' : 'Play'
    motionToggle.disabled = reducedMotion.matches
  }

  runWorkingSequence()

  if (options.scroll) {
    document.querySelector('#canvas').scrollIntoView({
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    })
  }
}

function toggleMotion() {
  if (!motionArtifact || !motionToggle || reducedMotion.matches) return
  const playing = !motionArtifact.classList.contains('is-playing')
  motionArtifact.classList.toggle('is-playing', playing)
  motionToggle.setAttribute('aria-pressed', String(playing))
  motionToggle.textContent = playing ? 'Pause' : 'Play'
  setRunState(playing ? 'Playing' : 'Paused', 'ready')
}

directionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    updateDirection(button.dataset.directionButton)
    runWorkingSequence()
  })
})

modeButtons.forEach((button, index) => {
  button.addEventListener('click', () => {
    setMode(button.dataset.modeButton)
  })

  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let nextIndex = index
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + modeButtons.length) % modeButtons.length
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % modeButtons.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = modeButtons.length - 1
    const nextButton = modeButtons[nextIndex]
    nextButton.focus()
    setMode(nextButton.dataset.modeButton)
  })
})

document.querySelectorAll('[data-set-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    setMode(button.dataset.setMode, { scroll: true })
  })
})

if (motionToggle) motionToggle.addEventListener('click', toggleMotion)

const modelTrigger = document.querySelector('[data-model-trigger]')
const modelPopover = document.querySelector('[data-model-popover]')

function setModelOpen(open) {
  if (!modelTrigger || !modelPopover) return
  modelTrigger.setAttribute('aria-expanded', String(open))
  modelPopover.hidden = !open
}

modelTrigger?.addEventListener('click', (event) => {
  event.stopPropagation()
  setModelOpen(modelPopover?.hidden ?? false)
})

document.addEventListener('click', (event) => {
  if (!modelPopover || modelPopover.hidden) return
  if (modelPopover.contains(event.target)) return
  setModelOpen(false)
})

const menuToggle = document.querySelector('[data-menu-toggle]')
const mobileMenu = document.querySelector('[data-mobile-menu]')

function setMenuOpen(open) {
  if (!menuToggle || !mobileMenu) return
  menuToggle.setAttribute('aria-expanded', String(open))
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  mobileMenu.hidden = !open
  document.body.classList.toggle('menu-open', open)
}

menuToggle?.addEventListener('click', () => {
  setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true')
})

document.querySelectorAll('[data-mobile-menu] a').forEach((link) => {
  link.addEventListener('click', () => setMenuOpen(false))
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  setModelOpen(false)
  if (menuToggle?.getAttribute('aria-expanded') === 'true') {
    setMenuOpen(false)
    menuToggle.focus()
  }
})

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
    if (!cached || !Number.isFinite(cached.stars) || !Number.isFinite(cached.downloads)) {
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

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`)
  return response.json()
}

async function loadMetrics() {
  const cached = readMetricsCache()
  if (cached) renderMetrics(cached)

  try {
    const metrics = await fetchJson(metricsApi)
    if (!Number.isFinite(metrics.stars) || !Number.isFinite(metrics.downloads)) {
      throw new Error('Public metrics were unavailable.')
    }
    const nextMetrics = {
      stars: metrics.stars,
      downloads: metrics.downloads,
      downloadUrl: metrics.downloadUrl || `${repositoryUrl}/releases/latest`,
      checkedAt: Date.now()
    }
    renderMetrics(nextMetrics)
    localStorage.setItem(metricsCacheKey, JSON.stringify(nextMetrics))
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

setMode('website')
void loadMetrics()

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const revealTargets = document.querySelectorAll('[data-reveal]')
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
  revealTargets.forEach((element) => observer.observe(element))
}
