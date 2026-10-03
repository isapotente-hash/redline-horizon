import { CARS } from '../vehicles/CarCatalog';

export const PROTOCOL = 'rh4-avatar-6';
export const ROOM_PREFIX = 'redline-horizon-avatar-6-';
export const MAX_PLAYERS = 5;
export const PLAYER_COLORS = [0x65fff1,0xffd166,0xb79cff,0xff82b2,0x93e875];
export const validSlot = (v:unknown):v is number => Number.isInteger(v) && Number(v)>=0 && Number(v)<MAX_PLAYERS;
export const validRoster = (v:unknown):v is number[] => Array.isArray(v) && v.length>=1 && v.length<=MAX_PLAYERS && v.every(validSlot) && new Set(v).size===v.length && v.includes(0);
export const normalizeCode = (value: string) => value.trim().toUpperCase();
export const validCode = (value: string) => /^[A-Z]{4}$/.test(value);
export function roomCode(random: Uint8Array): string {
  // Rejection sampling avoids bias from 256 not being divisible by 26.
  let code = '';
  for (const n of random) { if (n < 234) code += String.fromCharCode(65 + n % 26); if (code.length === 4) return code; }
  return '';
}
export interface Pose {
  t: 'state'; seq: number; car: string; paint: string; active: boolean; occupied?:boolean;
  p: number[]; q: number[]; steer: number; spin: number; lean: number; pitch: number; brake: number;
  race: string; progress: number; finished: boolean; time: number;
}
const finite = (v: unknown, limit: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
export function validPose(v: any): v is Pose {
  return !!v && v.t === 'state' && Number.isSafeInteger(v.seq) && v.seq >= 0 &&
    CARS.some(c => c.id === v.car) && typeof v.paint === 'string' && /^#[a-f0-9]{6}$/i.test(v.paint) &&
    typeof v.active === 'boolean' && (v.occupied===undefined||typeof v.occupied==='boolean') && Array.isArray(v.p) && v.p.length === 3 && v.p.every((n: unknown) => finite(n, 100000)) &&
    Array.isArray(v.q) && v.q.length === 4 && v.q.every((n: unknown) => finite(n, 1.01)) &&
    Math.abs(v.q.reduce((sum: number, n: number) => sum + n * n, 0) - 1) < .05 &&
    finite(v.steer, 2) && finite(v.spin, 1e10) && finite(v.lean, 4) && finite(v.pitch, 4) && finite(v.brake, 1) &&
    typeof v.race === 'string' && /^[A-Za-z0-9-]{0,64}$/.test(v.race) && finite(v.progress, 100000) &&
    typeof v.finished === 'boolean' && finite(v.time, 86400) && v.time >= 0;
}
