# Jasmeet's 3D Portfolio

An interactive 3D driving portfolio — Three.js + cannon-es physics. Drive a
low-poly buggy around a dark, grid-lined world and pull up to glowing kiosks
to read About / Projects / Contact.

Inspired by the feel of driving-based 3D portfolios (Three.js scene, physics
vehicle, hand-drawn accent font, dark grid aesthetic) but built from scratch
with original code, procedural textures, and placeholder content — no assets
or code were copied from any other site.

## Run it

```bash
npm install
npm run dev
```

Open the printed localhost URL. Controls: **WASD** / arrow keys to drive,
**E** to open a kiosk you're standing near, **Escape** or the × to close it.
On touch devices, on-screen buttons appear automatically.

## Customize

- **Content** (About / Projects / Contact text): edit [`src/content.js`](src/content.js).
- **Kiosk positions / colors / labels**: the `KIOSKS` array at the top of
  [`src/world.js`](src/world.js).
- **Colors / fonts**: [`src/style.css`](src/style.css) (CSS variables at the
  top) and the Google Fonts `<link>` in [`index.html`](index.html).
- **Car look**: `_buildCar()` in `src/world.js` — it's just boxes and
  cylinders, easy to restyle.
- **World size / scenery**: `_buildGround()` and `_buildScenery()` in
  `src/world.js`.

## Build for deployment

```bash
npm run build
```

Outputs a static site to `dist/` — deployable anywhere that serves static
files (Vercel, Netlify, GitHub Pages, etc.).
