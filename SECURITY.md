# Security

## Supported version

Security fixes are applied to the latest published Mees release.

## Reporting

Use GitHub's private vulnerability reporting through the repository's **Security** tab. Do not open a public issue for a vulnerability that could expose user data, API keys or the local workspace.

Include the affected version, operating system, reproduction steps and any relevant logs with secrets removed.

## Project controls

- API keys are encrypted with Electron `safeStorage` in the desktop main process.
- The renderer uses context isolation, no Node integration and a sandboxed process.
- Generated artifacts run in a sandboxed iframe.
- The public website is static and deployed with a restrictive content security policy.
- Dependencies are locked, audited and monitored by Dependabot.
- CodeQL runs on pull requests, pushes to `main` and weekly.
- Release installers are built only by the tag-triggered GitHub workflow.
