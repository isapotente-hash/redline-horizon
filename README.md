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

## Camera synchronization review

The runtime already uses 60 Hz physics. Chase position and aim now use the same interpolated vehicle transform in a single post-physics render phase. Common car translation is applied to both camera endpoints before exponential lerp smooths the trailing offset and turning direction. This avoids independently lagging the world-space camera behind the interpolated car when frame duration varies. Fixed-step overload handling retains the fractional interpolation phase.

Camera scratch vectors and its collision ray are reused. Static scenery constrains the final smoothed camera position; dynamic cars, multiplayer proxies and sensors do not shorten its follow distance. Teleports and camera-mode changes reset follow history. Free camera preserves its entry heading and independent controls. Camera dragging and map dragging stop after lost/cancelled pointer capture.

The review also fixed stale gamepad action edges after reconnection, loading-screen transition listener/timer cleanup, late PeerJS download callbacks, and repeated terrain-streaming failures (bounded retries and one error report per failure streak). Outgoing poses pause during area preparation. Camera listeners have explicit disposal, and existing streaming geometry/collider cleanup and multiplayer interval teardown remain intact. The autopilot HUD status check now runs with the throttled HUD. No active console.log/debug/info or analytics tracking was found in the runtime loops; exceptional initialization/streaming errors remain diagnosable.

Regression coverage adds synchronized camera offset/aim at 30/60/144 Hz, uneven frame times and stalls; smoothly eased turns; teleport and camera-mode transitions; wall obstruction and moving-car exclusion; pointer cleanup; gamepad reconnect; loading transitions and asynchronous retry cleanup. These are automated numeric/physics tests, not a claim of zero bugs or measured GPU frame rates on every device.

## Tight chase, on-foot controls and junction HUD

- Tight chase sits 4.8 m behind the car / 3.6 m behind a bike, with a small speed adjustment, higher elevation and a shorter aim offset. The synchronized translation and smoothed turns remain active; the wide camera is still available.
- Press **Shift** (either side) or the HUD Exit button to park and exit. Car velocity/forces are cleared without a teleport or braking impulse. Exit tests both sides for support and full capsule clearance, and rejects airborne/blocked exits. Finish an active pursuit/impound before exiting. A single reusable Rapier character controller handles ground contact, slopes, low steps and obstacle sliding.
- On foot, **WASD/arrows** move relative to the camera; **drag** to orbit and **scroll** to adjust distance. Return within **2.8 m**, with clear line of sight, and press Shift to enter. The capsule is disabled/hidden on entry and the car returns to dynamic driving physics with tight chase restored. Switching to another driving/garage mode cleans up possession. Saves retain the parked vehicle position; multiplayer peers retain its existing vehicle pose (the walking avatar is local).
- Fullscreen is now **Alt + Enter**, avoiding a conflict with Shift exit. Vehicle autopilot is disabled on exit; walking does not earn driving mileage rewards.
- Route warnings are compact and left-docked. Their four-second prediction uses speed projected along the route toward the existing steering-commit threshold (the greater of 50 m or 2.5 seconds of driving). Actual arrival time can change with acceleration/braking. Selection dismisses the panel synchronously while retaining the chosen turn internally. A four-second wall-clock deadline also hides it during a stopped or paused approach; passing the commit threshold clears it earlier.

Validation for this update: 122 automated tests, TypeScript/build validation and asset integrity checks, including all vehicle exit/re-entry variants, blocked/airborne exits, capsule wall collisions, unloaded-edge protection, the actual tunnel road, camera viewport framing, and HUD selection/expiry.

## Circular speedometer

The driving instrument follows the supplied reference: a transparent circular dial, thin outer ring, open-bottom 0–12 RPM scale, continuous yellow sweep with an angular tip, red high-RPM band, centered gear, large speed and a simple unit label. Live readings retain km/h or mph settings and reverse indication. SVG geometry remains sharp at desktop and touch-screen sizes without a texture or extra asset request. Boost, drift and wheelie feedback sits outside the dial. Updates remain on the existing throttled HUD cadence, with no changes to vehicle gearing or physics.

## Mobile driving HUD

HUD overrides and touch listeners apply only to recognized touch-capable Android/iOS phones and tablets (including the iPadOS desktop user agent). Windows, ChromeOS, macOS and Linux desktop/laptop browsers retain desktop controls even when resized or touchscreen enabled. Viewport size alone never enables the mobile overlay. Mobile action buttons show clean labels while preserving their existing handlers and toggle states. Coins stay centered at the top; location, enforcement and route notices have separate space. The map and dial are approximately 80% of their previous mobile size, with separate steering and pedal areas below them. All driving touch buttons are at least 48 × 48 px; the bike wheelie button uses a separate row with dial clearance. Insets respect device safe areas. Mouse/keyboard layouts retain their original styling, key hints and control labels, including narrow desktop windows.

Validation: actual HUD rendering at 10 phone/tablet sizes in portrait and landscape, including cars, bikes, route choices, race overlays, multiplayer status, large balances, touch press/release and exit/entry labels. Four desktop viewport comparisons match the prior element bounds, font sizes and visible labels in driving, autopilot and on-foot states. Physics and engine source files are unchanged.


## Personal laps, drift rewards and drafting

- **Lap times** on the home screen ranks the fastest 20 individual circuit laps, with vehicle, date and manual/assisted filters. Each completed ordered lap saves immediately, including individual laps in endurance and multiplayer races, under the existing `redline_horizon_v4_save` namespace. Compatible one-lap legacy records are imported; older circuit or three-lap totals are not invented as individual laps. Browser-origin/localStorage availability still determines persistence.
- Hold **Space / HB** while turning at driving speed to charge the drift meter through a sustained grounded slide. Progressive rear grip and physical yaw damping tame developing spins. Release the handbrake and straighten to earn **2.2 seconds of nitro**; partial drifts, spins, airborne exits, crashes and off-road slides do not reward. Nitro adds stronger thrust and remains separate from five-second orb boosts.
- Following an aligned opponent 6–40 m ahead builds slipstream after half a second, reducing drag and adding bounded acceleration. NPC traffic, race opponents and fresh visible multiplayer poses qualify; oncoming, adjacent-lane, stale, vertical-separated or obstructed vehicles do not. Braking/handbraking cancels drafting.
- Chase position and aim use critically damped springs for turn inertia while preserving synchronized interpolated translation. Speed widens FOV; boosts/drafting add a modest extension. Small temporary boost/crash pulses, static-wall scrape feedback and off-road vibration are removed before the next camera update so shake cannot accumulate or reintroduce rubber-banding. Static obstruction checks remain enabled; free/photo/on-foot views remain separate.
- Recognized mobile controls still map to the same WASD/Space actions. Touch release, cancellation and lost pointer capture clear held inputs. Desktop keyboard/mouse/gamepad bindings are preserved.

Validation: 132 automated physics/state/input/camera regressions; TypeScript and Vite build; GLB/WASM release integrity; ten mobile/tablet HUD/leaderboard viewports; four unchanged desktop driving layouts; explicit touch-enabled Windows/Mac/Linux desktop isolation; production startup and saved-lap reload checks. These checks do not measure GPU FPS across all hardware or prove zero bugs.


## Rural environment surfaces

- Neutral grey asphalt uses a shared 512px aggregate albedo and subtle relief. A single solid white centre line replaces the double yellow and dashed lane markers; paint has explicit depth ordering so it remains continuous over grades. True road junctions retain clear markings. Road layouts, lane following and vehicle controls are preserved.
- Dry brown/gold terrain and roadside grass use a world-aligned straw texture and bump relief, continuous across streamed chunk seams. Shared tapered 3D clumps add nearby field and verge detail. Grass stays outside pavement, is omitted from bridge/tunnel decks and crossing lanes, and fades/culls by quality and distance. Lower settings reduce field density.
- Rural metallic rail surfaces are replaced by low dry stone walls with irregular rubble joints, upright coping, grain and bump relief. The same continuous grade-following geometry provides solid collision: textured stone detail never introduces wheel-contact spikes. Urban sign hardware, legitimate tunnel boundaries and junction openings are retained.
- All surface textures are generated once at startup, use mipmaps and bounded dimensions, and need no new asset downloads. Grass geometry/materials are shared across instanced batches; streamed batches are disposed with their chunks. No UI, vehicle model, save namespace or driving-control changes are included.

Validation: full regression suite, shader/render checks at noon and late afternoon, terrain/UV seams, texture bounds, grass clearance/culling, 24,264 clear-lane sweeps, both tunnel boundaries, all eight vehicle types through the coastal tunnel in both directions, high-speed edge impacts and bounded world streaming.
