# 🧥 Try On — OOTD

Dead-simple virtual try-on. Open the page, the camera opens, and the jacket is
already on you. Line up your shoulders, tap the shutter, save the photo.

**Live:** https://ankitavthatte.github.io/fashion-ootd/

## How it works

- Camera opens automatically (front camera by default, so you see yourself)
- The jacket **tracks your body in real time** — it locks onto your shoulders
  and scales, follows and rotates as you move
- 🔄 flips between the front and back camera
- ◉ takes the photo (the jacket is baked into the saved image)
- Save the shot or retake

Body tracking runs entirely in your browser via
[MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe) (the Pose
model + WASM runtime load from a CDN on first use). If the model can't load,
the jacket falls back to a fixed centered overlay so the app still works.

No accounts, no uploads — the camera feed and pose detection never leave your
device. Camera access needs **HTTPS** (GitHub Pages qualifies) or `localhost`.

## Run locally

Static site — any static server works:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Project structure

```
index.html   # camera + jacket overlay + controls
styles.css   # full-screen camera UI
app.js       # camera, pose tracking, flip, capture/compositing
.github/workflows/deploy.yml  # GitHub Pages deployment
```

## True 3D try-on (`tryon-3d.html`)

`tryon-3d.html` is a **real 3D** try-on: a glossy puffer built as actual
Three.js geometry that wraps onto your body and turns/scales in perspective as
you move — not a flat image. It's self-contained and free (no accounts, no
paid platform): [Three.js](https://threejs.org) loads from a CDN, the same
MediaPipe Pose Landmarker drives the fit, and the garment + its studio
lighting are generated in code (`puffer3d.js`) so there's no model file to
ship. Reach it from the `3D ›` link on the main page, or open it directly.

- The garment is a procedural quilted puffer with a glossy nylon PBR material
  and an environment map, so it reads as shiny/wet and three-dimensional.
- Fit knobs live at the top of `tryon-3d.html` (`DIST`, `OVERSIZE`, `DROP`) —
  tune them on-device for how the jacket sits.

Honest caveats: depth from a single phone camera is approximate, so the fit is
best-effort (some sliding on fast motion); reflections come from a built-in
studio environment, not your real room; and the model faces the camera and
rolls with your shoulders but doesn't yaw as you turn.

### 8th Wall scaffold (optional, paid)

`tryon-8thwall.html` + `body-fit.js` remain as an alternative starter for
[8th Wall](https://www.8thwall.com) WebAR (hosted AR camera + a `.glb` model).
It needs a paid 8th Wall App Key and a jacket model, and 8th Wall doesn't do
garment fitting itself — `body-fit.js` adds that via MediaPipe. The free
`tryon-3d.html` above supersedes it for most uses.

## Swapping the jacket

The jacket is an inline SVG in `index.html` (`#jacket`). Replace that SVG — or
swap it for an `<img>` with a transparent PNG — to change the garment.

## License

MIT
