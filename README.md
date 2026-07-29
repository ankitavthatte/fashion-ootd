# 🧥 Try On — OOTD

Dead-simple virtual try-on. Open the page, the camera opens, and the jacket is
already on you. Line up your shoulders, tap the shutter, save the photo.

**Live:** https://ankitavthatte.github.io/fashion-ootd/

## How it works

- Camera opens automatically (front camera by default, so you see yourself)
- A jacket overlay sits on top of the live camera — nothing to choose or set up
- 🔄 flips between the front and back camera
- ◉ takes the photo (the jacket is baked into the saved image)
- Save the shot or retake

No accounts, no uploads — everything happens on your device. Camera access
needs **HTTPS** (GitHub Pages qualifies) or `localhost`.

## Run locally

Static site — any static server works:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Project structure

```
index.html   # camera + jacket overlay + controls
styles.css   # full-screen camera UI
app.js       # camera, flip, capture/compositing
.github/workflows/deploy.yml  # GitHub Pages deployment
```

## Swapping the jacket

The jacket is an inline SVG in `index.html` (`#jacket`). Replace that SVG — or
swap it for an `<img>` with a transparent PNG — to change the garment.

## License

MIT
