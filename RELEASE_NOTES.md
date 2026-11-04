# Mees 1.4.0

Mees 1.4.0 expands the agent into a more dependable local design runtime. AGY CLI now works through the same tool loop as the API providers and other harnesses, model effort controls follow each model's real capabilities, and the studio is faster to scan and edit.

Website: https://mees-design.vercel.app

## Improvements

- Added first-class AGY CLI discovery, native streaming, model selection, image references and Mees tool execution.
- Added model-exact AGY effort options: Gemini 3.8 Flash uses Low, Medium and High; GPT-OSS uses its supported Medium default; AGY Claude models omit the unsupported effort control.
- Added OpenCode effort discovery from local model metadata and native `model#variant` routing.
- Simplified provider-aware model labels in the composer and model menu, including `3.8 Flash` for AGY.
- Added draggable preview-panel resizing and sharper browser-zoom rendering.
- Added multi-element preview selection with targeted inline edits.
- Added compact text-only Settings sections for sources, agent behavior, updates and storage.
- Reduced avoidable wait by defaulting AGY Gemini to Medium and reducing artificial preview latency.

## Fixes

- Fixed `Unsupported provider: agy` stopping real AGY runs.
- Removed unsupported AGY Max and X-High choices.
- Fixed OpenCode effort controls missing from supported models.
- Fixed partial tool-call markup leaking into the transcript.
- Fixed favicon lookup returning an unrelated site image.
- Removed obsolete Review and Preview Size controls.
- Improved horizontal layout and mobile behavior across the workspace.

Download `Mees-Setup-1.4.0.exe` from this release. The installer is unsigned, so Windows SmartScreen may ask you to confirm the publisher before installation.
