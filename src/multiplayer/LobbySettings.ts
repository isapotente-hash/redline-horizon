import {CarSpec} from '../vehicles/CarCatalog';
import {RouteId,validRoute} from '../racing/RouteCatalog';
export type VehicleClass='all'|'cars'|'bikes'|'road';
export type RaceSettings={route:RouteId;laps:1|3;vehicleClass:VehicleClass;startRule:'grid'|'rolling'};
export const defaultRaceSettings=():RaceSettings=>({route:'horizon',laps:1,vehicleClass:'all',startRule:'grid'});
export function validRaceSettings(v:any):v is RaceSettings{return !!v&&validRoute(v.route)&&(v.laps===1||v.laps===3)&&(v.route==='horizon'||v.laps===1)&&['all','cars','bikes','road'].includes(v.vehicleClass)&&['grid','rolling'].includes(v.startRule);}
export function matchesClass(car:CarSpec,category:VehicleClass){const bike=car.kit==='bike'||car.kit==='sportbike';return category==='all'||(category==='bikes'?bike:category==='cars'?!bike:['road','rally','roadster','pickup'].includes(car.kit));}
