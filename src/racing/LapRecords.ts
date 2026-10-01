export type LapRecord={time:number;carId:string;date:number;lap:number;assisted:boolean;multiplayer:boolean;imported?:boolean;condition?:"dry"|"wet"};
export const MAX_LAP_RECORDS=20;
export function validLapRecords(value:unknown,carIds:readonly string[]):LapRecord[]{
  if(!Array.isArray(value))return [];
  const result:LapRecord[]=[];
  for(const r of value.slice(0,200)){
    if(!r||typeof r!=='object'||!Number.isFinite(r.time)||r.time<=0||r.time>21600||!carIds.includes(r.carId))continue;
    result.push({time:r.time,carId:r.carId,date:Number.isFinite(r.date)&&r.date>0&&r.date<=8640000000000000?r.date:0,lap:r.lap===2?2:r.lap===3?3:1,assisted:r.assisted===true,multiplayer:r.multiplayer===true,imported:r.imported===true,condition:r.condition==='wet'?'wet':'dry'});
  }
  return result.sort((a,b)=>a.time-b.time||a.date-b.date).slice(0,MAX_LAP_RECORDS);
}
