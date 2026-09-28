/** This namespace is independent of build hashes, URLs and hosting paths. */
export const SAVE_KEY = 'redline_horizon_v4_save';
export const BACKUP_KEY = SAVE_KEY + '_backup';
export const SAVE_VERSION = 4;
export const LEGACY_KEYS = [
  'redline-horizon-v1', 'redline-horizon-v4', 'redline_horizon_v4',
  'redline-horizon-save', 'redline_horizon_save', 'redlineHorizonSave',
  'redline-horizon', 'redline_horizon', 'redlineHorizon',
];
export const record = (value:unknown):value is Record<string,any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function parseSave(raw:string|null):Record<string,any>|null {
  if (!raw) return null;
  try {
    let data:unknown=JSON.parse(raw);
    if (!record(data)) return null;
    // Older state-manager exports sometimes wrap the actual profile.
    if(record(data.state))data=data.state;
    else if(record(data.save))data=data.save;
    if(!record(data))return null;
    const a=data;
    if(!['coins','cash','balance','ownedCars','unlockedCars','settings','distance','statistics','loadouts','ownedUpgrades','unlockedTracks'].some(k=>k in a))return null;
    return {...a,coins:a.coins??a.cash??a.balance,ownedCars:a.ownedCars??a.unlockedCars,
      selectedCar:a.selectedCar??a.currentCar,statistics:a.statistics??a.stats,
      loadouts:a.loadouts??a.carLoadouts,ownedUpgrades:a.ownedUpgrades??a.purchasedUpgrades};
  } catch { return null; }
}
export function readSave():{data:Record<string,any>|null;readOnly:boolean;unavailable:boolean} {
  try {
    const primary=parseSave(localStorage.getItem(SAVE_KEY));
    // Never overwrite a newer format with defaults from an older application build.
    if(primary && primary.schemaVersion>SAVE_VERSION)return {data:null,readOnly:true,unavailable:false};
    if(primary)return {data:primary,readOnly:false,unavailable:false};
    const backup=parseSave(localStorage.getItem(BACKUP_KEY));
    if(backup && !(backup.schemaVersion>SAVE_VERSION))return {data:backup,readOnly:false,unavailable:false};
    const keys=[...LEGACY_KEYS];
    // Discover only Redline-prefixed save/profile variants, never unrelated site data.
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key && /^redline[-_]?horizon(?:[-_]?(?:v\d+|edition[-_]?\d+|save|profile|progress))*$/i.test(key) && key!==SAVE_KEY && !keys.includes(key))keys.push(key);
    }
    let newest:Record<string,any>|null=null, timestamp=-1;
    for(const key of keys){
      const a=parseSave(localStorage.getItem(key));
      if(!a || a.schemaVersion>SAVE_VERSION)continue;
      const time=Number.isFinite(a.savedAt)?a.savedAt:Number.isFinite(a.updatedAt)?a.updatedAt:0;
      if(time>timestamp){newest=a;timestamp=time;}
    }
    return {data:newest,readOnly:false,unavailable:false};
  } catch { return {data:null,readOnly:false,unavailable:true}; }
}
