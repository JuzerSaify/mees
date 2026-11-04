# Changelog

## 1.4.0 - 2026-11-05

### Improvements

- Added first-class AGY CLI support with local discovery, native stream-json parsing, model selection, image references and the full Mees tool loop.
- Added model-exact effort controls for AGY and OpenCode. AGY Gemini exposes Low, Medium and High; GPT-OSS uses its supported Medium default; AGY Claude models correctly omit the unsupported effort control.
- OpenCode now reads its local model metadata and routes effort through native model variants, with no effort controls shown for models that do not support them.
- Simplified provider and model names in the composer and menus, including compact AGY labels such as `3.8 Flash`.
- Added draggable preview-panel resizing from the left divider and sharper layout zoom for fine text, borders and interface details.
- Added multi-element selection and targeted inline editing so only the chosen DOM regions are revised.
- Added a wider Settings dialog with compact text-only sections for model sources, agent behavior, updates and storage.
- Improved the agent stream with safe progressive output, partial tool-markup suppression and a clearer authoritative tool bridge across API and local harness models.
- Reworked the design library around mode categories and compact visual previews, and simplified generated-file listings to names and file-type icons.

### Fixes

- Fixed AGY runs stopping with `Unsupported provider: agy`.
- Removed unsupported AGY Max and X-High effort choices and corrected model-specific effort ranges.
- Fixed OpenCode effort controls being missing when the model metadata advertised reasoning variants.
- Fixed partial `<mees_tool_call>` markup leaking into the agent transcript.
- Fixed favicon resolution returning an unrelated website image instead of the exact requested host.
- Fixed scaled previews looking soft by switching to browser layout zoom while preserving selected-element coordinates.
- Removed the obsolete Review and Preview Size surfaces, including their empty or unreachable interaction states.

## 1.2.0 - 2026-11-01

### Improvements

- Added automatic detection of installed paid CLI harnesses, starting with Codex CLI and OpenCode.
- Added native model, image-capability, default-choice and reasoning-effort discovery from each installed harness.
- Codex CLI now prefers the model already configured in the user's Codex environment and discovers its catalog through the local app server.
- OpenCode now reuses its local service for lower startup cost, filters the exact models available to that installation and keeps authentication inside the CLI.
- Added a harness tool bridge with multi-turn and parallel Mees tool calls, tolerant tool parsing, unknown-action rejection and automatic correction of commentary-only responses.
- Added progressive canvas handoff so harnesses that publish a complete message at the end still render the artifact in a smooth sequence.
- Moved harness discovery off the startup critical path. The window opens immediately and settings update live when discovery finishes.
- Added direct title-bar update controls for `Update available`, live download progress and `Restart to update`.
- Added graceful fallback discovery for common Codex and OpenCode installation paths outside `PATH`.
- Simplified raw harness model names and replaced backend turn labels with user-facing agent states.

### Fixes

- Fixed raw `<mees_tool_call>` transport markup appearing in the agent transcript.
- Fixed OpenCode runs stopping when tool-call blocks omitted a closing transport tag.
- Fixed intermediate reasoning being treated as a completed design response.
- Fixed incomplete harness turns silently ending without an artifact.
- Fixed long model waits showing truncated provider internals instead of cycling real agent states.
- Fixed silent harness discovery delaying application startup.
- Fixed the app update indicator requiring users to reopen Settings to start a download or restart.

## 1.1.0 - 2026-10-31

### Improvements

- Added a compact, tool-aware agent status line with a live animated pixel loader, real activity detail, step position and elapsed time.
- Expanded the model picker with strict provider ownership, current-generation filtering, provider-native reasoning effort and clearer model grouping.
- Added license-aware Wikimedia and Wikipedia visual discovery, subject relevance filtering and multimodal inspection of fetched assets.
- Strengthened the agent harness with more tool rounds, duplicate-result reuse, bounded tool output, larger context handling and visual-run metrics.
- Improved design variety by passing recent layout, palette and typography signals into new runs.
- Added responsive preview checks for Website, Logo, Vector and Motion, plus cleaner mobile controls and guarded application recovery.

### Fixes

- Fixed the animated loader by defining its missing easing token and restoring the pixel wavefront.
- Fixed visual-search results being ranked by file size instead of subject relevance.
- Fixed visual discovery stopping before later pages that contained usable imagery.
- Prevented unrelated, fair-use and favicon-only results from being treated as general artwork.
- Fixed stale and cross-provider model entries appearing in provider menus.
- Fixed stale selected-model state after catalog filtering.
- Removed the nonessential Refine menu and its interaction path.
- Fixed mobile toast and composer overlap and increased touch-target sizing.
