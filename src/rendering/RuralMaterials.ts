import * as T from 'three';
import {rng} from '../core/math';

function texture(pixels:Uint8Array,width:number,height:number,color=false){
  const t=new T.DataTexture(pixels,width,height,T.RGBAFormat);
  t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;
  t.generateMipmaps=true;t.anisotropy=8;t.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;t.needsUpdate=true;return t;
}
/** Baked once at startup: bounded texture memory, no downloads or frame-time drawing. */
export function asphaltMaterial(){
  const size=512,pixels=new Uint8Array(size*size*4),relief=new Uint8Array(pixels.length),random=rng(344);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,fine=random(),aggregate=random(),patch=Math.sin(x*.061+Math.sin(y*.035))*3;
    const value=Math.round(98+(fine-.5)*26+(aggregate>.92?19:aggregate<.07?-18:0)+patch);
    pixels[i]=value;pixels[i+1]=value;pixels[i+2]=value-1;pixels[i+3]=255;
    const h=Math.round(125+fine*75);relief[i]=relief[i+1]=relief[i+2]=h;relief[i+3]=255;
  }
  const albedo=texture(pixels,size,size,true),height=texture(relief,size,size);
  return new T.MeshPhysicalMaterial({name:'weathered-grey-asphalt',color:'#c1beb7',map:albedo,bumpMap:height,bumpScale:.012,roughness:.94,metalness:0,clearcoat:0});
}
export function dryFieldTexture(){
  const size=512,p=new Uint8Array(size*size*4),random=rng(719);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,v=Math.round(128+random()*60+Math.sin(x*.041+Math.sin(y*.067))*12);
    p[i]=p[i+1]=p[i+2]=v;p[i+3]=255;
  }
  // Short, irregular straw fragments rather than a flat noisy wash.
  for(let j=0;j<22000;j++){
    const x=Math.floor(random()*size),y=Math.floor(random()*size),length=5+Math.floor(random()*14),bend=random()*1.4-.7,v=60+Math.floor(random()*175);
    for(let k=0;k<length;k++)for(let w=0;w<2;w++){const px=(x+Math.round(k*bend)+w+size)%size,py=(y+k)%size,i=(py*size+px)*4;p[i]=p[i+1]=p[i+2]=v;}
  }
  return texture(p,size,size);
}
export function dryStoneMaterial(){
  const width=512,height=256,p=new Uint8Array(width*height*4),bump=new Uint8Array(p.length),random=rng(922);
  for(let i=0;i<p.length;i+=4){p[i]=37;p[i+1]=36;p[i+2]=30;p[i+3]=255;bump[i]=bump[i+1]=bump[i+2]=18;bump[i+3]=255;}
  // Irregular rubble courses, with narrower upright coping stones along the crown.
  const bands=[0,55,116,183,256];
  // A jittered stone tessellation breaks up straight masonry joints into rubble.
  const sites=Array.from({length:40},(_,i)=>({x:(i%10+.15+random()*.7)*51.2,y:(Math.floor(i/10)+.15+random()*.7)*45.75,tone:72+random()*37,moss:random()>.83}));
  for(let y=0;y<183;y++)for(let x=0;x<width;x++){
    const gx=Math.floor(x/51.2),gy=Math.floor(y/45.75);let first=Infinity,second=Infinity,stone=sites[0];
    for(let row=Math.max(0,gy-1);row<=Math.min(3,gy+1);row++)for(let col=gx-1;col<=gx+1;col++){
      const wrapped=(col+10)%10,s=sites[row*10+wrapped],dx=x-s.x-(col<0?-width:col>=10?width:0),dy=(y-s.y)*1.2,d=dx*dx+dy*dy;
      if(d<first){second=first;first=d;stone=s;}else if(d<second)second=d;
    }
    const joint=(Math.sqrt(second)-Math.sqrt(first))*.5;if(joint<1.05)continue;
    const bevel=Math.min(1,(joint-1.05)/2.2),grain=(random()-.5)*20,v=stone.tone*(.77+bevel*.23)+grain,i=(y*width+x)*4;
    p[i]=v*(stone.moss?.91:1);p[i+1]=v*(stone.moss?.95:.95);p[i+2]=v*.82;
    const relief=45+bevel*135+grain*.55;bump[i]=bump[i+1]=bump[i+2]=relief;
  }
  for(let row=3;row<4;row++){
    let x=-100+random()*70;
    while(x<width){
      const w=row===3?15+random()*18:27+random()*52,y0=bands[row]+Math.sin(x*.063+row)*7+random()*8,y1=bands[row+1]+Math.sin(x*.044+row*2)*9-2-random()*5;
      const pts=[[x+4,y0+3],[x+w*.4,y0],[x+w-4,y0+2],[x+w-1,y0+(y1-y0)*.4],[x+w-5,y1-2],[x+w*.5,y1],[x+3,y1-3],[x,y0+(y1-y0)*.6]];
      const tone=72+random()*37,moss=random()>.82;
      for(let py=Math.max(0,Math.floor(y0));py<Math.min(height,Math.ceil(y1));py++)for(let px=Math.floor(x);px<Math.ceil(x+w);px++){
        let inside=true,edge=100;
        for(let k=0;k<pts.length;k++){
          const a=pts[k],b=pts[(k+1)%pts.length],dx=b[0]-a[0],dy=b[1]-a[1],cross=dx*(py-a[1])-dy*(px-a[0]);
          if(cross<0){inside=false;break;}edge=Math.min(edge,cross/Math.hypot(dx,dy));
        }
        if(!inside)continue;
        const xx=(px%width+width)%width,i=(py*width+xx)*4,bevel=Math.min(1,edge/2),grain=(random()-.5)*19;
        const shade=.77+bevel*.23+(py-y0)/(y1-y0)*.12,v=tone*shade+grain;
        p[i]=v*(moss?.91:1);p[i+1]=v*(moss?.95:.95);p[i+2]=v*.82;
        const relief=45+bevel*135+grain*.55;bump[i]=bump[i+1]=bump[i+2]=relief;
      }
      x+=w+1+random()*2;
    }
  }
  return new T.MeshStandardMaterial({name:'rural-dry-stone-wall',map:texture(p,width,height,true),bumpMap:texture(bump,width,height),bumpScale:.065,roughness:.98,metalness:0});
}
