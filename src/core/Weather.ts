import {Settings} from './SaveManager';
export const wetness=(settings:Pick<Settings,'weather'|'rainIntensity'>)=>settings.weather==='rain'?.3+.7*settings.rainIntensity:0;
export const raceCondition=(settings:Pick<Settings,'weather'>)=>settings.weather==='rain'?'wet':'dry';
