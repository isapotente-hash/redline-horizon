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
- Driving avoids expensive six-view reflection refreshes. Resolution can adapt to frame time with hysteresis; switch it off in Settings if preferred. HUD updates are limited to 10 Hz. Physics uses a fixed 60 Hz timestep with a two-step / 6 ms catch-up budget, network poses at 20 Hz, and rendering uses requestAnimationFrame.
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

Source entry: `web/index.html`; game source: `src/`. The root `index.html` and hashed runtime assets are the compiled Pages release. `npm run build` automatically publishes the current manifest resources to the repository root; commit the updated source and compiled release together. Do not publish old unused bundles or the offline export.

`npm run build:offline` also creates a single-file version in `dist/Redline-Horizon-Offline.html`.

## Dependencies and assets

Three.js 0.180.0 (MIT, license included), Rapier 0.19.0 (Apache-2.0), and PeerJS 1.5.5 (MIT, loaded on demand for rooms). The supplied vehicle assets and Redline Horizon logo are preserved. No third-party asset ownership or license transfer is implied.

## Physics and save update

- Fixed 60 Hz simulation is independent of render refresh rate, with interpolated rendering. Catch-up is limited to two ticks per frame and stops after a 6 ms budget (a single tick is never interrupted). Excess backlog is discarded, so slow devices can temporarily simulate less time instead of entering a catch-up spiral. CCD and live wheel contact raycasts remain enabled.
- Road queries select the nearest segment using scalar math before constructing a single result. Wheel controller settings are sent to WASM only when they change; the ray filter callback is reused. No console logging or tracking runs in physics/network loops.
- Permanent save key: `redline_horizon_v4_save`, with schema version, timestamp, backup recovery, validation and synchronous loading before vehicle initialization. Economy transactions, race completion and settings changes save immediately; driving statistics/position also checkpoint every 10 seconds and on page hide.
- Existing `redline-horizon-v1` data and recognized Redline save-key variants are copied without deleting the originals. A valid canonical save takes precedence so spent money cannot be resurrected by stale legacy data. Unknown future save formats are never overwritten. Older track unlock IDs and original-circuit records are retained.
- Browser origin isolation still applies: GitHub Pages cannot read localStorage from a different host, an offline HTML origin, another browser or a partitioned iframe. Those saves require transfer from the original origin; this migration does not claim to recover inaccessible data. Browser storage must permit writes for persistence.

Validation: 106 automated regressions, an additional 11-test world pass at 60 Hz (including the full 19.7 km circuit, all eight vehicles through tunnels, high-speed barrier contacts and NPC lanes), and web asset integrity checks. Run the extra pass with `PHYSICS_TEST_HZ=60 node --import tsx --test scripts/world-expansion.test.ts`. Actual FPS still depends on the device and graphics workload.
