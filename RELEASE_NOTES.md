# Mees 1.2.0

Mees now works with paid local CLI harnesses as well as API accounts. It automatically discovers installed harnesses, resolves their available models and reasoning levels, and keeps credentials inside the tool that owns them.

## Improvements

- Added automatic paid harness discovery for Codex CLI and OpenCode.
- Added model, image capability and reasoning-effort discovery directly from each installed harness.
- Codex CLI now selects the model configured by the user and reads its native app-server catalog.
- OpenCode now reuses the local service, shows the exact models available to the installation and keeps authentication in OpenCode.
- Added multi-turn Mees tool calls across local harnesses, including parallel tool requests and automatic correction retries.
- Added progressive canvas handoff for harnesses that publish their final message after the model turn.
- Moved harness discovery off the startup path so the workspace opens immediately and updates live.
- Added title-bar update controls for downloading and restarting, with live progress.
- Added cleaner user-facing agent states and compact harness model labels.

## Fixes

- Fixed raw harness tool markup appearing in the agent transcript.
- Fixed local tool loops stopping when closing transport tags were omitted.
- Fixed reasoning-only harness replies being accepted as completed designs.
- Fixed silent startup delays while local harnesses were discovered.
- Fixed update actions requiring repeated trips to Settings.

Download `Mees-Setup-1.2.0.exe` from this release. The installer is unsigned, so Windows SmartScreen may ask you to confirm the publisher before installation.
