import {SaveManager} from "./SaveManager";
import {VehiclePhysics} from "../physics/VehiclePhysics";

/** Counts grounded forward travel, excluding resets, fast travel and free camera. */
export class DrivingRewards {
  private teleportSerial=-1;
  constructor(private save:SaveManager){}
  update(dt:number,car:VehiclePhysics,enabled:boolean) {
    const teleported=car.teleportSerial!==this.teleportSerial;
    this.teleportSerial=car.teleportSerial;
    if(!enabled||teleported||car.contacts<2||car.signedSpeed<=1||!Number.isFinite(dt)||dt<=0)return 0;
    const meters=Math.hypot(car.position.x-car.previousPosition.x,car.position.z-car.previousPosition.z);
    if(meters>Math.max(2,car.speed*dt*2))return 0;
    return this.save.addRewardDistance(meters);
  }
}
