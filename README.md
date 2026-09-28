# Redline Horizon

Edition 04 with external assets and performance improvements.

## Play / GitHub Pages

Publish **main / (root)** in Settings → Pages → Deploy from a branch. The repository already contains a ready-to-serve `index.html`, JavaScript, styles, logo, binary GLB models and physics WASM. No build service or separate game server is needed.

Expected Pages address after enabling publication: https://isapotente-hash.github.io/redline-horizon/

## Changes

- 1,994-byte HTML entry and about 1.01 MB of JavaScript, replacing the previous 18.1 MB self-contained HTML. Models and the physics binary load separately and can be cached.
- Three GLBs extracted from the original HTML with byte-for-byte SHA-256 verification. Kestrel/APEX are packages applied to the shared Vanta model; remaining original vehicle geometry is generated in code. Packed textures remain inside their GLBs.
- A percentage loading bar covers model downloads, physics, world preparation and shader warmup. Driving and multiplayer state synchronization start only after readiness.
- Persistent, preallocated road sectors are culled/reused; terrain generation yields in short batches outside the driving frame. Existing road and obstacle collision geometry is retained.
- Driving avoids expensive six-view reflection refreshes. Resolution can adapt to frame time with hysteresis; switch it off in Settings if preferred. HUD updates are limited to 10 Hz. Physics stays at 120 Hz, network poses at 20 Hz, and rendering uses requestAnimationFrame.
- Existing vehicles, wheelies, statistics, selected autopilot routes, police, upgrades, races and 2–5-player rooms are preserved.

60 FPS is a target, not a guarantee: browser, GPU, device temperature, network restrictions and graphics settings still matter. Peer-to-peer rooms need Internet access to the PeerJS signaling service; restrictive networks may block WebRTC.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
node --test scripts/web-build.test.mjs
```

Source entry: `web/index.html`; game source: `src/`. The root `index.html` and hashed runtime assets are the compiled Pages release. After rebuilding, copy the files referenced by `dist/.vite/manifest.json`, plus `dist/index.html`, `dist/favicon.svg` and `dist/redline-logo.png`, to the repository root and commit them. Do not publish old unused bundles or the offline export.

`npm run build:offline` also creates a single-file version in `dist/Redline-Horizon-Offline.html`.

## Dependencies and assets

Three.js 0.180.0 (MIT, license included), Rapier 0.19.0 (Apache-2.0), and PeerJS 1.5.5 (MIT, loaded on demand for rooms). The supplied vehicle assets and Redline Horizon logo are preserved. No third-party asset ownership or license transfer is implied.
