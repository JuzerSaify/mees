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

const userData = await mkdtemp(join(tmpdir(), 'kern-ui-'))
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
      activeModel: 'gpt-5.2',
      efforts: {},
      providers: {
        openai: {
          encryptedApiKey: 'fixture-only',
          keyHint: '...test',
          models: [
            {
              id: 'gpt-5.2',
              name: 'GPT-5.2',
              provider: 'openai',
              supportsImages: true
            }
          ],
          selectedModel: 'gpt-5.2',
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
  join(root, 'kern-product-site', 'assets', 'proof-modes.webp')
)
async function storedSvgIcon(letter, color) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><text x="32" y="42" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fff">${letter}</text></svg>`,
    'utf8'
  )
  const fileName = `${createHash('sha256').update(svg).digest('hex')}.svg`
  await writeFile(join(assetDirectory, fileName), svg)
  return `kern-asset://asset/${fileName}`
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
          width: 1440,
          height: 1080,
          dataUrl: `data:image/webp;base64,${reference.toString('base64')}`,
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
      KERN_USER_DATA_DIR: userData
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
  const workSummary = page.getByRole('button', { name: /Agent work\./ })
  if ((await workSummary.count()) && (await workSummary.isEnabled())) {
    await workSummary.click()
    await page.waitForTimeout(250)
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
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      topbar: rect('.studio-topbar'),
      agent: rect('.agent-panel'),
      sheet: rect('.workspace-sheet'),
      toolbar: rect('.canvas-toolbar'),
      sourceFavicons: document.querySelectorAll('.source-favicon').length,
      sourceFaviconImages: Array.from(
        document.querySelectorAll('.source-favicon img')
      ).map((image) => ({
        src: image.getAttribute('src'),
        naturalWidth: image.naturalWidth,
        complete: image.complete
      })),
      horizontalOverflow:
        document.documentElement.scrollWidth - window.innerWidth
    }
  })

  const review = page.getByRole('button', { name: /Open design review/i })
  await review.click()
  await page.waitForTimeout(2600)
  const reviewStatus =
    (await page.locator('.review-summary h3').textContent())?.trim() ?? ''
  await page.screenshot({
    path: join(screenshotDirectory, 'seven-upgrades-review.png')
  })

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

  await page.setViewportSize({ width: 1100, height: 760 })
  await page.waitForTimeout(350)
  const narrowGeometry = await page.evaluate(() => {
    const measure = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: Math.round(box.x),
        right: Math.round(box.right),
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
        messages,
        reviewStatus,
        memoryEntries: await page.locator('.memory-row').count(),
        fileCount,
        visibleCodeBlocks,
        sourceFaviconAfterRun: await page.locator('.source-favicon').count(),
        storedProjectHasEmbeddedImages: storedProjects.includes('data:image/'),
        storedActivitySources:
          storedProject?.messages?.[1]?.activities?.[0]?.sources?.length ?? 0,
        storedAssetCount: storedAssets.length,
        screenshots: [
          'seven-upgrades-desktop.png',
          'seven-upgrades-agent-detail.png',
          'seven-upgrades-review.png',
          'seven-upgrades-reference.png',
          'seven-upgrades-reference-overlay.png',
          'seven-upgrades-memory.png',
          'seven-upgrades-files.png',
          'seven-upgrades-narrow.png'
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
