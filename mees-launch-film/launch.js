const DURATION = 15
const FPS = 30
const SCENE_TIMES = {
  signal: [0, 1.95],
  canvas: [1.78, 4.35],
  agent: [4.18, 7.3],
  modes: [7.13, 9.82],
  models: [9.64, 12.48],
  end: [12.3, 15]
}

const film = document.querySelector('#film')
const scenes = Object.fromEntries(
  Array.from(document.querySelectorAll('[data-scene]')).map((element) => [
    element.dataset.scene,
    element
  ])
)

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))
const smoothstep = (value) => {
  const p = clamp(value)
  return p * p * (3 - 2 * p)
}
const progress = (time, start, end) =>
  smoothstep((time - start) / Math.max(0.001, end - start))

function scenePresence(time, start, end, edge = 0.26) {
  const enter = smoothstep((time - start) / edge)
  const exit = 1 - smoothstep((time - (end - edge)) / edge)
  return clamp(Math.min(enter, exit))
}

function setVars(element, values) {
  for (const [name, value] of Object.entries(values)) {
    element.style.setProperty(name, String(value))
  }
}

function setReveal(element, amount, distance = 30) {
  if (!element) return
  const p = smoothstep(amount)
  element.style.opacity = String(p)
  element.style.transform = `translate3d(0, ${(1 - p) * distance}px, 0)`
}

function setScene(name, opacity, blur = 0) {
  const scene = scenes[name]
  if (!scene) return
  scene.style.opacity = String(opacity)
  scene.style.filter = blur > 0.01 ? `blur(${blur}px)` : 'none'
  scene.style.visibility = opacity > 0.005 ? 'visible' : 'hidden'
}

function revealLines(sceneName, time, start, stagger = 0.14, distance = 120) {
  const scene = scenes[sceneName]
  if (!scene) return
  const lines = scene.querySelectorAll('.line-inner')
  lines.forEach((line, index) => {
    const amount = progress(time, start + index * stagger, start + 0.75 + index * stagger)
    line.style.setProperty('--line-lift', `${(1 - amount) * distance}%`)
  })
}

function renderSignal(time) {
  const scene = scenes.signal
  const p = progress(time, 0.12, 1.48)
  const settle = progress(time, 1.08, 1.82)
  setVars(scene, {
    '--axis': smoothstep((time - 0.08) / 0.9),
    '--mark-scale': 0.86 + p * 0.14 + settle * 0.018,
    '--mark-lift': (1 - p) * 36,
    '--mark-clip': `${(1 - progress(time, 0.16, 0.92)) * 100}% 0 0 0`,
    '--word-lift': `${(1 - progress(time, 0.86, 1.56)) * 110}%`,
    '--caption-opacity': progress(time, 1.3, 1.78) * 0.8
  })
}

function renderCanvas(time) {
  const scene = scenes.canvas
  const p = progress(time, SCENE_TIMES.canvas[0], SCENE_TIMES.canvas[1])
  setVars(scene, {
    '--ui-x': `${10.2 - p * 6.4}%`,
    '--ui-y': `${4.2 - p * 3.1}%`,
    '--ui-scale': 1.02 + p * 0.12,
    '--ui-tilt-x': `${0.8 + p * 0.8}deg`,
    '--ui-tilt-y': `${-10.2 - p * 1.2}deg`
  })
  revealLines('canvas', time, 1.94, 0.1, 120)
  setReveal(scene.querySelector('.scene-support'), progress(time, 2.55, 3.32), 18)
}

function renderAgent(time) {
  const scene = scenes.agent
  const p = progress(time, SCENE_TIMES.agent[0], SCENE_TIMES.agent[1])
  setVars(scene, {
    '--agent-x': `${4 - p * 4.2}%`,
    '--agent-y': `${0.8 - p * 2.1}%`,
    '--agent-scale': 1.035 + p * 0.1,
    '--agent-rotate': `${-8 + p * 4.1}deg`,
    '--agent-crop-scale': 1.07 + p * 0.06,
    '--agent-crop-y': `${p * -2.8}%`,
    '--flow-opacity': progress(time, 4.38, 4.82)
  })
  setReveal(scene.querySelector('.scene-kicker'), progress(time, 4.35, 4.72), 15)
  revealLines('agent', time, 4.43, 0.08, 95)
  renderLiveFlow(scene, time)
}

function renderLiveFlow(scene, time) {
  const start = 4.72
  const stepDuration = 0.53
  const steps = Array.from(scene.querySelectorAll('.live-step'))
  let completed = 0

  steps.forEach((step, index) => {
    const stepStart = start + index * stepDuration
    const isActive = time >= stepStart && time < stepStart + stepDuration
    const isComplete = time >= stepStart + stepDuration
    if (isComplete) completed += 1
    step.classList.toggle('is-active', isActive)
    step.classList.toggle('is-complete', isComplete)
    const state = step.querySelector('.live-step-state')
    if (state) state.textContent = isComplete ? 'Done' : isActive ? 'Working' : 'Pending'
  })

  const count = scene.querySelector('.live-flow-count')
  if (count) {
    const activeIndex = steps.findIndex((step) =>
      step.classList.contains('is-active')
    )
    count.textContent =
      activeIndex >= 0 ? `${activeIndex + 1} of ${steps.length}` : `${completed} of ${steps.length}`
  }
  scene.style.setProperty(
    '--live-progress',
    progress(time, start, start + steps.length * stepDuration)
  )
}

function renderModes(time) {
  const scene = scenes.modes
  const p = progress(time, 7.22, 9.74)
  setVars(scene, {
    '--track-x': `${-p * 1960}px`,
    '--track-y': `${2.6 - p * 1.8}%`,
    '--track-rotate': `${5.4 - p * 2.2}deg`,
    '--track-roll': `${-0.85 + p * 0.38}deg`
  })
  revealLines('modes', time, 7.24, 0.09, 120)
}

function renderModels(time) {
  const scene = scenes.models
  const p = progress(time, 9.76, 12.24)
  setVars(scene, {
    '--selector-x': `${5.5 - p * 4.2}%`,
    '--selector-y': `${2.8 - p * 2}%`,
    '--selector-scale': 0.97 + p * 0.055,
    '--selector-rotate': `${-9 + p * 3.4}deg`,
    '--selector-glow': progress(time, 10.05, 10.45) * 0.16
  })
  revealLines('models', time, 9.77, 0.08, 120)
  setReveal(scene.querySelector('.scene-support'), progress(time, 10.18, 10.85), 18)
}

function renderEnd(time) {
  const scene = scenes.end
  const p = progress(time, 12.38, 14.3)
  setVars(scene, {
    '--end-scale': 0.975 + p * 0.025,
    '--end-ring-scale': 0.72 + p * 0.4,
    '--end-ring-opacity': progress(time, 12.48, 13.7) * 0.8,
    '--end-mark-opacity': progress(time, 12.44, 12.84),
    '--end-mark-lift': `${(1 - progress(time, 12.44, 12.84)) * 22}px`,
    '--word-lift': `${(1 - progress(time, 12.62, 13.12)) * 110}%`,
    '--end-caption-opacity': progress(time, 12.98, 13.56) * 0.9,
    '--end-caption-lift': `${(1 - progress(time, 12.98, 13.56)) * 18}px`
  })
}

function renderFrameRules(time) {
  const amount = progress(time, 0.12, 0.9)
  document.querySelectorAll('.frame-rule').forEach((rule) => {
    rule.style.transform = `scaleX(${amount})`
  })
}

function renderAt(time) {
  const t = clamp(Number(time) || 0, 0, DURATION)
  const signalOpacity = scenePresence(t, ...SCENE_TIMES.signal, 0.2)
  const canvasOpacity = scenePresence(t, ...SCENE_TIMES.canvas)
  const agentOpacity = scenePresence(t, ...SCENE_TIMES.agent)
  const modesOpacity = scenePresence(t, ...SCENE_TIMES.modes)
  const modelsOpacity = scenePresence(t, ...SCENE_TIMES.models)
  const endOpacity = smoothstep((t - SCENE_TIMES.end[0]) / 0.24)

  setScene('signal', signalOpacity, Math.max(0, 1 - signalOpacity) * 2)
  setScene('canvas', canvasOpacity, Math.max(0, 1 - canvasOpacity) * 1.8)
  setScene('agent', agentOpacity, Math.max(0, 1 - agentOpacity) * 2)
  setScene('modes', modesOpacity, Math.max(0, 1 - modesOpacity) * 1.8)
  setScene('models', modelsOpacity, Math.max(0, 1 - modelsOpacity) * 1.8)
  setScene('end', endOpacity, Math.max(0, 1 - endOpacity) * 2.4)

  const paper = sceneToPaper(t)
  film.style.backgroundColor = paper
  film.style.setProperty('--base-paper', paper)
  film.style.setProperty('--grain-x', `${Math.sin(t * 17.3) * 12}px`)
  film.style.setProperty('--grain-y', `${Math.cos(t * 13.7) * 10}px`)

  renderFrameRules(t)
  renderSignal(t)
  renderCanvas(t)
  renderAgent(t)
  renderModes(t)
  renderModels(t)
  renderEnd(t)
}

function sceneToPaper(time) {
  if (time < 1.9) return '#21190f'
  if (time < 4.24) return '#e9e6df'
  if (time < 7.19) return '#21190f'
  if (time < 9.75) return '#e9e6df'
  return '#33271c'
}

let startTime = null
let frameId = null

function play() {
  if (frameId !== null) return
  startTime = performance.now()
  const tick = (now) => {
    const time = Math.min(DURATION, (now - startTime) / 1000)
    renderAt(time)
    if (time >= DURATION) {
      frameId = null
      return
    }
    frameId = requestAnimationFrame(tick)
  }
  frameId = requestAnimationFrame(tick)
}

function pause() {
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
}

function seek(time) {
  pause()
  renderAt(time)
}

window.MEES_LAUNCH = {
  width: 1920,
  height: 1080,
  fps: FPS,
  duration: DURATION,
  play,
  pause,
  seek,
  renderAt
}

Promise.all([
  document.fonts.ready,
  ...Array.from(document.images).map((image) =>
    image.decode().catch(() => undefined)
  )
]).then(() => {
  renderAt(0)
  requestAnimationFrame(() => {
    window.__MEES_LAUNCH_READY__ = true
    if (!new URLSearchParams(window.location.search).has('capture')) {
      window.setTimeout(play, 450)
    }
  })
})
