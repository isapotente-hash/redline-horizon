import {PROTOCOL} from './Protocol';

const LABEL = `${PROTOCOL}-movement`;

/** One unordered, non-retransmitting stream alongside PeerJS's reliable control stream. */
export class MovementChannel {
  private channel?: RTCDataChannel;
  private closed=false;
  private previous:RTCPeerConnection['ondatachannel'];
  constructor(private pc:RTCPeerConnection,private host:boolean,private receive:(data:unknown)=>void,private changed:()=>void) {
    // PeerJS 1.5.5 wraps every incoming channel; its bundled adapter also drops
    // listener capture options. Chain the property handler instead, forwarding
    // only control channels so PeerJS can never replace them with movement.
    this.previous=pc.ondatachannel;
    pc.ondatachannel=this.incoming;
  }
  private incoming=(event:RTCDataChannelEvent)=>{
    if(event.channel.label!==LABEL){this.previous?.call(this.pc,event);return;}
    if(this.closed||!this.host||this.channel&&this.channel.readyState!=='closed'||event.channel.ordered||event.channel.maxRetransmits!==0){event.channel.close();return;}
    this.attach(event.channel);
  };
  get ready(){return this.channel?.readyState==='open';}
  start(){
    if(this.closed||this.host||this.channel&&this.channel.readyState!=='closed')return;
    try{this.attach(this.pc.createDataChannel(LABEL,{ordered:false,maxRetransmits:0}));}catch{this.changed();}
  }
  private attach(channel:RTCDataChannel){
    this.channel=channel;
    channel.onopen=()=>this.changed();
    channel.onclose=()=>this.changed();
    channel.onerror=()=>this.changed();
    channel.onmessage=event=>{
      if(this.closed||this.channel!==channel||typeof event.data!=='string'||event.data.length>4096)return;
      try{this.receive(JSON.parse(event.data));}catch{/* Discard malformed movement packets. */}
    };
    if(this.ready)this.changed();
  }
  send(data:unknown){
    const channel=this.channel;
    // Never build a movement backlog. The next simulation update supersedes this one.
    if(!this.ready||!channel||channel.bufferedAmount>0)return false;
    try{channel.send(JSON.stringify(data));return true;}catch{return false;}
  }
  close(){
    this.closed=true;if(this.pc.ondatachannel===this.incoming)this.pc.ondatachannel=this.previous;
    const channel=this.channel;this.channel=undefined;
    if(channel){channel.onopen=channel.onclose=channel.onerror=channel.onmessage=null;channel.close();}
  }
}
