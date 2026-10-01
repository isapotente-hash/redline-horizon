/** Simulation-time rules: pausing cannot advance a chase or a penalty. */
export class PursuitRules {
  static readonly SPEED_TOLERANCE=20;
  active=false; warning=0; capture=0; escape=0; cooldown=0; impound=0;
  pursuitTime=0;
  get stage(){return this.active?(this.pursuitTime>=65?3:this.pursuitTime>=25?2:1):0;}
  tick(dt:number, speedKmh:number, limit:number, nearestCop:number, racing=false, intercepted=false,seen=nearestCop<=220):'start'|'caught'|'escaped'|undefined {
    this.cooldown=Math.max(0,this.cooldown-dt);this.impound=Math.max(0,this.impound-dt);
    if(racing){this.warning=0;return;}
    if(!this.active) {
      this.warning=limit>0 && speedKmh>limit+PursuitRules.SPEED_TOLERANCE && !this.cooldown && !this.impound ? this.warning+dt:0;
      if(this.warning>=1.5){this.active=true;this.warning=0;this.capture=this.escape=this.pursuitTime=0;return 'start';}
    } else {
      this.pursuitTime+=dt;
      this.capture=intercepted && nearestCop<8 && speedKmh<9 ? this.capture+dt:0;
      this.escape=!seen&&nearestCop>65 ? this.escape+dt:0;
      if(this.capture>=3)return 'caught';
      if(this.escape>=8){this.finish(false);return 'escaped';}
    }
  }
  finish(caught:boolean){this.active=false;this.warning=this.capture=this.escape=this.pursuitTime=0;this.cooldown=15;this.impound=caught?5:0;}
}
