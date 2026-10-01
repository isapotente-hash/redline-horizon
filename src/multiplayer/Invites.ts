import {validCode,normalizeCode} from './Protocol';
export const cleanName=(value:unknown)=>typeof value==='string'?value.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,16)||'Driver':'Driver';
export function inviteCode(url:string){try{const code=normalizeCode(new URL(url).searchParams.get('room')||'');return validCode(code)?code:'';}catch{return '';}}
export function inviteURL(url:string,code:string){const u=new URL(url);u.searchParams.delete('room');u.hash='';if(validCode(code))u.searchParams.set('room',code);return u.toString();}
export const connectionQuality=(latency:number)=>latency<100?'Good':latency<220?'Fair':'Slow';
