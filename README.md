# Mees

Mees is a local-first desktop design agent. It uses a paid API account or an installed paid CLI harness, streams the design into a live canvas, and keeps each project on your machine.

Supported providers:

- OpenAI
- Claude / Anthropic
- Gemini / Google
- DeepSeek

Local paid harnesses:

- Codex CLI
- OpenCode

## Run

Requirements: Node.js 22.12 or newer.

```powershell
npm install
npm run dev
```

On first launch, connect at least one API provider with its key or use a supported paid CLI already installed on the same computer. Mees checks the normal executable search path and common installation folders, then discovers the harness's model catalog. Harness authentication remains owned by Codex CLI or OpenCode; Mees never copies that token.

Source checkouts are for development. Run `npm run build` to compile without creating an installer. Windows installers are built only by the tag-triggered GitHub release workflow in `.github/workflows/release.yml`.

The model menu is filtered to direct text-generation families used by the design agent. Retired entries and audio, image, embedding, live, transcription, music and managed-agent models stay out of the selector. Switching models happens inside the composer, with the model name and a compact effort summary on the trigger.

Reasoning effort lives in the same composer menu. Mees exposes each API or harness model's native levels, keeps a separate choice per model, and maps that choice to the real provider control. Models without an adjustable effort setting fall back to their default behavior.

No API keys are included with this project. Provider usage is billed to the account associated with the key you connect.

## Install and updates

Download the Windows installer from [GitHub Releases](https://github.com/JuzerSaify/mees/releases/latest). The current installer is unsigned, so Windows SmartScreen may ask for confirmation before running it.

Installed releases check the public GitHub release feed for stable updates. When one is available, the title bar shows the download action, live progress and the restart-to-install action. Settings keeps the same controls and current version. The release workflow verifies the packaged app, native image runtime and updater manifest before publishing the installer and SHA-256 checksums.

## Product website

The product website is live at [mees-design.vercel.app](https://mees-design.vercel.app/).

## Security

- API keys are encrypted with Electron `safeStorage` before being written to disk.
- Windows uses DPAPI, macOS uses Keychain, and Linux requires a protected secret store.
- Mees refuses to persist keys when only the unprotected Linux fallback is available.
- Keys are decrypted only in the Electron main process and sent only to the provider selected for a request.
- Local harness credentials remain in the installed CLI and are never read or stored by Mees.
- Generated designs run in a sandboxed iframe without same-origin access to the app.
- Local data files are written with owner-only permissions where the platform supports them.

App data is stored in Electron's per-user data directory. You can open it from **Settings > Local storage**.

## Design flow

1. Choose Website, Logo, Vector or Motion in the agent panel, then describe the subject and what the artifact needs to do.
2. Add optional visual references by dragging and dropping or pasting up to four PNG, JPEG or WebP images into the composer. Reference images are normalized locally before they reach the selected provider.
3. The request enters one continuous agent loop. API models and installed local harnesses use the same Mees tools. The selected model decides whether to answer immediately or call optional tools, and it can make several tool calls in parallel or across multiple turns.
4. The agent has a native, optional tool set: live web search, source-page reading, direct public-URL reading, real visual-asset fetching, multimodal visual inspection, favicon resolution, claim-to-source evaluation, a single blocking-question tool, browser artifact inspection, image cropping, image optimization, palette extraction and posterized image-to-vector tracing. Tool use is never forced and calls can run in parallel or across multiple agent turns.
5. Tool results return to the same agent conversation. Search results can be opened for full text, and validated visual assets return exact local embed tokens with creator, license and attribution metadata. On image-capable models, Mees can inspect up to three candidates in a separate bounded multimodal step before using one.
6. The agent streams the complete standalone artifact for the chosen mode. Fetched third-party assets keep their source page for attribution, and claim evidence is scored for direct support, source quality, freshness and conflicts.
7. The canvas updates while the document arrives. For harnesses that publish their result only after generation completes, Mees applies the artifact in a smooth progressive handoff. Review then plays the artifact in a real Electron browser, checks console, resource, accessibility, navigation and overflow failures, captures each responsive viewport, and merges those runtime findings with the local design audit.
8. Continue the design in the same conversation, switch providers or models, then open or export the HTML.

The agent status line shows only activity emitted by the main process: provider attempts, model turns, each tool call, artifact writing, browser playback and review. While the agent is working, one compact line cycles through the active tool's real state with a pixel wavefront, step position and live elapsed time. When the run finishes, it becomes a static summary of sources and duration with no disclosure button.

Reference images are treated as visual evidence, not instructions. Mees measures palette, aspect, luminance, contrast, colorfulness and edge density locally, then keeps the reference beside the current browser capture in split and overlay comparison modes. Models without image input keep the composer in a text-only state and explain why before a request can be sent.

The design review records a structural fingerprint for each artifact. New runs receive the last four fingerprints and measured palette/font signals from the same mode and are instructed to change the opening composition, media strategy, background logic, typography character and rhythm. A repeated direction is flagged during review.

### Output modes

- **Website** produces a responsive standalone HTML document and is reviewed at desktop, tablet and mobile widths.
- **Logo** produces one editable SVG mark built for scale, with transparent artwork by default and no raster fallback.
- **Vector** produces one standalone editable SVG composition with a subject-led focal hierarchy.
- **Motion** produces a silent 1280 × 720 canvas animation from inline code. The timeline is deterministic, exposes play, pause and seek controls in the preview, and exports as a video with no audio track.

Project conversations and the latest design source are saved locally and can be reopened from **Designs**.

Reference images, fetched images and browser screenshots are stored as content-addressed files under the local data directory instead of being embedded in `projects.json`. Saved projects refer to the same durable `mees-asset` URLs used by the preview and can be exported with those assets inlined.

Reviewed palettes, type and an optional saved logo or vector mark can be kept in **Design memory**. Approved memory is available to future agent runs as a constraint; it does not force the previous layout, and recent-design diversity still applies.

Before a run, Mees compacts older turns against the selected model's context window while retaining the original brief and recent conversation. A transient provider failure is retried once before any stream is consumed.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run verify:ui
npm run verify:tools
npm run verify:harnesses
npm run verify:updates
```

The test suite covers all four API adapters, local harness discovery and transport parsing, native tool-call handling, multimodal image payloads, live-search fallback, attributable Wikimedia and Wikipedia media, page reading, evidence scoring, content-addressed assets, assistant protocol rules, local history compaction and renderer utilities. `verify:ui` launches the built Electron app with a temporary profile, verifies geometry and zero horizontal overflow, mobile target sizes and toast placement, exercises browser review, reference comparison, design memory, settings and history, and saves screenshots under `.ui-check/`. `verify:tools` runs Website, Logo, Vector and Motion through both review layers. `verify:harnesses` audits real installed harnesses without using their credentials in the renderer. `verify:updates` verifies the title-bar available, downloading and restart states.

## Provider assets

The provider controls use the organizations' official favicons, bundled locally for reliable rendering. Sources are listed in [SOURCES.md](src/renderer/src/assets/providers/SOURCES.md). Names and marks belong to their respective owners.
