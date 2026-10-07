/** Optional asynchronous WebGL2 timing. Never waits for a GPU result. */
export class GpuTimer {
  private ext:{TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;
  private pending:WebGLQuery[]=[];
  private current:WebGLQuery|null=null;
  private measuredAt=0;
  private measured:number|null=null;
  constructor(private gl:WebGL2RenderingContext){this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');}
  begin(){
    if(!this.ext||this.gl.isContextLost())return;
    this.poll();
    if(this.pending.length>=4)return;
    this.current=this.gl.createQuery();
    if(this.current)this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.current);
  }
  end(){if(this.current&&this.ext){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.current);this.current=null;}}
  private poll(){
    if(!this.ext||!this.pending.length)return;
    if(this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)){this.reset();return;}
    const q=this.pending[0];
    if(!this.gl.getQueryParameter(q,this.gl.QUERY_RESULT_AVAILABLE))return;
    const ns=this.gl.getQueryParameter(q,this.gl.QUERY_RESULT);
    this.pending.shift();this.gl.deleteQuery(q);
    if(Number.isFinite(ns)&&ns>0){this.measured=ns/1e6;this.measuredAt=performance.now();}
  }
  get milliseconds(){return performance.now()-this.measuredAt<2000?this.measured:null;}
  reset(){for(const q of this.pending)this.gl.deleteQuery(q);this.pending.length=0;this.measured=null;this.measuredAt=0;}
}
