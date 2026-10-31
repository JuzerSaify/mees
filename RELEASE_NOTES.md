# Mees 1.1.0

Mees is a local-first desktop design agent that runs on API accounts you own. This release makes the agent workflow more truthful, visually capable and reliable across all four design modes.

## Improvements

- Added a single-line live agent status with an animated pixel wavefront, exact active-tool detail, real step position and elapsed time.
- Expanded the model picker with strict provider ownership, current-generation filtering, provider-native reasoning effort and accurate model grouping.
- Added Wikimedia and Wikipedia visual discovery with creator, license and attribution metadata.
- Added multimodal inspection of up to three fetched visual candidates before generation.
- Strengthened the agent harness with additional tool rounds, duplicate-result reuse, bounded tool output and richer run metrics.
- Improved design variety using recent structural, palette and typography signals.
- Extended responsive preview coverage across Website, Logo, Vector and Motion.

## Fixes

- Fixed the loader's missing easing token, which had invalidated the animation.
- Fixed visual results being ordered by byte size instead of subject relevance.
- Fixed visual discovery stopping before later usable sources.
- Removed unrelated, fair-use and favicon-only media from general artwork results.
- Removed stale and cross-provider models from provider menus.
- Removed the Refine menu and its unused interaction path.
- Fixed mobile toast placement and undersized composer controls.

Download `Mees-Setup-1.1.0.exe` from this release. The installer is unsigned, so Windows SmartScreen may ask you to confirm the publisher before installation.
