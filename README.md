# 👗 OOTD — Outfit of the Day

A lightweight web app for logging, tagging, and revisiting your daily outfits. Build a personal lookbook you'll actually come back to.

**Live demo:** deployed to GitHub Pages via GitHub Actions (see below).

## Features

- **Add looks** — title, cover (emoji or image URL), notes, occasion, weather, and tags
- **Browse & search** — filter by occasion or search across titles, notes, and tags
- **Like** your favorite looks and see running stats
- **Local-first** — everything is saved in your browser's `localStorage`; no account, no server
- **Light / dark theme** with a one-click toggle
- **Zero dependencies, no build step** — plain HTML, CSS, and JavaScript

## Run locally

It's a static site, so any static server works:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>.

## Project structure

```
index.html   # markup + modal
styles.css   # theme tokens, layout, components
app.js       # state, rendering, persistence
.github/workflows/deploy.yml  # GitHub Pages deployment
```

## Deployment

Pushing to the default branch runs the **Deploy to GitHub Pages** workflow, which
publishes the site. To enable it once: repository **Settings → Pages → Build and
deployment → Source: GitHub Actions**.

## License

MIT
