# Mees launch film

A 15-second, silent, 1920 × 1080 product launch film built from the actual Mees interface.

## Deliverables

- `renders/mees-launch-film-v2.mp4` - H.264, 1920 × 1080, 15 seconds
- `renders/mees-launch-film-v2.webm` - VP9 review copy
- `renders/mees-launch-poster-v2.png` - launch poster frame
- `frames/` - six full-resolution review frames

## Sequence

1. The Mees symbol resolves on a quiet cocoa field.
2. A perspective dolly reveals the live studio and the line "Make the artifact, not a mock."
3. The camera moves into the visible agent timeline.
4. A lateral track crosses Website, Logo, Vector and Motion modes.
5. A clearly marked concept model selector shows the illustrative "Opus 5.5"
   entry alongside the real provider marks.
6. The film resolves on the Mees wordmark and "Design anything. Keep the work."

The film renders frame by frame at 30 fps. It does not use a screen recording,
so camera movement and type animation are not limited by the browser's
video-recorder frame rate.

## Source

- Interface captures: `.ui-check` output from the local Electron app
- Provider marks: `src/renderer/src/assets/providers`
- Typeface: Schibsted Grotesk
- Motion: CSS 3D and a deterministic JavaScript timeline
- Audio: none

Provider marks identify supported services and remain the property of their owners.

## Preview

Open `index.html` in a browser. The film starts automatically, or call:

```js
window.MEES_LAUNCH.seek(8)
window.MEES_LAUNCH.play()
```

## Render

```powershell
node scripts/render-launch-film.mjs
```

The renderer samples every frame in Chromium, encodes a 30 fps H.264 master
with ffmpeg, creates a VP9 review copy, and writes the video, poster and
review frames under `renders/` and `frames/`.
