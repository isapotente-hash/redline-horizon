import {Road,RoadNetwork} from '../world/RoadNetwork';
export const RACE_ROUTES=[
 {id:'horizon',name:'Horizon Circuit',road:'HORIZON 01',description:'Full world circuit · changing scenery',closed:true},
 {id:'summit',name:'Summit Run',road:'SUMMIT PASS',description:'Climb, tunnel and mountain descent',closed:false},
 {id:'coast',name:'South Coast Sprint',road:'SOUTH COAST',description:'Fast coastal sweepers and bridge',closed:false},
 {id:'bracken',name:'Bracken Lane',road:'BRACKEN LANE',description:'Narrow farm lanes, crests and banked bends',closed:false},
 {id:'switchback',name:'Highland Switchbacks',road:'HIGHLAND SWITCHBACKS',description:'Tight hairpins and exposed hillside turns',closed:false},
] as const;
export type RouteId=typeof RACE_ROUTES[number]['id']|'custom';
export const validRoute=(id:unknown):id is RouteId=>id==='custom'||RACE_ROUTES.some(r=>r.id===id);
export function routeRoad(roads:RoadNetwork,id:RouteId):Road{if(id==='custom'){if(!roads.drawnRoad)throw new Error('Drawn track is not loaded');return roads.drawnRoad;}return roads.roads.find(r=>r.name===RACE_ROUTES.find(r=>r.id===id)?.road)||roads.main;}
export const PRACTICE_SECTIONS=[
 {id:'coastal-tunnel',name:'Tunnel approach',route:'horizon' as RouteId,distance:610,description:'Approach, tunnel and road-edge recovery'},
 {id:'forest-bends',name:'Forest bends',route:'horizon' as RouteId,distance:1900,description:'Linked corners and braking practice'},
 {id:'mountain',name:'Mountain climb',route:'summit' as RouteId,distance:650,description:'Elevation changes and uphill corner exits'},
 {id:'farm',name:'Country lane',route:'bracken' as RouteId,distance:240,description:'Narrow lanes, banks and hill crests'},
 {id:'hairpins',name:'Hairpin practice',route:'switchback' as RouteId,distance:380,description:'Low-speed turn-in and controlled slides'},
 {id:'coast-bridge',name:'Coastal bridge',route:'coast' as RouteId,distance:1120,description:'Fast bends and a long bridge approach'},
] as const;
