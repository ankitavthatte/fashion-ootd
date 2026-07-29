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

## 3D try-on on 8th Wall (experimental scaffold)

`tryon-8thwall.html` + `body-fit.js` are a **starter** for a true 3D, body-wrapping
try-on using [8th Wall](https://www.8thwall.com) WebAR. The main try-on page
above is unaffected. 8th Wall provides the hosted AR camera and a Three.js
scene; `body-fit.js` adds the missing piece — it runs MediaPipe Pose Landmarker
on the camera and fits a 3D garment (`.glb`) to your shoulders/hips, with a
metallic PBR material for the shiny "inflated" look.

To make it live:

1. Create a project at [8thwall.com](https://www.8thwall.com), copy its **App Key**,
   and add your site's domain to the project's authorized domains.
2. Add a 3D jacket model `jacket.glb` next to `tryon-8thwall.html` (Sketchfab has
   free downloadable ones), or point `model` at a URL.
3. Edit `window.OOTD_CONFIG` at the top of `tryon-8thwall.html` with your App Key
   and model path. Tune `distance` / `scale` / `yOffset` on-device.
4. Open `tryon-8thwall.html` on your phone.

Notes / honest caveats:
- 8th Wall is a **paid** platform, and body-garment fitting is not one of its
  built-in trackers — hence the MediaPipe integration in `body-fit.js`.
- Depth from a single camera is approximate, so the fit needs tuning; for a
  richer look, swap the procedural environment in `body-fit.js` for a real HDRI.

## Swapping the jacket

The jacket is an inline SVG in `index.html` (`#jacket`). Replace that SVG — or
swap it for an `<img>` with a transparent PNG — to change the garment.

## License

MIT
