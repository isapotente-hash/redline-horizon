import {TrackEditor} from '../ui/TrackEditor';
import {DrawnTrack,trackId} from '../racing/DrawnTrack';
import {DrawnTrackWorld} from '../world/DrawnTrackWorld';
import {AutoGraphics,FramePacer} from "./AutoGraphics";
import {graphicsPresentation} from "./GraphicsPresentation";
import {applyDistancePreset} from "./GraphicsPresets";
import {DriverAvatar,loadDriverAvatar} from '../player/DriverAvatar';
import {CornerGuide} from '../vehicles/CornerGuide';
import {FrameDiagnostics} from './FrameDiagnostics';
import {VehicleFinish} from '../vehicles/VehicleFinish';
import {raceCondition} from './Weather';
import {inviteCode} from '../multiplayer/Invites';
import {RACE_ROUTES,PRACTICE_SECTIONS,RouteId,validRoute,routeRoad} from "../racing/RouteCatalog";
import {recoverVehicle} from "../vehicles/Recovery";
import {matchesClass} from "../multiplayer/LobbySettings";
import { OnFootPlayer } from "../player/OnFootPlayer";
import { mobileDevice } from "../input/DevicePolicy";
import {SlipstreamSystem} from '../vehicles/SlipstreamSystem';
import { PhysicsClock } from "./PhysicsClock";
import {yieldLoading,finishStartup,loadingProgress,stopLoadingProgress} from "./Loading";
import {DevTools} from './DevTools';
import {DevPanel} from '../ui/DevPanel';
import {PlayerContacts} from '../multiplayer/PlayerContacts';
import {loadImportedVehicles} from '../vehicles/ImportedVehicles';
import {makeVehicle} from '../vehicles/VehicleModels';
import { RaceConnection } from '../multiplayer/RaceConnection';
import { RemoteVehicle } from '../multiplayer/RemoteVehicle';
import { MultiplayerPanel } from '../multiplayer/MultiplayerPanel';
import { Pose, PLAYER_COLORS } from '../multiplayer/Protocol';
import {isBike,CARS} from '../vehicles/CarCatalog';
import { PoliceManager } from '../police/PoliceManager';
import { CoinManager } from "../world/CoinManager";
import { fitCarPackage } from "../vehicles/CarCustomization";
import { DrivingRewards } from "./DrivingRewards";
import * as T from "three";
import { SaveManager } from "./SaveManager";
import { InputManager, Controls } from "../input/InputManager";
import { RoadNetwork } from "../world/RoadNetwork";
import { BoostManager } from "../world/BoostManager";
import { World } from "../world/World";
import { PhysicsWorld, VehiclePhysics } from "../physics/VehiclePhysics";
import { RenderSystem } from "../rendering/RenderSystem";
import { CameraManager } from "../camera/CameraManager";
import { loadCar } from "../vehicles/loadCar";
import { CarVisual } from "../vehicles/CarModel";
import { Autopilot, autopilotOverride } from "../vehicles/Autopilot";
import { TrafficManager } from "../vehicles/TrafficManager";
import { RaceManager } from "../racing/RaceManager";
import { AudioManager } from "../audio/AudioManager";
import { Particles } from "../effects/Particles";
import { UI, State } from "../ui/UI";
import { clamp, damp } from "./math";
const noTraffic=[] as const;
const stopped: Controls = {
  throttle: 0,
  brake: 1,
  steer: 0,
  handbrake: true,
  up: false,
  down: false,
};
export class Game {
  save = new SaveManager();
  input = new InputManager();
  autoGraphics=new AutoGraphics(mobileDevice()?2:4);
  private framePacer=new FramePacer();
  private activeTraffic:TrafficManager["cars"]=[];
  private enabledTraffic(){this.activeTraffic.length=0;for(const car of this.traffic.cars)if(car.body.isEnabled())this.activeTraffic.push(car);return this.activeTraffic;}
  private worldSettings={...this.save.settings};
  roads = new RoadNetwork();
  autopilot = new Autopilot(this.roads);
  avatar!:DriverAvatar;
  guide=new CornerGuide(this.roads);diagnostics=new FrameDiagnostics();private finishes=new Map<CarVisual,VehicleFinish>();private physicsMs=0;
  autopilotManualReady = false;
  physics = new PhysicsWorld();
  ui = new UI(this.save, this.roads, this.input);
  dev = new DevTools(this.save);
  devPanel = new DevPanel(this.ui.root,this.dev);
  network = new RaceConnection();
  multiplayer = new MultiplayerPanel(this.ui.root,this.network);
  remotes = PLAYER_COLORS.map(color=>new RemoteVehicle(color));
  trackEditor=new TrackEditor(this.ui.root,text=>this.ui.toast(text));
  drawnWorld?:DrawnTrackWorld;
  private tracksPrevious:State="menu";
  multiplayerPrevious:State='menu';
  networkStart=0;private rollingLaunch=false;
  private selectedRoute:RouteId="horizon";private practice:typeof PRACTICE_SECTIONS[number]|undefined;
  private activitiesPrevious:State="menu";
  networkClock=0;
  networkSequence=0;
  outgoing:Pose={t:'state',seq:0,car:'vanta',paint:'#b81120',active:false,p:[0,0,0],q:[0,0,0,1],steer:0,spin:0,lean:0,pitch:0,brake:0,race:'',progress:0,finished:false,time:0};
  audio = new AudioManager();
  render!: RenderSystem;
  camera!: CameraManager;
  world!: World;
  boosts!: BoostManager;
  coins!: CoinManager;
  rewards = new DrivingRewards(this.save);
  lastCrash=0;
  private readonly slipstream=new SlipstreamSystem();private recordedLapSerial=0;
  police!:PoliceManager;
  lastPoliceMessage=0;
  vehicle!: VehiclePhysics;
  foot!: OnFootPlayer;
  private routeVisible=false;
  playerContacts!:PlayerContacts;
  car!: CarVisual;
  baseCar!:CarVisual;
  vehicleModels=new Map<string,CarVisual>();
  traffic!: TrafficManager;
  race!: RaceManager;
  particles!: Particles;
  state: State = "loading";
  previous: State = "menu";
  settingsPrevious: State = "menu";
  controlsPrevious: State = "settings";
  garagePrevious: State = "menu";
  running = false;
  private preparingWorld=false;
  debug = false;
  lights = false;
  last = 0;
  elapsed = 0;
  readonly physicsClock = new PhysicsClock();
  fps = 60;
  frames = 0;
  private hudClock=0;
  private readonly nextFrame=(now:number)=>this.frame(now);
  saveClock = 0;
  resultShown = false;
  uiCheck =
    import.meta.env.DEV && new URLSearchParams(location.search).has("ui-check");
  constructor() {
    this.dev.onChange=()=>{
      if(this.vehicle.infiniteBoost!==this.dev.infiniteBoost)this.vehicle.boostRemaining=this.dev.infiniteBoost?5:0;
      this.vehicle.infiniteBoost=this.dev.infiniteBoost;
      this.police.disabled=this.dev.noPolice;
      if(this.dev.noPolice)this.police.clearWanted();
      this.vehicle.applyLoadout(this.save.loadout,this.save.setup);
      this.ui.economyKey="";this.ui.sync();
    };
    this.dev.onReset=()=>{this.police.clearWanted();this.vehicle.reset();this.syncCar(1);};
    this.trackEditor.onSolo=(track,laps)=>void this.startDrawnRace(track,laps);
    this.trackEditor.onMultiplayer=(track,laps)=>{
      if(this.network.pendingRace||this.network.raceLocked){this.ui.toast("Finish the shared race before changing tracks");return;}
      if(this.network.code&&!this.network.host){this.ui.toast("The host chooses the course. Leave the room to host your own.");return;}
      if(this.network.setRaceSettings({...this.network.raceSettings,route:"custom",track,laps:laps===3?3:1})){this.multiplayerPrevious="tracks";this.setState("multiplayer");this.ui.toast("Host a room or ready up — your course will be shared automatically");}
    };
    this.network.setName(this.save.settings.driverName);
    this.ui.onSetup=(key,value)=>{this.save.setSetup(key,value);this.vehicle.applyLoadout(this.save.loadout,this.save.setup);};
    this.ui.driverNames=this.network.drivers;
    this.network.onChange=()=>{this.multiplayer.refresh();if(this.network.ghost)this.playerContacts?.clear();};
    this.network.canStart=()=>!this.foot?.active&&this.running&&!this.preparingWorld&&!!this.vehicle&&!this.police.active&&this.police.rules.impound<=0;
    this.network.onConnected=()=>{
      this.remotes.forEach(remote=>remote.reset());this.networkSequence=0;
      this.ui.toast('Room connected');
    };
    this.network.onRoster=slots=>{
      this.remotes.forEach((remote,slot)=>{if(!slots.includes(slot)||slot===this.network.slot)remote.reset();});
      if(this.race?.networkRace){this.race.updateRoster(slots);if(this.state==='results')this.ui.showResults(this.race);}
    };
    this.network.onDisconnected=()=>{
      this.playerContacts?.clear();
      this.remotes.forEach(remote=>remote.reset());
      if(this.multiplayerPrevious==='results')this.multiplayerPrevious='drive';
      if(this.race?.networkRace){this.race.cancel();this.leaveDrawnTrack();this.traffic.active=true;if(this.state==='results')this.setState('drive');}
      this.ui.toast('Room closed');
    };
    this.network.onPose=(pose,slot)=>{
      this.remotes[slot].receive(pose);
      if(this.race.networkRace&&pose.race===this.network.session){
        this.race.updateOpponent(slot,pose.progress,pose.finished,pose.time);
        if(this.race.finished&&this.state==='results')this.ui.showResults(this.race);
      }
    };
    this.network.canRace=settings=>matchesClass(this.save.car,settings.vehicleClass);
    this.network.prepareRace=async settings=>{
      if(!this.network.canStart()||!this.network.canRace(settings))return false;
      this.preparingWorld=true;this.autopilot.disable();this.setState('loading');this.ui.loading('LOADING RACE ROUTE');
      try{if(settings.route==="custom"&&settings.track)this.activateDrawnTrack(settings.track);else {this.leaveDrawnTrack();await this.world.prime(this.roads.at(routeRoad(this.roads,settings.route),80).p);}return true;}
      catch{this.ui.toast('Race route could not be loaded',2);return false;}
      finally{this.preparingWorld=false;if(this.state==='loading')this.setState('multiplayer');}
    };
    this.network.onStart=(id,startAt,laps,settings)=>{
      this.autopilot.disable();this.networkStart=startAt;
      this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;this.selectedRoute=settings.route;this.rollingLaunch=settings.startRule==="rolling";
      if(settings.weather){this.save.settings.weather=settings.weather;this.save.settings.rainIntensity=.7;this.save.save();this.ui.sync();}
      this.race.start(this.vehicle,laps,true,settings.route);
      this.race.configurePlayers(this.network.racers,this.network.slot);
      this.vehicle.teleport(this.race.route,this.race.startDistance-Math.floor(this.network.slot/2)*7,(this.network.slot%2?.24:-.24)*this.race.route.width);
      if(!this.drawnWorld)this.world.update(this.vehicle.position,true);this.traffic.active=false;
      this.resultShown=false;this.camera.setMode(0);this.setState('drive');
      this.ui.toast(`ROOM ${this.network.code} · ${laps} lap${laps>1?'s':''} · ${this.network.ghost?'Ghost mode':'Player contact on'}`);
    };
    this.save.onError = () => this.ui.toast("Progress could not be saved. Browser storage is unavailable or full.");
    this.ui.onAction = (a) => void this.action(a);
    this.ui.onSetting = (k, v) => {
      if((k==="weather"||k==="rainIntensity")&&(this.race?.active||this.network?.raceLocked)){this.ui.toast("Change weather before the next race");this.ui.sync();return;}
      if(["quality","renderDistance","simulationDistance"].includes(k))this.save.settings.autoGraphics=false;
      (this.save.settings as any)[k] = v;
      if (k === "autopilotMode") {
        this.autopilotManualReady = false;
        if (this.autopilot.enabled) { this.autopilot.disable(); this.autopilot.toggle(this.vehicle); }
      }
      this.applySettings(k);
      this.save.save();
    };
    this.ui.onPhoto = (k, v) => {
      if (k === "fov") this.camera.photoFov = v;
      if (k === "exposure") this.render.exposure = v;
      if (k === "roll") this.camera.roll = v;
    };
    addEventListener("blur", () => {
      if (this.state === "drive") this.setState("pause");
    });
    document.addEventListener("visibilitychange", () => { if(document.hidden){this.persist();this.physicsClock.reset();}this.syncMusic(); });
    addEventListener("pagehide", () => {this.persist();this.network.leave(false);});
    addEventListener("beforeunload", () => this.persist());
  }
  async init() {
    try {
      this.ui.loading("LOADING PHYSICS");
      this.ui.root.inert=true;
      await this.save.restoreCheckpoint();this.ui.sync();
      await this.physics.init();loadingProgress("physics",1);
      const assetsReady=Promise.all([loadImportedVehicles(),loadCar(),loadDriverAvatar()]);
      void assetsReady.catch(()=>{});
      this.render = new RenderSystem(
        document.getElementById("game") as HTMLCanvasElement,
        this.save.settings,
        this.uiCheck,
        0,
      );
      this.camera = new CameraManager(this.render.camera, this.render.canvas, mobileDevice());
      this.ui.onFootLook = (x, y) => this.camera.lookFoot(x, y);
      this.ui.loading("LOADING WORLD");
      await new Promise((r) => requestAnimationFrame(r));
      this.syncWorldSettings();
      this.world = await new World(this.roads, this.physics, this.worldSettings).init(f=>loadingProgress("world",f));
      this.render.scene.add(this.world.root);
      this.boosts = new BoostManager(this.roads);
      this.coins=new CoinManager(this.roads,this.save);
      this.world.root.add(this.boosts.root,this.coins.root);
      this.vehicle = new VehiclePhysics(
        this.physics,
        this.roads,
        this.save.settings,
      );
      
      this.playerContacts=new PlayerContacts(this.physics,this.vehicle);
      await this.world.prime(this.vehicle.position);loadingProgress("terrain",1);
      this.ui.loading("LOADING VEHICLES");
      const [,hero,avatar]=await assetsReady;this.avatar=avatar;
      this.foot=new OnFootPlayer(this.physics,avatar);this.render.scene.add(this.foot.root);
      this.car = this.baseCar = hero;
      this.render.scene.add(this.car.root);
      this.render.scene.add(...this.remotes.map(remote=>remote.root));
      for(const spec of CARS)if(isBike(spec)||['pickup','roadster','supercar'].includes(spec.kit)){this.vehicleModels.set(spec.id,makeVehicle(spec));await yieldLoading();}
      this.equipVehicle();
      this.vehicle.applyLoadout(this.save.loadout,this.save.setup);
      this.traffic = new TrafficManager(this.roads, this.physics);
      this.race = new RaceManager(this.roads, this.physics);
      this.police=new PoliceManager(this.roads,this.physics,this.save);
      this.police.zones.buildSigns();this.world.root.add(this.police.zones.root);
      this.ui.police=this.police;this.render.scene.add(this.police.root);
      this.race.best = this.save.best;
      this.render.scene.add(
        this.traffic.root,
        this.race.ai.root,
        this.race.gate,
        this.race.finish,
      );
      this.particles = new Particles();
      loadingProgress("vehicles",1);
      this.render.scene.add(this.particles.root,this.guide.root);
      this.camera.setMode(this.save.settings.camera);
      this.applySettings();
      this.physics.world.timestep = this.physicsClock.step;
      for (let i = 0; i < 50; i++) {
        this.vehicle.preStep(stopped, this.physicsClock.step);
        this.physics.world.step();
        this.vehicle.postStep(this.physicsClock.step);
      }
      this.vehicle.distance = this.save.distance;
      this.syncCar(1);
      this.render.environment();
      this.camera.update(0,this.vehicle,this.car.root,"menu",0,stopped);
      await yieldLoading();
      await this.render.renderer?.compileAsync(this.render.scene,this.render.camera);
      this.render.render(this.car.root); // Warm post-processing before play, not on the first drive frame.
      loadingProgress("shaders",1);
      this.ui.root.inert=true;
      this.setState("menu");
      await finishStartup();
      this.ui.root.inert=false;
      this.ui.root.setAttribute("aria-busy","false");
      if (this.uiCheck) {
        const b = document.createElement("div");
        b.className = "dev-banner";
        b.textContent = "DEVELOPMENT CHECK · 3D RENDERING OFF";
        document.body.append(b);
      }
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.nextFrame);
      this.registerTools();
      const room=inviteCode(location.href);if(room){this.multiplayer.input.value=room;this.multiplayerPrevious="menu";this.setState("multiplayer");this.ui.toast("Invite loaded — choose your vehicle and connect");}
    } catch (error) {
      stopLoadingProgress();
      this.ui.root.inert=false;this.ui.root.setAttribute("aria-busy","false");
      document.getElementById("startup")?.remove();
      console.error(error);
      this.ui.error(
        error instanceof Error
          ? error.message
          : "Enable hardware acceleration and try a browser with WebGL 2 support.",
      );
    }
  }
  equipVehicle() {
    const spec=this.save.car,newShape=isBike(spec)||spec.kit==='pickup'||spec.kit==='roadster'||spec.kit==='supercar';
    this.render.scene.remove(this.car.root);
    if(newShape) {
      if(!this.vehicleModels.has(spec.id))this.vehicleModels.set(spec.id,makeVehicle(spec));
      this.car=this.vehicleModels.get(spec.id)!;
    } else {this.car=this.baseCar;fitCarPackage(this.car,spec);}
    this.render.scene.add(this.car.root);
    this.vehicle.spec=spec;this.network.setCar(spec.id);
    const p=this.vehicle.position,q=this.vehicle.rotation,yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
    const road=this.roads.nearest(p.x,p.z);
    this.vehicle.setPosition(p.x,Math.max(p.y,road.height+this.vehicle.chassis.rideHeight+.06),p.z,yaw);
    this.vehicle.applyLoadout(this.save.loadout,this.save.setup);
    this.autopilot.disable();this.syncCar(1);this.avatar.occupy(this.car,spec);
  }
  private syncWorldSettings(){
    Object.assign(this.worldSettings,this.save.settings);
    const {level,...presentation}=graphicsPresentation(this.save.settings,this.autoGraphics.level,this.state==='drive'||this.state==='photo'||this.preparingWorld,mobileDevice());
    Object.assign(this.worldSettings,presentation);
    return level;
  }
  private graphicsStatus(){
    const menu=this.state!=='drive'&&this.state!=='photo'&&!this.preparingWorld;
    this.ui.graphicsStatus(menu?"Menu preview · Very Low · driving preferences resume when you play":this.save.settings.autoGraphics?`Auto · ${this.autoGraphics.profile.label} · target ${this.autoGraphics.targetFps} FPS · ${this.worldSettings.renderDistance} m render / ${this.worldSettings.simulationDistance} m simulation`:"Manual graphics · automatic adjustment off");
  }
  private syncMusic(){this.audio.music(this.save.settings.music,this.save.settings.volume,this.state==='drive'&&!this.preparingWorld&&!document.hidden);}
  applySettings(changed = "") {
    if (!this.car) return;
    this.car.paint.color.set(this.save.settings.paint);
    if(!this.finishes.has(this.car))this.finishes.set(this.car,new VehicleFinish(this.car));
    this.finishes.get(this.car)!.apply(this.save.car,this.save.liveries[this.save.selectedCar]||"factory",this.save.plates[this.save.selectedCar]||"REDLINE");
    if(changed==="driverName"){this.save.settings.driverName=this.save.settings.driverName.replace(/[<>\x00-\x1f]/g,"").trim().slice(0,16)||"Driver";this.network.setName(this.save.settings.driverName);}
    this.car.alloy.color.set(this.save.settings.wheels);
    this.car.glass.opacity = clamp(
      0.62 + this.save.settings.tint * 0.36,
      0.6,
      0.96,
    );
    if(changed==="autoGraphics"){this.autoGraphics.restart();this.framePacer.reset();}
    if(changed==="quality")applyDistancePreset(this.save.settings);
    this.render.setAutomaticLevel(this.syncWorldSettings());
    if(changed==="quality")this.render.applyQuality();
    if(changed==="autoGraphics"||changed==="quality"||changed==="renderDistance"||changed==="simulationDistance")if(!this.drawnWorld)this.world.update(this.vehicle.position,false,this.camera.mode===6?this.camera.freePosition:this.vehicle.position);
    this.ui.sync();this.graphicsStatus();
    this.syncMusic();
  }
  setState(state: State) {
    if(state==="activities")this.activitiesPrevious=this.state;
    if (state === "settings" && this.state !== "controls")
      this.settingsPrevious = this.state;
    if (state === "controls") this.controlsPrevious = this.state;
    if (state === "garage" && this.state!=="workshop") this.garagePrevious = this.state;
    this.previous = this.state;
    this.state = state;
    this.framePacer.reset();
    if(this.render){this.render.setAutomaticLevel(this.syncWorldSettings());if(this.world&&this.vehicle&&!this.drawnWorld)this.world.update(this.vehicle.position,false,this.camera.mode===6?this.camera.freePosition:this.vehicle.position);}
    this.save.background=state==='drive';
    if(state!=='drive'){this.slipstream.reset();if(this.vehicle)this.vehicle.slipstreamStrength=0;}
    if(state!=='drive')this.playerContacts?.clear();
    if(this.foot)this.ui.footStatus(this.foot.active,this.foot.active&&this.foot.canEnter(this.vehicle));
    this.ui.setState(state);
    this.input.clear();
    this.physicsClock.reset();
    this.camera.photo = state === "photo";
    this.camera.setFootInputEnabled(state === 'drive' && !!this.foot?.active);
    if (state !== "photo") {
      this.render.exposure = 0.95;
      this.camera.roll = 0;
    }
    const garage = state === "garage" || state === "workshop";
    const worldActive=state==='drive'||state==='photo';
    this.world.root.visible = !garage&&!this.drawnWorld;
    if(this.drawnWorld)this.drawnWorld.root.visible=!garage;
    this.traffic.root.visible = worldActive&&!this.practice&&!this.drawnWorld;
    this.race.ai.root.visible =
      worldActive && !this.race.networkRace && !this.race.solo && (this.race.active || this.race.finished);
    this.race.gate.visible = worldActive && this.race.active;
    this.race.finish.visible = worldActive && (this.race.active||this.race.finished);
    this.particles.root.visible = worldActive;
    this.police.root.visible = worldActive;
    this.boosts.root.visible=worldActive&&!this.drawnWorld;
    this.coins.root.visible=worldActive&&!this.practice&&!this.drawnWorld;
    this.render.water.visible = !garage&&!this.drawnWorld;
    this.render.studio.visible = garage;
    if (garage) {
      this.render.studio.position.copy(this.vehicle.position);
      this.render.studio.rotation.y = this.car.root.rotation.y;
    }
    if (state === "drive") this.audio.start();
    this.syncMusic();
  }
  private async prepareWorld(){
    this.preparingWorld=true;this.setState("loading");this.ui.loading("LOADING AREA");
    try{
      if(!this.drawnWorld)await this.world.prime(this.vehicle.position);this.syncCar(1);
      this.render.updateAtmosphere(this.elapsed,this.vehicle.position);
      this.camera.update(0,this.vehicle,this.car.root,"drive",this.elapsed,stopped);
      this.render.render(this.car.root); // Warm post-processing before play, not on the first drive frame.
    }finally{this.preparingWorld=false;}
  }
  async action(action: string) {
    if (action === "reload") {
      location.reload();
      return;
    }
    if (!this.running||!this.vehicle||this.preparingWorld) return;
    if(action==='track-editor'){
      if(this.police.active||this.police.rules.impound||this.network.pendingRace||this.network.raceLocked){this.ui.toast("Finish the pursuit or shared race before drawing a track");return;}
      this.tracksPrevious=this.state;this.setState("tracks");this.trackEditor.renderSaved();return;
    }
    if(action==='track-back'){this.setState(this.tracksPrevious);return;}
    if(action.startsWith('route:')){if(this.state==='drive'&&this.autopilot.enabled&&this.save.settings.autopilotMode!=='speed'&&this.autopilot.routes.choice?.visible&&this.autopilot.routes.select(Number(action.slice(6)))){this.ui.routeChoice(undefined);this.routeVisible=false;}return;}
    if(action==='vehicle-toggle'){this.toggleFoot();return;}
    if(this.foot.active&&action==='autopilot'){this.ui.toast('Enter the vehicle to use autopilot');return;}
    if(this.foot.active&&(['drive','continue','menu','garage','workshop','race','garage-drive'].includes(action)||action.startsWith('travel:'))){this.foot.enter(this.vehicle,true);this.camera.stopFoot();this.ui.footStatus(false,false);}
    if(action==='recover'){this.recover();return;}
    if(action==='restart'){
      if(this.network.raceLocked){this.ui.toast('Finish the shared race before a rematch');return;}
      if(this.police.active||this.police.rules.impound){this.ui.toast('Finish the pursuit before restarting');return;}
      if(this.practice){await this.startPractice(this.practice);return;}
      if(this.race.active||this.race.finished){await this.action('race');return;}
      this.recover();this.setState('drive');return;
    }
    if(action.startsWith('practice:')){
      const section=PRACTICE_SECTIONS.find(p=>p.id===action.slice(9));if(!section)return;
      if(this.police.active||this.police.rules.impound){this.ui.toast('Finish the pursuit before practicing');return;}
      if(this.network.connected){this.ui.toast('Leave the room before practicing solo');return;}
      await this.startPractice(section);return;
    }
    if(action.startsWith('race-route:')){
      const id=action.slice(11);if(!validRoute(id))return;
      if(this.network.connected){if(this.network.host)this.network.setRaceSettings({...this.network.raceSettings,route:id,track:undefined,laps:1});this.multiplayerPrevious=this.state;this.setState('multiplayer');return;}
      this.leaveDrawnTrack();this.selectedRoute=id;await this.action('race');return;
    }
    this.audio.click(this.save.settings.volume);
    if(action==='dev-open'){if(this.state==='menu'){this.devPanel.lock();this.setState('dev');this.devPanel.focus();}return;}
    if(action==='dev-close'){if(this.state==='dev'){this.devPanel.lock();this.setState('menu');this.ui.root.querySelector<HTMLButtonElement>('[data-action=dev-open]')?.focus();}return;}
    if(action==='mp-open'){this.multiplayerPrevious=this.state;this.setState('multiplayer');return;}
    if(action==='mp-back'){if(this.network.pendingRace){this.ui.toast("Preparing the shared race — leave the room to cancel");return;}this.setState(this.multiplayerPrevious);return;}
    if(action==='mp-copy'){const link=this.multiplayerRootInvite();try{await navigator.clipboard.writeText(link);this.ui.toast('Invite link copied');}catch{const el=document.getElementById('mp-invite') as HTMLInputElement;el.focus();el.select();this.ui.toast('Select and copy the invite link');}return;}
    if(action==='mp-reconnect'){if(!this.network.busy&&!this.network.connected&&this.network.lastRoom)await this.network.open(false,this.network.lastRoom);return;}
    if(action==='map-race'){await this.action(`race-route:${this.ui.previewRoute}`);return;}
    if(action.startsWith('setup:')){if(this.state!=='workshop')return;this.save.presetSetup(action.slice(6));this.vehicle.applyLoadout(this.save.loadout,this.save.setup);this.ui.syncSetup();this.ui.renderWorkshop();return;}
    if(action.startsWith('livery:')){if(this.state!=='garage')return;const result=this.save.buyLivery(action.slice(7));if(result==='insufficient'){this.ui.toast('More coins needed');return;}this.applySettings();this.ui.renderFinish();this.ui.economy();return;}
    if(action==='plate-apply'){if(this.state==='garage'){this.save.setPlate((document.getElementById('number-plate') as HTMLInputElement).value);this.applySettings();this.ui.renderFinish();}return;}
    if(action==='repair'){if(this.state!=='garage')return;const finish=this.finishes.get(this.car);if(!finish)return;const cost=this.repairPrice();if(!this.save.unlimitedCoins&&this.save.coins<cost){this.ui.toast(`Repair costs ${cost} coins`);return;}this.save.payFine(cost);finish.repair();this.ui.economy();this.ui.toast('Cosmetic damage repaired');return;}
    if(action==='mp-ready'){this.network.setReady(!this.network.localReady);this.multiplayer.refresh();return;}
    if(action==='mp-leave'){this.network.leave();return;}
    if(action==='mp-host'||action==='mp-join'||action==='mp-start'||action==='mp-drive'){
      if(!this.network.canStart()){this.ui.toast('Escape or pull over before joining or starting a shared drive');return;}
      if(action==='mp-host'||action==='mp-join'){this.network.setCar(this.save.selectedCar);await this.network.open(action==='mp-host',this.multiplayer.input.value);return;}
      if(action==='mp-start'){this.network.requestRace(this.network.raceSettings.laps);return;}
      if(this.network.pendingRace){this.ui.toast('Preparing the shared race');return;}
      this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;
      if(!this.running||this.preparingWorld||!this.network.connected)return;
      if(!this.race.networkRace){this.race.cancel();this.leaveDrawnTrack();this.traffic.active=true;this.vehicle.teleport(this.roads.main,120-Math.floor(this.network.slot/2)*7,this.network.slot%2?5.5:2);this.world.update(this.vehicle.position,true);}
      this.setState('drive');return;
    }
    if(this.network.connected&&action==='race'){
      if(this.network.host){if(this.network.canStart())this.network.requestRace(this.network.raceSettings.laps);else this.ui.toast('Escape or pull over before starting a shared race');}
      else this.ui.toast('The host starts the shared race in Race via Code');
      return;
    }
    if(this.race.networkRace&&(['drive','continue','menu','garage','workshop'].includes(action)||action.startsWith('travel:')))this.network.leave();
    if ((this.police.active||this.police.rules.impound>0) && (["drive","continue","menu","race","garage","workshop"].includes(action)||action.startsWith("travel:"))) {
      this.ui.toast("Escape or pull over before changing mode");return;
    }
    if(action.startsWith("upgrade:")) {
      if(this.state!=="workshop")return;
      const result=this.save.buyUpgrade(action.slice(8));
      if(result==="invalid")return;
      if(result==="insufficient"){this.ui.toast("More coins needed");return;}
      this.vehicle.applyLoadout(this.save.loadout,this.save.setup);this.ui.sync();
      this.ui.toast(result==="bought"?"Upgrade purchased and fitted":"Owned setup fitted");return;
    }
    if(action.startsWith("car:")) {
      if(this.state!=="garage")return;
      const result=this.save.buyOrSelect(action.slice(4));
      if(result==="insufficient"){this.ui.toast("More coins needed");return;}
      if(result==="invalid")return;
      this.equipVehicle();this.applySettings();
      this.vehicle.applyLoadout(this.save.loadout,this.save.setup);
      this.ui.toast(`${this.save.car.name} ${result==="bought"?"unlocked":"selected"}`);return;
    }
    if (
      ["drive", "continue", "resume", "garage-drive", "race"].includes(action)
    )
      this.audio.start();
    if (["drive", "continue", "menu", "race"].includes(action) || action.startsWith("travel:")) this.autopilot.disable();
    switch (action) {
      case "autopilot":
        if (this.state !== "drive") break;
        this.autopilot.toggle(this.vehicle);
        this.autopilotManualReady = false;
        this.ui.toast(this.autopilot.enabled ? `${this.save.settings.autopilotMode === "steering" ? "Steering assist" : this.save.settings.autopilotMode === "speed" ? "Speed assist" : "Full autopilot"} on` : "Autopilot off");
        break;
      case "drive":
        this.leaveDrawnTrack();
        this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;
        this.race.cancel();
        this.traffic.active=true;
        this.vehicle.teleport(this.roads.main, 120);
        await this.prepareWorld();
        this.setState("drive");
        break;
      case "continue":
        this.leaveDrawnTrack();
        this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;
        this.race.cancel();this.traffic.active=true;
        if (this.save.position) {
          const p = this.save.position;
          const hit=this.roads.nearest(p.x,p.z,true),onRoad=hit.distance<hit.road.width/2+2.3;
          const height=onRoad?hit.height:this.world.terrainSampler.groundHeight(p.x,p.z);
          const pitch=onRoad?Math.asin(clamp(hit.sample.t.y,-1,1))*Math.sign(-Math.sin(p.yaw)*hit.sample.t.x-Math.cos(p.yaw)*hit.sample.t.z):0;
          this.vehicle.setPosition(p.x,height+this.vehicle.chassis.rideHeight,p.z,p.yaw,pitch);
          await this.prepareWorld();
        }
        this.setState("drive");
        break;
      case "resume":
        if (this.race.finished&&!this.drawnWorld) {
          this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;
          this.race.cancel();
          this.traffic.active = true;
        }
        this.setState("drive");
        break;
      case "pause":
        this.setState("pause");
        break;
      case "menu":
        this.persist();this.leaveDrawnTrack();
        this.race.cancel();
        this.traffic.active = true;
        this.setState("menu");
        break;
      case "activities":
        this.setState("activities");break;
      case "statistics":
        if(this.state==="menu")this.setState("statistics");
        break;
      case "leaderboard":
        if(this.state==='menu')this.setState('leaderboard');
        break;
      case "settings":
        this.setState("settings");
        break;
      case "controls":
        this.setState("controls");
        break;
      case "garage":
        this.setState("garage");
        break;
      case "workshop":
        this.setState("workshop");
        break;
      case "garage-drive":
        this.persist();
        this.setState("drive");
        break;
      case "photo":
        this.setState("photo");
        this.camera.orbitYaw = Math.atan2(
          this.render.camera.position.x - this.vehicle.position.x,
          this.render.camera.position.z - this.vehicle.position.z,
        );
        break;
      case "map":
        this.setState("map");
        break;
      case "back":
        this.setState(
          this.state==="activities"?this.activitiesPrevious:this.state === "statistics"||this.state==='leaderboard' ? "menu" : this.state === "settings"
            ? this.settingsPrevious
            : this.state === "workshop" ? "garage"
            : this.state === "controls"
              ? this.controlsPrevious
              : this.state === "garage"
                ? this.garagePrevious
                : "drive",
        );
        break;
      case "race":
        if(this.drawnWorld){await this.startDrawnRace(this.drawnWorld.track,this.race.laps);break;}
        this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;
        this.race.best=raceCondition(this.save.settings)==="wet"?(this.selectedRoute==="horizon"?this.save.wetBestByLaps[this.save.settings.raceLaps]||0:this.save.wetRouteBests[this.selectedRoute]||0):this.selectedRoute==="horizon"?(this.save.bestByLaps[this.save.settings.raceLaps]||0):(this.save.routeBests[this.selectedRoute]||0);
        this.race.start(this.vehicle,this.save.settings.raceLaps,false,this.selectedRoute);
        await this.prepareWorld();
        this.traffic.active = false;
        this.resultShown = false;
        this.camera.setMode(0);
        this.setState("drive");
        this.ui.toast(`${RACE_ROUTES.find(r=>r.id===this.selectedRoute)!.name} · ${this.race.route.closed?`${this.race.laps} lap${this.race.laps>1?"s":""}`:"Sprint"}`);
        break;
      case "capture":
        this.render.render(this.car.root);
        const a = document.createElement("a");
        a.href = this.render.capture();
        a.download = `Redline-Horizon-${Date.now()}.png`;
        a.click();
        this.ui.toast("Photo captured");
        break;
      default:
        if (action.startsWith("travel:")) {
          this.leaveDrawnTrack();
          this.practice=undefined;this.ui.practiceName="";this.coins.root.visible=true;
          this.race.cancel();
          this.traffic.active = true;
          const parts=action.split(":");
          const road=parts.length===3?this.roads.roads[Number(parts[1])]:this.roads.main;
          if(!road)return;
          this.vehicle.teleport(road,Number(parts.at(-1)));
          await this.prepareWorld();
          this.setState("drive");
          this.persist();
        }
    }
  }
  keys() {
    if (this.input.take("Escape")) {
      if (this.state === "drive") this.setState("pause");
      else if(this.state==='tracks')void this.action('track-back');
      else if(this.state==='dev')void this.action('dev-close');
      else if(this.state==='multiplayer')void this.action('mp-back');
      else if (["pause", "map", "photo"].includes(this.state))
        void this.action("resume");
      else if (["activities", "statistics", "leaderboard", "settings", "controls", "garage", "workshop"].includes(this.state))
        void this.action("back");
    }
    if (this.input.take("F3")) this.debug = !this.debug;
    if(this.input.take("KeyF")&&this.state==="drive"&&!this.foot.active)void this.action("autopilot");
    if(this.input.take("Enter")&&this.input.held("AltLeft","AltRight")){
      if(document.fullscreenElement)void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(()=>this.ui.toast("Fullscreen unavailable"));
    }
    if (this.state === "photo") {
      if (this.input.take("Tab")) {
        this.ui.hiddenPhoto = !this.ui.hiddenPhoto;
        this.ui.root.classList.toggle("photo-hidden", this.ui.hiddenPhoto);
      }
      if (this.input.take("KeyP")) void this.action("resume");
      return;
    }
    if (this.state === "map") {
      if (this.input.take("KeyM")) void this.action("resume");
      return;
    }
    if (this.state !== "drive") return;
    const leftShift=this.input.take("ShiftLeft"),rightShift=this.input.take("ShiftRight");
    const shift=leftShift||rightShift;
    if(shift)this.toggleFoot();
    if(this.foot.active)return;
    if (this.input.take("KeyC")) {
      this.camera.setMode(this.camera.mode + 1);
      this.save.settings.camera = this.camera.mode;
      this.ui.toast(
        [
          "Chase camera",
          "Wide chase",
          "Bumper camera",
          "Hood camera",
          "Cockpit camera",
          "Orbit · drag to look",
          "Free camera · I/J/K/L move · O/U rise/descend",
        ][this.camera.mode],
      );
      this.save.save();
    }
    if(this.input.take("KeyR"))this.recover();
    if (this.input.take("KeyQ")) this.vehicle.shift(-1);
    if (this.input.take("KeyE")) this.vehicle.shift(1);
    if (this.input.take("KeyL") && this.camera.mode!==6) this.lights = !this.lights;
    if (this.input.take("KeyG")) void this.action("race");
    if (this.input.take("KeyM")) void this.action("map");
    if (this.input.take("KeyP")) void this.action("photo");
  }
  private recover(){
    if(this.foot.active){this.ui.toast('Enter the vehicle before recovery');return;}
    if(this.police.rules.impound>0){this.ui.toast('Wait for the traffic stop to finish');return;}
    this.autopilot.disable();this.police.recovered();
    const success=this.race.active||this.drawnWorld?this.race.recover(this.vehicle):recoverVehicle(this.vehicle);
    if(success){this.physicsClock.reset();this.syncCar(1);this.ui.toast(this.race.active&&!this.race.networkRace&&this.race.countdown<=0?'Returned to checkpoint · +3 seconds':'Back on the road');}
    else this.ui.toast('Recovery area blocked — try again when traffic clears');
  }
  private async startPractice(section:typeof PRACTICE_SECTIONS[number]){
    if(this.foot.active){this.foot.enter(this.vehicle,true);this.camera.stopFoot();}
    this.leaveDrawnTrack();this.practice=section;this.ui.practiceName=section.name;this.race.cancel();this.autopilot.disable();this.police.clearWanted();this.traffic.active=false;this.traffic.root.visible=false;
    for(const car of this.traffic.cars)car.body.setEnabled(false);
    this.vehicle.teleport(routeRoad(this.roads,section.route),section.distance);this.coins.root.visible=false;
    await this.prepareWorld();this.camera.setMode(0);this.setState('drive');this.ui.toast(`${section.name} · Practice`);
  }
  private activateDrawnTrack(track:DrawnTrack){
    if(this.drawnWorld&&trackId(this.drawnWorld.track)===trackId(track))return;
    this.drawnWorld?.dispose();this.drawnWorld=undefined;
    try{this.drawnWorld=new DrawnTrackWorld(track,this.roads,this.physics);}catch(error){this.vehicle.teleport(this.roads.main,120);throw error;}this.render.scene.add(this.drawnWorld.root);
    this.autopilot.disable();this.police.clearWanted();this.traffic.active=false;this.traffic.root.visible=false;
    for(const car of this.traffic.cars)car.body.setEnabled(false);
    this.vehicle.teleport(this.drawnWorld.road,24);this.playerContacts.clear();this.physicsClock.reset();this.syncCar(1);
  }
  private leaveDrawnTrack(){
    if(!this.drawnWorld)return;
    if(this.foot.active){this.foot.enter(this.vehicle,true);this.camera.stopFoot();}
    this.drawnWorld.dispose();this.drawnWorld=undefined;this.selectedRoute="horizon";
    this.vehicle.teleport(this.roads.main,120);this.syncCar(1);this.physicsClock.reset();
  }
  private async startDrawnRace(track:DrawnTrack,laps:number){
    if(this.preparingWorld||this.network.connected||this.network.busy||this.network.raceLocked){this.ui.toast("Leave the multiplayer room before racing solo");return;}
    if(this.police.active||this.police.rules.impound){this.ui.toast("Finish the pursuit before racing");return;}
    const previous=this.state;
    try{
      if(this.foot.active){this.foot.enter(this.vehicle,true);this.camera.stopFoot();}
      this.race.cancel();this.activateDrawnTrack(track);this.practice=undefined;this.ui.practiceName="";
      this.race.best=this.trackEditor.store.best(track,raceCondition(this.save.settings),laps);
      this.race.start(this.vehicle,laps,false,"custom",true);this.resultShown=false;
      await this.prepareWorld();this.camera.setMode(0);this.setState("drive");this.ui.toast(`${track.name} · solo time trial`);
    }catch(error){this.leaveDrawnTrack();this.race.cancel();this.traffic.active=true;this.setState(previous);this.ui.toast(error instanceof Error?error.message:"Track could not be loaded");}
  }
  private toggleFoot(){
    if(this.state!=="drive")return;
    if(this.foot.active){
      if(!this.foot.enter(this.vehicle)){this.ui.toast("Move within 2.8 m of the vehicle");return;}
      this.camera.stopFoot();this.ui.footStatus(false,false);
    }else{
      if(this.police.active||this.police.rules.impound>0){this.ui.toast("Finish the pursuit before exiting");return;}
      if(!this.foot.exit(this.vehicle)){this.ui.toast("No safe exit space — stop on clear ground");return;}
      this.autopilot.disable();this.playerContacts.clear();this.ui.routeChoice(undefined);this.routeVisible=false;
      this.camera.startFoot(this.foot.root);this.ui.footStatus(true,this.foot.canEnter(this.vehicle));
    }
    this.physicsClock.reset();this.input.steer=0;
  }
  private multiplayerRootInvite(){return (document.getElementById("mp-invite") as HTMLInputElement).value;}
  private repairPrice(){return this.save.settings.repairCosts?Math.ceil((this.finishes.get(this.car)?.damageAmount||0)*40):0;}
  syncCar(alpha: number) {
    this.car.root.position.lerpVectors(
      this.vehicle.previousPosition,
      this.vehicle.position,
      alpha,
    );
    this.car.root.quaternion.slerpQuaternions(
      this.vehicle.previousRotation,
      this.vehicle.rotation,
      alpha,
    );
    if(this.vehicle.bike)this.car.root.rotateZ(this.vehicle.lean);
    this.car.body.position.y = -(this.vehicle.chassis.radius+.18);
    this.car.body.rotation.z = this.vehicle.roll;
    this.car.body.rotation.x = this.vehicle.pitch;
    for (let i = 0; i < 4; i++) {
      this.car.steers[i].position.y =
        0.03 - (this.vehicle.controller.wheelSuspensionLength(i) ?? 0.3);
      this.car.steers[i].rotation.y = i < 2 ? this.vehicle.steering : 0;
      this.car.wheels[i].rotation.x = this.vehicle.wheelSpin;
    }
    if(this.vehicle.bike){this.car.steering.rotation.y=this.vehicle.steering;this.car.steering.rotation.z=0;}
    else this.car.steering.rotation.z = -this.vehicle.steering * 5;
    this.car.brake.emissiveIntensity = this.vehicle.braking > 0.1 ? 4.0 : 0.6;
    const on = this.lights || this.render.night > 0.5;
    this.car.head.emissiveIntensity = on ? 4 : 1.8;
    for(const light of this.car.lights)light.intensity=on?70:0;
  }
  frame(now: number) {
    if (!this.running) return;
    const automatic=this.save.settings.autoGraphics;
    if(document.hidden){this.last=now;this.framePacer.reset();this.autoGraphics.suspend();requestAnimationFrame(this.nextFrame);return;}
    const frameLimit=this.state!=='drive'&&this.state!=='photo'&&!this.preparingWorld?30:automatic?this.autoGraphics.targetFps:0;
    if(frameLimit&&!this.framePacer.ready(now,frameLimit)){requestAnimationFrame(this.nextFrame);return;}
    const cpuStart=performance.now();this.physicsMs=0;
    const elapsedFrame=(now-this.last)/1000;
    const dt = Math.max(0, Math.min(1/15, elapsedFrame));

    this.last = now;
    this.elapsed += dt;
    this.fps = damp(this.fps, 1 / Math.max(0.001, elapsedFrame), 2, dt);
    const controls = this.input.read(dt);
    this.keys();
    const driving = this.state === "drive";
    if(this.race.networkRace&&this.race.active){
      this.race.countdown=(this.networkStart-Date.now())/1000;
      this.race.elapsed=Math.max(0,-this.race.countdown);
    }
    if (driving&&!this.foot.active) {
      const override = autopilotOverride(this.save.settings.autopilotMode, controls);
      if (!override) this.autopilotManualReady = true;
      if (this.autopilot.enabled && this.autopilotManualReady && override) {
        this.autopilot.disable();
        this.ui.toast("Autopilot off");
      }
      const navigation = {
        routeChoices:false,
        orbs: this.drawnWorld?[]:this.boosts.pickups,
        coins:this.drawnWorld?[]:this.coins.items,
        limits:!this.drawnWorld&&!this.dev.noPolice&&!this.race.active&&!this.race.finished?this.police.zones.zones:[],
        cars: this.race.networkRace?[]:this.race.active ? this.race.ai.cars : this.traffic.active ? this.enabledTraffic() : [],
      };
      const step = this.physicsClock.step;
      this.physicsClock.begin(elapsedFrame, performance.now());
      while (this.physicsClock.take(performance.now())) {
        const stepStart=performance.now();
        this.traffic.update(
          step,
          this.vehicle.position,
          this.worldSettings.quality,
          this.worldSettings.simulationDistance,
          this.worldSettings.renderDistance,
          this.camera.mode===6?this.camera.freePosition:this.vehicle.position,
          this.vehicle.speed,
        );
        navigation.cars=this.race.networkRace?[]:this.race.active?this.race.ai.cars:this.traffic.active?this.enabledTraffic():[];
        this.police.preStep(step,this.vehicle,this.race.active||this.race.finished||!!this.practice||!!this.drawnWorld,this.traffic.active?navigation.cars:[]);
        if(this.rollingLaunch&&this.race.networkRace&&this.race.countdown<=0){this.rollingLaunch=false;this.vehicle.body.setLinvel({x:this.vehicle.forward.x*15,y:this.vehicle.forward.y*15,z:this.vehicle.forward.z*15},true);}
        const input =
          this.police.rules.impound>0 ||
          (this.race.active && this.race.countdown > 0)
            ? stopped
            : this.autopilot.enabled ? this.autopilot.controls(this.vehicle, Math.min(this.save.settings.autopilotSpeed,this.police.limit?this.police.limit-2:Infinity), this.save.settings.autopilotMode, controls, navigation, step) : controls;
        this.slipstream.update(step,this.vehicle,input,this.race.networkRace?noTraffic:this.race.active?this.race.ai.cars:this.traffic.active?this.traffic.cars:noTraffic,this.remotes,now);
        if(this.race.active&&this.race.countdown<=0&&this.autopilot.enabled){this.race.assistUsed=true;this.race.allAssisted=true;}
        this.vehicle.preStep(input, step);
        this.race.update(step, this.vehicle);
        if(this.race.lapSerial!==this.recordedLapSerial){
          this.recordedLapSerial=this.race.lapSerial;
          if(!this.drawnWorld)this.save.recordLap(this.race.lastLapTime,this.save.selectedCar,this.race.lastLapNumber,this.race.lastLapAssisted,this.race.networkRace,this.race.condition);
        }
        this.playerContacts.update(now-this.physicsClock.accumulator*1000,this.network.connected&&!this.network.ghost,this.remotes);
        this.physics.world.step(undefined,this.playerContacts.hooks);
        this.vehicle.postStep(this.physicsClock.step);
        this.police.postStep(step);
        if(!this.drawnWorld&&!this.practice&&!(this.race.active&&this.race.countdown>0)&&!this.race.finished&&this.police.rules.impound===0)this.save.recordDriving(step,this.vehicle.speed*3.6,this.vehicle.contacts>0&&this.vehicle.crashCooldown===0);
        if(!this.race.networkRace)(this.race.active?this.race.ai:this.traffic).collisions(this.vehicle);
        if(this.police.messageSerial!==this.lastPoliceMessage) {
          this.lastPoliceMessage=this.police.messageSerial;this.ui.toast(this.police.message,2);this.ui.economy();
          if(this.police.rules.impound)this.autopilot.disable();
        }
        const mileageReward=this.rewards.update(step,this.vehicle,!this.drawnWorld&&!this.practice&&this.police.rules.impound===0&&!(this.race.active&&this.race.countdown>0)&&!this.race.finished);
        if(mileageReward){this.audio.coin();this.ui.reward(mileageReward);}
        if(this.vehicle.crashSerial!==this.lastCrash) {
          this.lastCrash=this.vehicle.crashSerial;
          this.particles.explode(this.vehicle.position,this.vehicle.crashSeverity);
          this.audio.explosion(this.vehicle.crashSeverity,this.vehicle.impactSide);this.finishes.get(this.car)?.impact(this.vehicle,this.vehicle.crashSeverity);
        }
        if(!this.drawnWorld&&!this.practice&&this.police.rules.impound===0 && !(this.race.active&&this.race.countdown>0)) {
          const amount=this.coins.collect(this.vehicle);
          if(amount){this.audio.coin();this.ui.economy();this.ui.reward(amount);}
        }
        if (!this.drawnWorld&&this.police.rules.impound===0 && !(this.race.active && this.race.countdown > 0))
          this.boosts.update(step, this.vehicle);
        this.physicsMs+=performance.now()-stepStart;
      }
      if(!this.drawnWorld)this.world.update(this.vehicle.position,false,this.camera.mode===6?this.camera.freePosition:this.vehicle.position);
      if (
        this.vehicle.position.y < -8
      )
      { this.police.recovered();if(this.drawnWorld){this.race.recover(this.vehicle);}else this.vehicle.reset(); }
      if (this.save.settings.cycle)
        this.save.settings.hour = (this.save.settings.hour + dt / 90) % 24;
      this.saveClock += dt;
      if (this.saveClock > 10) {
        this.saveClock = 0;
        this.persist(true);
      }
      if (this.race.finished && !this.resultShown) {
        this.resultShown = true;
        this.save.statistics.racesCompleted++;
        this.save.coins+=this.race.claimReward();
        if(this.drawnWorld&&!this.race.networkRace&&!this.race.allAssisted){try{this.trackEditor.store.record(this.drawnWorld.track,this.race.resultTime,this.race.condition,this.race.laps);}catch{this.ui.toast("Track time could not be saved");}}
        if(!this.drawnWorld&&!this.race.networkRace){this.save.recordRoute(this.race.routeId,this.race.resultTime,this.race.condition);if(this.race.route.closed){if(this.race.condition==="wet")this.save.wetBestByLaps[this.race.laps]=this.race.best;else {this.save.bestByLaps[this.race.laps]=this.race.best;if(this.race.laps===1)this.save.best=this.race.best;}}}
        this.persist();
        this.ui.showResults(this.race);
        this.setState("results");
      }
    }
    if(driving&&this.foot.active){
      const step=this.physicsClock.step,walk=this.input.readFoot();
      this.physicsClock.begin(elapsedFrame,performance.now());
      while(this.physicsClock.take(performance.now())){
        this.traffic.update(step,this.foot.position,this.worldSettings.quality,this.worldSettings.simulationDistance,this.worldSettings.renderDistance,this.foot.position);
        this.race.update(step,this.vehicle);
        this.foot.preStep(walk,this.camera.orbitYaw,step);
        const stepStart=performance.now();this.physics.world.step();this.physicsMs+=performance.now()-stepStart;this.foot.postStep();
      }
      if(!this.drawnWorld)this.world.update(this.foot.position,false,this.foot.position);
    }
    this.coins.animate(driving?dt:0,this.vehicle.position);
    // One render phase: finalized physics -> interpolated vehicle -> camera -> draw.
    // Re-read state because race completion can change it and reset the clock above.
    this.syncCar(this.state === "drive"&&!this.foot.active ? this.physicsClock.alpha : 1);
    this.foot.render(this.state==="drive"?this.physicsClock.alpha:1);
    this.foot.root.visible=this.foot.active;this.avatar.update(dt,this.state==="drive");
    if(this.foot.active)this.camera.updateFoot(dt,this.foot.root,this.vehicle);
    else
    this.camera.update(
      dt,
      this.vehicle,
      this.car.root,
      this.state==="workshop"?"garage":this.state,
      this.elapsed,
      this.input.readCamera(),
    );
    this.updateNetwork(now,dt);
    this.worldSettings.hour=this.save.settings.hour;this.worldSettings.weather=this.save.settings.weather;this.worldSettings.rainIntensity=this.save.settings.rainIntensity;
    this.render.updateAtmosphere(this.elapsed, this.foot.active?this.foot.position:this.vehicle.position);
    if (this.state === "garage" || this.state === "workshop") {
      (this.render.scene.fog as T.FogExp2).density = 0;
      this.render.hemi.intensity = 2.5;
      this.render.sun.intensity = 1.4;
    }
    this.car.root.visible = !(!this.foot.active&&driving && this.camera.mode === 2);
    this.particles.update(dt, this.vehicle, this.save.settings, driving&&!this.foot.active);
    const near = this.roads.nearest(
      this.vehicle.position.x,
      this.vehicle.position.z,
    );
    this.audio.update(
      this.vehicle,
      this.save.settings,
      driving&&!this.foot.active,
      this.input.held("KeyH"),
      near.road === this.roads.main &&
        near.sample.d > 760 &&
        near.sample.d < 995,
    );
    this.audio.siren(driving&&this.police.active,this.police.nearest);
    if(this.routeVisible){this.routeVisible=false;this.ui.routeChoice(undefined);}
    this.frames++;this.hudClock+=dt;
    if (this.hudClock>=.1){
      this.guide.update(this.vehicle,driving&&!this.foot.active&&this.save.settings.cornerGuide!=="off",this.race.active?this.race.route:undefined);this.ui.guide(this.guide,driving&&!this.foot.active);
      this.ui.fpsDisplay(this.fps,this.debug||this.save.settings.diagnostics);
      if(this.state==="garage")document.getElementById("repair-price")!.textContent=this.save.settings.repairCosts?`Repair · ${this.repairPrice()} coins`:"Cosmetic repair · free";
      this.graphicsStatus();
      this.ui.autopilotStatus(this.autopilot.enabled);
      this.hudClock%=.1;
      this.ui.routeChoice(undefined);
      this.ui.footStatus(this.foot.active,this.foot.active&&this.foot.canEnter(this.vehicle));
      this.ui.update(
        this.vehicle,
        this.race,
        this.camera,
      );
    }
    this.guide.root.visible=this.guide.root.visible&&driving&&!this.foot.active;this.finishes.get(this.car)?.update();
    const renderStart=performance.now();this.render.render(this.car.root, this.state === "garage" || this.state === "workshop",!driving);
    const cpuMs=performance.now()-cpuStart;
    this.diagnostics.record(elapsedFrame*1000,this.physicsMs,performance.now()-renderStart,cpuMs);
    if(automatic&&this.autoGraphics.observe(elapsedFrame*1000,cpuMs,this.render.gpuMs,this.state==="drive"&&!this.preparingWorld)){
      this.render.setAutomaticLevel(this.syncWorldSettings());this.framePacer.reset();this.graphicsStatus();
    }
    requestAnimationFrame(this.nextFrame);
  }
  persist(checkpoint=false) {
    if (!this.vehicle) return;
    if(this.drawnWorld){this.save.save();return;}
    this.save.savePosition(this.vehicle,checkpoint);
  }
  updateNetwork(now:number,dt:number) {
    const visible=['drive','pause','map','photo','results','multiplayer'].includes(this.state);
    for(const remote of this.remotes)remote.update(now,visible,this.vehicle.position);
    if(!this.network.connected||this.preparingWorld)return;
    this.networkClock+=dt;if(this.networkClock<.05)return;this.networkClock%=.05;
    const p=this.outgoing,v=this.vehicle;
    p.seq=++this.networkSequence;p.car=this.save.car.id;p.paint=this.save.settings.paint;p.active=visible;p.occupied=!this.foot.active;
    p.p[0]=v.position.x;p.p[1]=v.position.y;p.p[2]=v.position.z;
    p.q[0]=v.rotation.x;p.q[1]=v.rotation.y;p.q[2]=v.rotation.z;p.q[3]=v.rotation.w;
    p.steer=v.steering;p.spin=v.wheelSpin;p.lean=v.lean;p.pitch=v.pitch;p.brake=v.braking;
    p.race=this.race.networkRace?this.network.session:'';p.progress=this.race.playerProgress;
    p.finished=this.race.networkRace&&this.race.finished;p.time=p.finished?this.race.resultTime:this.race.elapsed;
    this.network.send(p,true);
  }
  registerTools() {
    const context = (navigator as any).modelContext;
    if (!context?.registerTool) return;
    try {
      context.registerTool({
        name: "redline_state",
        description: "Read Redline Horizon driving state.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: this.state,
                isDriving: !this.foot.active,
                walkingPosition: this.foot.active ? {x:this.foot.position.x,y:this.foot.position.y,z:this.foot.position.z} : null,
                statistics:this.save.statistics,routeChoice:this.autopilot.routes.choice?{distance:this.autopilot.routes.choice.distance,locked:this.autopilot.routes.choice.locked,selected:this.autopilot.routes.choice.selected,options:this.autopilot.routes.choice.options.map(o=>({label:o.label,road:o.road.name}))}:null,
                speedKmh: Math.round(this.vehicle.speed * 3.6),
                gear: this.vehicle.gear,
                camera:this.camera.mode,autopilot:this.autopilot.enabled,drift:this.autopilot.drift.phase,autopilotMode:this.save.settings.autopilotMode,
                position:{x:this.vehicle.position.x,y:this.vehicle.position.y,z:this.vehicle.position.z},
                renderDistance:this.worldSettings.renderDistance,simulationDistance:this.worldSettings.simulationDistance,
                graphics:{automatic:this.save.settings.autoGraphics,targetFps:this.save.settings.autoGraphics?this.autoGraphics.targetFps:null,level:this.autoGraphics.level,gpuMs:this.render.gpuMs,preset:this.worldSettings.quality,pixelRatio:this.render.renderer?.getPixelRatio(),buffer:[this.render.canvas.width,this.render.canvas.height],shadowSize:this.render.sun.shadow.mapSize.x,ao:this.render.ao?.enabled,bloom:this.render.bloom?.enabled,samples:this.render.composer?.renderTarget1.samples,sharpness:this.render.grade?.uniforms.sharpness.value},
                cornerGuide:this.save.settings.cornerGuide,autopilotRoutes:this.save.settings.autopilotRoutes,
                location: this.roads.region(
                  this.vehicle.position.x,
                  this.vehicle.position.z,
                ),
                race: this.race.active,route:this.race.routeId,practice:this.practice?.id||null,police:{active:this.police.active,stage:this.police.rules.stage,seen:this.police.seen},
                weather: this.save.settings.weather,
              }),
            },
          ],
        }),
      });
    } catch {}
  }
}
