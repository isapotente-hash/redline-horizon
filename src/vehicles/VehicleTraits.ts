import {CarSpec,chassisFor} from './CarCatalog';
import {HandlingTune} from './UpgradeCatalog';

export type VehicleTraits={label:string;drive:'RWD'|'AWD';brakes:number;aero:number;wet:number;loose:number;roll:number;finalDrive:number;redline:number;firing:number;timbre:number};
const balanced:VehicleTraits={label:'Balanced rear drive',drive:'RWD',brakes:1,aero:1,wet:1,loose:1,roll:1,finalDrive:1,redline:8050,firing:2,timbre:1};
const traits:Record<CarSpec['kit'],VehicleTraits>={
 road:balanced,
 rally:{...balanced,label:'All-wheel-drive rally',drive:'AWD',brakes:1.06,aero:.84,wet:1.08,loose:1.22,roll:1.25,finalDrive:1.06,firing:2,timbre:.82},
 gt:{...balanced,label:'Planted track chassis',brakes:1.16,aero:1.35,wet:.97,loose:.91,roll:.72,finalDrive:.97,firing:4,timbre:.72},
 supercar:{...balanced,label:'V12 all-wheel-drive',drive:'AWD',brakes:1.2,aero:1.24,wet:1.03,loose:.9,roll:.68,finalDrive:.95,redline:8250,firing:6,timbre:.62},
 bike:{...balanced,label:'Light, nimble street bike',brakes:1.06,aero:.1,wet:.95,loose:.96,roll:0,redline:8300,firing:2,timbre:1.35},
 sportbike:{...balanced,label:'High-revving superbike',brakes:1.18,aero:.1,wet:.86,loose:.86,roll:0,finalDrive:.96,redline:8450,firing:2,timbre:1.65},
 pickup:{...balanced,label:'Heavy all-terrain chassis',drive:'AWD',brakes:.9,aero:.78,wet:1.05,loose:1.06,roll:1.55,finalDrive:1.08,firing:4,timbre:.55},
 roadster:{...balanced,label:'Lightweight rear drive',brakes:1.09,aero:.87,wet:.96,loose:.98,roll:1.1,finalDrive:1.03,firing:2,timbre:1.15},
};
export const traitsFor=(spec:CarSpec)=>traits[spec.kit];
/** Dry-road estimates, shared drivetrain/brake parameters; not claimed as measured lap data. */
export function performanceEstimate(spec:CarSpec,tune:HandlingTune){
 const c=chassisFor(spec),v=traitsFor(spec),mass=c.mass;
 const traction=9.81*Math.min(1.15,spec.handling*tune.dry)*(v.drive==='AWD'?1:.75);
 const launch=Math.min(traction,620*spec.power*tune.enginePower*c.forceScale*3.8*tune.finalDrive*v.finalDrive*.9/c.radius/mass);
 const mid=Math.min(traction,620*spec.power*tune.enginePower*c.forceScale*2.62*tune.finalDrive*v.finalDrive*.9/c.radius/mass);
 const seconds=13.9/Math.max(1,launch)+13.9/Math.max(1,mid-.4)+.36;
 const decel=Math.min(9.81*spec.handling*tune.dry,9400/1550*tune.brakeForce*v.brakes);
 return {acceleration:seconds,braking:27.7778**2/(2*Math.max(2,decel)),mass,drive:v.drive,label:v.label};
}
