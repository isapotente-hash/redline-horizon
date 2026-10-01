import {Road} from './RoadNetwork';
export const LANDMARKS=[
 {road:'BRACKEN LANE',distance:650,side:1,name:'Bracken Farm',kind:'farm'},
 {road:'BRACKEN LANE',distance:1570,side:-1,name:'Old Mill',kind:'mill'},
 {road:'HIGHLAND SWITCHBACKS',distance:1040,side:1,name:'Highland Lookout',kind:'lookout'},
 {road:'SOUTH COAST',distance:2380,side:-1,name:'Coastal Farm',kind:'farm'},
] as const;
export function wallOpening(road:Road,d:number){return LANDMARKS.some(l=>l.road===road.name&&Math.abs(l.distance-d)<9);}
