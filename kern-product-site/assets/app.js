(() => {
  const hero = document.querySelector('.hero')
  const canvas = document.querySelector('#artifact-field')
  const modeButtons = [...document.querySelectorAll('[data-mode]')]
  const modeName = document.querySelector('#mode-name')
  const modeOutput = document.querySelector('#mode-output')
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  )

  const modes = {
    website: {
      name: 'Website',
      output: 'Responsive HTML'
    },
    logo: {
      name: 'Logo',
      output: 'Transparent vector mark'
    },
    vector: {
      name: 'Vector',
      output: 'Editable SVG artwork'
    },
    motion: {
      name: 'Motion',
      output: 'Silent 1280 by 720 video'
    }
  }

  const modeOrder = ['website', 'logo', 'vector', 'motion']
  let activeMode = 'website'
  let previousMode = 'website'
  let transitionStartedAt = performance.now() - 1000
  let animationFrame = 0
  let canvasVisible = true
  let width = 0
  let height = 0
  let deviceScale = 1
  let pointer = { x: 0.74, y: 0.48, targetX: 0.74, targetY: 0.48 }

  const colors = {
    ink: '23, 27, 24',
    muted: '89, 100, 93',
    accent: '27, 108, 128',
    light: '244, 246, 241'
  }

  if (hero && canvas) {
    hero.classList.add('is-live')
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function easeOutQuart(value) {
    return 1 - Math.pow(1 - clamp(value, 0, 1), 4)
  }

  function fieldRect() {
    if (width <= 880) {
      return {
        x: width * 0.08,
        y: height * 0.43,
        width: width * 0.86,
        height: height * 0.39
      }
    }
    return {
      x: width * 0.485,
      y: height * 0.115,
      width: width * 0.48,
      height: height * 0.74
    }
  }

  function warpedPoint(field, x, y, strength = 1) {
    const px = field.x + pointer.x * field.width
    const py = field.y + pointer.y * field.height
    let sx = field.x + x * field.width
    let sy = field.y + y * field.height
    const dx = sx - px
    const dy = sy - py
    const radius = Math.max(150, field.width * 0.22)
    const influence = Math.exp(-(dx * dx + dy * dy) / (radius * radius))
    sx += (pointer.x - 0.5) * 30 * influence * strength
    sy += (pointer.y - 0.5) * 22 * influence * strength
    return [sx, sy]
  }

  function beginPath(points) {
    canvas.getContext('2d').beginPath()
    points.forEach(([x, y], index) => {
      if (index === 0) canvas.getContext('2d').moveTo(x, y)
      else canvas.getContext('2d').lineTo(x, y)
    })
  }

  function strokePath(points, options = {}) {
    if (points.length < 2) return
    const context = canvas.getContext('2d')
    const {
      alpha = 1,
      accent = false,
      close = false,
      dash = null,
      width: lineWidth = 1
    } = options
    context.save()
    context.globalAlpha = alpha
    context.strokeStyle = accent
      ? `rgba(${colors.accent}, 0.94)`
      : `rgba(${colors.ink}, 0.6)`
    context.lineWidth = lineWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (dash) context.setLineDash(dash)
    beginPath(points)
    if (close) context.closePath()
    context.stroke()
    context.restore()
  }

  function fillPolygon(field, controls, color, strength = 1) {
    const context = canvas.getContext('2d')
    const points = controls.map(([x, y], index) =>
      warpedPoint(field, x, y, index % 2 === 0 ? 0.55 : 0.35)
    )
    context.save()
    context.fillStyle = color
    context.globalAlpha = strength
    context.beginPath()
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.closePath()
    context.fill()
    context.restore()
  }

  function smoothClosedPath(field, controls, alpha, lineWidth, accent = false) {
    const context = canvas.getContext('2d')
    const points = controls.map(([x, y], index) =>
      warpedPoint(field, x, y, index % 2 === 0 ? 1 : 0.7)
    )
    const first = points[0]
    const last = points[points.length - 1]
    context.save()
    context.globalAlpha = alpha
    context.strokeStyle = accent
      ? `rgba(${colors.accent}, 0.94)`
      : `rgba(${colors.ink}, 0.6)`
    context.lineWidth = lineWidth
    context.beginPath()
    context.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2)
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index]
      const next = points[(index + 1) % points.length]
      context.quadraticCurveTo(
        current[0],
        current[1],
        (current[0] + next[0]) / 2,
        (current[1] + next[1]) / 2
      )
    }
    context.closePath()
    context.stroke()
    context.restore()
  }

  function drawWebsite(field, alpha) {
    fillPolygon(
      field,
      [
        [0.03, 0.12],
        [0.53, 0.03],
        [0.46, 0.94],
        [0.01, 0.82]
      ],
      `rgba(${colors.ink}, 0.07)`,
      alpha
    )
    fillPolygon(
      field,
      [
        [0.53, 0.15],
        [0.96, 0.09],
        [0.92, 0.87],
        [0.46, 0.79]
      ],
      `rgba(${colors.accent}, 0.16)`,
      alpha
    )

    const frames = [
      { x: 0.05, y: 0.08, w: 0.88, h: 0.81, width: 1.4, alpha: 0.76 },
      { x: 0.15, y: 0.18, w: 0.61, h: 0.6, width: 1.2, alpha: 0.45 }
    ]

    frames.forEach((frame, frameIndex) => {
      const points = [
        [frame.x, frame.y],
        [frame.x + frame.w, frame.y],
        [frame.x + frame.w, frame.y + frame.h],
        [frame.x, frame.y + frame.h]
      ].map(([x, y]) => warpedPoint(field, x, y, 0.65))
      strokePath(points, {
        alpha: alpha * frame.alpha,
        accent: frameIndex === 2,
        close: true,
        width: frame.width
      })
    })

    for (let index = 0; index < 5; index += 1) {
      const y = 0.15 + index * 0.09
      const start = 0.12 + (index % 3) * 0.035
      const end = index === 1 ? 0.72 : 0.55 + (index % 2) * 0.2
      strokePath(
        [
          warpedPoint(field, start, y, 0.35),
          warpedPoint(field, end, y + (index % 2 ? 0.008 : -0.005), 0.35)
        ],
        {
          alpha: alpha * (index < 2 ? 0.32 : 0.18),
          width: index === 0 ? 3 : 1.2
        }
      )
    }

    fillPolygon(
      field,
      [
        [0.33, 0.62],
        [0.34, 0.78],
        [0.5, 0.78],
        [0.5, 0.62]
      ],
      `rgba(${colors.accent}, 0.86)`,
      alpha
    )

    strokePath(
      [
        warpedPoint(field, 0.1, 0.78, 0.7),
        warpedPoint(field, 0.18, 0.71, 0.8),
        warpedPoint(field, 0.18, 0.69, 0.8),
        warpedPoint(field, 0.71, 0.69, 0.8)
      ],
      { alpha: alpha * 0.9, accent: true, width: 4 }
    )
  }

  function drawLogo(field, alpha) {
    fillPolygon(
      field,
      [
        [0.62, 0.58],
        [0.9, 0.58],
        [0.9, 0.88],
        [0.62, 0.88]
      ],
      `rgba(${colors.accent}, 0.12)`,
      alpha
    )

    const mark = [
      [
        [0.31, 0.16],
        [0.31, 0.84]
      ],
      [
        [0.31, 0.48],
        [0.68, 0.16]
      ],
      [
        [0.31, 0.52],
        [0.69, 0.84]
      ]
    ]

    mark.forEach((line, index) => {
      strokePath(
        line.map(([x, y]) => warpedPoint(field, x, y, 0.85)),
        {
          alpha: alpha * (index === 0 ? 0.9 : 0.74),
          width: 17
        }
      )
    })

    strokePath(
      [
        warpedPoint(field, 0.79, 0.17, 0.6),
        warpedPoint(field, 0.79, 0.83, 0.6)
      ],
      { alpha: alpha * 0.95, accent: true, width: 5 }
    )

    smoothClosedPath(
      field,
      [
        [0.08, 0.25],
        [0.19, 0.08],
        [0.74, 0.08],
        [0.92, 0.23],
        [0.92, 0.77],
        [0.74, 0.92],
        [0.19, 0.92],
        [0.08, 0.75]
      ],
      alpha * 0.18,
      1
    )

    for (const x of [0.18, 0.41, 0.64, 0.88]) {
      strokePath(
        [
          warpedPoint(field, x, 0.07, 0.32),
          warpedPoint(field, x, 0.93, 0.32)
        ],
        { alpha: alpha * 0.12, width: 1 }
      )
    }
  }

  function vectorLoop(cx, cy, rx, ry, phase, points = 14) {
    return Array.from({ length: points }, (_, index) => {
      const angle = (index / points) * Math.PI * 2
      const wobble = 1 + Math.sin(angle * 3 + phase) * 0.09
      return [
        cx + Math.cos(angle) * rx * wobble,
        cy + Math.sin(angle) * ry * wobble
      ]
    })
  }

  function drawVector(field, alpha) {
    const loops = [
      { cx: 0.52, cy: 0.5, rx: 0.39, ry: 0.36, phase: 0.2, weight: 1.25 },
      { cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, phase: 1.1, weight: 1 },
      { cx: 0.53, cy: 0.52, rx: 0.2, ry: 0.21, phase: 2.3, weight: 1 },
      { cx: 0.5, cy: 0.48, rx: 0.1, ry: 0.12, phase: 3.5, weight: 1 }
    ]

    loops.forEach((loop, index) => {
      if (index === 0) {
        fillPolygon(
          field,
          vectorLoop(loop.cx, loop.cy, loop.rx, loop.ry, loop.phase),
          `rgba(${colors.accent}, 0.075)`,
          alpha
        )
      }
      smoothClosedPath(
        field,
        vectorLoop(loop.cx, loop.cy, loop.rx, loop.ry, loop.phase),
        alpha * (index === 1 ? 0.8 : 0.35),
        loop.weight,
        index === 1
      )
    })

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + 0.18
      const inner = warpedPoint(
        field,
        0.5 + Math.cos(angle) * 0.1,
        0.5 + Math.sin(angle) * 0.12,
        0.5
      )
      const outer = warpedPoint(
        field,
        0.5 + Math.cos(angle) * 0.43,
        0.5 + Math.sin(angle) * 0.4,
        0.32
      )
      strokePath([inner, outer], {
        alpha: alpha * (index % 2 === 0 ? 0.2 : 0.1),
        width: 1
      })
    }
  }

  function drawMotion(field, alpha, now) {
    fillPolygon(
      field,
      [
        [0.02, 0.16],
        [0.97, 0.1],
        [0.95, 0.9],
        [0.04, 0.94]
      ],
      `rgba(${colors.ink}, 0.06)`,
      alpha
    )

    for (let line = 0; line < 7; line += 1) {
      const points = Array.from({ length: 9 }, (_, index) => {
        const x = 0.05 + (index / 8) * 0.9
        const phase = now * 0.00055 + line * 0.72
        const y =
          0.2 +
          line * 0.09 +
          Math.sin(index * 0.8 + phase) * (0.018 + line * 0.002)
        return warpedPoint(field, x, y, 0.62)
      })
      strokePath(points, {
        alpha: alpha * (line === 2 ? 0.74 : 0.28),
        accent: line === 2,
        width: line === 2 ? 2 : 1
      })
    }

    const playhead = ((now * 0.00017) % 1) * 0.78 + 0.1
    strokePath(
      [
        warpedPoint(field, 0.06, 0.84, 0.7),
        warpedPoint(field, 0.94, 0.84, 0.7)
      ],
      { alpha: alpha * 0.46, width: 1 }
    )

    for (let index = 0; index < 9; index += 1) {
      const x = 0.06 + index * 0.11
      strokePath(
        [
          warpedPoint(field, x, 0.83, 0.25),
          warpedPoint(field, x, 0.87, 0.25)
        ],
        { alpha: alpha * (index === 0 ? 0.65 : 0.3), width: index === 0 ? 2 : 1 }
      )
    }

    const context = canvas.getContext('2d')
    const [dotX, dotY] = warpedPoint(field, playhead, 0.84, 0.7)
    context.save()
    context.globalAlpha = alpha
    context.fillStyle = `rgba(${colors.accent}, 1)`
    context.beginPath()
    context.arc(dotX, dotY, 5.5, 0, Math.PI * 2)
    context.fill()
    context.restore()

    strokePath(
      [
        warpedPoint(field, playhead, 0.18, 0.45),
        warpedPoint(field, playhead, 0.81, 0.45)
      ],
      { alpha: alpha * 0.22, width: 1 }
    )
  }

  function drawMode(mode, alpha, now) {
    if (alpha <= 0.001 || !canvas) return
    const context = canvas.getContext('2d')
    context.save()
    context.globalAlpha = alpha
    const field = fieldRect()
    if (mode === 'website') drawWebsite(field, alpha)
    if (mode === 'logo') drawLogo(field, alpha)
    if (mode === 'vector') drawVector(field, alpha)
    if (mode === 'motion') drawMotion(field, alpha, now)
    context.restore()
  }

  function drawInteractionLens(now) {
    if (!canvas) return
    const field = fieldRect()
    const context = canvas.getContext('2d')
    const [x, y] = warpedPoint(field, pointer.x, pointer.y, 0)
    const radius =
      Math.min(field.width, field.height) *
      (width <= 880 ? 0.075 : 0.11) *
      (1 + Math.sin(now * 0.0011) * 0.025)
    context.save()
    context.fillStyle = `rgba(${colors.accent}, 0.045)`
    context.strokeStyle = `rgba(${colors.accent}, 0.62)`
    context.lineWidth = 1.4
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.fillStyle = `rgba(${colors.ink}, 0.8)`
    context.fillRect(x - 2.5, y - 9, 5, 18)
    context.fillRect(x - 9, y - 2.5, 18, 5)
    context.restore()
  }

  function drawFrame(now = performance.now()) {
    if (!canvas) return
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, width, height)

    pointer.x += (pointer.targetX - pointer.x) * 0.08
    pointer.y += (pointer.targetY - pointer.y) * 0.08

    const progress = prefersReducedMotion.matches
      ? 1
      : easeOutQuart((now - transitionStartedAt) / 720)

    if (progress < 1 && previousMode !== activeMode) {
      drawMode(previousMode, 1 - progress, now)
    }
    drawMode(activeMode, progress, now)
    drawInteractionLens(now)
  }

  function animate(now) {
    if (!canvasVisible || document.hidden) {
      animationFrame = 0
      return
    }
    drawFrame(now)
    animationFrame = requestAnimationFrame(animate)
  }

  function beginAnimation() {
    if (animationFrame || prefersReducedMotion.matches) return
    animationFrame = requestAnimationFrame(animate)
  }

  function stopAnimation() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }

  function resizeCanvas() {
    if (!canvas || !hero) return
    const bounds = hero.getBoundingClientRect()
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    deviceScale = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * deviceScale)
    canvas.height = Math.round(height * deviceScale)
    const context = canvas.getContext('2d')
    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0)
    drawFrame()
  }

  function setMode(mode) {
    if (!modes[mode]) return
    if (mode !== activeMode) {
      previousMode = activeMode
      activeMode = mode
      transitionStartedAt = performance.now()
    }
    modeButtons.forEach((button) => {
      const selected = button.dataset.mode === activeMode
      button.classList.toggle('is-active', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    modeName.textContent = modes[mode].name
    modeOutput.textContent = modes[mode].output
    document.documentElement.dataset.artifactMode = mode
    drawFrame()
    beginAnimation()
  }

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode))
  })

  if (hero && canvas) {
    hero.addEventListener('pointermove', (event) => {
      const bounds = hero.getBoundingClientRect()
      pointer.targetX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
      pointer.targetY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
      if (prefersReducedMotion.matches) drawFrame()
    })

    hero.addEventListener('pointerleave', () => {
      pointer.targetX = 0.74
      pointer.targetY = 0.48
    })

    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(resizeCanvas)
      resizeObserver.observe(hero)
    } else {
      window.addEventListener('resize', resizeCanvas)
    }

    if ('IntersectionObserver' in window) {
      const visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          canvasVisible = Boolean(entry?.isIntersecting)
          if (canvasVisible) beginAnimation()
          else stopAnimation()
        },
        { threshold: 0.05 }
      )
      visibilityObserver.observe(hero)
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAnimation()
      else beginAnimation()
    })

    prefersReducedMotion.addEventListener('change', () => {
      if (prefersReducedMotion.matches) {
        stopAnimation()
        drawFrame()
      } else {
        beginAnimation()
      }
    })

    resizeCanvas()
    setMode('website')
  }

  const lineHeadings = [...document.querySelectorAll('[data-lines]')]
  lineHeadings.forEach((heading) => {
    const lines = heading.innerHTML
      .split(/<br\s*\/?>/i)
      .map(
        (line, index) =>
          `<span class="text-mask"><span class="text-line" style="--line-index:${index}">${line.trim()}</span></span>`
      )
    heading.innerHTML = lines.join('')
  })

  const revealTargets = [
    ...document.querySelectorAll(
      '[data-reveal], [data-shutter], [data-lines]'
    )
  ]

  if (prefersReducedMotion.matches || !('IntersectionObserver' in window)) {
    revealTargets.forEach((element) => element.classList.add('is-in'))
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          revealObserver.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -11% 0px', threshold: 0.08 }
    )
    revealTargets.forEach((element) => revealObserver.observe(element))
    window.setTimeout(() => {
      revealTargets.forEach((element) => {
        if (element.getBoundingClientRect().top < innerHeight) {
          element.classList.add('is-in')
          revealObserver.unobserve(element)
        }
      })
    }, 1200)
  }

  const traceCopy = {
    research: {
      label: 'Source check',
      text: 'Current sources and retrieved dates stay attached to the run, so a time-sensitive claim can be checked instead of guessed.'
    },
    assets: {
      label: 'Real material',
      text: 'When a page supplies relevant media, Kern validates the file, checks its dimensions, and carries the source into the artifact instead of inventing a generic substitute.'
    },
    direct: {
      label: 'One direction',
      text: 'The brief, current evidence, and recent artifact fingerprints meet in one design turn. There is no separate planner wait before the canvas begins.'
    },
    review: {
      label: 'Measured finish',
      text: 'The rendered artifact is checked for layout, accessibility, broken assets, repeated structure, and the constraints of its mode.'
    }
  }

  const traceTabs = [...document.querySelectorAll('[data-trace]')]
  const tracePanel = document.querySelector('.trace-detail')
  const traceLabel = tracePanel?.querySelector('span')
  const traceText = tracePanel?.querySelector('p')

  traceTabs.forEach((tab, index) => {
    tab.id = `trace-tab-${tab.dataset.trace}`
    tab.setAttribute('aria-controls', 'trace-detail-panel')
    tab.tabIndex = tab.classList.contains('is-active') ? 0 : -1
    tab.addEventListener('click', () => selectTrace(index))
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return
      }
      event.preventDefault()
      const direction =
        event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
      const next = (index + direction + traceTabs.length) % traceTabs.length
      traceTabs[next].focus()
      selectTrace(next)
    })
  })

  if (tracePanel) {
    tracePanel.id = 'trace-detail-panel'
    tracePanel.setAttribute('role', 'tabpanel')
  }

  selectTrace(0)

  const motionSample = document.querySelector('.motion-sample')
  const motionToggle = document.querySelector('#motion-toggle')
  const motionSeek = document.querySelector('#motion-seek')
  const motionElapsed = document.querySelector('#motion-elapsed')
  const motionDuration = document.querySelector('#motion-duration')
  let motionSampleVisible = false
  let motionUserPaused = false

  function formatMotionTime(value, roundUp = false) {
    const seconds = Number.isFinite(value)
      ? Math.max(0, roundUp ? Math.ceil(value) : Math.floor(value))
      : 0
    const secondPart = String(seconds % 60).padStart(2, '0') // taste-skill-ignore numbering - timecode
    return `${Math.floor(seconds / 60)}:${secondPart}`
  }

  function updateMotionProgress() {
    if (!motionSample) return
    const duration = Number.isFinite(motionSample.duration)
      ? motionSample.duration
      : 0
    const elapsed = Math.min(motionSample.currentTime || 0, duration || 0)
    if (motionSeek && duration > 0) {
      motionSeek.max = String(duration)
      motionSeek.value = String(elapsed)
      motionSeek.setAttribute(
        'aria-valuetext',
        `${formatMotionTime(elapsed)} of ${formatMotionTime(duration)}`
      )
    }
    if (motionElapsed) motionElapsed.textContent = formatMotionTime(elapsed)
    if (motionDuration) {
      motionDuration.textContent = formatMotionTime(duration, true)
    }
  }

  function updateMotionToggle() {
    if (!motionSample || !motionToggle) return
    const playing = !motionSample.paused
    motionToggle.dataset.state = playing ? 'playing' : 'paused'
    motionToggle.setAttribute(
      'aria-label',
      playing ? 'Pause motion sample' : 'Play motion sample'
    )
  }

  function syncMotionSample() {
    if (!motionSample) return
    if (
      prefersReducedMotion.matches ||
      !motionSampleVisible ||
      document.hidden ||
      motionUserPaused
    ) {
      motionSample.pause()
      return
    }
    motionSample.play().catch(() => {})
  }

  if (motionToggle) {
    motionToggle.addEventListener('click', () => {
      if (motionSample.paused) {
        motionUserPaused = false
        motionSample.play().catch(() => {})
      } else {
        motionUserPaused = true
        motionSample.pause()
      }
    })
  }

  if (motionSeek) {
    motionSeek.addEventListener('input', () => {
      if (!motionSample || !Number.isFinite(motionSample.duration)) return
      motionSample.currentTime = Number(motionSeek.value)
      updateMotionProgress()
    })
  }

  motionSample?.addEventListener('loadedmetadata', updateMotionProgress)
  motionSample?.addEventListener('durationchange', updateMotionProgress)
  motionSample?.addEventListener('timeupdate', updateMotionProgress)
  motionSample?.addEventListener('play', updateMotionToggle)
  motionSample?.addEventListener('pause', updateMotionToggle)
  updateMotionProgress()
  updateMotionToggle()

  if (motionSample && 'IntersectionObserver' in window) {
    const videoObserver = new IntersectionObserver(
      ([entry]) => {
        motionSampleVisible = Boolean(entry?.isIntersecting)
        syncMotionSample()
      },
      { threshold: 0.2 }
    )
    videoObserver.observe(motionSample)
  }

  document.addEventListener('visibilitychange', syncMotionSample)
  prefersReducedMotion.addEventListener('change', syncMotionSample)

  function selectTrace(index) {
    const tab = traceTabs[index]
    const content = traceCopy[tab?.dataset.trace]
    if (!tab || !content) return
    traceTabs.forEach((item, itemIndex) => {
      const selected = itemIndex === index
      item.classList.toggle('is-active', selected)
      item.setAttribute('aria-selected', String(selected))
      item.tabIndex = selected ? 0 : -1
    })
    if (tracePanel) tracePanel.setAttribute('aria-labelledby', tab.id)
    if (traceLabel) traceLabel.textContent = content.label
    if (traceText) traceText.textContent = content.text
  }

  const copyButton = document.querySelector('#copy-command')
  const copyStatus = document.querySelector('#copy-status')
  const command = 'npm install\nnpm run dev'

  async function copyCommands() {
    let copied = false
    try {
      await navigator.clipboard.writeText(command)
      copied = true
    } catch {
      const helper = document.createElement('textarea')
      helper.value = command
      helper.setAttribute('readonly', '')
      helper.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(helper)
      helper.select()
      copied = document.execCommand('copy')
      helper.remove()
    }
    if (copyStatus) {
      copyStatus.textContent = copied
        ? 'Commands copied.'
        : 'Select the commands above to copy them.'
    }
    if (copyButton && copied) {
      const previous = copyButton.textContent
      copyButton.textContent = 'Copied'
      window.setTimeout(() => {
        copyButton.textContent = previous
      }, 2200)
    }
  }

  copyButton?.addEventListener('click', copyCommands)
})()
