import { _electron as electron } from 'playwright'
import { createHash } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const screenshotDirectory = join(root, '.ui-check')
await mkdir(screenshotDirectory, { recursive: true })

const userData = await mkdtemp(join(tmpdir(), 'mees-ui-'))
const assetDirectory = join(userData, 'assets')
await mkdir(assetDirectory, { recursive: true })
await writeFile(
  join(userData, 'settings.json'),
  `${JSON.stringify(
    {
      version: 1,
      onboardingComplete: true,
      reviewAfterBuild: false,
      activeProvider: 'openai',
      activeModel: 'gpt-6.1-sol',
      efforts: {},
      providers: {
        openai: {
          encryptedApiKey: 'fixture-only',
          keyHint: '...test',
          models: [
            {
              id: 'gpt-6.1-sol',
              name: 'GPT-6.1 Sol',
              provider: 'openai',
              supportsImages: true
            },
            {
              id: 'gpt-5.4',
              name: 'GPT-5.4',
              provider: 'openai',
              supportsImages: true
            },
            {
              id: 'gpt-5.5',
              name: 'GPT-5.5',
              provider: 'openai',
              supportsImages: true
            },
            {
              id: 'gpt-5.6',
              name: 'GPT-5.6',
              provider: 'openai',
              supportsImages: true
            }
          ],
          selectedModel: 'gpt-6.1-sol',
          verifiedAt: new Date().toISOString()
        },
        anthropic: {
          encryptedApiKey: 'fixture-only',
          keyHint: '...test',
          models: [
            {
              id: 'claude-opus-4-7',
              name: 'Claude Opus 4.7',
              provider: 'anthropic',
              supportsImages: true
            },
            {
              id: 'claude-opus-5-1',
              name: 'Claude Opus 5.1',
              provider: 'anthropic',
              supportsImages: true
            },
            {
              id: 'claude-sonnet-5-5',
              name: 'Claude Sonnet 5.5',
              provider: 'anthropic',
              supportsImages: true
            }
          ],
          selectedModel: 'claude-opus-4-7',
          verifiedAt: new Date().toISOString()
        },
        google: {
          encryptedApiKey: 'fixture-only',
          keyHint: '...test',
          models: [
            {
              id: 'gemini-4-argon',
              name: 'Gemini 4 Argon',
              provider: 'google',
              supportsImages: true
            },
            {
              id: 'gemini-3.8-flash',
              name: 'Gemini 3.8 Flash',
              provider: 'google',
              supportsImages: true
            },
            {
              id: 'gemini-3.5-pro',
              name: 'Gemini 3.5 Pro',
              provider: 'google',
              supportsImages: true
            }
          ],
          selectedModel: 'gemini-4-argon',
          verifiedAt: new Date().toISOString()
        },
        deepseek: {
          encryptedApiKey: 'fixture-only',
          keyHint: '...test',
          models: [
            {
              id: 'deepseek-v4-pro',
              name: 'DeepSeek V4 Pro',
              provider: 'deepseek',
              supportsImages: false
            }
          ],
          selectedModel: 'deepseek-v4-pro',
          verifiedAt: new Date().toISOString()
        },
        agy: {
          harnessPath: 'C:\\Tools\\agy\\bin\\agy.exe',
          harnessVersion: '1.5.0',
          models: [
            {
              id: 'gemini-3.8-flash',
              name: 'Gemini 3.8 Flash',
              provider: 'agy',
              supportsImages: true,
              reasoningEfforts: ['low', 'medium', 'high'],
              defaultEffort: 'medium'
            },
            {
              id: 'claude-sonnet-4-6',
              name: 'Claude Sonnet 4.6',
              provider: 'agy',
              supportsImages: true,
              reasoningEfforts: []
            },
            {
              id: 'gpt-oss-120b',
              name: 'GPT-OSS 120B',
              provider: 'agy',
              supportsImages: false,
              reasoningEfforts: ['medium'],
              defaultEffort: 'medium'
            }
          ],
          selectedModel: 'gemini-3.8-flash',
          verifiedAt: new Date().toISOString()
        }
      }
    },
    null,
    2
  )}\n`,
  'utf8'
)

const reference = await readFile(
  join(root, 'build', 'icon.png')
)
async function storedSvgIcon(letter, color) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="32" y="42" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fff">${letter}</text></svg>`,
    'utf8'
  )
  const fileName = `${createHash('sha256').update(svg).digest('hex')}.svg`
  await writeFile(join(assetDirectory, fileName), svg)
  return `mees-asset://asset/${fileName}`
}
const archiveIcon = await storedSvgIcon('A', '#1b566d')
const recordIcon = await storedSvgIcon('R', '#8a541f')
const plateSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><rect width="760" height="520" fill="#d9d4c7"/><path d="M0 315C120 260 205 290 312 258c142-43 258-8 448-58v320H0Z" fill="#1b566d"/><path d="M0 367c157-53 254 9 401-31 119-32 218-18 359-53v237H0Z" fill="#365967"/><circle cx="595" cy="121" r="54" fill="#f2e9d7"/><path d="M80 90h190M80 116h130" stroke="#171916" stroke-width="8"/><path d="M509 374l-49-136M567 371l-18-207M650 388l46-158" stroke="#f0eee8" stroke-width="3"/></svg>`
const plateData = `data:image/svg+xml;base64,${Buffer.from(plateSvg).toString('base64')}`
const now = new Date().toISOString()
const designHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Northline Archive</title>
<style>
:root{--paper:#f0eee8;--ink:#171916;--blue:#1b566d}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,serif}
main{max-width:1240px;margin:auto}
section{min-height:56vh;padding:64px 56px;border-bottom:1px solid #c7c5be}
.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:48px;align-items:end}
.hero h1{font-size:clamp(54px,8vw,112px);line-height:.88;margin:0}
.hero p{font:16px/1.6 Arial,sans-serif;max-width:34ch}
.mark{height:220px;background:var(--blue);color:#f5f2ea;display:grid;place-items:center;font-size:54px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:70px}
.split h2{font-size:48px;line-height:1;margin:0}
.items{font:14px/1.5 Arial,sans-serif}
.items div{padding:14px 0;border-top:1px solid #979991}
.foot{font:14px/1.5 Arial,sans-serif;display:flex;justify-content:space-between;align-items:end}
.foot strong{font:96px/.8 Georgia,serif}
.plate{display:grid;grid-template-columns:1.1fr .9fr;gap:64px;align-items:center}
.plate img{display:block;width:100%}
.plate h2{margin:0 0 18px;font-size:52px;line-height:.98}
.plate p{max-width:34ch;font:15px/1.55 Arial,sans-serif}
@media(max-width:700px){section{padding:36px 22px}.hero,.split,.plate{grid-template-columns:1fr}.mark{height:160px}.foot strong{font-size:58px}}
</style>
</head>
<body>
<main>
<section class="hero">
<div><h1>Field notes become a place.</h1><p>A working archive for the people documenting a changing coastline.</p></div>
<div class="mark">N / 04</div>
</section>
<section class="split">
<h2>One record. Five ways to read it.</h2>
<div class="items"><div>Collected objects</div><div>Shoreline transects</div><div>Oral histories</div><div>Field sketches</div></div>
</section>
<section class="plate">
<img src="${plateData}" alt="An abstract shoreline plate from the field archive">
<div><h2>Objects hold a different kind of date.</h2><p>Each field plate is catalogued with the weather, route and hand that recorded it.</p></div>
</section>
<section class="foot"><strong>Read the edge.</strong><span>Northline Archive<br>48.2 N / 4.5 W</span></section>
</main>
</body>
</html>`

const project = {
  id: 'verify-project',
  title: 'Northline Archive',
  titleEdited: true,
  createdAt: now,
  updatedAt: now,
  designMode: 'website',
  messages: [
    {
      id: 'ref-msg',
      role: 'user',
      content:
        'Use this reference for the visual weight and editorial pacing.',
      createdAt: now,
      status: 'complete',
      referenceImages: [
        {
          id: 'ref-one',
          name: 'Editorial reference',
          mimeType: 'image/webp',
          width: 512,
          height: 512,
          dataUrl: `data:image/png;base64,${reference.toString('base64')}`,
          visualSummary: {
            imageId: 'ref-one',
            name: 'Editorial reference',
            width: 1440,
            height: 1080,
            aspectRatio: 1.33,
            palette: ['#1b566d', '#f0eee8', '#171916', '#cfc8bd'],
            averageLuminance: 0.58,
            contrast: 0.54,
            colorfulness: 0.27,
            edgeDensity: 0.31,
            transparent: false
          }
        }
      ]
    },
    {
      id: 'assistant-history',
      role: 'assistant',
      content:
        'The archive now reads as a field ledger: a large typographic opening, a quiet index and one closing statement. The source image was used for visual pacing, not copied as a layout.',
      createdAt: now,
      status: 'complete',
      provider: 'openai',
      model: 'GPT-5.2',
      designMode: 'website',
      activities: [
        {
          id: 'activity-research',
          kind: 'research',
          label: 'Reading current field references',
          detail: 'Two independent sources checked for the archive context',
          status: 'complete',
          startedAt: now,
          finishedAt: now,
          durationMs: 1240,
          sources: [
            {
              id: 'source-one',
              title: 'Coastal archive reference',
              url: 'https://www.nationalarchives.gov.uk/',
              publisher: 'nationalarchives.gov.uk',
              snippet: 'A primary archive reference.',
              faviconUrl: archiveIcon
            },
            {
              id: 'source-two',
              title: 'Field records reference',
              url: 'https://www.si.edu/',
              publisher: 'si.edu',
              snippet: 'A museum collection reference.',
              faviconUrl: recordIcon
            }
          ]
        },
        {
          id: 'activity-compose',
          kind: 'compose',
          label: 'Setting the editorial direction',
          detail: 'One asymmetric opening with a field-index rhythm',
          status: 'complete',
          startedAt: now,
          finishedAt: now,
          durationMs: 1840
        },
        {
          id: 'activity-write',
          kind: 'write',
          label: 'Writing the live canvas',
          detail: '3 responsive sections streamed into the preview',
          status: 'complete',
          startedAt: now,
          finishedAt: now,
          durationMs: 4200
        },
        {
          id: 'activity-review',
          kind: 'review',
          label: 'Reviewing the artifact',
          detail: 'Browser playback passed at three widths',
          status: 'complete',
          startedAt: now,
          finishedAt: now,
          durationMs: 2100
        }
      ],
      toolMetrics: {
        rounds: 2,
        parallelBatches: 1,
        queries: 2,
        toolCalls: 3,
        pagesRead: 2,
        sources: 3,
        claims: 2,
        conflicts: 0,
        fetchedAssets: 1,
        evidenceItems: 6,
        durationMs: 8140,
        firstTokenMs: 960,
        toolDurationMs: 1720,
        writeDurationMs: 4200
      },
      toolComparison: {
        evidencePercent: 50,
        issuePercent: 100
      },
      evidence: [
        {
          id: 'evidence-field-context',
          claim:
            'The archive brief calls for a working record of a changing coastline.',
          verdict: 'supported',
          sourceIds: ['source-one'],
          citations: [
            {
              title: 'Coastal archive reference',
              url: 'https://www.nationalarchives.gov.uk/',
              publisher: 'nationalarchives.gov.uk',
              retrievedAt: now
            }
          ],
          qualityScore: 92,
          freshnessScore: 88,
          notes: ['Official archive source.']
        }
      ],
      telemetry: {
        requestStartedAt: now,
        firstTokenAt: now,
        completedAt: now,
        spans: [
          {
            id: 'span-model',
            stage: 'model',
            label: 'Understanding the brief',
            status: 'complete',
            startedAt: now,
            finishedAt: now,
            durationMs: 960
          },
          {
            id: 'span-write',
            stage: 'write',
            label: 'Streaming the artifact',
            status: 'complete',
            startedAt: now,
            finishedAt: now,
            durationMs: 4200
          },
          {
            id: 'span-runtime',
            stage: 'runtime',
            label: 'Testing in a real browser',
            status: 'complete',
            startedAt: now,
            finishedAt: now,
            durationMs: 2100
          }
        ]
      }
    }
  ],
  designHtml,
  revision: 1,
  versions: []
}

await writeFile(
  join(userData, 'projects.json'),
  `${JSON.stringify({ version: 1, projects: [project] }, null, 2)}\n`,
  'utf8'
)

const messages = []
let application
try {
  application = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      MEES_DISABLE_HARNESS_DISCOVERY: '1',
      MEES_USER_DATA_DIR: userData
    }
  })
  const page = await application.firstWindow()
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    messages.push(`pageerror: ${error.message}`)
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1200)
  await page.screenshot({
    path: join(screenshotDirectory, 'seven-upgrades-desktop.png')
  })
  await page
    .locator('.canvas-toolbar')
    .getByRole('button', { name: 'Select elements to edit' })
    .click()
  await page.waitForTimeout(220)
  const previewFrame = page
    .frames()
    .find((frame) => frame !== page.mainFrame())
  if (!previewFrame) throw new Error('The generated preview frame is missing.')
  await previewFrame.evaluate(() => {
    window.__meesTestClicks = 0
    document.addEventListener('click', () => {
      window.__meesTestClicks += 1
    }, true)
    const dispatch = (element) => {
      element?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        })
      )
    }
    dispatch(document.querySelector('h1'))
    dispatch(document.querySelector('.items div'))
  })
  await page.waitForTimeout(180)
  const selectionState = {
    outlines: await page.locator('.preview-selection-outline').count(),
    pills: await page.locator('.preview-selection-prompt').count(),
    editorVisible: await page.locator('.preview-inline-editor').isVisible()
  }
  if (
    selectionState.outlines !== 2 ||
    selectionState.pills !== 2 ||
    !selectionState.editorVisible
  ) {
    const childFrame = page.frames().find((frame) => frame !== page.mainFrame())
    const frameState = childFrame
      ? await childFrame
          .evaluate(() => ({
            bridge: Boolean(window.__meesPreviewSelection),
            active: document.body.classList.contains('mees-selection-active'),
            clicks: window.__meesTestClicks ?? 0,
            selectionUi: Boolean(
              document.querySelector('[data-mees-selection-ui]')
            ),
            overlayText:
              document.querySelector('[data-mees-selection-ui]')?.textContent,
            h1: Boolean(document.querySelector('h1')),
            item: Boolean(document.querySelector('.items div'))
          }))
          .catch((error) => ({ error: String(error) }))
      : null
    throw new Error(
      `Multi-element selection failed: ${JSON.stringify({ selectionState, frameState })}`
    )
  }
  const selectedChange = page.getByLabel(
    'Describe the selected-element change'
  )
  await selectedChange.fill('Tighten both selected regions without changing the rest.')
  if (
    !(await page.getByRole('button', {
      name: 'Apply selected-element change'
    }).isEnabled())
  ) {
    throw new Error('The inline selected-element composer did not enable.')
  }
  await page.screenshot({
    path: join(screenshotDirectory, 'multi-selection.png')
  })
  await page.getByRole('button', { name: 'Clear' }).click({ force: true })
  await page
    .locator('.canvas-toolbar')
    .getByRole('button', { name: 'Stop selecting elements' })
    .click()
  const previewGuide = page.getByRole('button', {
    name: 'Preview tool support'
  })
  await previewGuide.click()
  await page.waitForSelector('.preview-help-popover')
  await page.waitForTimeout(220)
  const previewSupport = await page.evaluate(() => ({
    rows: document.querySelectorAll('.preview-capability-row').length,
    allModes: Array.from(
      document.querySelectorAll('.preview-mode-chip.is-all')
    ).length,
    text:
      document.querySelector('.preview-help-popover')?.textContent
        ?.replace(/\s+/g, ' ')
        .trim() ?? ''
  }))
  if (
    previewSupport.rows < 5 ||
    previewSupport.allModes < 2 ||
    !previewSupport.text.includes('Timeline transport') ||
    !previewSupport.text.includes('Motion')
  ) {
    throw new Error('The preview guide is missing mode support information.')
  }
  await page.screenshot({
    path: join(screenshotDirectory, 'preview-guide.png')
  })
  await page.keyboard.press('Escape')
  if (await page.getByRole('button', { name: /Preview page size/ }).count()) {
    throw new Error('The removed preview size menu is still present.')
  }
  const resizeHandle = page.getByRole('separator', {
    name: 'Resize agent and preview panels'
  })
  const beforeResize = await page.evaluate(() => ({
    agent: Math.round(document.querySelector('.agent-panel')?.getBoundingClientRect().width ?? 0),
    preview: Math.round(document.querySelector('.workspace-sheet')?.getBoundingClientRect().width ?? 0)
  }))
  await resizeHandle.focus()
  await resizeHandle.press('ArrowLeft')
  await resizeHandle.press('ArrowLeft')
  await page.waitForTimeout(160)
  const afterResize = await page.evaluate(() => ({
    agent: Math.round(document.querySelector('.agent-panel')?.getBoundingClientRect().width ?? 0),
    preview: Math.round(document.querySelector('.workspace-sheet')?.getBoundingClientRect().width ?? 0)
  }))
  if (
    afterResize.agent >= beforeResize.agent ||
    afterResize.preview <= beforeResize.preview
  ) {
    throw new Error('The left panel resizer did not update the preview width.')
  }
  const modelTrigger = page.getByRole('button', {
    name: /Choose model and effort/
  })
  await modelTrigger.click()
  await page.waitForSelector('.model-menu')
  await page.waitForTimeout(180)
  const effortOptions = page
    .locator('.model-effort-options')
    .getByRole('radio')
  if ((await effortOptions.count()) < 3) {
    throw new Error('The selected model does not expose direct effort options.')
  }
  const targetEffort = effortOptions.last()
  if ((await targetEffort.getAttribute('aria-checked')) !== 'true') {
    await targetEffort.click()
    await page.waitForTimeout(350)
  }
  if ((await targetEffort.getAttribute('aria-checked')) !== 'true') {
    throw new Error('The direct model effort picker did not apply the selection.')
  }
  await page.screenshot({
    path: join(screenshotDirectory, 'mees-model-grouping.png')
  })
  const modelGroups = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.model-group')).map((group) => ({
      name:
        group
          .querySelector('.model-group-label span:first-child')
          ?.textContent?.trim() ?? '',
      models: Array.from(group.querySelectorAll('.model-option')).map(
        (option) => ({
          provider: option.getAttribute('data-model-provider'),
          id: option.getAttribute('data-model-id')
        })
      )
    }))
  )
  const expectedModelGroups = [
    {
      name: 'OpenAI',
      provider: 'openai',
      ids: ['gpt-6.1-sol', 'gpt-5.4']
    },
    {
      name: 'Claude',
      provider: 'anthropic',
      ids: ['claude-sonnet-5-5', 'claude-opus-5-1', 'claude-opus-4-7']
    },
    {
      name: 'Gemini',
      provider: 'google',
      ids: ['gemini-4-argon', 'gemini-3.8-flash']
    },
    {
      name: 'DeepSeek',
      provider: 'deepseek',
      ids: ['deepseek-v4-pro']
    },
    {
      name: 'AGY CLI',
      provider: 'agy',
      ids: ['gemini-3.8-flash', 'claude-sonnet-4-6', 'gpt-oss-120b']
    }
  ]
  if (
    modelGroups.length !== expectedModelGroups.length ||
    expectedModelGroups.some(({ name, provider, ids }) => {
      const group = modelGroups.find((item) => item.name === name)
      return (
        !group ||
        group.models.length !== ids.length ||
        group.models.some(
          (model, index) =>
            model.provider !== provider || model.id !== ids[index]
        )
      )
    })
  ) {
    throw new Error('Provider model groups contain stale or cross-provider models.')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)

  const completedStatus = page.locator('.agent-status-line.is-complete')
  if (await completedStatus.count()) {
    await page.screenshot({
      path: join(screenshotDirectory, 'seven-upgrades-agent-detail.png')
    })
  }

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height)
      }
    }
    const titlebarBrand = document.querySelector('.studio-topbar .wordmark')
    const titlebarIcon = titlebarBrand?.querySelector('.brand-mark')
    const iconBox = titlebarIcon?.getBoundingClientRect()
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      topbar: rect('.studio-topbar'),
      titlebarBrand: {
        text: titlebarBrand?.textContent?.trim() ?? '',
        ariaLabel: titlebarBrand?.getAttribute('aria-label') ?? '',
        iconWidth: Math.round(iconBox?.width ?? 0),
        iconHeight: Math.round(iconBox?.height ?? 0)
      },
      agent: rect('.agent-panel'),
      sheet: rect('.workspace-sheet'),
      toolbar: rect('.canvas-toolbar'),
      agentStatus: rect('.agent-status-line'),
      agentStatusText:
        document.querySelector('.agent-status-line')?.textContent
          ?.replace(/\s+/g, ' ')
          .trim() ?? '',
      agentStatusClickable:
        document.querySelectorAll('.agent-status-line button').length,
      refineButtons: Array.from(document.querySelectorAll('button')).filter(
        (button) =>
          /refine/i.test(
            `${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`
          )
      ).length,
      horizontalOverflow:
        document.documentElement.scrollWidth - window.innerWidth
    }
  })
  if (
    geometry.titlebarBrand.text ||
    geometry.titlebarBrand.ariaLabel !== 'Mees' ||
    geometry.titlebarBrand.iconWidth !== 24 ||
    geometry.titlebarBrand.iconHeight !== 24
  ) {
    throw new Error(
      'The app title bar or agent activity layout failed its visual contract.'
    )
  }
  if (
    geometry.agentStatusClickable !== 0 ||
    geometry.refineButtons !== 0 ||
    !geometry.agentStatusText.includes('Agent work completed')
  ) {
    throw new Error(
      'The completed agent state is clickable, missing, or the Refine control is still present.'
    )
  }
  const loaderAnimation = await page.evaluate(async () => {
    const host = document.createElement('div')
    host.className = 'agent-pixel-grid'
    host.style.cssText = 'position:fixed;left:-100px;top:0'
    for (let index = 0; index < 9; index += 1) {
      const cell = document.createElement('i')
      const row = Math.floor(index / 3)
      const column = index % 3
      cell.style.animationDelay = `${(column + Math.abs(row - 1)) * 90}ms`
      host.appendChild(cell)
    }
    document.body.appendChild(host)
    await new Promise((resolve) => window.setTimeout(resolve, 260))
    const cells = Array.from(host.querySelectorAll('i'))
    const result = {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationNames: cells.map(
        (cell) => getComputedStyle(cell).animationName
      ),
      durations: cells.map(
        (cell) => getComputedStyle(cell).animationDuration
      ),
      playStates: cells.flatMap((cell) =>
        cell.getAnimations().map((animation) => animation.playState)
      ),
      opacities: cells.map((cell) => Number(getComputedStyle(cell).opacity))
    }
    host.remove()
    return result
  })
  if (
    !loaderAnimation.reducedMotion &&
    (loaderAnimation.animationNames.some((name) => name !== 'agent-pixel-on') ||
      loaderAnimation.playStates.some((state) => state !== 'running') ||
      loaderAnimation.opacities.every(
        (opacity) => Math.abs(opacity - loaderAnimation.opacities[0]) < 0.01
      ))
  ) {
    throw new Error('The agent pixel loader is not animating.')
  }

  if (await page.getByRole('button', { name: /Open design review/i }).count()) {
    throw new Error('The removed Review surface is still present.')
  }
  if (await page.getByRole('tab', { name: 'Review' }).count()) {
    throw new Error('The Review inspector tab is still present.')
  }

  const referenceButton = page.getByRole('button', {
    name: /Compare reference images/i
  })
  await referenceButton.click()
  await page.waitForTimeout(500)
  await page.screenshot({
    path: join(screenshotDirectory, 'seven-upgrades-reference.png')
  })
  const saveReference = page.getByRole('button', {
    name: 'Save reference'
  })
  if ((await saveReference.count()) && (await saveReference.isEnabled())) {
    await saveReference.click()
    await page.waitForTimeout(300)
  }
  await page.getByRole('button', { name: 'Overlay' }).click()
  const overlay = page.locator('.reference-compare.is-overlay')
  if (await overlay.count()) {
    const box = await overlay.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.76)
      await page.mouse.up()
    }
    await page.waitForTimeout(250)
    await page.screenshot({
      path: join(screenshotDirectory, 'seven-upgrades-reference-overlay.png')
    })
  }

  await page.getByRole('tab', { name: 'Memory' }).click()
  const saveMemory = page.getByRole('button', {
    name: 'Save this direction'
  })
  if ((await saveMemory.count()) && (await saveMemory.isEnabled())) {
    await saveMemory.click()
    await page.waitForTimeout(450)
  }
  await page.waitForTimeout(300)
  await page.screenshot({
    path: join(screenshotDirectory, 'seven-upgrades-memory.png')
  })
  await page.getByRole('button', { name: 'Open generated page files' }).click()
  await page.waitForTimeout(250)
  const fileCount = await page.locator('.file-row').count()
  const visibleCodeBlocks = await page.locator('.files-view pre, .files-view code').count()
  await page.screenshot({
    path: join(screenshotDirectory, 'seven-upgrades-files.png')
  })
  await page.getByRole('tab', { name: 'Memory' }).click()

  const desktopSettingsButton = page
    .getByRole('button', { name: /settings/i })
    .first()
  await desktopSettingsButton.click()
  await page.waitForSelector('.settings-dialog-wide')
  await page.waitForTimeout(180)
  await page.screenshot({
    path: join(screenshotDirectory, 'mees-settings-desktop.png')
  })
  const desktopSettings = await page.evaluate(() => ({
    tabs: Array.from(
      document.querySelectorAll('.settings-nav [role="tab"]')
    ).map((tab) => ({
      label: tab.textContent?.trim() ?? '',
      icons: tab.querySelectorAll('svg').length
    })),
    active: document
      .querySelector('.settings-nav [aria-selected="true"]')
      ?.textContent?.trim() ?? ''
  }))
  if (
    desktopSettings.tabs.length !== 4 ||
    desktopSettings.tabs.some((tab) => tab.icons !== 0) ||
    desktopSettings.active !== 'Model sources'
  ) {
    throw new Error('Settings tabs are not compact text-only sections.')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(160)

  await page.setViewportSize({ width: 1100, height: 760 })
  await page.waitForTimeout(350)
  const narrowGeometry = await page.evaluate(() => {
    const measure = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      }
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      agent: measure('.agent-panel'),
      sheet: measure('.workspace-sheet'),
      inspector: measure('.design-inspector'),
      overflow:
        document.documentElement.scrollWidth - window.innerWidth
    }
  })
  await page.screenshot({
    path: join(screenshotDirectory, 'seven-upgrades-narrow.png')
  })

  const closeInspector = page.getByRole('button', {
    name: 'Close design tools'
  })
  if (await closeInspector.count()) await closeInspector.click()
  await page.setViewportSize({ width: 439, height: 900 })
  await page.waitForTimeout(250)
  const openAgent = page.getByRole('button', { name: 'Open agent' })
  if (await openAgent.isVisible()) await openAgent.click()
  await page.waitForTimeout(260)
  const mobileGeometry = await page.evaluate(() => {
    const measure = (target) => {
      const element =
        typeof target === 'string' ? document.querySelector(target) : target
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      }
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      agent: measure('.agent-panel'),
      composer: measure('.composer'),
      toast: measure('.toast'),
      composerTargets: Array.from(
        document.querySelectorAll(
          '.agent-panel .model-trigger, .agent-panel .mode-trigger, .agent-panel .send-button, .agent-panel .mobile-agent-close'
        )
      ).map((element) => ({
        label:
          element.getAttribute('aria-label') ||
          element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 70),
        ...measure(element)
      })),
      overflow:
        document.documentElement.scrollWidth - window.innerWidth
    }
  })
  if (
    mobileGeometry.composerTargets.some(
      (target) => target.width < 34 || target.height < 34
    )
  ) {
    throw new Error('A mobile composer control is below the 34px target floor.')
  }
  if (
    mobileGeometry.toast &&
    mobileGeometry.composer &&
    mobileGeometry.toast.bottom > mobileGeometry.composer.y &&
    mobileGeometry.toast.y < mobileGeometry.composer.bottom
  ) {
    throw new Error('The mobile toast overlaps the composer.')
  }
  await page.screenshot({
    path: join(screenshotDirectory, 'mees-agent-mobile.png')
  })
  const closeMobileAgent = page.getByRole('button', {
    name: 'Close agent',
    exact: true
  })
  if (await closeMobileAgent.isVisible()) await closeMobileAgent.click()
  await page.waitForTimeout(180)
  const mobilePreviewGuide = page.getByRole('button', {
    name: 'Preview tool support'
  })
  if (await mobilePreviewGuide.isVisible()) {
    await mobilePreviewGuide.click()
    await page.waitForSelector('.preview-help-popover')
    await page.waitForTimeout(220)
    await page.screenshot({
      path: join(screenshotDirectory, 'preview-guide-mobile.png')
    })
    const mobileGuideGeometry = await page.evaluate(() => {
      const menu = document.querySelector('.preview-help-popover')
      if (!menu) return null
      const box = menu.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        right: Math.round(box.right),
        viewportWidth: window.innerWidth
      }
    })
    if (
      !mobileGuideGeometry ||
      mobileGuideGeometry.x < 0 ||
      mobileGuideGeometry.right > mobileGuideGeometry.viewportWidth
    ) {
      throw new Error(
        `The mobile preview guide is clipped: ${JSON.stringify(mobileGuideGeometry)}`
      )
    }
    await page.keyboard.press('Escape')
  }
  if (
    await page
      .getByRole('button', { name: /Preview page size/ })
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('The removed preview size menu is still visible on mobile.')
  }
  if (
    await page
      .getByRole('separator', { name: 'Resize agent and preview panels' })
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('The desktop panel resizer is visible on mobile.')
  }
  const dismissToast = page.locator('.toast-close')
  if (await dismissToast.isVisible()) {
    await dismissToast.click({ force: true })
  }

  const settingsButton = page
    .getByRole('button', { name: /settings/i })
    .first()
  if (await settingsButton.count()) {
    await settingsButton.click()
    await page.waitForSelector('[role="dialog"]')
    await page.waitForTimeout(220)
    await page.screenshot({
      path: join(screenshotDirectory, 'mees-settings-mobile.png')
    })
    const focusInside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      return Boolean(
        dialog &&
          document.activeElement &&
          dialog.contains(document.activeElement)
      )
    })
    if (!focusInside) {
      throw new Error('The mobile settings dialog did not take focus.')
    }
    const settingsStructure = await page.evaluate(() => ({
      tabs: document.querySelectorAll('.settings-nav [role="tab"]').length,
      text:
        document
          .querySelector('.settings-dialog')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? ''
    }))
    if (
      settingsStructure.tabs !== 4 ||
      !settingsStructure.text.includes('AGY CLI') ||
      !settingsStructure.text.includes('Local harnesses')
    ) {
      throw new Error('Settings is missing side tabs or the AGY harness row.')
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(180)
    if (await page.locator('[role="dialog"]').isVisible()) {
      throw new Error('Escape did not close the mobile settings dialog.')
    }
  }

  const libraryButton = page
    .getByRole('button', { name: /design library/i })
    .first()
  if (await libraryButton.count()) {
    await libraryButton.click()
    await page.waitForSelector('[role="dialog"]')
    await page.waitForTimeout(220)
    await page.screenshot({
      path: join(screenshotDirectory, 'mees-library-mobile.png')
    })
    await page.keyboard.press('Escape')
  }

  const storedProjects = await readFile(
    join(userData, 'projects.json'),
    'utf8'
  )
  const storedProject = JSON.parse(storedProjects).projects[0]
  const storedAssets = await readdir(join(userData, 'assets'))
  console.log(
    JSON.stringify(
      {
        geometry,
        narrowGeometry,
        mobileGeometry,
        loaderAnimation,
        modelGroups,
        messages,
        memoryEntries: await page.locator('.memory-row').count(),
        fileCount,
        visibleCodeBlocks,
        storedProjectHasEmbeddedImages: storedProjects.includes('data:image/'),
        storedActivitySources:
          storedProject?.messages?.[1]?.activities?.[0]?.sources?.length ?? 0,
        storedAssetCount: storedAssets.length,
        screenshots: [
          'seven-upgrades-desktop.png',
          'preview-guide.png',
          'mees-model-grouping.png',
          'seven-upgrades-agent-detail.png',
          'seven-upgrades-reference.png',
          'seven-upgrades-reference-overlay.png',
          'seven-upgrades-memory.png',
          'seven-upgrades-files.png',
          'seven-upgrades-narrow.png',
          'mees-agent-mobile.png',
          'mees-settings-desktop.png',
          'mees-settings-mobile.png',
          'mees-library-mobile.png'
        ]
      },
      null,
      2
    )
  )
} finally {
  if (application) await application.close()
  await rm(userData, { recursive: true, force: true })
}
