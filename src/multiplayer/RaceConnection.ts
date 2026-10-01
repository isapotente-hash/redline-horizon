import {CARS,carSpec} from "../vehicles/CarCatalog";
import {RaceSettings,defaultRaceSettings,validRaceSettings,matchesClass} from "./LobbySettings";
import { PROTOCOL, ROOM_PREFIX, normalizeCode, validCode, roomCode, validPose, Pose, MAX_PLAYERS, validRoster, validSlot } from './Protocol';

type Handler = (...args: any[]) => void;
export interface DataLink {
  open: boolean; peer: string; bufferSize: number; metadata?: any;
  dataChannel?: { bufferedAmount: number };
  on(event: string, fn: Handler): void; send(data: unknown): void; close(): void;
}
export interface PeerClient {
  on(event: string, fn: Handler): void;
  connect(id: string, options: object): DataLink;
  destroy(): void;
}
export type PeerFactory = new (id?: string, options?: object) => PeerClient;
let library: Promise<PeerFactory> | undefined;
export function loadPeerJS(): Promise<PeerFactory> {
  const win = window as unknown as { Peer?: PeerFactory };
  if (win.Peer) return Promise.resolve(win.Peer);
  if (library) return library;
  library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
    script.async = true; script.crossOrigin = 'anonymous';
    let settled=false;
    const cleanup=()=>{clearTimeout(timer);script.onload=null;script.onerror=null;};
    const fail = () => { if(settled)return;settled=true;cleanup();script.remove();library=undefined;reject(new Error('Could not load multiplayer. Check your internet or try another network.')); };
    const timer = setTimeout(fail, 20000);
    script.onerror = fail;
    script.onload = () => { if(settled)return;if(!win.Peer){fail();return;}settled=true;cleanup();resolve(win.Peer); };
    document.head.append(script);
  });
  return library;
}


type Member = {link:DataLink; slot:number; ready:boolean; seen:number; deadline:number; seq:number; clock:boolean; latency:number};
type Proposal = {id:string; settings:RaceSettings; laps:number; expires:number; slots:number[]; ready:Set<number>};

/** Host-relayed star: up to four guests, no separate gameplay server. */
export class RaceConnection {
  host=false; code=''; connected=false; busy=false;
  ghost=true;
  raceSettings=defaultRaceSettings();private racePreference=defaultRaceSettings();settingsVersion=0;localCar="vanta";
  drivers=new Map<number,{ready:boolean;car:string}>([[0,{ready:true,car:"vanta"}]]);
  get raceReady(){return this.ready&&this.players.every(slot=>{const d=this.drivers.get(slot);return d?.ready&&matchesClass(carSpec(d.car),this.raceSettings.vehicleClass);});}
  get localReady(){return this.drivers.get(this.slot)?.ready??true;}
  prepareRace:(settings:RaceSettings)=>boolean|Promise<boolean>=()=>true;
  canRace:(settings:RaceSettings)=>boolean=()=>true;
  setCar(id:string){if(!CARS.some(c=>c.id===id))return;this.localCar=id;if(this.connected)this.setReady(false);}
  setReady(ready:boolean){
    if(!this.connected||this.pendingRace||this.raceLocked)return false;
    const accepted=ready&&this.canStart()&&matchesClass(carSpec(this.localCar),this.raceSettings.vehicleClass);
    this.drivers.set(this.slot,{ready:accepted,car:this.localCar});
    if(this.host)this.publishLobby();else {const m=this.members.values().next().value;if(m)this.transmit(m,{t:"lobby-ready",ready:accepted,car:this.localCar});}
    this.onChange();return accepted===ready;
  }
  setRaceSettings(settings:RaceSettings){
    if(!validRaceSettings(settings)||(this.code&&!this.host)||this.busy||this.pendingRace||this.raceLocked)return false;
    this.raceSettings=this.racePreference={...settings};this.settingsVersion++;
    for(const d of this.drivers.values())d.ready=false;
    if(this.host&&this.code){this.broadcast({t:"room-settings",ghost:this.ghost,settings:this.raceSettings,version:this.settingsVersion});this.publishLobby();}
    this.onChange();return true;
  }
  private publishLobby(){this.broadcast({t:"lobby",drivers:this.players.map(slot=>({slot,...this.drivers.get(slot)}))});this.onChange();}
  private ghostPreference=true;
  /** Only the room host may change the shared contact rule. */
  setGhost(value:boolean) {
    if(typeof value!=='boolean'||(this.code&&!this.host)||this.busy||this.pendingRace||this.raceLocked)return false;
    this.ghost=this.ghostPreference=value;
    if(this.host&&this.code)this.broadcast({t:'room-settings',ghost:value,settings:this.raceSettings,version:this.settingsVersion});
    this.onChange();return true;
  }
  status='';
  latency=0; clockOffset=0; session=''; pendingRace=false;
  slot=0; players:number[]=[0]; racers:number[]=[]; raceLocked=false;
  onChange:()=>void=()=>{};
  onConnected:()=>void=()=>{};
  onDisconnected:()=>void=()=>{};
  onRoster:(slots:number[])=>void=()=>{};
  onPose:(pose:Pose,slot:number)=>void=()=>{};
  onStart:(id:string,startAt:number,laps:number,settings:RaceSettings)=>void=()=>{};
  canStart:()=>boolean=()=>true;
  private peer?:PeerClient;
  private members=new Map<DataLink,Member>();
  private epoch=0; private deadline=0; private retries=0; private clockReady=false;
  private timer?:ReturnType<typeof setInterval>;
  private proposal?:Proposal;
  private lastSeq=new Map<number,number>();
  private finishedSlots=new Set<number>();
  private startSerial=0;
  get playerCount(){return this.players.length;}
  get ready(){return this.connected&&!this.busy&&Array.from(this.members.values()).every(m=>m.ready&&m.clock);}
  constructor(private loader=loadPeerJS,private now=Date.now){}
  private change(message:string){this.status=message;this.onChange();}
  async open(host:boolean,rawCode=''){
    const code=normalizeCode(rawCode);
    if(!host&&!validCode(code)){this.change('Enter exactly four letters, A–Z.');return;}
    this.leave(false);this.raceSettings=host?{...this.racePreference}:defaultRaceSettings();this.settingsVersion=JSON.stringify(this.raceSettings)===JSON.stringify(defaultRaceSettings())?0:1;this.ghost=host?this.ghostPreference:true;this.host=host;this.slot=host?0:-1;this.code=host?'':code;this.busy=true;
    const epoch=this.epoch;this.change('Loading multiplayer…');
    try{
      const Peer=await this.loader();if(epoch!==this.epoch)return;
      this.retries=0;this.create(Peer,epoch);
      this.timer=setInterval(()=>this.tick(),1000);
    }catch(error){if(epoch===this.epoch)this.fail(error instanceof Error?error.message:'Multiplayer is unavailable.');}
  }
  private create(Peer:PeerFactory,epoch:number){
    let code=this.code;
    if(this.host){do{code=roomCode(crypto.getRandomValues(new Uint8Array(16)));}while(!code);}
    const peer=this.peer=new Peer(this.host?ROOM_PREFIX+code:undefined,{secure:true,debug:0});
    this.deadline=this.now()+25000;
    const current=()=>epoch===this.epoch&&this.peer===peer;
    this.change(this.host?'Creating your room…':`Connecting to ${code}…`);
    peer.on('open',()=>{
      if(!current())return;
      if(this.host){this.code=code;this.busy=false;this.deadline=0;this.change('Waiting for players.');}
      else this.attach(peer.connect(ROOM_PREFIX+code,{reliable:true,serialization:'json',label:PROTOCOL,metadata:{protocol:PROTOCOL}}),0,epoch);
    });
    peer.on('connection',(link:DataLink)=>{
      if(!current()){link.close();return;}
      let reason='';
      if(!this.host||link.metadata?.protocol!==PROTOCOL)reason='version';
      else if(this.members.size>=MAX_PLAYERS-1)reason='full';
      else if(this.pendingRace||this.raceLocked)reason='racing';
      if(reason){
        const reject=()=>{try{link.send({t:'reject',reason});}catch{}setTimeout(()=>link.close(),250);};
        if(link.open)reject();else link.on('open',reject);
        link.on('error',()=>{});return;
      }
      let slot=1;while(Array.from(this.members.values()).some(m=>m.slot===slot))slot++;
      this.attach(link,slot,epoch);
    });
    peer.on('error',(error:{type?:string})=>{
      if(!current())return;
      if(error.type==='unavailable-id'&&this.host&&++this.retries<8){this.peer=undefined;peer.destroy();this.create(Peer,epoch);return;}
      if(this.connected&&(error.type==='network'||error.type==='server-error')){this.change('Room service interrupted; existing players remain connected.');return;}
      this.fail(error.type==='peer-unavailable'?'Room not found. Check the code and keep the host’s room open.':'Connection failed. Try again or another network; WebRTC may be blocked.');
    });
    peer.on('disconnected',()=>{if(current()&&!this.connected)this.fail('Room service disconnected. Host or connect again.');});
    peer.on('close',()=>{if(current())this.fail('Host room closed. You can keep playing solo.');});
  }
  private attach(link:DataLink,slot:number,epoch:number){
    const member:Member={link,slot,ready:false,seen:this.now(),deadline:this.now()+20000,seq:-1,clock:false,latency:0};
    this.members.set(link,member);
    const current=()=>epoch===this.epoch&&this.members.get(link)===member;
    const hello=()=>{if(current())this.transmit(member,{t:'hello',protocol:PROTOCOL,host:this.host});};
    link.on('open',hello);if(link.open)hello();
    link.on('data',(data:any)=>{if(current()&&data&&typeof data==='object')this.receive(member,data);});
    link.on('close',()=>{if(current())this.drop(member,'A driver disconnected. The remaining players can continue.');});
    link.on('error',()=>{if(current())this.drop(member,'A peer connection failed. Other drivers remain connected.');});
  }
  private receive(m:Member,data:any){
    if(data.t==='reject'&&!this.connected){
      this.fail(data.reason==='full'?'Room full · maximum five players.':data.reason==='racing'?'Race in progress. Join after everyone finishes.':'Use the same five-player Multiplayer edition on every device.');return;
    }
    if(data.t==='hello'){
      if(data.protocol!==PROTOCOL||data.host===this.host||typeof data.host!=='boolean'){this.drop(m,'Incompatible game version. Use the same five-player edition.');return;}
      if(!m.ready){
        m.ready=true;m.deadline=0;m.seen=this.now();this.deadline=0;this.busy=false;
        if(this.host){
          this.transmit(m,{t:'welcome',slot:m.slot});
          this.transmit(m,{t:'room-settings',ghost:this.ghost,settings:this.raceSettings,version:this.settingsVersion});
          this.updateHostRoster();
        }
        this.transmit(m,{t:'ping',at:this.now()});
      }
      return;
    }
    if(!m.ready)return;
    if(data.t==='welcome'&&!this.host&&validSlot(data.slot)&&data.slot!==0){this.slot=data.slot;return;}
    if(data.t==='roster'&&!this.host&&validRoster(data.slots)&&data.slots.includes(this.slot)){
      this.applyRoster(data.slots);return;
    }
    if(!this.host&&data.t==='room-settings'&&typeof data.ghost==='boolean'){
      this.ghost=data.ghost;
      if(validRaceSettings(data.settings)&&Number.isSafeInteger(data.version)&&data.version>=this.settingsVersion){
        const changed=data.version>this.settingsVersion;this.raceSettings={...data.settings};this.settingsVersion=data.version;
        if(changed)this.setReady(false);
      }
      this.onChange();return;
    }
    if(this.host&&data.t==='lobby-ready'&&typeof data.ready==='boolean'&&CARS.some(c=>c.id===data.car)&&!this.pendingRace&&!this.raceLocked){
      this.drivers.set(m.slot,{ready:data.ready&&matchesClass(carSpec(data.car),this.raceSettings.vehicleClass),car:data.car});this.publishLobby();return;
    }
    if(!this.host&&data.t==='lobby'&&Array.isArray(data.drivers)&&data.drivers.length===this.players.length&&new Set(data.drivers.map((d:any)=>d.slot)).size===this.players.length&&data.drivers.every((d:any)=>this.players.includes(d.slot)&&typeof d.ready==='boolean'&&CARS.some(c=>c.id===d.car))){
      this.drivers.clear();for(const d of data.drivers)this.drivers.set(d.slot,{ready:d.ready,car:d.car});this.onChange();return;
    }
    if(data.t==='ping' &&Number.isFinite(data.at)){
      m.seen=this.now();this.transmit(m,{t:'pong',at:data.at,now:this.now()});return;
    }
    if(data.t==='pong'&&Number.isFinite(data.at)&&Number.isFinite(data.now)){
      const rtt=this.now()-data.at;if(rtt<0||rtt>10000)return;
      m.seen=this.now();m.clock=true;m.latency=Math.round(rtt);
      this.latency=Math.max(0,...Array.from(this.members.values()).map(v=>v.latency));
      if(!this.host){const offset=data.now-(data.at+this.now())/2;this.clockOffset=this.clockReady?this.clockOffset*.7+offset*.3:offset;this.clockReady=true;}
      this.onChange();return;
    }
    if(this.host&&validPose(data)){
      if(data.seq<=m.seq)return;
      m.seq=data.seq;m.seen=this.now();this.acceptPose(data,m.slot);
      this.broadcast({t:'pose',slot:m.slot,pose:data},true,m);return;
    }
    if(!this.host&&data.t==='pose'&&validSlot(data.slot)&&data.slot!==this.slot&&this.players.includes(data.slot)&&validPose(data.pose)){
      if(data.pose.seq<=(this.lastSeq.get(data.slot)??-1))return;
      m.seen=this.now();this.lastSeq.set(data.slot,data.pose.seq);this.acceptPose(data.pose,data.slot);return;
    }
    if(!this.host&&data.t==='prepare'&&this.validRace(data)&&validRoster(data.slots)&&data.slots.includes(this.slot)){
      if(this.pendingRace||!this.canStart()||!this.canRace(data.settings)||!this.localReady||!this.ready){this.transmit(m,{t:'not-ready',id:data.id});return;}
      this.proposal={id:data.id,settings:{...data.settings},laps:data.laps,expires:this.now()+45000,slots:data.slots,ready:new Set()};
      this.pendingRace=true;this.change('Loading race route…');this.prepare(this.proposal,m);return;
    }
    if(this.host&&data.t==='not-ready'&&data.id===this.proposal?.id){this.cancelStart('A driver is not ready. Finish any police pursuit and try again.');return;}
    if(this.host&&data.t==='ready'&&data.id===this.proposal?.id){
      this.proposal!.ready.add(m.slot);this.commitProposal();
      return;
    }
    if(!this.host&&data.t==='cancel-start'&&data.id===this.proposal?.id){this.proposal=undefined;this.pendingRace=false;this.change('Race start canceled. The host can try again.');return;}
    if(!this.host&&data.t==='start'&&this.validRace(data)&&data.id===this.proposal?.id&&validRoster(data.slots)&&data.slots.includes(this.slot)&&Number.isFinite(data.at)){
      if(!this.canStart()){this.fail('Race canceled: finish the police pursuit before joining again.');return;}
      const local=data.at-this.clockOffset;
      if(local<this.now()-2000||local>this.now()+10000)return;
      this.start(data.id,local,data.laps,data.slots,data.settings);
    }
  }
  private acceptPose(pose:Pose,slot:number){
    if(pose.race===this.session&&pose.finished)this.finishedSlots.add(slot);
    this.onPose(pose,slot);this.checkFinished();
  }
  private checkFinished(){
    if(this.host&&this.raceLocked&&this.racers.every(slot=>!this.players.includes(slot)||this.finishedSlots.has(slot))){
      this.raceLocked=false;this.change('Race complete. The host can start another race; new friends can join.');
    }
  }
  private updateHostRoster(){
    const slots=[0,...Array.from(this.members.values()).filter(m=>m.ready).map(m=>m.slot)].sort((a,b)=>a-b);
    this.applyRoster(slots);this.broadcast({t:'roster',slots});this.publishLobby();this.checkFinished();
    if(slots.length<2){this.raceLocked=false;this.session='';this.racers=[];}
  }
  private applyRoster(slots:number[]){
    const before=this.connected;
    for(const old of this.players)if(!slots.includes(old))this.lastSeq.delete(old);
    this.players=[...slots];
    for(const slot of slots)if(!this.drivers.has(slot))this.drivers.set(slot,{ready:true,car:slot===this.slot?this.localCar:"vanta"});
    for(const slot of this.drivers.keys())if(!slots.includes(slot))this.drivers.delete(slot);this.connected=this.host?slots.length>1:slots.includes(this.slot)&&this.slot>0;
    this.onRoster(this.players);
    if(!before&&this.connected){this.onConnected();if(!this.host)this.setReady(true);}
    if(before&&!this.connected)this.onDisconnected();
    this.change(this.connected?`Connected · ${slots.length}/5 drivers in the room.`:'Waiting for players.');
  }
  private validRace(data:any){return typeof data.id==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(data.id)&&(data.laps===1||data.laps===3)&&validRaceSettings(data.settings)&&data.settings.laps===data.laps;}
  requestRace(laps:number){
    if(!this.host||!this.raceReady||this.raceLocked||this.pendingRace||!this.canStart())return;
    const id=`${this.code}-${this.now()}-${++this.startSerial}`;
    const settings={...this.raceSettings,laps:(this.raceSettings.route==="horizon"&&laps===3?3:1) as 1|3};if(!this.canRace(settings))return;
    this.proposal={id,settings,laps:settings.laps,expires:this.now()+45000,slots:[...this.players],ready:new Set()};
    this.pendingRace=true;
    this.broadcast({t:'prepare',id,laps:this.proposal.laps,settings,slots:this.proposal.slots});
    this.change('Loading race route for all drivers…');this.prepare(this.proposal);
  }
  private prepare(p:Proposal,member?:Member){
    const epoch=this.epoch;
    const complete=(ok:boolean)=>{
      if(epoch!==this.epoch||this.proposal!==p)return;
      if(!ok||!this.canStart()||!this.canRace(p.settings)){if(member)this.transmit(member,{t:'not-ready',id:p.id});else this.cancelStart('Race preparation failed. Check the vehicle class and try again.');return;}
      if(member)this.transmit(member,{t:'ready',id:p.id});else {p.ready.add(0);this.commitProposal();}
    };
    try{const result=this.prepareRace(p.settings);if(typeof result==='boolean')complete(result);else void result.then(complete,()=>complete(false));}catch{complete(false);}
  }
  private commitProposal(){
    const p=this.proposal;if(!p||!p.slots.every(slot=>p.ready.has(slot)))return;
    if(!this.canStart()){this.cancelStart('Finish the police pursuit before starting.');return;}
    const at=this.now()+4000;
    if(this.broadcast({t:'start',id:p.id,laps:p.laps,settings:p.settings,at,slots:p.slots}))this.start(p.id,at,p.laps,p.slots,p.settings);
    else this.cancelStart('A driver lost connection. Please try again.');
  }
  private start(id:string,at:number,laps:number,slots:number[],settings:RaceSettings){
    this.session=id;this.racers=[...slots];this.finishedSlots.clear();this.raceLocked=true;this.proposal=undefined;this.pendingRace=false;
    this.change(`Connected · ${slots.length}-player race · ${this.ghost?'ghost mode':'player contact on'}.`);this.onStart(id,at,laps,settings);
  }
  private cancelStart(message:string){
    const id=this.proposal?.id;this.proposal=undefined;this.pendingRace=false;
    if(this.host&&id)this.broadcast({t:'cancel-start',id});this.change(message);
  }
  private tick(){
    const now=this.now();
    if(this.deadline&&now>this.deadline){this.fail('Connection timed out. Check the code and internet; this network may block WebRTC.');return;}
    for(const m of this.members.values()){
      if((m.deadline&&now>m.deadline)||(m.ready&&now-m.seen>20000)){this.drop(m,'Connection timed out. Other drivers can continue.');continue;}
      if(m.ready)this.transmit(m,{t:'ping',at:now});
    }
    if(this.proposal&&now>this.proposal.expires)this.cancelStart('Race start timed out. The host can try again.');
  }
  private transmit(m:Member,data:unknown,state=false){
    if(!m.link.open||(state&&(m.link.bufferSize>0||(m.link.dataChannel?.bufferedAmount||0)>32768)))return false;
    try{m.link.send(data);return true;}catch{this.drop(m,'A driver lost connection. Other players can continue.');return false;}
  }
  private broadcast(data:unknown,state=false,except?:Member){
    let success=true;
    for(const m of this.members.values())if(m.ready&&m!==except)success=this.transmit(m,data,state)&&success;
    return success;
  }
  send(data:unknown,state=false):boolean{
    if(!this.connected)return false;
    if(this.host){
      if(state&&validPose(data)){if(data.race===this.session&&data.finished)this.finishedSlots.add(0);this.checkFinished();return this.broadcast({t:'pose',slot:0,pose:data},true);}
      return false;
    }
    const member=this.members.values().next().value as Member|undefined;
    return !!member&&this.transmit(member,data,state);
  }
  private drop(m:Member,message:string){
    if(!this.members.has(m.link))return;
    if(!this.host){this.fail(message+' Reconnect using the room code.');return;}
    this.members.delete(m.link);try{m.link.close();}catch{}
    if(this.proposal)this.cancelStart('A driver left before the start. Try again with the remaining drivers.');
    this.updateHostRoster();this.change(message);
  }
  private fail(message:string){this.leave(false);this.change(message);}
  leave(notify=true){
    const hadConnection=this.connected;this.epoch++;clearInterval(this.timer);this.timer=undefined;
    const members=Array.from(this.members.values()),peer=this.peer;this.members.clear();this.peer=undefined;
    this.connected=false;this.busy=false;this.ghost=true;this.host=false;this.code='';this.session='';this.pendingRace=false;this.raceLocked=false;
    this.proposal=undefined;this.settingsVersion=0;this.raceSettings=defaultRaceSettings();this.drivers.clear();this.drivers.set(0,{ready:true,car:this.localCar});this.players=[0];this.racers=[];this.slot=0;this.finishedSlots.clear();this.lastSeq.clear();
    this.clockReady=false;this.clockOffset=0;this.latency=0;this.deadline=0;
    for(const m of members)try{m.link.close();}catch{}try{peer?.destroy();}catch{}
    this.onRoster(this.players);if(hadConnection)this.onDisconnected();
    if(notify)this.change('Room closed. Single-player driving is ready.');
  }
}
