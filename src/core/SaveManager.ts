import {DriverSetup,validateSetup,SETUP_PRESETS} from '../vehicles/DriverSetup';
import {LIVERIES,Livery,validLivery,cleanPlate} from '../vehicles/CosmeticCatalog';
import {validRoute,RouteId} from "../racing/RouteCatalog";
import { SAVE_KEY, BACKUP_KEY, SAVE_VERSION, readSave, record } from "./SaveStorage";
import { CARS, carSpec } from "../vehicles/CarCatalog";
import { Loadout, STOCK, UPGRADES, UPGRADE_SLOTS } from "../vehicles/UpgradeCatalog";
import {LapRecord,MAX_LAP_RECORDS,validLapRecords} from '../racing/LapRecords';
export type Settings = {
  cameraMotion:number;
  cornerGuide:"off"|"hud"|"markers";rainIntensity:number;diagnostics:boolean;repairCosts:boolean;driverName:string;
  adaptiveResolution:boolean;
  renderDistance: number;
  simulationDistance: number;
  raceLaps: number;
  autopilotRoutes: boolean;
  autopilotSpeed: number;
  autopilotMode: "full" | "steering" | "speed";
  quality: "low" | "medium" | "high" | "ultra";
  weather: "clear" | "cloudy" | "rain" | "fog";
  hour: number;
  cycle: boolean;
  volume: number;
  automatic: boolean;
  traction: boolean;
  stability: boolean;
  paint: string;
  wheels: string;
  tint: number;
  camera: number;
  units: "kmh" | "mph";
};
export const defaults: Settings = {
  cameraMotion:1,cornerGuide:"off",rainIntensity:.7,diagnostics:false,repairCosts:false,driverName:"Driver",
  adaptiveResolution:true,
  renderDistance: 1600,
  simulationDistance: 600,
  raceLaps: 1,
  autopilotRoutes: true,
  autopilotSpeed: 90,
  autopilotMode: "full",
  quality: "high",
  weather: "clear",
  hour: 17.3,
  cycle: false,
  volume: 0.4,
  automatic: true,
  traction: true,
  stability: true,
  paint: "#b81120",
  wheels: "#92989e",
  tint: 0.25,
  camera: 0,
  units: "kmh",
};
function validSettings(value:unknown):Settings {
  const result={...defaults}, a=record(value)?value:{};
  for(const key of ['adaptiveResolution','autopilotRoutes','cycle','automatic','traction','stability','diagnostics','repairCosts'] as const)
    if(typeof a[key]==='boolean')result[key]=a[key];
  const bounds={rainIntensity:[0,1],cameraMotion:[0,1],renderDistance:[500,3000],simulationDistance:[250,1000],autopilotSpeed:[30,180],hour:[0,24],volume:[0,1],tint:[0,1],camera:[0,6]} as const;
  for(const key of Object.keys(bounds) as (keyof typeof bounds)[])
    if(Number.isFinite(a[key]))result[key]=Math.max(bounds[key][0],Math.min(bounds[key][1],a[key]));
  result.camera=Math.floor(result.camera);
  result.raceLaps=a.raceLaps===3?3:1;
  if(['full','steering','speed'].includes(a.autopilotMode))result.autopilotMode=a.autopilotMode;
  if(['low','medium','high','ultra'].includes(a.quality))result.quality=a.quality;
  if(['clear','cloudy','rain','fog'].includes(a.weather))result.weather=a.weather;
  if(['kmh','mph'].includes(a.units))result.units=a.units;
  for(const key of ['paint','wheels'] as const)if(typeof a[key]==='string'&&/^#[0-9a-f]{6}$/i.test(a[key]))result[key]=a[key];
  if(["off","hud","markers"].includes(a.cornerGuide))result.cornerGuide=a.cornerGuide;
  if(typeof a.driverName==="string")result.driverName=a.driverName.replace(/[<>\x00-\x1f]/g,"").trim().slice(0,16)||"Driver";
  return result;
}
const nonnegative=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,v):0;
export class SaveManager {
  onError:()=>void=()=>{};
  storageError=false;
  private readOnly=false;
  // The current world has no locked tracks; retain legacy unlock IDs for future catalogs.
  unlockedTracks:string[]=[];
  settings: Settings = { ...defaults };
  coins = 0;
  statistics={drivingSeconds:0,topSpeedKmh:0,racesCompleted:0};
  recordDriving(dt:number,speedKmh:number,grounded:boolean){
    if(Number.isFinite(dt)&&dt>0&&dt<=.1)this.statistics.drivingSeconds+=dt;
    if(grounded&&Number.isFinite(speedKmh)&&speedKmh>=0)this.statistics.topSpeedKmh=Math.max(this.statistics.topSpeedKmh,speedKmh);
  }
  // Session-only: keep the saved balance finite and compatible with existing saves.
  unlimitedCoins = false;
  ownedCars = new Set<string>(["vanta","pulse","revuelto"]);
  selectedCar = "vanta";
  collectedCoins = new Set<string>();
  loadouts:Record<string,Loadout>={};
  ownedUpgrades:Record<string,string[]>={};
  rewardMeters=0;
  setups:Record<string,DriverSetup>={};
  ownedLiveries:Livery[]=['factory'];liveries:Record<string,Livery>={};plates:Record<string,string>={};
  wetRouteBests:Partial<Record<RouteId,number>>={};wetBestByLaps:Record<number,number>={};
  get setup(){return validateSetup(this.setups[this.selectedCar]);}
  setSetup(key:string,value:number){if(!['brakeBias','steering','differential','spring'].includes(key)||!Number.isFinite(value))return;this.setups[this.selectedCar]=validateSetup({...this.setup,[key]:value});this.save();}
  presetSetup(id:string){if(!(id in SETUP_PRESETS))return;this.setups[this.selectedCar]={...SETUP_PRESETS[id as keyof typeof SETUP_PRESETS]};this.save();}
  buyLivery(id:unknown){if(!validLivery(id))return 'invalid';const part=LIVERIES.find(l=>l.id===id)!;if(!this.ownedLiveries.includes(id)){if(!this.unlimitedCoins&&this.coins<part.price)return 'insufficient';if(!this.unlimitedCoins)this.coins-=part.price;this.ownedLiveries.push(id);}this.liveries[this.selectedCar]=id;this.save();return 'equipped';}
  setPlate(value:string){this.plates[this.selectedCar]=cleanPlate(value);this.save();}

  get loadout():Loadout { return {...STOCK,...this.loadouts[this.selectedCar]}; }
  ownsUpgrade(id:string) { return Object.values(STOCK).includes(id)||(this.ownedUpgrades[this.selectedCar]||[]).includes(id); }
  buyUpgrade(id:string):"equipped"|"bought"|"insufficient"|"invalid" {
    const part=UPGRADES.find(u=>u.id===id);
    if(!part||!this.ownedCars.has(this.selectedCar))return "invalid";
    const owned=this.ownsUpgrade(id);
    if(!owned&&!this.unlimitedCoins&&this.coins<part.price)return "insufficient";
    if(!owned){if(!this.unlimitedCoins)this.coins-=part.price;(this.ownedUpgrades[this.selectedCar]??=[]).push(id);}
    this.loadouts[this.selectedCar]={...this.loadout,[part.slot]:id};this.save();
    return owned?"equipped":"bought";
  }
  addRewardDistance(meters:number) {
    if(!Number.isFinite(meters)||meters<=0||meters>20)return 0;
    this.rewardMeters+=meters;
    const reward=Math.floor(this.rewardMeters/1000)*20;
    if(reward){this.rewardMeters%=1000;this.coins+=reward;this.save();}
    return reward;
  }
  payFine(amount:number) {
    if(this.unlimitedCoins)return 0;
    const paid=Math.min(this.coins,Math.max(0,Math.floor(amount)));
    this.coins-=paid;this.save();return paid;
  }
  collectCoin(id: string) {
    if (this.collectedCoins.has(id)) return false;
    this.collectedCoins.add(id); this.coins += 5; this.save(); return true;
  }
  buyOrSelect(id: string): "selected"|"bought"|"insufficient"|"invalid" {
    const spec = CARS.find(c=>c.id===id);
    if (!spec) return "invalid";
    const owned = this.ownedCars.has(id);
    if (!owned && !this.unlimitedCoins && this.coins < spec.price) return "insufficient";
    if (!owned) { if(!this.unlimitedCoins)this.coins -= spec.price; this.ownedCars.add(id); }
    this.selectedCar = id; this.settings.paint = spec.color; this.save();
    return owned ? "selected" : "bought";
  }
  get car() { return carSpec(this.selectedCar); }
  legacyRecords:Record<string,unknown>={};
  bestByLaps:Record<number,number>={};
  lapRecords:LapRecord[]=[];
  recordLap(time:number,carId:string,lap:number,assisted=false,multiplayer=false,condition:"dry"|"wet"="dry"):boolean {
    if(!Number.isFinite(time)||time<=0||time>21600||!Number.isInteger(lap)||lap<1||lap>3||!CARS.some(c=>c.id===carId))return false;
    this.lapRecords.push({time,carId,date:Date.now(),lap,assisted,multiplayer,condition});
    this.lapRecords.sort((a,b)=>a.time-b.time||a.date-b.date);this.lapRecords.length=Math.min(this.lapRecords.length,MAX_LAP_RECORDS);
    this.save();return true;
  }
  routeBests:Partial<Record<RouteId,number>>={};
  recordRoute(id:RouteId,time:number,condition:"dry"|"wet"="dry"){if(!validRoute(id)||!Number.isFinite(time)||time<=0||time>21600)return;const records=condition==="wet"?this.wetRouteBests:this.routeBests;records[id]=Math.min(records[id]||Infinity,time);this.save();}
  best = 0;
  distance = 0;
  position: { x: number; y: number; z: number; yaw: number } | null = null;
  constructor() {
    const loaded=readSave();
    this.readOnly=loaded.readOnly;
    this.storageError=loaded.unavailable||loaded.readOnly;
    try {
      const a = loaded.data;
      if (a) {
        this.settings = validSettings(a.settings);
        this.ownedLiveries=['factory',...(Array.isArray(a.ownedLiveries)?a.ownedLiveries.filter((id:unknown)=>validLivery(id)&&id!=='factory'):[])];
        for(const car of CARS){this.setups[car.id]=validateSetup(a.setups?.[car.id]);const l=a.liveries?.[car.id];if(validLivery(l)&&this.ownedLiveries.includes(l))this.liveries[car.id]=l;this.plates[car.id]=cleanPlate(a.plates?.[car.id]);}
        if(record(a.wetRouteBests))for(const [id,t] of Object.entries(a.wetRouteBests))if(validRoute(id)&&typeof t==='number'&&t>0&&t<=21600)this.wetRouteBests[id]=t;
        for(const lap of [1,3])if(Number.isFinite(a.wetBestByLaps?.[lap])&&a.wetBestByLaps[lap]>0&&a.wetBestByLaps[lap]<=21600)this.wetBestByLaps[lap]=a.wetBestByLaps[lap];
        for(const key of Object.keys(this.statistics) as (keyof typeof this.statistics)[]){const value=a.statistics?.[key];if(Number.isFinite(value)&&value>=0)this.statistics[key]=value;}
        if(a.performanceEdition===5)this.settings.quality=defaults.quality;
        if(record(a.routeBests))for(const [id,time] of Object.entries(a.routeBests))if(validRoute(id)&&typeof time==="number"&&time>0&&time<=21600)this.routeBests[id]=time;
        this.best = nonnegative(a.best);
        this.bestByLaps={1:this.best,3:nonnegative(a.bestByLaps?.[3])};
        this.legacyRecords=record(a.legacyRecords)?a.legacyRecords:{};
        if(a.layoutVersion!==2 && this.best>0){this.legacyRecords['original-circuit']={best:this.best,bestByLaps:this.bestByLaps};this.best=0;this.bestByLaps={};}
        this.lapRecords=a.layoutVersion===2?validLapRecords(a.lapRecords,CARS.map(c=>c.id)):[];
        // Only a one-lap record from the current circuit can become an imported lap.
        if(a.layoutVersion===2&&!Array.isArray(a.lapRecords)&&this.best>0&&this.best<=21600)this.lapRecords=[{time:this.best,carId:'vanta',date:0,lap:1,assisted:false,multiplayer:false,imported:true}];
        this.distance = nonnegative(a.distance);
        this.position = record(a.position)&&['x','y','z','yaw'].every(k=>Number.isFinite(a.position[k]))
          ? {x:a.position.x,y:a.position.y,z:a.position.z,yaw:a.position.yaw} : null;
        this.unlockedTracks=Array.isArray(a.unlockedTracks)?[...new Set<string>(a.unlockedTracks.filter((id:unknown)=>typeof id==='string'))]:[];
        this.coins = Number.isFinite(a.coins) ? Math.max(0,Math.floor(a.coins)) : 0;
        this.rewardMeters=Number.isFinite(a.rewardMeters)?Math.max(0,Math.min(999.999,a.rewardMeters)):0;
        if (Array.isArray(a.ownedCars)) for (const id of a.ownedCars) if (CARS.some(c=>c.id===id)) this.ownedCars.add(id);
        this.selectedCar = this.ownedCars.has(a.selectedCar) ? a.selectedCar : "vanta";
        if (Array.isArray(a.collectedCoins)) this.collectedCoins = new Set(a.collectedCoins.filter((id:unknown)=>typeof id==="string").slice(0,5000));
        for(const car of CARS) {
          const owned=a.ownedUpgrades?.[car.id];
          this.ownedUpgrades[car.id]=Array.isArray(owned)?[...new Set<string>(owned.filter((id:unknown)=>UPGRADES.some(u=>u.id===id)))]:[];
          const loadout={...STOCK};
          for(const slot of UPGRADE_SLOTS){const id=a.loadouts?.[car.id]?.[slot];if(UPGRADES.some(u=>u.id===id&&u.slot===slot)&&(id===STOCK[slot]||this.ownedUpgrades[car.id].includes(id)))loadout[slot]=id;}
          this.loadouts[car.id]=loadout;
        }
      }
    } catch { this.storageError=true; }
    // Import before Game creates UI, coin items or vehicle kits. Leave legacy keys untouched.
    if(loaded.data&&!this.readOnly)this.save();
  }
  save():boolean {
    if(this.readOnly)return false;
    try {
      const serialized=JSON.stringify({
        schemaVersion:SAVE_VERSION,savedAt:Date.now(),
        coins:this.coins,ownedCars:[...this.ownedCars],selectedCar:this.selectedCar,
        collectedCoins:[...this.collectedCoins],unlockedTracks:this.unlockedTracks,
        setups:this.setups,ownedLiveries:this.ownedLiveries,liveries:this.liveries,plates:this.plates,wetRouteBests:this.wetRouteBests,wetBestByLaps:this.wetBestByLaps,
        loadouts:this.loadouts,ownedUpgrades:this.ownedUpgrades,rewardMeters:this.rewardMeters,
        settings:this.settings,routeBests:this.routeBests,best:this.best,bestByLaps:this.bestByLaps,lapRecords:this.lapRecords,
        layoutVersion:2,legacyRecords:this.legacyRecords,distance:this.distance,
        statistics:this.statistics,position:this.position,
      });
      // setItem is atomic. A failed write must not erase the last good profile.
      localStorage.setItem(SAVE_KEY,serialized);
      this.storageError=false;
      try { localStorage.setItem(BACKUP_KEY,serialized); } catch { /* Primary is durable even if backup quota is exhausted. */ }
      return true;
    } catch {
      if(!this.storageError)this.onError();
      this.storageError=true;
      return false;
    }
  }
}
