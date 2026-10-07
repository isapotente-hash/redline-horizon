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
- Existing vehicles, wheelies, statistics, automatic autopilot routing, police, upgrades, races and 2–5-player rooms are preserved.

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
- On foot, **WASD/arrows** walk and strafe relative to the camera; **click the scene** for mouse look and **scroll** to adjust distance. Mobile uses a left walking joystick and right camera-drag area. Return within **2.8 m**, with clear line of sight, and press Shift or tap ENTER to enter. The capsule is disabled/hidden on entry and the car returns to dynamic driving physics with tight chase restored. Switching to another driving/garage mode cleans up possession. Saves retain the parked vehicle position; multiplayer peers retain its existing vehicle pose (the walking avatar is local).
- Fullscreen is now **Alt + Enter**, avoiding a conflict with Shift exit. Vehicle autopilot is disabled on exit; walking does not earn driving mileage rewards.
- Route warnings are compact and left-docked. Their four-second prediction uses speed projected along the route toward the existing steering-commit threshold (the greater of 50 m or 2.5 seconds of driving). Actual arrival time can change with acceleration/braking. Selection dismisses the panel synchronously while retaining the chosen turn internally. A four-second wall-clock deadline also hides it during a stopped or paused approach; passing the commit threshold clears it earlier.

Validation for this update: 122 automated tests, TypeScript/build validation and asset integrity checks, including all vehicle exit/re-entry variants, blocked/airborne exits, capsule wall collisions, unloaded-edge protection, the actual tunnel road, camera viewport framing, and HUD selection/expiry.

## Circular speedometer

The driving instrument follows the supplied reference: a transparent circular dial, thin outer ring, open-bottom 0–12 RPM scale, continuous yellow sweep with an angular tip, red high-RPM band, centered gear, large speed and a simple unit label. Live readings retain km/h or mph settings and reverse indication. SVG geometry remains sharp at desktop and touch-screen sizes without a texture or extra asset request. Boost, drift and wheelie feedback sits outside the dial. Updates remain on the existing throttled HUD cadence, with no changes to vehicle gearing or physics.

## Mobile driving HUD

HUD overrides and touch listeners apply only to recognized touch-capable Android/iOS phones and tablets (including the iPadOS desktop user agent). Windows, ChromeOS, macOS and Linux desktop/laptop browsers retain keyboard/mouse controls, even when resized or touchscreen enabled. Viewport size alone never enables touch controls.

The approved top bar groups Exit/Enter, Autopilot, Photo, Map and Pause in a dark control strip. Desktop shows keyboard shortcuts; portrait mobile puts Exit/Enter, the existing coin fade and Pause above Autopilot, Photo and Map. Wide mobile screens use one row. Desktop controls are 32px high; mobile controls retain 44px touch targets and use one compact row on normal-width phones. Very narrow phones put the balance above the controls. Controls respect safe areas, and show all three assist modes with explicit ON/OFF status. Autopilot is disabled on foot. Mode changes update labels without replacing the icons or event handlers. Five bundled Lucide SVG icons add no network requests or runtime dependency; their license is in `licenses/LUCIDE.txt`.

The map, dial, steering and pedal areas retain the existing mobile layout. Walking still switches to the left joystick and right look area, and desktop keeps its WASD/mouse controls. Optional driving notices avoid the complete action bar.


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

## Routes, vehicle feedback and race rooms

- **Routes & practice** on the home/pause screens offers five races: the existing 19.7 km Horizon circuit, Summit Run, South Coast Sprint, and two new connected alternatives, Bracken Lane and Highland Switchbacks. New narrow lanes, crests and hairpins have bounded banking shared by road meshes, collision, terrain, collectibles and traffic. New junctions attach to the established road grade without changing the original routes. Sprint gates must be passed in order; personal sprint bests save independently of circuit lap records.
- Six practice starts cover tunnels, forest bends, climbing, country lanes, hairpins and the coastal bridge. Practice has no timer, traffic, police or economy rewards. Pause offers quick restart and return to road. Recovery tests the actual chassis clearance and ground bank before moving; races return to the last passed checkpoint with a three-second solo penalty. Recovery preserves a pursuit and cannot bypass impound.
- Shared scenery adds irregular shrub clusters, farm entrances, a mill and mountain lookout. Farm gates have matching wall openings; buildings remain solid. Scenery builds incrementally with the existing distance-limited chunk lifecycle and shared materials/geometries.
- Vehicle profiles distinguish AWD/RWD, brake force, gearing, aero, wet/loose traction and response. Garage acceleration/braking figures are explicitly **estimates**, with mass and vehicle character for comparison. Engines respond to load and vehicle timbre; pooled shift/lift sounds, tyre/rumble layers, suspension response and brief exhaust effects add feedback. Existing brake lights, drift rewards and camera translation synchronization remain active.
- The host chooses one of five routes, circuit laps, vehicle class, standing/rolling start and player ghost contact. Drivers choose eligible vehicles and confirm readiness after rule changes. All peers finish asynchronous route preparation before the shared countdown. Results list finish order; the host can rematch when the field finishes or disconnects. The protocol version changed, so all players must use this release. This is peer-hosted WebRTC, not a server-authoritative competitive service.
- Police pursuits escalate through three stages, with coordinated lead interception and bounded catch-up speed. Visibility rays account for obstacles; leaving sight and gaining distance enables escape. Arrest still requires an officer physically intercepting the slowed player. Crashes alone never arrest or start a pursuit.
- Coin notices coalesce behind higher-priority driving/police messages. Camera vibration is adjustable and saved. New panels scroll within mobile safe areas, retain 48px touch targets and keep desktop driving controls unchanged. No personal-best replay ghost or rival personalities were added.

Validation: automated physics/state/network regression coverage; real-car traversals of both new routes; 26,031 clear-lane shape sweeps and 87,040 near/far terrain samples; production startup, saved-progress reload, driving/autopilot, practice reward isolation, restart/recovery, garage and lobby checks; desktop HUD comparisons, ten mobile driving viewports and four new route/lobby mobile layouts; WebGL shader checks and release asset integrity. Multiplayer start/configuration uses simulated peer tests; live cross-network reliability and hardware FPS are not measured by these checks.

## Driving tools, finishes and clean intersections

- Intersection rendering now subtracts crossing pavement footprints instead of using per-road depth offsets. Each same-grade overlap has one asphalt owner; the other road's asphalt, shoulder and paint fragments are trimmed to its boundary. Interpolated UVs and heights preserve grades. Height-separated overpasses remain visible. Shared physically based asphalt also removes redundant road materials; the existing continuous collision support is retained.
- **Corner guidance** defaults to Off. Optional warnings use the same road tyre coefficient as the vehicle controller, including vehicle/upgrade/weather grip, aero load, road banking and speed-sensitive steering. Braking distance uses the installed brakes and aerodynamic drag. Nearby bends remain silent when the current speed is feasible, when lifting suffices, or before the braking point is near. Warnings clear immediately when slowing makes them unnecessary. Uncommitted junction branches, airborne/off-road recovery and active drifts are excluded. Six reusable roadside markers appear only with a braking warning; the guide never operates vehicle controls.
- **Driver setup** in the workshop adds brake bias, steering sensitivity, differential lock and spring stiffness. Factory preserves the installed upgrade's brake bias; stable/agile/rough presets offer starting points. Supported-wheel axle torque redistribution conserves engine force, and bounded power-on yaw damping models lock's turn-in trade-off. Per-vehicle setups save immediately and stack with purchased parts. Autopilot compensates steering sensitivity to retain its intended wheel angle.
- Rain intensity changes visible rainfall, road wetness/reflections, road grip, fog visibility and rain audio. Race weather is fixed at its start, with separate dry/wet personal lap and route records. Old records remain dry and are not erased. Hosts can choose dry, wet or fog conditions for the room.
- Race rooms now include driver names, per-driver connection-quality/readiness information, copyable deployment-safe invite links and a reconnect action after a dropped guest link. Invites open the lobby after startup; players confirm Connect. Rejoining waits if a shared race is still active, rather than inventing an in-race resume or discarding opponents' results. All players must use this protocol version.
- Cosmetic livery unlocks, existing wheel finishes and editable number plates are available in the garage. One reusable paint shader and plate texture per vehicle avoid per-frame asset creation. Major impacts add cosmetic paint wear; garage repairs are free unless **Paid cosmetic repairs** is enabled. Cosmetic damage never changes driving performance or police arrest conditions.
- Impact sounds pan toward the hit side; continuous scraping has its own sound layer. Crash noise/tones reuse preallocated audio voices. Route boards name scenic destinations before their junctions; map previews highlight the selected route with distance, difficulty, climb and an elevation profile.
- **Performance diagnostics** (Settings or F3) displays a bounded frame-time graph with physics subsystem, render-submission and overall CPU timings, draw calls and triangles. Render-submission time is not GPU time. HUD updates are throttled; no analytics or network telemetry logging is added. Optional mobile panels find space around driving controls, and default desktop driving layout remains unchanged.

Validation includes 163 automated tests, 7,461 visible lane coverage/duplicate-surface checks, grade-separated crossing coverage, actual tuning controller behavior, corner prediction, dry/wet save isolation, cosmetic economy, host weather/name synchronization and reconnect handling. Production WebGL checks cover startup/reload, shaders, purchases, workshop settings, diagnostics, map previews and lobby controls. Desktop comparisons and mobile/tablet layouts preserve controls and touch targets. No race sector timing or save export/import was added.

The intersection visual pass also corrected older city building placement: buildings now use the rendered terrain footprint, with solid foundations extending into the supported near/far ground rather than floating above terrain lowered for road clearance.

Corner-warning regression tests also drive a real 50m-radius physics road at 115 km/h without brakes or warnings. Dry/wet overspeed runs verify road departure when warnings are ignored and safe completion when responding to the wet warning. Fresh/older saves default to Off while explicit player preferences persist.

## Uploaded racer and possession ownership

The local player uses the supplied Realistic Male F1 Racer rig, suit and helmet. `assets/characters/RACER.glb` is an external 3.6MB GLB optimized from the 57.7MB upload: bounded JPEG textures, compact accessor data and the authored Idle/Walking clips, with original mesh topology, 66-joint skin and weights retained. `scripts/optimize-racer.py` reproduces the asset from the original GLB. Presentation transforms and horizontal animation root motion are removed; Rapier still owns movement.

A single `DriverAvatar` moves between the selected vehicle body and `OnFootPlayer.root` on successful possession changes. Existing local procedural rider meshes are explicitly hidden; the walking capsule has no second person mesh. Failed exits/re-entry retain the previous owner, and forced menu/garage transitions use the same path. Per-class seating targets and bounded two-bone fitting place hands/boots at controls, with low-cabin fit scaling and sport-bike posture. Repeated exits reuse the avatar, rig and physics capsule; walking blends the supplied animations and stops when paused. The new actor is preloaded and counted in startup progress before gameplay/shader warm-up. Peer occupancy packets clear a parked remote motorcycle rider when its driver exits; new rooms require the updated protocol.

Validation: 169 automated tests plus the production build and asset integrity checks. Avatar tests cover all eight vehicles, 64 repeated possession cycles, yawed/banked/translated seat coordinates, helmet/hand/foot fit, real exit/walking/re-entry physics, walking bone animation without independent root movement, loading readiness and remote occupant visibility. Browser rendering checks cover the uploaded suit/helmet, all vehicle silhouettes and the playable Shift interaction.

Character delivery uses thirty bounded binary transfers with six requests at a time. Loading reassembles the original GLB before possession; `npm run build` and `npm test` reconstruct and SHA-256 verify the source model from the committed parts. No transfer or reassembly occurs during driving.

## On-foot controls

Exiting switches from vehicle inputs to independent forward/right walking axes. Desktop WASD or arrows move and strafe relative to the camera; click the scene to capture the mouse for look (drag is available if capture is unavailable), and Esc releases it and pauses. Mobile phones/tablets show a left analogue joystick and a right camera-drag area in place of steering, GO, BRAKE, handbrake and wheelie buttons. Two fingers can walk and look together. Release, cancel, lost capture, focus loss, pause and possession changes clear touch movement. Entering restores the original vehicle controls. Touch UI and handlers use the existing mobile device policy, so touch laptops and resized desktops retain keyboard/mouse controls.

## Short-distance collision streaming

Terrain collision uses distance to each tile boundary instead of the integer tile offset. Nearby edges and diagonal corners are prefetched, so walking behind a parked vehicle cannot stop at an unloaded neighbouring tile merely because simulation distance is below 256 m. Ground keeps a small unloading buffer; nearby scenery colliders use actual metre distance plus their physical extent and a 32 m unloading buffer. This preserves solid vehicles/walls/trees while allowing distant collision work to unload. Walking floor checks exclude the parked vehicle so its chassis cannot be mistaken for ground.

## Gameplay checkpoints without periodic blocking saves

Ten-second position checkpoints and gameplay economy writes use asynchronous IndexedDB transactions; pending writes coalesce to the latest full profile. Startup validates and restores a newer checkpoint before creating the world, vehicles and collectibles. A newer explicit save wins over an older in-flight checkpoint, including purchases/settings changed during loading. Existing localStorage primary/backup keys and legacy migration remain supported. Menu transactions/settings and lifecycle position flushes remain immediately durable; closing/hiding the game flushes its current profile. Failed/blocked asynchronous storage remains nonfatal and does not introduce a synchronous disk write into the animation frame.


## Automatic device graphics and manual presets

Automatic graphics is on by default for new and existing profiles. It measures actual gameplay frame cadence and CPU cost, plus asynchronous GPU timer queries when the browser supports them. It starts conservatively at Low with a 60 FPS target, lowers shadows, effects, antialiasing and distances after sustained overload, and can settle at a paced 30 FPS when 60 is not sustainable. Consistent headroom gradually raises quality through Medium and High to Extra High (the maximum Ultra distance/rendering budget). Failed upgrades are held back; paused, hidden, loading and isolated long-stall intervals are excluded. The controller continues monitoring thermal slowdown and changing scene load. Targets are goals, not a guarantee on every device.

Auto never drops rendering below one pixel per CSS pixel and retains existing textures, materials, sharpness and lighting. It can reduce supersampling above that floor. At its lowest tier, ambient occlusion, bloom and shadow rendering are off; higher tiers restore them. Settings shows the active tier, FPS target and effective distances. Choosing a manual preset or distance disables Auto, and manual preferences survive automatic adjustments and reloads. Re-enabling Auto starts a fresh calibration; no device-name guessing or hardware fingerprinting is used.

Frame pacing supports 60/90/120/144 Hz displays without changing the fixed physics timestep. The FPS overlay shares the coins’ aqua text and fade. Internal performance measurements still count all render passes and use GPU milliseconds when supported. GPU queries are bounded, read only after completion, and discarded after disjoint events or tier changes.

Manual presets use the same display-density rendering (up to 2× CSS resolution), 4× hardware antialiasing where supported, full-resolution ambient occlusion, restrained bloom, sharpened output, shadows up to 4096px, clouds, grass density, nearby tree detail and road texture filtering. Manual preset changes never resize render buffers or toggle visual effects. Hardware limits apply equally to every preset. Weather remains a separate setting.

| Preset | Render distance | Simulation distance |
| --- | ---: | ---: |
| Very Low | 10m | 10m |
| Low | 500m | 150m |
| Medium | 1000m | 350m |
| High | 1600m | 600m |
| Ultra | 3000m | 1000m |

Both distance sliders start at 10m, with 5m steps. Auto uses the same 10m Very Low budget under sustained overload. Nearby ground collision retains its safety margin across terrain tile edges. Distance sliders can override these budgets, and custom distances survive reload. Old saves without distance values get their selected preset's budget. Scenery residency, grass range and traffic activity follow distance rather than the preset name. Removing half-resolution rendering, stacked FXAA on MSAA hardware and short-range haze keeps Very Low sharp. The game continues to use its existing vehicle, character and scenery assets.

Autopilot route selection is removed from Settings and gameplay; autopilot follows its automatic route. Braking warnings and braking markers default to Off, including a one-time migration of old saves. Players can explicitly enable corner guidance later, and that preference persists.

## Racing soundtrack and boost feedback

Racing soundtrack defaults to On in Settings, with a saved on/off checkbox and the existing audio volume control. Three original electronic instrumentals (Neon Run, Apex Chase and Afterburn) blend drums, bass, arpeggios and chord pads. A worker renders stereo tracks off the game thread; buffered playback crossfades between tracks without scheduling individual notes during gameplay. Music starts after a player interaction when driving, pauses in menus/loading and hidden tabs, and resumes from its previous position. Disabling music stops playback and releases the worker and cached tracks. Engine, tyre and other game sounds remain independently available. No third-party recordings or external music downloads are used.

The boost signal replaces the old boost text above the speedometer. An angled aqua/purple badge animates exhaust trails and energy rails, bursts once on activation, and shows a segmented remaining-time meter. Nitro takes precedence while active, then returns to any remaining orb boost. Unlimited developer boost displays an infinity symbol. Mobile layouts and reduced-motion preferences are supported.
