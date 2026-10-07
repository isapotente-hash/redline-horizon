import {renderSoundtrack} from './SoundtrackScore';
const worker=self as unknown as {onmessage:((event:MessageEvent<number>)=>void)|null;postMessage:(message:unknown,transfer:Transferable[])=>void};
worker.onmessage=event=>{
  const index=event.data,data=renderSoundtrack(index);
  worker.postMessage({index,...data},[data.left.buffer,data.right.buffer]);
};
