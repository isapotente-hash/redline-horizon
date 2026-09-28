import {SaveManager} from './SaveManager';
import {CARS} from '../vehicles/CarCatalog';
import {UPGRADES} from '../vehicles/UpgradeCatalog';

/** Local developer cheats. Authentication is per visit; driving toggles are per session. */
export class DevTools {
  private authenticated=false;
  infiniteBoost=false;
  noPolice=false;
  onChange:()=>void=()=>{};
  onReset:()=>void=()=>{};
  constructor(public save:SaveManager){}
  unlock(password:string){this.authenticated=password==='0922';return this.authenticated;}
  lock(){this.authenticated=false;}
  execute(action:string,value?:string|boolean):string {
    if(!this.authenticated)return 'Enter the password first.';
    let message='Updated';
    switch(action){
      case 'coins': {
        const amount=Number(value),balance=this.save.coins+amount;
        if(typeof value!=='string'||!value.trim()||!Number.isFinite(amount)||amount<=0||!Number.isInteger(amount)||!Number.isFinite(balance))return 'Enter a positive whole number.';
        this.save.coins=balance;message=`+${amount.toLocaleString()} coins`;break;
      }
      case 'unlimited-coins':this.save.unlimitedCoins=value===true;break;
      case 'unlock-cars':for(const car of CARS)this.save.ownedCars.add(car.id);message='All vehicles unlocked';break;
      case 'unlock-upgrades':this.unlockUpgrades();message='All upgrades unlocked';break;
      case 'unlock-all':for(const car of CARS)this.save.ownedCars.add(car.id);this.unlockUpgrades();message='Everything unlocked';break;
      case 'max-power': {
        this.unlockUpgrades();
        this.save.loadouts[this.save.selectedCar]={...this.save.loadout,engine:'engine-race',gearing:'gearing-long'};
        message='Maximum engine & gearing fitted';break;
      }
      case 'boost':this.infiniteBoost=value===true;break;
      case 'no-police':this.noPolice=value===true;break;
      case 'reset-car':this.onReset();message='Vehicle reset · wanted level cleared';break;
      case 'disable':this.save.unlimitedCoins=this.infiniteBoost=this.noPolice=false;message='Cheat toggles off';break;
      default:return 'Unknown action';
    }
    this.save.save();this.onChange();return message;
  }
  private unlockUpgrades(){for(const car of CARS)this.save.ownedUpgrades[car.id]=UPGRADES.map(part=>part.id);}
}
