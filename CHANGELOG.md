# Changelog

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
