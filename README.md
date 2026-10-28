# Kern

Kern is a local-first desktop design agent. It connects to a paid API account you own, streams a complete HTML interface into a live canvas, and keeps each project on your machine.

Supported providers:

- OpenAI
- Claude / Anthropic
- Gemini / Google
- DeepSeek

## Run

Requirements: Node.js 22.12 or newer.

```powershell
npm install
npm run dev
```

On first launch, connect at least one provider with its API key. Kern verifies the key by loading the text-model catalog from that account. Model choices are discovered at runtime, so newly released models appear without an application update.

The model menu is filtered to direct text-generation families used by the design agent. Retired entries and audio, image, embedding, live, transcription, music and managed-agent models stay out of the selector. Switching models happens inside the composer, with the model name and a compact effort summary on the trigger.

Reasoning effort lives in the same composer menu. Kern exposes each model's native levels, keeps a separate choice per provider model, and maps that choice to the provider's real request control. Models without an adjustable effort setting fall back to their default behavior.

No API keys are included with this project. Provider usage is billed to the account associated with the key you connect.

## Security

- API keys are encrypted with Electron `safeStorage` before being written to disk.
- Windows uses DPAPI, macOS uses Keychain, and Linux requires a protected secret store.
- Kern refuses to persist keys when only the unprotected Linux fallback is available.
- Keys are decrypted only in the Electron main process and sent only to the provider selected for a request.
- Generated designs run in a sandboxed iframe without same-origin access to the app.
- Local data files are written with owner-only permissions where the platform supports them.

App data is stored in Electron's per-user data directory. You can open it from **Settings > Local storage**.

## Design flow

1. Choose Website, Logo, Vector or Motion in the agent panel, then describe the subject and what the artifact needs to do.
2. Add optional visual references by dragging and dropping or pasting up to four PNG, JPEG or WebP images into the composer. Reference images are normalized locally before they reach the selected provider.
3. The request enters one continuous agent loop. The selected model decides whether to answer immediately or call optional tools, and it can make several tool calls in parallel or across multiple turns.
4. Available tools are live web search, full source-page reading, direct public-URL reading and visual-asset fetching. Tool use is never forced; a simple request can complete without any external call.
5. Tool results return to the same agent conversation. Search results can be opened for full text, and validated visual assets return exact local embed tokens.
6. The agent streams the complete standalone artifact for the chosen mode. Fetched third-party assets keep their source page for attribution.
7. The canvas updates while the document arrives and a local three-width review measures the result.
8. Refine the design in the same conversation, switch providers or models, then open or export the HTML.

The agent timeline shows only tool or writing activity that actually happened. Steps remain expanded while the agent is working, then fold into a clickable completion summary. Opening it restores the full trail, source favicons, query count, pages read, evidence items, tool time, and the percentage change in evidence coverage from the previous run in that conversation. That percentage is an operational comparison, not a universal measure of model intelligence.

Reference images are treated as visual evidence, not instructions. Models without image input keep the composer in a text-only state and explain why before a request can be sent.

The design review records a structural fingerprint for each artifact. New runs receive the last three fingerprints from the same mode and are instructed to change the opening composition, media strategy, background logic, typography character and rhythm. A repeated direction is flagged during review.

### Output modes

- **Website** produces a responsive standalone HTML document and is reviewed at desktop, tablet and mobile widths.
- **Logo** produces one editable SVG mark built for scale, with transparent artwork by default and no raster fallback.
- **Vector** produces one standalone editable SVG composition with a subject-led focal hierarchy.
- **Motion** produces a silent 1280 × 720 canvas animation from inline code. The timeline is deterministic, exposes play, pause and seek controls in the preview, and exports as a video with no audio track.

Project conversations and the latest design source are saved locally and can be reopened from **Designs**.

Before a run, Kern compacts older turns against the selected model's context window while retaining the original brief and recent conversation. A transient provider failure is retried once before any stream is consumed.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

The test suite covers all four provider adapters, native tool-call parsing, multimodal image payloads, live-search fallback, page reading, assistant protocol rules, local history compaction and the renderer's supporting utilities.

## Provider assets

The provider controls use the organizations' official favicons, bundled locally for reliable rendering. Sources are listed in [SOURCES.md](src/renderer/src/assets/providers/SOURCES.md). Names and marks belong to their respective owners.
