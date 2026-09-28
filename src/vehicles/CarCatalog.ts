export type CarSpec = { id:string; name:string; subtitle:string; price:number; power:number; handling:number; topSpeed:number; color:string; kit:"road"|"gt"|"rally"|"bike"|"sportbike"|"pickup"|"roadster"|"supercar" };
export const isBike=(spec:CarSpec)=>spec.kit==='bike'||spec.kit==='sportbike';
export function chassisFor(spec:CarSpec) {
  if(isBike(spec))return {mass:260,halfWidth:.14,halfLength:.87,radius:.33,halfBody:[.29,.3,1.12] as const,rideHeight:.58,forceScale:.19,dragScale:.19,steerAngle:.56,steerFade:.038,response:1.8};
  if(spec.kit==='pickup')return {mass:2350,halfWidth:1.05,halfLength:1.65,radius:.43,halfBody:[1.04,.37,2.5] as const,rideHeight:.70,forceScale:1.10,dragScale:1.45,steerAngle:.43,steerFade:.060,response:.8};
  if(spec.kit==='roadster')return {mass:1150,halfWidth:.88,halfLength:1.3,radius:.35,halfBody:[.87,.19,1.98] as const,rideHeight:.58,forceScale:.9,dragScale:.82,steerAngle:.51,steerFade:.049,response:1.3};
  return {mass:1550,halfWidth:.95,halfLength:1.43,radius:.365,halfBody:[.88,.2,2.1] as const,rideHeight:.60,forceScale:1,dragScale:1,steerAngle:.48,steerFade:.055,response:1};
}
export const CARS: readonly CarSpec[] = [
  {id:"vanta",name:"VANTA R1",subtitle:"The original · balanced rear-wheel drive",price:0,power:1,handling:1,topSpeed:85,color:"#b81120",kit:"road"},
  {id:"kestrel",name:"KESTREL RX",subtitle:"Rally package · grip over outright speed",price:120,power:.95,handling:1.2,topSpeed:78,color:"#d8e5d2",kit:"rally"},
  {id:"apex",name:"APEX GT",subtitle:"Track package · extra power and aero",price:250,power:1.3,handling:1.08,topSpeed:96,color:"#eead31",kit:"gt"},
  {id:"pulse",name:"PULSE 900",subtitle:"Street bike · quick steering · hold Ctrl for a wheelie",price:0,power:1.35,handling:1.35,topSpeed:103,color:"#26c4c5",kit:"bike"},
  {id:"spectre",name:"SPECTRE RR",subtitle:"Superbike · fastest acceleration · less forgiving on gravel",price:180,power:1.6,handling:1.25,topSpeed:113,color:"#e54340",kit:"sportbike"},
  {id:"atlas",name:"ATLAS 4X",subtitle:"Pickup · heavier chassis · strong loose-surface grip",price:160,power:1.05,handling:.88,topSpeed:70,color:"#76846c",kit:"pickup"},
  {id:"comet",name:"COMET S",subtitle:"Open-top roadster · light and agile",price:200,power:1.15,handling:1.15,topSpeed:94,color:"#eeb94e",kit:"roadster"},
  {id:"revuelto",name:"LAMBORGHINI REVUELTO",subtitle:"Duke Dynamics · V12 flagship · precision and power",price:0,power:1.48,handling:1.13,topSpeed:108,color:"#e69a25",kit:"supercar"},
];
export const carSpec = (id:string) => CARS.find(c=>c.id===id) || CARS[0];
