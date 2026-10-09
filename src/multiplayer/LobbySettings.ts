import {DrawnTrack,validDrawnTrack} from '../racing/DrawnTrack';
import {CarSpec} from '../vehicles/CarCatalog';
import {RouteId,validRoute} from '../racing/RouteCatalog';
export type VehicleClass='all'|'cars'|'bikes'|'road';
export type RaceSettings={route:RouteId;laps:1|3;vehicleClass:VehicleClass;startRule:'grid'|'rolling';weather?:'clear'|'rain'|'fog';track?:DrawnTrack};
export const defaultRaceSettings=():RaceSettings=>({route:'horizon',laps:1,vehicleClass:'all',startRule:'grid',weather:'clear'});
export function validRaceSettings(v:any):v is RaceSettings{return !!v&&validRoute(v.route)&&(v.route==='custom'?validDrawnTrack(v.track):v.track===undefined)&&(v.laps===1||v.laps===3)&&(v.route==='horizon'||v.route==='custom'||v.laps===1)&&['all','cars','bikes','road'].includes(v.vehicleClass)&&['grid','rolling'].includes(v.startRule)&&(v.weather===undefined||['clear','rain','fog'].includes(v.weather));}
export function matchesClass(car:CarSpec,category:VehicleClass){const bike=car.kit==='bike'||car.kit==='sportbike';return category==='all'||(category==='bikes'?bike:category==='cars'?!bike:['road','rally','roadster','pickup'].includes(car.kit));}
