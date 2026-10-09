import * as T from 'three';
import {rng,clamp} from '../core/math';

/** Periodic density baked once, replacing three noise octaves on every sky pixel. */
export function cloudDensity(){
  const size=256,data=new Uint8Array(size*size*4),random=rng(843),waves=Array.from({length:18},(_,i)=>({x:1+Math.floor(random()*8),y:1+Math.floor(random()*8),phase:random()*Math.PI*2,weight:1/(1+i*.3)}));
  const total=waves.reduce((n,w)=>n+w.weight,0);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let n=0;for(const w of waves)n+=Math.sin((x*w.x+y*w.y)/size*Math.PI*2+w.phase)*w.weight;
    const v=Math.round(clamp(.5+n/total*1.6,0,1)*255),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const t=new T.DataTexture(data,size,size);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}

/** Small HDR panorama: bright cloud reflections and a dark land horizon give
 * paint/glass shape without a second live scene render or cube-camera captures. */
export function reflectionPanorama(hour:number,weather:string){
  const width=512,height=256,data=new Float32Array(width*height*4);
  const elevation=Math.sin((hour-6)/12*Math.PI),day=clamp((elevation+.07)/.24,0,1),overcast=weather==='clear'?0:weather==='cloudy'?.65:.85;
  const sun=new T.Vector3(.62,elevation*.95,-.48).normalize();
  const sky=new T.Color('#428fc9'),horizon=new T.Color('#d7e2e5'),ground=new T.Color('#645b40'),white=new T.Color('#fff5dd'),sunset=new T.Color('#e2ad83'),color=new T.Color();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const theta=(y+.5)/height*Math.PI,phi=(x+.5)/width*Math.PI*2,up=Math.cos(theta),sx=-Math.sin(theta)*Math.cos(phi),sz=Math.sin(theta)*Math.sin(phi);
    const ridge=.025+Math.sin(phi*7)*.018+Math.sin(phi*19)*.008;
    if(up<ridge){color.copy(ground).multiplyScalar(.36+.38*Math.max(0,up+1));}
    else {
      color.copy(horizon).lerp(sky,Math.sqrt(Math.max(0,up))*(1-overcast*.8));
      const cloud=Math.sin(phi*5+up*19)+Math.sin(phi*11-up*31)*.5+Math.sin(phi*23+up*47)*.25;
      const cover=clamp((cloud-.25+overcast)*1.4,0,.93)*clamp(up*8,0,1);
      color.lerp(white,cover*.8);
      const dot=sx*sun.x+up*sun.y+sz*sun.z,glow=Math.pow(Math.max(0,dot),32)*.24,disc=Math.pow(Math.max(0,dot),1800)*8;
      color.r+=(glow+disc)*(1-overcast);color.g+=(glow*.8+disc*.9)*(1-overcast);color.b+=(glow*.5+disc*.65)*(1-overcast);
      if(elevation<.45)color.lerp(sunset,clamp((.45-elevation)*.8,0,.45)*(1-up));
    }
    color.multiplyScalar(.035+day*.965);const i=(y*width+x)*4;data[i]=color.r;data[i+1]=color.g;data[i+2]=color.b;data[i+3]=1;
  }
  const t=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);t.mapping=T.EquirectangularReflectionMapping;t.colorSpace=T.LinearSRGBColorSpace;t.needsUpdate=true;return t;
}
