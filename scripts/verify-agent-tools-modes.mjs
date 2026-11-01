import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const screenshotDirectory = join(root, '.ui-check', 'agent-tools-modes')
await mkdir(screenshotDirectory, { recursive: true })
const userData = await mkdtemp(join(tmpdir(), 'mees-tools-modes-'))

const website = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Website mode</title>
<style>
body{margin:0;background:#f3f1ea;color:#171916;font-family:Arial,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:48px}
section{max-width:720px}
h1{margin:0 0 18px;font:600 clamp(42px,8vw,84px)/.95 Georgia,serif}
p{max-width:48ch;margin:0;font-size:18px;line-height:1.55}
a{display:inline-flex;min-height:40px;align-items:center;color:#1b566d}
</style>
</head>
<body><main><section><h1>Website mode</h1><p>The runtime inspector can read structure, controls and responsive layout.</p><a href="#details">Read details</a><p id="details" tabindex="-1">The target exists and the page has no runtime failures.</p></section></main></body>
</html>`

const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
<title>Contour mark</title>
<desc>Three interlocking contour bands form a compact archive mark.</desc>
<path d="M180 680C260 360 470 190 790 240" fill="none" stroke="#1b566d" stroke-width="96"/>
<path d="M210 790C360 520 530 410 820 470" fill="none" stroke="#263e49" stroke-width="64"/>
<path d="M620 190L790 240L735 410" fill="#8a541f"/>
</svg>`

const vector = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
<title>Shoreline transect</title>
<desc>A bright field sample crosses layered shoreline contours.</desc>
<rect width="1200" height="900" fill="#f0eee8"/>
<path d="M0 570C210 380 390 640 610 470S950 350 1200 430V900H0Z" fill="#1b566d"/>
<path d="M0 720C240 570 440 790 690 610S1010 560 1200 650V900H0Z" fill="#263e49"/>
<circle cx="840" cy="250" r="96" fill="#cfc8bd"/>
<path d="M120 170H470M120 215H390" stroke="#171916" stroke-width="16"/>
</svg>`

const motion = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Motion mode</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111510}
canvas{display:block;width:100%;height:100%}
</style>
</head>
<body>
<canvas width="1280" height="720" aria-label="Moving shoreline study"></canvas>
<script>
const canvas=document.querySelector('canvas');
const context=canvas.getContext('2d');
const draw=(time)=>{
  const duration=6;
  const t=Math.max(0,Math.min(duration,Number(time)||0));
  const p=t/duration;
  context.fillStyle='#111510';
  context.fillRect(0,0,1280,720);
  context.fillStyle='#1b566d';
  context.beginPath();
  context.moveTo(0,520-110*p);
  context.bezierCurveTo(330,300+40*p,620,650-80*p,1280,390+90*p);
  context.lineTo(1280,720);
  context.lineTo(0,720);
  context.fill();
  const x=110+p*920;
  const y=210+Math.sin(p*Math.PI)*90;
  context.fillStyle='#f0eee8';
  context.beginPath();
  context.arc(x,y,54,0,Math.PI*2);
  context.fill();
  context.fillStyle='#171916';
  context.font='600 46px Georgia';
  context.fillText('SHORELINE',80,120);
};
let frame=0;
let started=0;
let playing=false;
const tick=(now)=>{
  if(!playing)return;
  if(!started)started=now;
  const time=((now-started)/1000)%6;
  draw(time);
  frame=requestAnimationFrame(tick);
};
window.MEES_MOTION={
  width:1280,
  height:720,
  fps:30,
  duration:6,
  renderAt:draw,
  play(){
    if(playing)return;
    playing=true;
    started=0;
    frame=requestAnimationFrame(tick);
  },
  pause(){
    playing=false;
    cancelAnimationFrame(frame);
  },
  seek(time){
    draw(time);
  }
};
draw(0);
</script>
</body>
</html>`

const artifacts = {
  website,
  logo,
  vector,
  motion
}

const brokenMotion = `<!doctype html><html><head><meta charset="utf-8"><title>Blank</title></head><body style="margin:0"><canvas width="320" height="180"></canvas><script>
const canvas=document.querySelector('canvas');
const context=canvas.getContext('2d',{willReadFrequently:true});
const draw=(time)=>{context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height)};
window.MEES_MOTION={width:320,height:180,fps:30,duration:4,renderAt:draw,play(){},pause(){},seek:draw};
draw(0);
</script></body></html>`

const negativeArtifacts = [
  {
    mode: 'website',
    html: '<!doctype html><html lang="en"><head><title>Overflow</title></head><body><h1>Broken</h1><div style="width:1800px;height:80px">Overflow</div><img src="mees-asset://asset/0000000000000000000000000000000000000000000000000000000000000000.png" alt="Missing"></body></html>',
    expected: ['runtime-horizontal-overflow']
  },
  {
    mode: 'logo',
    html: '<!doctype html><html lang="en"><body><p>This is not an SVG artifact.</p></body></html>',
    expected: ['runtime-svg-root']
  },
  {
    mode: 'vector',
    html: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#000"/></svg>',
    expected: ['runtime-svg-viewbox', 'runtime-svg-title']
  },
  {
    mode: 'motion',
    html: brokenMotion,
    expected: ['runtime-motion-blank']
  }
]

const now = Date.now()
const projects = Object.entries(artifacts).map(([designMode, designHtml], index) => ({
  id: `mode-${designMode}`,
  title: `Mode ${designMode}`,
  titleEdited: true,
  createdAt: new Date(now - index * 1000).toISOString(),
  updatedAt: new Date(now - index * 1000).toISOString(),
  designMode,
  messages: [],
  designHtml,
  revision: 1,
  versions: []
}))

async function writeTruthfulSettings() {
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
}

await writeTruthfulSettings()
await writeFile(
  join(userData, 'projects.json'),
  `${JSON.stringify({ version: 1, projects }, null, 2)}\n`,
  'utf8'
)

const issues = []
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
      issues.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`)
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(900)

  const results = []
  for (const [mode, html] of Object.entries(artifacts)) {
    const capture = await page.evaluate(
      async ({ html: source, designMode }) =>
        window.mees.captureArtifact(source, designMode),
      { html, designMode: mode }
    )
    const expectedScreenshots = mode === 'website' ? 3 : 1
    const errors = [
      ...capture.consoleErrors,
      ...capture.pageErrors,
      ...capture.networkFailures,
      ...capture.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.title)
    ]
    if (capture.screenshots.length !== expectedScreenshots) {
      issues.push(
        `${mode}: expected ${expectedScreenshots} screenshot(s), received ${capture.screenshots.length}`
      )
    }
    if (errors.length) {
      issues.push(`${mode}: ${errors.join(' | ')}`)
    }
    results.push({
      mode,
      screenshots: capture.screenshots.length,
      runtimeIssues: capture.issues.map((issue) => issue.rule),
      durationMs: capture.durationMs
    })
  }

  for (const check of negativeArtifacts) {
    const capture = await page.evaluate(
      async ({ html: source, designMode }) =>
        window.mees.captureArtifact(source, designMode),
      { html: check.html, designMode: check.mode }
    )
    const detected = new Set([
      ...capture.issues.map((issue) => issue.rule),
      ...capture.consoleErrors.map(() => 'runtime-console-error'),
      ...capture.pageErrors.map(() => 'runtime-page-error'),
      ...capture.networkFailures.map(() => 'runtime-network-failure')
    ])
    for (const expected of check.expected) {
      if (!detected.has(expected)) {
        issues.push(`${check.mode} negative control missed ${expected}`)
      }
    }
    results[Object.keys(artifacts).indexOf(check.mode)].negativeControl =
      [...detected]
  }

  for (const mode of Object.keys(artifacts)) {
    const modeProject = projects.find((project) => project.designMode === mode)
    if (!modeProject) continue
    await page
      .locator('.app-rail')
      .getByRole('button', { name: 'Saved designs' })
      .click()
    await page
      .locator('.project-row-main')
      .filter({ hasText: modeProject.title })
      .click()
    await page.waitForTimeout(250)
    const toolbar = await page.evaluate(() => {
      const select = document.querySelector('.selection-trigger')
      return {
        viewportButtons: document.querySelectorAll(
          '.segmented-control .segment-button'
        ).length,
        artifactBadge:
          document.querySelector('.artifact-mode-badge')?.textContent
            ?.replace(/\s+/g, ' ')
            .trim() ?? '',
        motionTransport: Boolean(
          document.querySelector('.motion-transport')
        ),
        selectDisabled:
          select instanceof HTMLButtonElement ? select.disabled : null,
        refineButtons: Array.from(document.querySelectorAll('button')).filter(
          (button) => /refine/i.test(
            `${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`
          )
        ).length
      }
    })
    if (toolbar.refineButtons !== 0) {
      issues.push(`${mode}: the removed Refine control is still visible`)
    }
    if (mode === 'website' && toolbar.viewportButtons !== 3) {
      issues.push(`${mode}: expected three responsive preview controls`)
    }
    if (
      (mode === 'logo' || mode === 'vector') &&
      !toolbar.artifactBadge
    ) {
      issues.push(`${mode}: artifact-mode preview badge is missing`)
    }
    if (mode === 'motion' && !toolbar.motionTransport) {
      issues.push(`${mode}: motion preview transport is missing`)
    }
    if (mode === 'motion' ? toolbar.selectDisabled !== true : toolbar.selectDisabled !== false) {
      issues.push(`${mode}: element-selection support is incorrect`)
    }
    await page
      .locator('.canvas-toolbar')
      .getByRole('button', { name: /Open design review/i })
      .click()
    await page.waitForSelector('.inspector-loading', { timeout: 5_000 })
    await page.waitForSelector('.review-summary h3', { timeout: 15_000 })
    const title =
      (await page.locator('.review-summary h3').textContent())?.trim() ?? ''
    const issueCount = await page.locator('.review-issue').count()
    if (!title.toLowerCase().includes('no measured issues') && issueCount > 0) {
      issues.push(`${mode} local review: ${issueCount} finding(s)`)
    }
    await page.screenshot({
      path: join(screenshotDirectory, `${mode}.png`)
    })
    results[Object.keys(artifacts).indexOf(mode)].localReview = {
      title,
      issueCount,
      viewports: await page.locator('.review-viewport').count(),
      toolbar
    }
  }

  console.log(JSON.stringify({ results, issues }, null, 2))
  if (issues.length) process.exitCode = 1
} finally {
  if (application) await application.close()
  await rm(userData, { recursive: true, force: true })
}
