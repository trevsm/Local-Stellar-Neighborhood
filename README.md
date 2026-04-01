# Local Stellar Neighborhood

**Live site:** [trevsm.github.io/Local-Stellar-Neighborhood](https://trevsm.github.io/Local-Stellar-Neighborhood/)

<img width="1728" height="1277" alt="Screenshot 2026-04-01 at 9 34 30 AM" src="https://github.com/user-attachments/assets/cf170e40-9775-43c6-9d0e-2b04f53015d5" />

Interactive **3D visualization** of the [AT-HYG v3.3](https://codeberg.org/astronexus/athyg) star catalog (~2.5M stars) using **Three.js**. Positions use catalog Cartesian coordinates (parsecs); colors derive from B–V color index.

## Setup

```bash
npm install
```

## Generate star data

The catalog is stored on Codeberg with **Git LFS**. The prepare script resolves LFS pointers, downloads both gzip parts, and writes:

- `public/data/stars.bin` — compact binary (positions, colors, magnitudes)
- `public/data/named-stars.json` — named stars for click identification

```bash
npm run prepare-data
```

This downloads ~200MB compressed CSV and takes on the order of **1–2 minutes** depending on network speed.

## Run locally

```bash
npm run dev
```

Open the URL shown (default `http://localhost:5173`). **Drag** to orbit, **scroll** to zoom, **click** to pick a named star when nearby.

## Build

```bash
npm run build
npm run preview   # optional production preview (root base; fine for quick checks)
npm run preview:pages   # build with /Local-Stellar-Neighborhood/ base, then preview (matches GitHub Pages)
```

## License

The AT-HYG catalog is **CC BY-SA 4.0** — see [Codeberg / athyg](https://codeberg.org/astronexus/athyg).
