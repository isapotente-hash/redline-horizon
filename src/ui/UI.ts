import {BoostSignal,boostSignalMarkup} from "./BoostSignal";
import {DriftSignal,driftSignalMarkup} from "./DriftSignal";
import {drivingBarMarkup} from "./DrivingBar";
import {routePreview} from '../world/RoutePreview';
import {LIVERIES} from '../vehicles/CosmeticCatalog';
import {setupTune} from '../vehicles/DriverSetup';
import {CornerGuide} from '../vehicles/CornerGuide';
import {performanceEstimate} from "../vehicles/VehicleTraits";
import {RACE_ROUTES,PRACTICE_SECTIONS,routeRoad} from "../racing/RouteCatalog";
import {mobileDevice} from "../input/DevicePolicy";
import { speedometerMarkup, updateSpeedometer } from "./Speedometer";
import {RouteChoice} from "../vehicles/AutopilotRoutes";
import {REGION_LABELS} from "../world/RegionalScenery";
import {isBike,chassisFor} from '../vehicles/CarCatalog';
import {PoliceManager} from '../police/PoliceManager';
import {CARS} from "../vehicles/CarCatalog";
import { STOCK, UPGRADES, UPGRADE_SLOTS, tuneFor } from "../vehicles/UpgradeCatalog";
import { SaveManager, Settings } from "../core/SaveManager";
import { VehiclePhysics } from "../physics/VehiclePhysics";
import { RoadNetwork } from "../world/RoadNetwork";
import { RaceManager } from "../racing/RaceManager";
import { CameraManager } from "../camera/CameraManager";
import { InputManager } from "../input/InputManager";
import { WalkingTouchControls } from "../input/WalkingTouchControls";
import { timeText, clamp } from "../core/math";
export type State =
  | "loading"
  | "menu"
  | "activities"
  | "statistics"
  | "leaderboard"
  | "dev"
  | "drive"
  | "pause"
  | "settings"
  | "controls"
  | "garage"
  | "workshop"
  | "multiplayer"
  | "photo"
  | "map"
  | "results";
const validPreview=(id:string)=>RACE_ROUTES.find(r=>r.id===id)?.id||'horizon';
const button = (action: string, label: string, cls = "") =>
  `<button data-action="${action}" class="${cls}">${label}</button>`;
const compactCoins = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
// Reference coin display: outlined turquoise figures over a transparent-to-dark fade.
const wallet = (hud = false) => `<div class="wallet${hud ? ' hud-wallet' : ''}" role="group" aria-label="Coin balance">
  <div class="coin-copy"><span class="coin-prefix" aria-hidden="true">+</span><b class="coin-balance">0</b></div>
</div>`;
const homeVehicleImages:Record<string,string>={
  vanta:new URL('../../assets/ui/home/vanta.webp',import.meta.url).href,
  kestrel:new URL('../../assets/ui/home/kestrel.webp',import.meta.url).href,
  apex:new URL('../../assets/ui/home/apex.webp',import.meta.url).href,
  pulse:new URL('../../assets/ui/home/pulse.webp',import.meta.url).href,
  spectre:new URL('../../assets/ui/home/spectre.webp',import.meta.url).href,
  atlas:new URL('../../assets/ui/home/atlas.webp',import.meta.url).href,
  comet:new URL('../../assets/ui/home/comet.webp',import.meta.url).href,
  revuelto:new URL('../../assets/ui/home/revuelto.webp',import.meta.url).href,
};
const homeRouteImage=new URL('../../assets/ui/home/routes.webp',import.meta.url).href;
const homeLapImage=new URL('../../assets/ui/home/lap-times.webp',import.meta.url).href;
export class UI {
  private mobile=false;
  private walkingTouch?: WalkingTouchControls;
  onFootLook: (x: number, y: number) => void = () => {};
  practiceName="";
  police?:PoliceManager;
  root: HTMLElement;
  state: State = "loading";
  onAction: (a: string) => void = () => {};
  onSetting: (k: string, v: any) => void = () => {};
  onSetup:(key:string,value:number)=>void=()=>{};
  private mapRoute="horizon";driverNames=new Map<number,{name?:string}>();
  onPhoto: (k: string, v: number) => void = () => {};
  toastTimer = 0;
  private driftSignal!:DriftSignal;
  private boostSignal!:BoostSignal;
  mini: HTMLCanvasElement;
  map: HTMLCanvasElement;
  mapZoom = 1;
  mapPan = { x: 0, y: 0 };
  mapDrag = false;
  mapLast = { x: 0, y: 0 };
  hiddenPhoto = false;
  constructor(
    public save: SaveManager,
    public roads: RoadNetwork,
    public input: InputManager,
  ) {
    this.root = document.getElementById("ui")!;
    const mobile=this.mobile=mobileDevice();document.documentElement.classList.toggle("mobile-device",mobile);
    const logo=document.querySelector<HTMLImageElement>("#startup img")?.src||"";
    this.root.innerHTML = `
 <div id="vignette"></div><div id="toast" role="status"></div>
 <section data-panel="loading" class="world-loading"><img src="${logo}" alt="Redline Horizon"><p id="loading-text" class="screen-reader-only">Loading</p></section>
 <section data-panel="menu" class="menu-panel home-menu">
   <div class="home-sidebar">
     <h1 class="wordmark">REDLINE<span>HORIZON</span></h1>
     <nav class="home-actions" aria-label="Play and customise">
       <button data-action="drive" class="home-link home-default"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14"/><path d="m26 11-4 12-13 5 5-13Z"/></svg><span>OPEN WORLD</span><b aria-hidden="true">↗</b></button>
       <button data-action="race" class="home-link"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 36V6h25v20H9m0-10h25M21 6v20"/></svg><span>RACE</span><b aria-hidden="true">↗</b></button>
       <button data-action="mp-open" class="home-link"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="15" cy="13" r="6"/><path d="M4 34v-5a11 11 0 0 1 22 0v5m0-28a6 6 0 0 1 0 12m3 5a9 9 0 0 1 7 9v2"/></svg><span>MULTIPLAYER</span><b aria-hidden="true">↗</b></button>
       <button data-action="garage" class="home-link"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m4 14 16-9 16 9v21H4Zm5 21V18h22v17M9 24h22M9 29h22"/></svg><span>GARAGE</span><b aria-hidden="true">↗</b></button>
       <button data-action="settings" class="home-link"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 5v30M20 5v30M33 5v30M3 13h8m5 14h8m5-10h8"/></svg><span>SETTINGS</span><b aria-hidden="true">↗</b></button>
     </nav>
     <nav class="main-nav home-secondary" aria-label="More options">${button("activities", "ROUTES & PRACTICE")}${button("statistics", "STATISTICS")}${button("leaderboard", "LAP TIMES")}${button("continue", "CONTINUE", "continue")}</nav>
   </div>
   <div class="home-features" aria-label="Quick access">
     <button data-action="garage" class="home-feature home-ride"><img id="home-car-image" src="${homeVehicleImages.vanta}" alt="VANTA R1" decoding="async"><span>YOUR VEHICLE</span><strong id="home-car-name">VANTA R1</strong><b aria-hidden="true">↗</b></button>
     <button data-action="activities" class="home-feature home-routes"><img src="${homeRouteImage}" alt="A winding road through the game’s hills" decoding="async"><span>EXPLORE THE MAP</span><strong>ROUTES & PRACTICE</strong><b aria-hidden="true">↗</b></button>
     <button data-action="leaderboard" class="home-feature home-times"><img src="${homeLapImage}" alt="The game’s circuit starting grid" decoding="async"><span>PERSONAL BESTS</span><strong>LAP TIMES</strong><b aria-hidden="true">↗</b></button>
   </div>
 </section>
 <section data-panel="activities" class="overlay" hidden><div class="panel activities-panel"><div class="panel-head"><h2>Routes & practice</h2>${button("back","← BACK","text-button")}</div><h3>RACE ROUTES</h3><div id="race-routes" class="activity-grid"></div><h3>PRACTICE SECTIONS</h3><p class="muted">No timer, traffic or police. Restart the section at any time.</p><div id="practice-sections" class="activity-grid"></div></div></section>
 <div id="edition">${wallet()}</div>
 <section data-panel="drive" class="drive-ui">${drivingBarMarkup(wallet(true))}<div id="coin-reward" role="status" aria-live="polite" aria-atomic="true" hidden><span class="coin-prefix" aria-hidden="true">+</span><b class="coin-amount">0</b></div><aside id="law-hud" hidden><div id="speed-sign" data-style="circle" role="img" aria-label="No posted speed limit"><span class="sign-heading" aria-hidden="true"></span><strong id="posted-limit">—</strong><small>km/h</small></div><div id="law-copy"><b id="law-title">UNRESTRICTED</b><span id="law-detail"></span><progress id="law-progress" max="1" value="0" hidden></progress></div></aside><div class="minimap"><canvas id="minimap" width="440" height="440"></canvas><div class="map-n">N</div></div><div class="instruments">${speedometerMarkup()}<div class="instrument-status"><div id="wheelie-status" hidden></div>${boostSignalMarkup()}<div id="slipstream-status" hidden>SLIPSTREAM</div></div></div>${driftSignalMarkup()}<div id="race-hud"><div><span>POSITION</span><strong id="race-position">8<small> / 8</small></strong></div><div><span>TIME</span><strong id="race-time">00:00.00</strong></div><div><span>LAP</span><strong id="race-lap">1<small> / 1</small></strong></div><div><span>CHECKPOINT</span><strong id="race-checkpoint">01<small> / 19</small></strong></div></div><div id="countdown"></div><div class="touch-controls"><button data-hold="KeyA">◀</button><button data-hold="KeyD">▶</button><button data-hold="Space" id="touch-drift" aria-label="Hold to drift while steering">DRIFT</button><button data-hold="KeyS">BRAKE</button><button data-hold="KeyW">GO</button><button data-hold="ControlLeft" id="touch-wheelie" hidden>WHEELIE</button></div></section>
 <section data-panel="leaderboard" class="overlay"><div class="panel leaderboard-panel"><div class="panel-head"><h2>Lap times</h2>${button("back","← BACK","text-button")}</div><div class="leaderboard-toolbar"><div><span class="tiny">HORIZON CIRCUIT</span><strong id="lap-best">—</strong></div><label>Driving<select id="lap-filter"><option value="all">All laps</option><option value="manual">Manual</option><option value="assisted">Assisted</option></select></label><label>Conditions<select id="lap-condition"><option value="dry">Dry</option><option value="wet">Wet</option><option value="all">All</option></select></label></div><div id="leaderboard-content"></div></div></section>
 <section data-panel="statistics" class="overlay"><div class="panel statistics-panel"><div class="panel-head"><h2>Statistics</h2>${button("back","← BACK","text-button")}</div><div id="statistics-content"></div></div></section>
 <section data-panel="pause" class="overlay"><div class="panel narrow"><h2>Paused</h2><div class="stack">${button("resume", "RESUME", "primary")}${button("restart", "RESTART SESSION")}${button("recover", "RETURN TO ROAD")}${button("activities", "ROUTES & PRACTICE")}${button("race", `HORIZON CIRCUIT <span>${(this.roads.main.length/1000).toFixed(1)} km / 8 cars</span>`)}${button("garage", "GARAGE")}${button("settings", "SETTINGS")}${button("controls", "CONTROLS")}${button("menu", "MAIN MENU")}</div></div></section>
 <section data-panel="settings" class="overlay"><div class="panel settings"><div class="panel-head"><div><h2>Settings</h2></div>${button("back", "← BACK", "text-button")}</div><div class="settings-grid"><div><h3>DISPLAY & WORLD</h3><label class="check">Automatic graphics<input data-setting="autoGraphics" type="checkbox"></label><p id="auto-graphics-status" class="muted" role="status"></p><label>Manual graphics preset<select data-setting="quality"><option value="very-low">Very Low</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><p class="muted">Auto measures gameplay and balances distances, shadows and effects for a stable 60 or 30 FPS target. Image resolution stays at least one pixel per CSS pixel. Choosing a preset or distance turns Auto off; manual presets share maximum rendering quality.</p><label>Render distance <span id="render-distance-out"></span><input data-setting="renderDistance" type="range" min="10" max="3000" step="5"></label><label>Simulation distance <span id="simulation-distance-out"></span><input data-setting="simulationDistance" type="range" min="10" max="1000" step="5"></label><p class="muted">Simulation distance controls scenery collisions. Traffic keeps extra distance at speed so you can react. Active races and pursuits keep running.</p><label>Weather<select data-setting="weather"><option value="clear">Clear</option><option value="cloudy">Cloudy</option><option value="rain">Rain</option><option value="fog">Fog</option></select></label><label>Time of day <span id="hour-out"></span><input data-setting="hour" type="range" min="0" max="23.9" step=".1"></label><label class="check">Day / night cycle<input data-setting="cycle" type="checkbox"></label><label>Camera vibration<input data-setting="cameraMotion" type="range" min="0" max="1" step=".1"></label><label>Rain intensity<input data-setting="rainIntensity" type="range" min="0" max="1" step=".1"></label><label class="check">Show FPS<input data-setting="diagnostics" type="checkbox"></label><label class="check">Paid cosmetic repairs<input data-setting="repairCosts" type="checkbox"></label><label>Corner guidance<select data-setting="cornerGuide"><option value="off">Off</option><option value="hud">Warnings only</option><option value="markers">Warnings + braking markers</option></select></label><label class="check">Racing soundtrack<input data-setting="music" type="checkbox"></label><label>Audio volume<input data-setting="volume" type="range" min="0" max="1" step=".01"></label></div><div><h3>DRIVING</h3><label>Race length<select data-setting="raceLaps"><option value="1">1 lap · sprint</option><option value="3">3 laps · endurance</option></select></label><label>Transmission<select data-setting="automatic"><option value="true">Automatic</option><option value="false">Manual · Q / E</option></select></label><label>Speed units<select data-setting="units"><option value="kmh">Kilometres per hour</option><option value="mph">Miles per hour</option></select></label><label class="check">Traction control<input data-setting="traction" type="checkbox"></label><label class="check">Stability assist<input data-setting="stability" type="checkbox"></label><label>Autopilot mode<select data-setting="autopilotMode"><option value="full">Full driving</option><option value="steering">Steering only · you control speed</option><option value="speed">Speed only · you steer</option></select></label><p id="autopilot-mode-help" class="muted"></p><label>Autopilot speed <span id="autopilot-speed-out"></span><input data-setting="autopilotSpeed" type="range" min="30" max="180" step="5"></label><p class="muted">F toggles autopilot. Manual input overrides the assist.</p>${button("controls", "VIEW CONTROLS →", "text-button")}</div></div></div></section>
 <section data-panel="controls" class="overlay"><div class="panel controls"><div class="panel-head"><div><h2>Controls</h2></div>${button("back", "← BACK", "text-button")}</div><div class="control-grid"><div><h3>KEYBOARD</h3><dl><dt>W / ↑</dt><dd>Accelerate</dd><dt>S / ↓</dt><dd>Brake · hold at rest to reverse</dd><dt>A D / ← →</dt><dd>Steer</dd><dt>Hold Space</dt><dd>Drift / handbrake while steering</dd><dt>Hold Ctrl</dt><dd>Bike wheelie while moving · release or brake to land</dd><dt>Q / E</dt><dd>Shift down / up</dd><dt>C</dt><dd>Cycle 7 cameras</dd><dt>R</dt><dd>Reset to road</dd><dt>H / L</dt><dd>Horn / headlights</dd><dt>G</dt><dd>Start Horizon Circuit</dd><dt>M / P</dt><dd>World map / photo mode</dd><dt>Esc</dt><dd>Pause / back</dd><dt>F</dt><dd>Autopilot on / off</dd><dt>Shift</dt><dd>Exit / enter vehicle</dd><dt>Alt + Enter / F3</dt><dd>Fullscreen / performance</dd></dl></div><div><h3>ON FOOT</h3><p class="muted">W / S or ↑ / ↓ walk forward / backward. A / D or ← / → strafe. Click the scene to capture the mouse, then move the mouse to look. Esc releases the mouse and pauses. On mobile, use the left joystick to walk in any direction and drag the right side to look. Tap ENTER near your vehicle.</p><h3>MANUAL DRIFT</h3><p class="muted">Build speed on the road, then hold Space while steering. On mobile, hold DRIFT and a steering arrow together; you can keep GO held with another finger. Release the drift button and straighten the vehicle to finish the slide. Fill the drift meter and make a clean exit to earn nitro.</p><h3>CONTROLLER</h3><dl><dt>Left stick</dt><dd>Steer</dd><dt>RT / LT</dt><dd>Accelerate / brake</dd><dt>Hold A</dt><dd>Drift / handbrake</dd><dt>LB / RB</dt><dd>Shift down / up</dd><dt>Y / X</dt><dd>Camera / reset</dd><dt>Start / View</dt><dd>Pause / map</dd></dl><h3>PHOTO & FREE CAMERA</h3><p class="muted">Drag to orbit or look. Scroll to change orbit distance. Free camera: I/K forward/back, J/L left/right, O/U rise/descend. WASD, arrows and controller still drive the vehicle. In photo mode, Tab hides the controls.</p></div></div></div></section>
 <section data-panel="garage" class="garage-panel"><div class="garage-header"><div class="eyebrow">GARAGE</div>${wallet()}</div><h2><span id="garage-car-name">VANTA R1</span></h2><div id="garage-spec" class="garage-spec"></div><h3>VEHICLES</h3><div id="car-shop" class="car-shop"></div><h3>BODY FINISH</h3><div class="swatches">${[
   ["#b81120", "Rosso"],
   ["#14181d", "Obsidian"],
   ["#dcdedb", "Glacier"],
   ["#174b79", "Atlantic"],
   ["#686b70", "Titanium"],
 ]
   .map(
     ([c, n]) =>
       `<button aria-label="${n} paint" title="${n}" data-color="${c}" style="--swatch:${c}"></button>`,
   )
   .join("")}</div><h3>WHEELS</h3><div class="wheel-options">${[
   ["#92989e", "SILVER"],
   ["#17191d", "BLACK"],
   ["#9b7a4f", "BRONZE"],
 ]
   .map(([c, n]) => `<button data-wheel="${c}">${n}</button>`)
   .join(
     "",
   )}</div><label>Glass tint<input type="range" data-setting="tint" min=".05" max=".85" step=".01"></label><div class="stack">${button("garage-drive", "SAVE & DRIVE <span>↗</span>", "primary")}${button("back", "← BACK", "text-button")}</div></section>
 <section data-panel="photo" class="photo-panel"><div class="panel-head"><div><h2>Photo mode</h2></div>${button("resume", "×", "close")}</div><label>Field of view<input data-photo="fov" type="range" min="25" max="90" value="50"></label><label>Exposure<input data-photo="exposure" type="range" min=".4" max="1.8" step=".01" value=".95"></label><label>Camera roll<input data-photo="roll" type="range" min="-.5" max=".5" step=".01" value="0"></label><label>Time of day<input data-setting="hour" type="range" min="0" max="23.9" step=".1"></label>${button("capture", "CAPTURE PHOTO", "primary")}<p class="muted">Drag to orbit · Scroll to zoom<br>Tab hides controls · P returns to the road</p></section>
 <section data-panel="map" class="map-panel"><canvas id="world-map"></canvas><div class="map-sidebar"><h2>Map</h2><p class="muted">Drag to pan · Scroll to zoom</p><h3>ROUTE PREVIEW</h3><select id="map-route" aria-label="Preview route">${RACE_ROUTES.map(r=>`<option value="${r.id}">${r.name}</option>`).join("")}</select><div id="map-route-details"></div><canvas id="map-elevation" width="240" height="80" aria-label="Route elevation profile"></canvas>${button("map-race", "RACE THIS ROUTE →", "primary")}<h3>FAST TRAVEL</h3><div class="stack">${[["HORIZON 01",120,"AZURE COAST"],["SUMMIT PASS",600,"SUMMIT PASS"],["COPPER DUNES",600,"COPPER DUNES"],["NOVA CITY",300,"NOVA CITY"],["CEDAR SUBURBS",700,"CEDAR SUBURBS"],["ZENITH INDUSTRIAL",600,"INDUSTRIAL"],["SOUTH COAST",1800,"SOUTH COAST"]].map(([name,d,label])=>button(`travel:${this.roads.roads.findIndex(r=>r.name===name)}:${d}`,String(label))).join("")}</div>${button("resume", "← RESUME", "text-button")}</div></section>
 <section data-panel="results" class="overlay"><div class="panel result-panel"><h2>Race results</h2><div class="results-numbers"><div><span>POSITION</span><strong id="result-place">01 <small>/ 08</small></strong></div><div><span>YOUR TIME</span><strong id="result-time">00:00.00</strong></div></div><p id="result-best" class="muted"></p><div class="stack">${button("race", "RACE AGAIN", "primary")}${button("resume", "CONTINUE")}</div></div></section>
`;
    this.root.querySelector('[data-panel="garage"] h2')!.insertAdjacentHTML("afterend",button("workshop","UPGRADES →","workshop-entry"));
    this.root.querySelector("#result-best")!.insertAdjacentHTML("afterend",'<p id="result-reward" class="reward-note"></p>');
    this.root.querySelector("#result-best")!.insertAdjacentHTML("afterend",'<ol id="result-standings" class="result-standings" hidden aria-label="Finishing order"></ol>');
    this.root.insertAdjacentHTML("beforeend",`<section data-panel="workshop" class="overlay" hidden><div class="panel workshop-panel"><div class="panel-head"><div><div class="eyebrow">UPGRADES</div><h2 id="workshop-car"></h2>${wallet()}</div>${button("back","← BACK","text-button")}</div><div id="tune-summary" class="tune-summary"></div><div id="upgrade-shop" class="upgrade-shop"></div></div></section>`);
    this.root.querySelector('[data-panel="drive"]')!.insertAdjacentHTML('beforeend','<aside id="route-choice" hidden aria-label="Autopilot route choice"><div class="route-heading"><strong>CHOOSE ROUTE</strong><span id="route-distance"></span></div><div id="route-options"></div><p id="route-hint" role="status"></p></aside>');
    this.root.querySelector('.drive-ui')!.insertAdjacentHTML('beforeend','<aside id="corner-guide" hidden aria-live="polite"><b id="corner-action"></b><span id="corner-speed"></span><small id="corner-distance"></small></aside><aside id="frame-diagnostics" class="wallet fps-strip" aria-label="Frames per second" hidden><b id="fps-value">60</b><span>FPS</span></aside>');
    this.root.querySelector('.drive-ui')!.insertAdjacentHTML('beforeend', '<p class="foot-help">WASD / arrows · walk & strafe &nbsp; Mouse · click to look &nbsp; Shift · enter vehicle</p><div id="walking-touch"><div id="walk-joystick" role="group" aria-label="Walking joystick"><span class="walk-directions" aria-hidden="true">✥</span><i id="walk-thumb" aria-hidden="true"></i><small>WALK</small></div><div id="walk-look" aria-label="Drag to rotate walking camera"><span>DRAG TO LOOK</span></div></div>');
    if (mobile) this.walkingTouch = new WalkingTouchControls(document.getElementById('walk-joystick')!, document.getElementById('walk-thumb')!, document.getElementById('walk-look')!, this.input, (x, y) => this.onFootLook(x, y));
    this.root.querySelector('.garage-panel')!.insertAdjacentHTML('beforeend','<section class="finish-options"><h3>LIVERY</h3><div id="livery-shop"></div><label>Number plate<input id="number-plate" maxlength="8" placeholder="REDLINE"></label><button data-action="plate-apply">APPLY PLATE</button><button data-action="repair">REPAIR COSMETIC DAMAGE</button><small id="repair-price"></small></section>');
    this.root.querySelector('.workshop-panel')!.insertAdjacentHTML('beforeend','<section id="driver-setup"><h3>DRIVER SETUP</h3><div class="setup-presets"><button data-action="setup:factory">FACTORY</button><button data-action="setup:stable">STABLE</button><button data-action="setup:agile">AGILE</button><button data-action="setup:rough">ROUGH ROAD</button></div><div class="setup-grid"><label>Front brake bias <output id="setup-brakeBias-out"></output><input data-setup="brakeBias" type="range" min=".35" max=".75" step=".01"><small>More front bias adds stability; rear bias helps turn-in.</small></label><label>Steering sensitivity <output id="setup-steering-out"></output><input data-setup="steering" type="range" min=".6" max="1.4" step=".05"><small>Higher values turn faster and need finer inputs.</small></label><label>Differential lock <output id="setup-differential-out"></output><input data-setup="differential" type="range" min="0" max="1" step=".05"><small>Transfers torque toward supported wheels; more lock resists rotation under power.</small></label><label>Spring stiffness <output id="setup-spring-out"></output><input data-setup="spring" type="range" min=".75" max="1.25" step=".05"><small>Stiffer response is sharper; softer springs absorb bumps.</small></label></div></section>');
    this.mini = document.getElementById("minimap") as HTMLCanvasElement;
    this.map = document.getElementById("world-map") as HTMLCanvasElement;
    this.root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement,
        b = t.closest<HTMLElement>("[data-action]");
      if (b) this.onAction(b.dataset.action!);
      const color = t.closest<HTMLElement>("[data-color]");
      if (color) this.onSetting("paint", color.dataset.color);
      const wheel = t.closest<HTMLElement>("[data-wheel]");
      if (wheel) this.onSetting("wheels", wheel.dataset.wheel);
    });
    this.root.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if(t.id==="lap-filter"||t.id==="lap-condition"){this.showLeaderboard();return;}
      if(t.id==="map-route"){this.mapRoute=t.value;this.showMapPreview();return;}
      if(t.dataset.setup){this.onSetup(t.dataset.setup,Number(t.value));this.syncSetup();return;}
      if (t.dataset.setting) {
        const k = t.dataset.setting;
        let v: any =
          t.type === "checkbox"
            ? t.checked
            : t.type === "range"
              ? Number(t.value)
              : t.value;
        if (k === "automatic") v = v === "true";
        if (k === "raceLaps") v = Number(v);
        this.onSetting(k, v);
        this.sync();
      }
      if (t.dataset.photo) this.onPhoto(t.dataset.photo, Number(t.value));
    });
    if(mobile)this.root.querySelectorAll<HTMLButtonElement>("[data-hold]").forEach(b=>{
      const release=()=>this.input.touch.delete(b.dataset.hold!);
      b.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||this.state!=='drive'||!this.input.isDriving)return;e.preventDefault();b.setPointerCapture(e.pointerId);this.input.touch.add(b.dataset.hold!);});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,release);
    });
    this.map.addEventListener("pointerdown", (e) => {
      this.mapDrag = true;
      this.mapLast = { x: e.clientX, y: e.clientY };
      this.map.setPointerCapture(e.pointerId);
    });
    this.map.addEventListener("pointermove", (e) => {
      if (this.mapDrag) {
        this.mapPan.x += e.clientX - this.mapLast.x;
        this.mapPan.y += e.clientY - this.mapLast.y;
        this.mapLast = { x: e.clientX, y: e.clientY };
      }
    });
    for(const event of ["pointerup","pointercancel","lostpointercapture"])this.map.addEventListener(event, () => (this.mapDrag = false));
    this.map.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.mapZoom = clamp(
          this.mapZoom * (e.deltaY < 0 ? 1.12 : 0.89),
          0.6,
          4,
        );
      },
      { passive: false },
    );
    this.driftSignal=new DriftSignal(document.getElementById("drift-meter")!);
    this.boostSignal=new BoostSignal(document.getElementById("boost-signal")!);
    this.sync();
    this.setState("loading");
  }
  setState(state: State) {
    this.state = state;
    if(state!=="drive"){this.driftSignal.hide();this.boostSignal.hide();this.rewardUntil=0;this.rewardAmount=0;document.getElementById("coin-reward")!.hidden=true;}
    this.syncMovementControls();
    if(state==="map")this.showMapPreview();
    if(state==="activities")this.showActivities();
    if(state==="statistics")this.showStatistics();
    if(state==="leaderboard")this.showLeaderboard();
    this.root.dataset.state = state;
    this.root
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((p) => (p.hidden = p.dataset.panel !== state));
    document.getElementById("edition")!.hidden = state !== "menu";
    document.querySelector<HTMLElement>(".continue")!.hidden =
      !this.save.position;
    this.hiddenPhoto = false;
    this.root.classList.remove("photo-hidden");
  }
  economyKey = "";
  economy() {
    const key=`${this.save.unlimitedCoins}:${this.save.coins}:${this.save.selectedCar}:${[...this.save.ownedCars].join()}:${JSON.stringify(this.save.loadout)}`;
    if(key===this.economyKey)return;this.economyKey=key;
    const balance=this.save.unlimitedCoins?"∞":this.save.coins.toLocaleString(undefined,{useGrouping:false});
    this.root.querySelectorAll(".coin-balance").forEach(el=>el.textContent=
      this.mobile&&!this.save.unlimitedCoins&&this.save.coins>=1_000_000&&el.closest('#edition,.hud-wallet')
        ? compactCoins.format(this.save.coins) : balance);
    this.root.querySelectorAll(".wallet").forEach(el=>el.setAttribute("aria-label",this.save.unlimitedCoins?"Unlimited coins":`${this.save.coins.toLocaleString()} coins`));
    const car=this.save.car,tune=setupTune(tuneFor(this.save.loadout),this.save.setup),estimate=performanceEstimate(car,tune);
    document.getElementById("home-car-name")!.textContent=car.name;
    const ride=this.root.querySelector<HTMLElement>(".home-ride")!;ride.classList.toggle("is-bike",isBike(car));
    const image=this.root.querySelector<HTMLImageElement>("#home-car-image")!;if(image.dataset.vehicle!==car.id){image.src=homeVehicleImages[car.id];image.alt=car.name;image.dataset.vehicle=car.id;}
    document.getElementById("garage-car-name")!.textContent=car.name;
    document.getElementById("garage-spec")!.innerHTML=`<div><strong>${Math.round(620*car.power*tune.enginePower*chassisFor(car).forceScale)}</strong><span>Nm TORQUE</span></div><div><strong>${Math.round((car.topSpeed+tune.engineSpeed+tune.gearingSpeed)*3.6)}</strong><span>km/h TOP SPEED</span></div><div><strong>${Math.round(car.handling*100)}</strong><span>GRIP</span></div><div><strong>${estimate.acceleration.toFixed(1)} s</strong><span>0–100 KM/H · EST.</span></div><div><strong>${Math.round(estimate.braking)} m</strong><span>100–0 KM/H · EST.</span></div><div><strong>${estimate.mass} kg</strong><span>${estimate.drive}</span></div><p class="vehicle-character">${estimate.label}</p>`;
    document.getElementById("car-shop")!.innerHTML=CARS.map((c,i)=>{
      const preview=performanceEstimate(c,tuneFor(this.save.loadouts[c.id]||STOCK));
      const selected=c.id===this.save.selectedCar,owned=this.save.ownedCars.has(c.id),canBuy=this.save.unlimitedCoins||this.save.coins>=c.price;
      return `<article class="shop-car ${selected?'equipped':''}" style="--car-color:${c.color}"><div class="shop-car-top"><span class="car-number">0${i+1}</span><div><strong>${c.name}</strong></div></div><div class="car-stat-row"><span>POWER ${Math.round(c.power*100)}</span><span>GRIP ${Math.round(c.handling*100)}</span><span>${Math.round(c.topSpeed*3.6)} KM/H LIMIT</span><span>${preview.acceleration.toFixed(1)}s 0–100 · EST.</span><span>${Math.round(preview.braking)}m STOP · EST.</span></div><button data-action="car:${c.id}" ${selected||(!owned&&!canBuy)?'disabled':''}>${selected?'EQUIPPED':owned?'SELECT →':`UNLOCK · ${c.price} COINS`}</button>${!owned&&!canBuy?`<small>${c.price-this.save.coins} more coins needed</small>`:''}</article>`;
    }).join("");
    document.getElementById("touch-wheelie")!.hidden=!isBike(car);
    this.renderFinish();this.renderWorkshop();
  }
  renderWorkshop() {
    const loadout=this.save.loadout,tune=setupTune(tuneFor(loadout),this.save.setup),car=this.save.car;
    document.getElementById("workshop-car")!.textContent=car.name;
    document.getElementById("tune-summary")!.innerHTML=`<span>SPEED LIMIT <b>${Math.round((car.topSpeed+tune.engineSpeed+tune.gearingSpeed)*3.6)} km/h</b></span><span>POWER <b>${Math.round(car.power*tune.enginePower*100)}</b></span><span>DRY GRIP <b>${Math.round(tune.dry*car.handling*100)}</b></span><span>WET GRIP <b>${Math.round(tune.wet*car.handling*100)}</b></span><span>LOOSE GRIP <b>${Math.round(tune.loose*car.handling*100)}</b></span><span>BRAKE FORCE <b>${Math.round(tune.brakeForce*100)}</b></span><span>TRAVEL <b>${Math.round(tune.travel*100)} cm</b></span>`;
    document.getElementById("upgrade-shop")!.innerHTML=UPGRADE_SLOTS.map(slot=>`<section class="upgrade-column"><h3>${slot.toUpperCase()}</h3>${UPGRADES.filter(u=>u.slot===slot).map(u=>{
      const equipped=loadout[slot]===u.id,owned=this.save.ownsUpgrade(u.id),affordable=this.save.unlimitedCoins||this.save.coins>=u.price;
      return `<article class="upgrade-option ${equipped?'fitted':''}"><div class="upgrade-heading"><strong>${u.name}</strong><span>${equipped?'FITTED':owned?'OWNED':`${u.price} COINS`}</span></div><p class="upgrade-pro">${u.advantage}</p><p class="upgrade-con">${u.tradeoff}</p><small>${u.stats}</small><button data-action="upgrade:${u.id}" ${equipped||(!owned&&!affordable)?'disabled':''}>${equipped?'FITTED':owned?'FIT':`BUY & FIT · ${u.price}`}</button>${!owned&&!affordable?`<span class="upgrade-shortfall">${u.price-this.save.coins} more coins needed</span>`:''}</article>`;
    }).join('')}</section>`).join('');
    this.syncSetup();
  }
  sync() {
    this.economy();
    for (const el of this.root.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("[data-setting]")) {
      const val = this.save.settings[el.dataset.setting as keyof Settings];
      if (el instanceof HTMLInputElement && el.type === "checkbox")
        el.checked = val as boolean;
      else el.value = String(val);
    }
    document.getElementById("render-distance-out")!.textContent=`${this.save.settings.renderDistance} m`;
    document.getElementById("simulation-distance-out")!.textContent=`${this.save.settings.simulationDistance} m`;
    document.getElementById("autopilot-speed-out")!.textContent = `${this.save.settings.autopilotSpeed} km/h`;
    const mode = this.save.settings.autopilotMode;
    const speedControl = this.root.querySelector<HTMLInputElement>('[data-setting="autopilotSpeed"]')!;
    speedControl.disabled = mode === "steering";
    document.getElementById("autopilot-mode-help")!.textContent = mode === "steering" ? "You control acceleration and braking." : mode === "speed" ? "You steer." : "Steering and speed assistance.";
    const h = this.save.settings.hour;
    document.getElementById("hour-out")!.textContent =
      `${Math.floor(h).toString().padStart(2, "0")}:${Math.floor((h % 1) * 60)
        .toString()
        .padStart(2, "0")}`;
    this.root
      .querySelectorAll<HTMLElement>("[data-color]")
      .forEach((b) =>
        b.classList.toggle(
          "selected",
          b.dataset.color === this.save.settings.paint,
        ),
      );
    this.root
      .querySelectorAll<HTMLElement>("[data-wheel]")
      .forEach((b) =>
        b.classList.toggle(
          "selected",
          b.dataset.wheel === this.save.settings.wheels,
        ),
      );
  }
  autopilotStatus(enabled: boolean) {
    const button = document.getElementById("autopilot-toggle") as HTMLButtonElement;
    const state = String(enabled);
    const mode = this.save.settings.autopilotMode;
    if (button.getAttribute("aria-pressed") === state && button.dataset.mode === mode) return;
    button.dataset.mode = mode;
    button.setAttribute("aria-pressed", state);
    const label = mode === "steering" ? "AUTO STEER" : mode === "speed" ? "AUTO SPEED" : "AUTOPILOT";
    button.querySelector(".toolbar-label")!.textContent = label;
    button.querySelector(".toolbar-status")!.textContent = enabled ? "ON" : "OFF";
    button.setAttribute("aria-label", `${label} ${enabled ? "on" : "off"}`);
  }
  showLeaderboard(){
    const filter=(document.getElementById('lap-filter') as HTMLSelectElement).value;
    const condition=(document.getElementById('lap-condition') as HTMLSelectElement).value;
    const records=this.save.lapRecords.filter(r=>(filter==='all'||(filter==='assisted')===r.assisted)&&(condition==='all'||(r.condition||'dry')===condition));
    document.getElementById('lap-best')!.textContent=records.length?timeText(records[0].time):'—';
    document.getElementById('leaderboard-content')!.innerHTML=records.length?`<table class="lap-table"><thead><tr><th scope="col">#</th><th scope="col">Lap time</th><th scope="col">Vehicle / driving</th><th scope="col" class="lap-date">Date</th></tr></thead><tbody>${records.map((r,i)=>`<tr><th scope="row">${String(i+1).padStart(2,'0')}</th><td class="lap-time">${timeText(r.time)}</td><td>${r.imported?'Previous best':CARS.find(c=>c.id===r.carId)!.name}<small>${r.imported?'Imported':`${r.assisted?'Assisted':'Manual'}${r.multiplayer?' · Multiplayer':''} · ${r.condition==='wet'?'Wet':'Dry'} · Lap ${r.lap}`}</small></td><td class="lap-date">${r.date?new Date(r.date).toLocaleDateString():'—'}</td></tr>`).join('')}</tbody></table>`:'<p class="leaderboard-empty">Complete a circuit lap to set a time.</p>';
  }
  syncSetup(){const setup=this.save.setup,tune=tuneFor(this.save.loadout);for(const [k,v] of Object.entries(setup)){const el=this.root.querySelector<HTMLInputElement>(`[data-setup="${k}"]`);if(el)el.value=String(k==='brakeBias'&&!v?tune.frontBias:v);const out=document.getElementById(`setup-${k}-out`);if(out)out.textContent=k==='brakeBias'?`${Math.round((v||tune.frontBias)*100)}% front`:`${Math.round(v*100)}%`;}}
  renderFinish(){document.getElementById('livery-shop')!.innerHTML=LIVERIES.map(l=>{const owned=this.save.ownedLiveries.includes(l.id),selected=(this.save.liveries[this.save.selectedCar]||'factory')===l.id;return `<button data-action="livery:${l.id}" ${selected?'disabled':''}>${l.name} · ${selected?'FITTED':owned?'OWNED':`${l.price} COINS`}</button>`;}).join('');(document.getElementById('number-plate') as HTMLInputElement).value=this.save.plates[this.save.selectedCar]||'REDLINE';}
  get previewRoute(){return validPreview(this.mapRoute);}
  showMapPreview(){const r=RACE_ROUTES.find(r=>r.id===this.mapRoute)||RACE_ROUTES[0],road=routeRoad(this.roads,r.id),info=routePreview(road);document.getElementById('map-route-details')!.textContent=`${(info.length/1000).toFixed(1)} km · ${info.difficulty} · ↑ ${Math.round(info.gain)} m · ${Math.round(info.min)}–${Math.round(info.max)} m altitude`;const canvas=document.getElementById('map-elevation') as HTMLCanvasElement,c=canvas.getContext('2d')!;c.clearRect(0,0,240,80);c.strokeStyle='#8be8ce';c.lineWidth=2;c.beginPath();road.samples.forEach((s,i)=>{const x=s.d/road.length*236+2,y=74-(s.p.y-info.min)/Math.max(20,info.max-info.min)*65;i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
  private placeOptional(box:HTMLElement){if(!this.mobile||box.hidden)return;const rect=box.getBoundingClientRect();if(!rect.width||!rect.height)return;const w=rect.width,h=rect.height,obstacles=[...this.root.querySelectorAll<HTMLElement>('.topbar,.hud-wallet,#law-hud,.minimap,.instruments,.touch-controls,#route-choice,#mp-hud,#race-hud,#corner-guide,#drift-meter,#coin-reward,#frame-diagnostics')].filter(e=>e!==box&&!e.hidden&&getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);if(rect.left>=12&&rect.right<=innerWidth-12&&rect.top>=64&&rect.bottom<=innerHeight-64&&!obstacles.some(r=>rect.left<r.right+6&&rect.right>r.left-6&&rect.top<r.bottom+6&&rect.bottom>r.top-6))return;let bestX=-1,bestY=-1,best=Infinity;for(let y=64;y+h<=innerHeight-64;y+=12)for(let x=12;x+w<=innerWidth-12;x+=12){if(obstacles.some(r=>x<r.right+6&&x+w>r.left-6&&y<r.bottom+6&&y+h>r.top-6))continue;const score=Math.abs(x+w-(innerWidth-12))+Math.abs(y-150)*.3;if(score<best){best=score;bestX=x;bestY=y;}}if(bestX>=0){box.style.left=`${bestX}px`;box.style.top=`${bestY}px`;box.style.right='auto';box.style.bottom='auto';box.style.transform='none';}}
  guide(guide:CornerGuide,active:boolean){const box=document.getElementById('corner-guide')!;box.hidden=!active||!guide.visible;if(box.hidden)return;box.classList.toggle('brake-now',guide.brake);document.getElementById('corner-action')!.textContent='BRAKE';document.getElementById('corner-speed')!.textContent=`${this.save.settings.units==='mph'?Math.round(guide.recommended/1.609344):guide.recommended} ${this.save.settings.units==='mph'?'mph':'km/h'}`;document.getElementById('corner-distance')!.textContent=`${guide.distance} m · target entry`;this.placeOptional(box);}
  graphicsStatus(text:string){const el=document.getElementById("auto-graphics-status");if(el&&el.textContent!==text)el.textContent=text;}
  fpsDisplay(fps:number,active:boolean){const box=document.getElementById('frame-diagnostics')!;box.hidden=!active;if(!active)return;const value=document.getElementById('fps-value')!,text=String(Math.max(0,Math.round(Number.isFinite(fps)?fps:0)));if(value.textContent!==text)value.textContent=text;if(this.state==="drive")this.placeOptional(box);}

  showActivities(){
    document.getElementById('race-routes')!.innerHTML=RACE_ROUTES.map(r=>{const road=routeRoad(this.roads,r.id),best=this.save.settings.weather==='rain'?(r.id==='horizon'?this.save.wetBestByLaps[1]:this.save.wetRouteBests[r.id]):r.id==='horizon'?this.save.best:this.save.routeBests[r.id];return `<article><span class="tiny">${r.closed?'CIRCUIT':'SPRINT'} · ${(road.length/1000).toFixed(1)} KM</span><h4>${r.name}</h4><p>${r.description}</p><small>${routePreview(road).difficulty} · ↑ ${Math.round(routePreview(road).gain)} m</small>${best?`<small>Best ${timeText(best)}</small>`:''}<button data-action="race-route:${r.id}">RACE →</button></article>`;}).join('');
    document.getElementById('practice-sections')!.innerHTML=PRACTICE_SECTIONS.map(p=>`<article><h4>${p.name}</h4><p>${p.description}</p><button data-action="practice:${p.id}">PRACTICE →</button></article>`).join('');
  }
  showStatistics(){
    const s=this.save,miles=s.settings.units==='mph',num=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:0});
    const cards=(items:[string,string][])=>items.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
    const upgrades=Object.values(s.ownedUpgrades).reduce((n,ids)=>n+ids.length,0),seconds=Math.floor(s.statistics.drivingSeconds);
    document.getElementById('statistics-content')!.innerHTML=`<h3>PROGRESS</h3><dl class="statistics-grid">${cards([
      ['Distance driven',`${(s.distance/(miles?1609.344:1000)).toFixed(1)} <small>${miles?'mi':'km'}</small>`],
      ['Coin balance',num(s.coins)],['Coins collected',num(s.collectedCoins.size)],['Vehicles owned',`${s.ownedCars.size} <small>/ ${CARS.length}</small>`],['Upgrades owned',num(upgrades)],
    ])}</dl><h3>DRIVING <small>RECORDED SINCE THIS UPDATE</small></h3><dl class="statistics-grid">${cards([
      ['Driving time',`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`],['Top speed',`${Math.round(s.statistics.topSpeedKmh*(miles?.621371:1))} <small>${miles?'mph':'km/h'}</small>`],['Races finished',num(s.statistics.racesCompleted)],
    ])}</dl><h3>CIRCUIT RECORDS</h3><dl class="statistics-grid">${cards([['1 lap',s.bestByLaps[1]?timeText(s.bestByLaps[1]):'—'],['3 laps',s.bestByLaps[3]?timeText(s.bestByLaps[3]):'—']])}</dl>`;
  }
  footStatus(active:boolean,near:boolean){
    this.root.classList.toggle('on-foot',active);
    this.syncMovementControls();
    const button=document.getElementById('vehicle-toggle') as HTMLButtonElement;
    const label=active?(near?'SHIFT · ENTER':'ON FOOT · WASD'):'SHIFT · EXIT';
    if(button.dataset.footLabel!==label){
      button.dataset.footLabel=label;
      button.querySelector('.toolbar-label')!.textContent=active?(near?'ENTER':'ON FOOT'):'EXIT';
      button.setAttribute('aria-label',active?(near?'Enter vehicle':'On foot, walk back to the vehicle to enter'):'Exit vehicle');
    }
    button.disabled=active&&!near;
    (document.getElementById('autopilot-toggle') as HTMLButtonElement).disabled=active;
  }
  private syncMovementControls() {
    const walking = this.root.classList.contains('on-foot');
    this.input.setMovementMode(!walking);
    this.walkingTouch?.setEnabled(walking && this.state === 'drive');
    if (this.state !== 'drive') this.input.clearTouch();
  }
  private routeKey='';
  private routeTimer:ReturnType<typeof setTimeout>|undefined;
  private routeId='';
  routeChoice(choice:RouteChoice|undefined){
    const box=document.getElementById('route-choice')!;
    if(!choice?.visible)choice=undefined;
    box.hidden=!choice;
    if(!choice){this.routeKey='';this.routeId='';clearTimeout(this.routeTimer);return;}
    if(this.routeId!==choice.id){
      this.routeId=choice.id;clearTimeout(this.routeTimer);const shown=choice;
      this.routeTimer=setTimeout(()=>{shown.visible=false;shown.dismissed=true;box.hidden=true;this.routeKey='';this.routeId='';},Math.max(0,(choice.expiresAt-performance.now()/1000)*1000));
    }
    const key=`${choice.id}:${choice.selected}:${choice.locked}`;
    if(key!==this.routeKey){
      this.routeKey=key;
      document.getElementById('route-options')!.innerHTML=choice.options.map((o,i)=>`<button data-action="route:${i}" ${choice.locked?'disabled':''} aria-pressed="${i===choice.selected}"><span class="key">${i+1}</span><b>${o.label==='Left'?'↰':o.label==='Right'?'↱':'↑'} ${o.label}</b><small>${o.road.name}</small></button>`).join('');
    }
    const distance=`${Math.max(0,Math.ceil(choice.distance/10)*10)} m`,out=document.getElementById('route-distance')!;if(out.textContent!==distance)out.textContent=distance;
    const hint=this.mobile?(this.save.settings.autopilotMode==='steering'?'Tap a route · brake for turns':'Tap a route'):this.save.settings.autopilotMode==='steering'?'1–3 to choose · brake for turns':'1–3 to choose';
    const label=document.getElementById('route-hint')!;if(label.textContent!==hint)label.textContent=hint;
  }
  loading(text: string) {
    document.getElementById("loading-text")!.textContent = text;
  }
  error(message: string) {
    const p = this.root.querySelector<HTMLElement>('[data-panel="loading"]')!;
    p.innerHTML = `<div class="eyebrow">UNABLE TO START</div><h2>Unable to load game</h2><p class="muted"></p>${button("reload", "TRY AGAIN", "primary")}`;
    p.querySelector("p")!.textContent = message;
  }
  private toastPriority=0;private toastUntil=0;private rewardUntil=0;private rewardAmount=0;
  private rewardAnimation?:Animation;
  reward(amount:number){
    if(!Number.isFinite(amount)||amount<=0||this.state!=="drive")return;
    const now=performance.now();
    this.rewardAmount=(now<this.rewardUntil?this.rewardAmount:0)+amount;
    this.rewardUntil=now+1800;
    const badge=document.getElementById("coin-reward")!;
    badge.querySelector(".coin-amount")!.textContent=this.rewardAmount.toLocaleString(undefined,{useGrouping:false});
    badge.setAttribute("aria-label",`${this.rewardAmount.toLocaleString()} coins earned`);
    badge.hidden=false;
    this.rewardAnimation?.cancel();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)this.rewardAnimation=badge.animate([
      {opacity:0,transform:'translateY(5px)',offset:0},
      {opacity:1,transform:'translateY(0)',offset:.1},
      {opacity:1,transform:'translateY(0)',offset:.85},
      {opacity:0,transform:'translateY(-3px)',offset:1},
    ],{duration:1800,fill:'forwards'});
    // Reposition only on rewards, never in the frame loop.
    if(this.mobile){badge.style.cssText="";this.placeOptional(badge);}
  }
  toast(text: string,priority=1) {
    const now=performance.now();if(priority<this.toastPriority&&now<this.toastUntil)return;
    this.toastPriority=priority;this.toastUntil=now+2300;
    document.getElementById("toast")!.textContent = text;
    document.getElementById("toast")!.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => document.getElementById("toast")!.classList.remove("show"),
      2300,
    );
  }
  lawStatus(racing:boolean) {
    const p=this.police;if(!p)return;const r=p.rules;
    const title=r.impound>0?"TRAFFIC STOP":p.active?(!p.seen?"SEARCHING":`PURSUIT · ${r.stage}/3`):r.warning>0?"SLOW DOWN":racing?"CLOSED CIRCUIT":p.limit?"SPEED LIMIT":"UNRESTRICTED";
    const detail=r.impound>0?`−${p.lastFine} coins · ${Math.ceil(r.impound)}s`:p.active?r.capture>0?`Officer intercept · ${Math.ceil(3-r.capture)}s`:r.escape>0?`Escaping · ${Math.ceil(8-r.escape)}s`:`${p.seen?"In sight":"Sight lost"} · ${Math.round(p.nearest)} m`:"";
    document.getElementById("law-hud")!.hidden=!(r.impound>0||p.active||r.warning>0||(!racing&&p.limit));
    document.getElementById("law-detail")!.hidden=!detail;
    const sign=document.getElementById("speed-sign")!;sign.dataset.style=p.limit?p.zones.signStyle:"circle";
    sign.setAttribute("aria-label",p.limit?`Speed limit ${p.limit} kilometres per hour`:"No posted speed limit");
    document.getElementById("posted-limit")!.textContent=p.limit?String(p.limit):"—";
    document.getElementById("law-title")!.textContent=title;document.getElementById("law-detail")!.textContent=detail;
    document.getElementById("law-hud")!.classList.toggle("wanted",p.active||r.impound>0);
    const bar=document.getElementById("law-progress") as HTMLProgressElement;bar.hidden=!p.active&&!r.warning&&!r.impound;bar.value=r.impound>0?r.impound/5:r.capture>0?r.capture/3:r.escape>0?r.escape/8:r.warning/1.5;
  }
  update(
    car: VehiclePhysics,
    race: RaceManager,
    camera: CameraManager,
  ) {
    const s = this.save.settings;
    if(this.rewardUntil&&performance.now()>=this.rewardUntil){this.rewardUntil=0;this.rewardAmount=0;document.getElementById("coin-reward")!.hidden=true;}
    this.economy();
    const wheelieStatus=document.getElementById("wheelie-status")!;
    wheelieStatus.hidden=!car.bike||car.wheelie<=.12;
    wheelieStatus.textContent="WHEELIE";
    document.getElementById("race-lap")!.innerHTML=`${race.lap}<small> / ${race.laps}</small>`;
    updateSpeedometer(car.speed,car.rpm,car.gear,car.reverse,s.units);
    if(this.state==='drive'&&!this.root.classList.contains('on-foot'))this.boostSignal.update(car);else this.boostSignal.hide();
    if(this.state==='drive'&&!this.root.classList.contains('on-foot'))this.driftSignal.update(car.drift,Math.abs(car.slip)>.18&&car.speed>10,car.driftScore);else this.driftSignal.hide();
    document.getElementById("slipstream-status")!.hidden=car.slipstreamStrength<.08;
    this.lawStatus(race.active||race.finished||!!this.practiceName);
    document.getElementById("race-hud")!.style.display = race.active
      ? "flex"
      : "none";
    document.getElementById("race-position")!.innerHTML =
      `${race.position}<small> / ${race.networkRace?race.networkCount:8}</small>`;
    document.getElementById("race-time")!.textContent = timeText(race.elapsed);
    document.getElementById("race-checkpoint")!.innerHTML =
      `${String(race.checkpoint % race.count + 1).padStart(2, "0")}<small> / ${race.count}</small>`;
    document.getElementById("countdown")!.textContent =
      race.active && race.countdown > -0.8
        ? race.countdown > 0
          ? String(Math.ceil(race.countdown))
          : "GO"
        : "";
    if (this.state === "drive") this.drawMap(this.mini, car, true);
    if (this.state === "map") this.drawMap(this.map, car, false);
  }
  showResults(race: RaceManager) {
    const table=document.getElementById('result-standings')!;table.hidden=!race.networkRace;
    if(race.networkRace)table.innerHTML=race.standings.map((p,i)=>`<li><b>${i+1}</b><span>${(this.driverNames.get(p.slot)?.name||`Driver ${p.slot+1}`).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}${p.slot===race.localSlot?' · YOU':''}</span><strong>${p.finished?timeText(p.time):p.connected?'RACING':'DNF'}</strong></li>`).join('');
    document.getElementById("result-reward")!.textContent=race.networkRace?'':`+${race.rewardEarned} COINS`;
    document.getElementById("result-place")!.innerHTML =
      `${String(race.position).padStart(2, "0")} <small>/ ${race.networkRace?String(race.networkCount).padStart(2,'0'):'08'}</small>`;
    document.getElementById("result-time")!.textContent = timeText(
      race.resultTime,
    );
    document.getElementById("result-best")!.textContent =
      race.networkRace ? race.networkResult : `PERSONAL BEST · ${race.route.closed?`${race.laps} LAP${race.laps>1?"S":""}`:RACE_ROUTES.find(r=>r.id===race.routeId)?.name}  ${timeText(race.best)}`;
  }
  drawMap(canvas: HTMLCanvasElement, car: VehiclePhysics, mini: boolean) {
    const w = mini ? 440 : innerWidth,
      h = mini ? 440 : innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const c = canvas.getContext("2d")!;
    let mapScale=1;
    c.clearRect(0, 0, w, h);
    c.fillStyle = mini ? "rgba(14,23,29,.86)" : "#152731";
    c.fillRect(0, 0, w, h);
    c.save();
    if (mini) {
      c.translate(w / 2, h / 2 + 45);
      const yaw = Math.atan2(-car.forward.x, -car.forward.z);
      c.rotate(yaw);
      c.scale(0.49, 0.49);
      c.translate(-car.position.x, -car.position.z);
    } else {
      c.translate(w * 0.62 + this.mapPan.x, h * 0.53 + this.mapPan.y);
      const bounds=this.roads.bounds;
      const scale = Math.min(w*.74 / (bounds.maxX-bounds.minX+900), h*.9 / (bounds.maxZ-bounds.minZ+900)) * this.mapZoom;
      mapScale=scale;c.scale(scale, scale);
      c.translate(-(bounds.minX+bounds.maxX)/2,-(bounds.minZ+bounds.maxZ)/2);
    }
    c.beginPath();
    c.moveTo(this.roads.bounds.minX-1000,this.roads.bounds.minZ-1000);
    c.lineTo(150,this.roads.bounds.minZ-1000);
    for (let z = this.roads.bounds.minZ-1000; z <= this.roads.bounds.maxZ+1000; z += 100)
      c.lineTo(150 + Math.sin(z * 0.0018) * 90, z);
    c.lineTo(this.roads.bounds.minX-1000,this.roads.bounds.maxZ+1000);
    c.closePath();
    c.fillStyle = mini ? "#293532" : "#354239";
    c.fill();
    for (const road of this.roads.roads) {
      c.beginPath();
      road.samples.forEach((s, i) =>
        i ? c.lineTo(s.p.x, s.p.z) : c.moveTo(s.p.x, s.p.z),
      );
      c.strokeStyle = !mini&&road===routeRoad(this.roads,this.previewRoute)?"#8be8ce":road === this.roads.main ? "#dddaca" : "#81918a";
      c.lineWidth = mini
        ? road === this.roads.main
          ? 8
          : 5
        : road === this.roads.main
          ? 17
          : 8;
      c.stroke();
    }
    if (!mini) {
      c.font = `bold ${12/mapScale}px Arial`;
      c.fillStyle = "#d5ddd5";
      for (const [name,x,z] of REGION_LABELS)
        c.fillText(name, x, z);
      c.fillStyle = "#bc494d";
      c.beginPath();
      c.arc(5, 300, 28, 0, Math.PI * 2);
      c.fill();
    }
    c.translate(car.position.x, car.position.z);
    c.rotate(Math.atan2(-car.forward.x, -car.forward.z));
    const size = mini ? 20 : 38;
    c.beginPath();
    c.moveTo(0, -size);
    c.lineTo(size * 0.65, size * 0.6);
    c.lineTo(0, size * 0.3);
    c.lineTo(-size * 0.65, size * 0.6);
    c.closePath();
    c.fillStyle = "#f44355";
    c.fill();
    c.strokeStyle = "#ffe8e5";
    c.lineWidth = mini ? 2 : 5;
    c.stroke();
    c.restore();
  }
}
