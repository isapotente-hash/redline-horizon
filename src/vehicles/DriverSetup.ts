import {HandlingTune} from './UpgradeCatalog';
export type DriverSetup={brakeBias:number;steering:number;differential:number;spring:number};
export const SETUP_RANGES={brakeBias:[.35,.75],steering:[.6,1.4],differential:[0,1],spring:[.75,1.25]} as const;
export function validateSetup(v:any):DriverSetup{const d:DriverSetup={brakeBias:0,steering:1,differential:.5,spring:1};for(const k of ['steering','differential','spring'] as const)if(Number.isFinite(v?.[k]))d[k]=Math.max(SETUP_RANGES[k][0],Math.min(SETUP_RANGES[k][1],v[k]));if(Number.isFinite(v?.brakeBias)&&v.brakeBias!==0)d.brakeBias=Math.max(.35,Math.min(.75,v.brakeBias));return d;}
export function setupTune(tune:HandlingTune,setup:DriverSetup){return {...tune,frontBias:setup.brakeBias||tune.frontBias,stiffness:tune.stiffness*setup.spring,compression:tune.compression*Math.sqrt(setup.spring),relaxation:tune.relaxation*Math.sqrt(setup.spring)};}
export const SETUP_PRESETS={factory:{brakeBias:0,steering:1,differential:.5,spring:1},stable:{brakeBias:.65,steering:.85,differential:.7,spring:1.05},agile:{brakeBias:.5,steering:1.12,differential:.3,spring:1.12},rough:{brakeBias:.58,steering:.95,differential:.6,spring:.8}} satisfies Record<string,DriverSetup>;
/** Simulates open/locked axle torque sharing with bounded, lossless redistribution. */
export function axleShare(leftContact:boolean,rightContact:boolean,lock:number){if(leftContact===rightContact)return .5;return leftContact?.5+.35*lock:.5-.35*lock;}
