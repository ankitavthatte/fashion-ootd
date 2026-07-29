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

## Swapping the jacket

The jacket is an inline SVG in `index.html` (`#jacket`). Replace that SVG — or
swap it for an `<img>` with a transparent PNG — to change the garment.

## License

MIT
