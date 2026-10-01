export class FrameDiagnostics{
 readonly frame=new Float32Array(120);readonly physics=new Float32Array(120);readonly render=new Float32Array(120);readonly cpu=new Float32Array(120);cursor=0;count=0;
 record(frame:number,physics:number,render:number,cpu=physics+render){const i=this.cursor;this.frame[i]=Math.min(250,Math.max(0,frame));this.physics[i]=Math.max(0,physics);this.render[i]=Math.max(0,render);this.cpu[i]=Math.max(0,cpu);this.cursor=(i+1)%120;this.count=Math.min(120,this.count+1);}
 averages(){let frame=0,physics=0,render=0,cpu=0;for(let i=0;i<this.count;i++){frame+=this.frame[i];physics+=this.physics[i];render+=this.render[i];cpu+=this.cpu[i];}const n=Math.max(1,this.count);return {frame:frame/n,physics:physics/n,render:render/n,cpu:cpu/n};}
}
