/** Original instrumental arrangements; no downloads or third-party recordings. */
export const SOUNDTRACK = [
  {name:'Neon Run',bpm:132,root:38,chords:[0,8,3,10],lead:[0,7,12,10,7,3,7,15],beat:'pulse'},
  {name:'Apex Chase',bpm:144,root:41,chords:[0,3,10,8],lead:[12,7,3,7,10,7,15,14],beat:'break'},
  {name:'Afterburn',bpm:138,root:45,chords:[0,10,8,3],lead:[0,12,7,15,10,7,3,7],beat:'pulse'},
] as const;

export function renderSoundtrack(index:number,sampleRate=22050,bars=16){
  const score=SOUNDTRACK[index%SOUNDTRACK.length],beat=60/score.bpm,duration=bars*4*beat;
  const left=new Float32Array(Math.ceil(duration*sampleRate)),right=new Float32Array(left.length);
  let seed=0x12456+index*977;
  const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
  const hz=(m:number)=>440*2**((m-69)/12),tau=Math.PI*2;
  function add(start:number,length:number,voice:(t:number,n:number)=>number,volume:number,pan=0){
    const begin=Math.floor(start*sampleRate),count=Math.floor(length*sampleRate),l=Math.sqrt((1-pan)/2)*volume,r=Math.sqrt((1+pan)/2)*volume;
    for(let n=0;n<count;n++){const value=voice(n/sampleRate,n),at=(begin+n)%left.length;left[at]+=value*l;right[at]+=value*r;}
  }
  const kick=(t:number)=>Math.sin(tau*(48*t+110*.032*(1-Math.exp(-t/.032))))*Math.exp(-t*15)+noise()*.14*Math.exp(-t*130);
  const snare=(t:number)=>noise()*Math.exp(-t*25)*.8+Math.sin(tau*185*t)*Math.exp(-t*35)*.3;
  const hat=(t:number)=>noise()*Math.exp(-t*95);
  for(let bar=0;bar<bars;bar++){
    const base=score.root+score.chords[Math.floor(bar/2)%4],barTime=bar*beat*4;
    for(let step=0;step<16;step++){
      const at=barTime+step*beat/4;
      const isKick=score.beat==='break'?[0,6,8,11].includes(step):step%4===0;
      if(isKick)add(at,.4,kick,.55);
      if(step===4||step===12)add(at,.23,snare,.35);
      if(step%2===0)add(at,.08,hat,step%4===2?.12:.065,step%4===2?.25:-.25);
      if(bar%4===3&&(step===14||step===15))add(at,.12,snare,.12,step===14?-.2:.2);
      if(step%2===0){const f=hz(base+(step===14?7:0)),len=beat*.42;add(at,len,t=>{
        const env=Math.min(1,t/.006)*Math.exp(-t*11),duck=1-.65*Math.exp(-t*30);
        return (Math.sin(tau*f*t)+.22*Math.sin(tau*f*2*t)+.09*Math.sin(tau*f*3*t))*env*duck;
      },.27);}
      if(bar%8>=2){const note=score.lead[(step+Math.floor(bar/4))%8],f=hz(base+24+note),len=beat*.42,pan=step%2?.35:-.35;
        const voice=(t:number)=>(Math.sin(tau*f*t)+.23*Math.sin(tau*f*2.002*t)+.11*Math.sin(tau*f*3*t))*Math.min(1,t/.005)*Math.exp(-t*14);
        add(at,len,voice,step%4===0?.12:.075,pan);add(at+beat*.75,len,voice,.026,-pan);
      }
    }
    for(const interval of [0,3,7]){const f=hz(base+12+interval),length=4*beat;
      add(barTime,length,t=>{const env=Math.sin(Math.PI*t/length)**2,duck=.45+.55*(1-Math.exp(-(t%beat)*16));return (Math.sin(tau*f*t)+.35*Math.sin(tau*f*1.004*t))*.5*env*duck;},.13,interval===0?-.55:.55);
    }
  }
  // Wrap delay tails into the loop and gently limit peaks without abrupt clipping.
  for(let n=0;n<left.length;n++){left[n]=.88*Math.tanh(left[n]*1.35);right[n]=.88*Math.tanh(right[n]*1.35);}
  return {left,right,sampleRate,duration:left.length/sampleRate};
}
