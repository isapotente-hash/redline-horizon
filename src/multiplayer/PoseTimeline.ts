import * as T from 'three';
import {Pose} from './Protocol';

/** Sender-time interpolation, adaptive jitter buffering and bounded gap prediction. */
export class PoseTimeline {
  private queue:{pose:Pose;at:number}[]=[];
  private offset=0;private jitter=0;private interval=50;
  private transit:number[]=[];
  delay=100;
  visualA?:Pose;visualB?:Pose;visualAlpha=1;
  latest?:Pose;receivedAt=-Infinity;speed=0;
  private correction=new T.Vector3();private correctionRotation=new T.Quaternion();private correctedAt=0;
  private oldPosition=new T.Vector3();private oldRotation=new T.Quaternion();
  private nextPosition=new T.Vector3();private nextRotation=new T.Quaternion();
  private aPosition=new T.Vector3();private aRotation=new T.Quaternion();
  private bPosition=new T.Vector3();private bRotation=new T.Quaternion();
  private velocity=new T.Vector3();
  private renderTime(now:number){return now-this.offset-this.delay;}
  receive(pose:Pose,now:number){
    const previous=this.latest;
    if(previous&&pose.seq<=previous.seq)return false;
    const source=pose.sentAt??now,last=this.queue[this.queue.length-1];
    const gap=now-this.receivedAt,span=last?source-last.at:0;
    const distance=last?this.aPosition.fromArray(last.pose.p).distanceTo(this.bPosition.fromArray(pose.p)):0;
    const reset=!last||previous?.car!==pose.car||previous?.active!==pose.active||gap>750||span<=0||span>750||distance>Math.max(12,span*.14+4);
    if(!reset){
      this.evaluate(this.renderTime(now),this.oldPosition,this.oldRotation);
      this.applyCorrection(now,this.oldPosition,this.oldRotation);
      this.jitter+=.15*(Math.abs(gap-span)-this.jitter);
      this.interval+=.1*(Math.min(150,span/Math.max(1,pose.seq-previous!.seq))-this.interval);
      const target=T.MathUtils.clamp(this.interval+this.jitter*2,50,180);
      this.delay+=(target-this.delay)*(target>this.delay?.4:.06);
      // A rolling low-water mark also follows sustained route/clock changes;
      // one delayed packet must not move the whole playback timeline.
      this.transit.push(now-source);if(this.transit.length>32)this.transit.shift();
      const offset=Math.min(...this.transit);
      this.offset=offset<this.offset?offset:this.offset+(offset-this.offset)*.05;
    }else{
      this.queue.length=0;this.offset=now-source;this.jitter=0;this.interval=50;this.delay=100;
      this.transit=[this.offset];
      this.correction.set(0,0,0);this.correctionRotation.identity();
    }
    this.queue.push({pose,at:source});if(this.queue.length>12)this.queue.shift();
    this.latest=pose;this.receivedAt=now;this.speed=!reset?Math.min(140,distance/(span/1000)):0;
    if(!reset){
      this.evaluate(this.renderTime(now),this.nextPosition,this.nextRotation);
      this.correction.copy(this.oldPosition).sub(this.nextPosition);
      if(this.correction.length()>12){this.correction.set(0,0,0);this.correctionRotation.identity();}
      else this.correctionRotation.copy(this.nextRotation).invert().premultiply(this.oldRotation).normalize();
      this.correctedAt=now;
    }
    return true;
  }
  private evaluate(time:number,position:T.Vector3,rotation:T.Quaternion){
    const q=this.queue;
    let i=0;while(i<q.length-2&&q[i+1].at<time)i++;
    const a=q[i],b=q[i+1]??a;
    const span=Math.max(1,b.at-a.at),alpha=a===b?1:T.MathUtils.clamp((time-a.at)/span,0,1);
    position.fromArray(a.pose.p);this.bPosition.fromArray(b.pose.p);position.lerp(this.bPosition,alpha);
    rotation.fromArray(a.pose.q).normalize();this.bRotation.fromArray(b.pose.q).normalize();rotation.slerp(this.bRotation,alpha);
    if(time>b.at&&a!==b){
      // Predict for at most 120 ms, then hold. A long outage cannot propel a car forever.
      const ahead=Math.min(120,time-b.at)/1000;
      this.velocity.copy(this.bPosition).sub(this.aPosition.fromArray(a.pose.p)).multiplyScalar(1000/span).clampLength(0,140);
      const damping=1-Math.min(1,b.pose.brake)*ahead*4;
      position.addScaledVector(this.velocity,ahead*damping);
      const angle=this.aRotation.fromArray(a.pose.q).normalize().angleTo(this.bRotation);
      const extra=Math.min(ahead*1000/span,.25/Math.max(.001,angle));
      rotation.copy(this.aRotation).slerp(this.bRotation,1+extra).normalize();
    }
  }
  private applyCorrection(now:number,position:T.Vector3,rotation:T.Quaternion){
    const weight=Math.exp(-Math.max(0,now-this.correctedAt)/80);
    position.addScaledVector(this.correction,weight);
    this.nextRotation.identity().slerp(this.correctionRotation,weight);
    rotation.premultiply(this.nextRotation).normalize();
  }
  sample(now:number,position:T.Vector3,rotation:T.Quaternion,maxAge=5000){
    if(!this.latest?.active||!this.queue.length||now-this.receivedAt>maxAge)return false;
    this.evaluate(this.renderTime(now),position,rotation);this.applyCorrection(now,position,rotation);return true;
  }
  visualAt(now:number){
    const q=this.queue,time=this.renderTime(now);let i=0;
    while(i<q.length-2&&q[i+1].at<time)i++;
    const a=q[i],b=q[i+1]??a;this.visualA=a.pose;this.visualB=b.pose;this.visualAlpha=a===b?1:T.MathUtils.clamp((time-a.at)/Math.max(1,b.at-a.at),0,1);
  }
  reset(){this.queue.length=0;this.transit.length=0;this.latest=undefined;this.receivedAt=-Infinity;this.speed=0;this.delay=100;this.correction.set(0,0,0);this.correctionRotation.identity();}
}
