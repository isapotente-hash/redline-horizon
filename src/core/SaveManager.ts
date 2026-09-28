import { CARS, carSpec } from "../vehicles/CarCatalog";
import { Loadout, STOCK, UPGRADES, UPGRADE_SLOTS } from "../vehicles/UpgradeCatalog";
export type Settings = {
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
export class SaveManager {
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
  best = 0;
  distance = 0;
  position: { x: number; y: number; z: number; yaw: number } | null = null;
  constructor() {
    try {
      const a = JSON.parse(
        localStorage.getItem("redline-horizon-v1") || "null",
      );
      if (a) {
        this.settings = { ...defaults, ...a.settings };
        this.settings.autopilotRoutes=a.settings?.autopilotRoutes!==false;
        for(const key of Object.keys(this.statistics) as (keyof typeof this.statistics)[]){const value=a.statistics?.[key];if(Number.isFinite(value)&&value>=0)this.statistics[key]=value;}
        this.settings.renderDistance=Number.isFinite(this.settings.renderDistance)?Math.max(500,Math.min(3000,this.settings.renderDistance)):defaults.renderDistance;
        this.settings.simulationDistance=Number.isFinite(this.settings.simulationDistance)?Math.max(250,Math.min(1000,this.settings.simulationDistance)):defaults.simulationDistance;
        if(a.performanceEdition===5)this.settings.quality=defaults.quality;
        this.best = Number(a.best) || 0;
        this.bestByLaps={1:this.best,3:Number(a.bestByLaps?.[3])||0};
        this.legacyRecords=a.legacyRecords||{};
        if(a.layoutVersion!==2 && this.best>0){this.legacyRecords['original-circuit']={best:this.best,bestByLaps:this.bestByLaps};this.best=0;this.bestByLaps={};}
        this.distance = Number(a.distance) || 0;
        this.position = a.position || null;
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
    } catch {}
  }
  save() {
    try {
      localStorage.setItem(
        "redline-horizon-v1",
        JSON.stringify({
          coins: this.coins, ownedCars: [...this.ownedCars], selectedCar: this.selectedCar,
          collectedCoins: [...this.collectedCoins],
          loadouts:this.loadouts,ownedUpgrades:this.ownedUpgrades,rewardMeters:this.rewardMeters,
          settings: this.settings,
          best: this.best, bestByLaps:this.bestByLaps,layoutVersion:2,legacyRecords:this.legacyRecords,
          distance: this.distance,statistics:this.statistics,
          position: this.position,
        }),
      );
    } catch {}
  }
}
