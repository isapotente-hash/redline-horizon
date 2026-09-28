export type UpgradeSlot = "engine" | "gearing" | "tyres" | "brakes" | "suspension";
export type Loadout = Record<UpgradeSlot, string>;
export type HandlingTune = {
  dry: number; wet: number; loose: number; rearGrip: number; rolling: number;
  brakeForce: number; frontBias: number; brakeTurn: number; brakeRearGrip: number;
  stiffness: number; compression: number; relaxation: number; travel: number;
  response: number; bodyRoll: number;
  enginePower:number; engineSpeed:number; gearingSpeed:number; finalDrive:number;
};
export type Upgrade = {
  id: string; slot: UpgradeSlot; name: string; price: number;
  advantage: string; tradeoff: string; stats: string; tune: Partial<HandlingTune>;
};
export const STOCK: Loadout = {engine:"engine-stock",gearing:"gearing-stock",tyres:"tyres-stock",brakes:"brakes-stock",suspension:"suspension-stock"};
export const BASE_TUNE: HandlingTune = {
  dry:1,wet:1,loose:1,rearGrip:1,rolling:1,
  brakeForce:1,frontBias:.5,brakeTurn:1,brakeRearGrip:1,
  stiffness:44,compression:4.4,relaxation:5.5,travel:.19,response:5.4,bodyRoll:1,
  enginePower:1,engineSpeed:0,gearingSpeed:0,finalDrive:3.45,
};
export const UPGRADES: readonly Upgrade[] = [
  {id:STOCK.engine,slot:"engine",name:"Factory engine",price:0,advantage:"Original power and speed limit.",tradeoff:"Standard performance.",stats:"POWER 100 / STANDARD LIMIT",tune:{}},
  {id:"engine-ecu",slot:"engine",name:"Stage 1 · ECU",price:100,advantage:"10% more torque; 18 km/h higher speed limit.",tradeoff:"More wheelspin with assists off.",stats:"POWER 110 / LIMIT +18 KM/H",tune:{enginePower:1.1,engineSpeed:5}},
  {id:"engine-turbo",slot:"engine",name:"Stage 2 · Turbo",price:220,advantage:"25% more torque; 36 km/h higher speed limit.",tradeoff:"Requires a gentler throttle on corner exits.",stats:"POWER 125 / LIMIT +36 KM/H",tune:{enginePower:1.25,engineSpeed:10}},
  {id:"engine-race",slot:"engine",name:"Stage 3 · Race engine",price:380,advantage:"40% more torque; 54 km/h higher speed limit.",tradeoff:"Harder to put power down on wet or loose roads.",stats:"POWER 140 / LIMIT +54 KM/H",tune:{enginePower:1.4,engineSpeed:15}},
  {id:STOCK.gearing,slot:"gearing",name:"Factory ratios",price:0,advantage:"Balanced acceleration and cruising.",tradeoff:"Standard speed limit.",stats:"FINAL DRIVE 3.45",tune:{}},
  {id:"gearing-sport",slot:"gearing",name:"Sport overdrive",price:110,advantage:"18 km/h higher limit; stacks with engine tuning.",tradeoff:"Taller gearing reduces wheel torque and launch acceleration.",stats:"FINAL DRIVE 3.25 / LIMIT +18 KM/H",tune:{finalDrive:3.25,gearingSpeed:5}},
  {id:"gearing-long",slot:"gearing",name:"Long-ratio gearbox",price:180,advantage:"36 km/h higher limit; stacks with engine tuning.",tradeoff:"Slower launch; pair with an upgraded engine.",stats:"FINAL DRIVE 3.00 / LIMIT +36 KM/H",tune:{finalDrive:3,gearingSpeed:10}},
  {id:STOCK.tyres,slot:"tyres",name:"Road compound",price:0,advantage:"Balanced grip in changing conditions.",tradeoff:"No specialist advantage.",stats:"DRY 100 / WET 100 / LOOSE 100",tune:{}},
  {id:"tyres-sport",slot:"tyres",name:"Sport semi-slick",price:85,advantage:"More grip on dry asphalt.",tradeoff:"Less grip in rain and on loose ground.",stats:"DRY 122 / WET 80 / LOOSE 65",tune:{dry:1.22,wet:.8,loose:.65,rolling:1.08}},
  {id:"tyres-terrain",slot:"tyres",name:"All-terrain",price:75,advantage:"Much better loose-surface traction.",tradeoff:"Less dry-road grip; more rolling resistance.",stats:"DRY 88 / WET 108 / LOOSE 145",tune:{dry:.88,wet:1.08,loose:1.45,rolling:1.2}},
  {id:"tyres-drift",slot:"tyres",name:"Drift compound",price:65,advantage:"Reduced rear grip makes slides easier.",tradeoff:"Less cornering and wet-road stability.",stats:"DRY 95 / WET 80 / REAR GRIP 72",tune:{dry:.95,wet:.8,loose:.8,rearGrip:.72}},
  {id:STOCK.brakes,slot:"brakes",name:"Road brakes",price:0,advantage:"Predictable, balanced pedal response.",tradeoff:"Standard stopping power.",stats:"FORCE 100 / FRONT BIAS 50%",tune:{}},
  {id:"brakes-track",slot:"brakes",name:"Track brakes",price:100,advantage:"Stronger stops with a stable front bias.",tradeoff:"Less steering authority under heavy braking.",stats:"FORCE 128 / FRONT BIAS 65%",tune:{brakeForce:1.28,frontBias:.65,brakeTurn:.72}},
  {id:"brakes-rotation",slot:"brakes",name:"Rotation brakes",price:70,advantage:"Rear bias helps rotate into a corner.",tradeoff:"Rear tyres can slide while braking.",stats:"FORCE 110 / FRONT BIAS 40%",tune:{brakeForce:1.1,frontBias:.4,brakeRearGrip:.75}},
  {id:STOCK.suspension,slot:"suspension",name:"Road suspension",price:0,advantage:"Balanced compliance and response.",tradeoff:"Neither a track nor rough-road specialist.",stats:"SPRING 44 / TRAVEL 19 CM",tune:{}},
  {id:"suspension-track",slot:"suspension",name:"Track suspension",price:95,advantage:"Quicker steering response and less body roll.",tradeoff:"Stiff springs and short travel on bumps.",stats:"SPRING 62 / TRAVEL 12 CM",tune:{stiffness:62,compression:5.8,relaxation:6.8,travel:.12,response:7.6,bodyRoll:.6}},
  {id:"suspension-rally",slot:"suspension",name:"Rally suspension",price:80,advantage:"Longer travel and softer springs absorb bumps.",tradeoff:"Slower steering response and more body roll.",stats:"SPRING 34 / TRAVEL 29 CM",tune:{stiffness:34,compression:3.8,relaxation:5.1,travel:.29,response:4.1,bodyRoll:1.4}},
];
export const UPGRADE_SLOTS: UpgradeSlot[] = ["engine","gearing","tyres","brakes","suspension"];
export function tuneFor(loadout:Loadout):HandlingTune {
  const tune={...BASE_TUNE};
  for(const slot of UPGRADE_SLOTS) {
    const upgrade=UPGRADES.find(u=>u.id===loadout[slot]&&u.slot===slot);
    if(upgrade)Object.assign(tune,upgrade.tune);
  }
  return tune;
}
