import {inviteURL,inviteCode,connectionQuality} from './Invites';
import {RACE_ROUTES} from "../racing/RouteCatalog";
import {RaceSettings,matchesClass} from "./LobbySettings";
import {carSpec} from "../vehicles/CarCatalog";
import { PLAYER_COLORS } from './Protocol';
import { RaceConnection } from './RaceConnection';

export class MultiplayerPanel {
  private status: HTMLElement;
  private code: HTMLElement;
  private host: HTMLButtonElement;
  private join: HTMLButtonElement;
  private start: HTMLButtonElement;
  private leave: HTMLButtonElement;
  private drive: HTMLButtonElement;
  private hud: HTMLElement;
  private roster: HTMLElement;
  private ghost:HTMLInputElement;
  private ghostHint:HTMLElement;
  private invite:HTMLInputElement;private reconnect:HTMLButtonElement;private readyButton:HTMLButtonElement;private selections:HTMLSelectElement[];
  input: HTMLInputElement;
  constructor(root: HTMLElement, private network: RaceConnection) {
    root.querySelector('.main-nav')!.insertAdjacentHTML('beforeend','<button data-action="mp-open">RACE VIA CODE <span>↗</span></button>');
    root.querySelector('[data-panel="pause"] .stack')!.insertAdjacentHTML('beforeend','<button data-action="mp-open">RACE VIA CODE <span>2–5 PLAYERS</span></button>');
    root.querySelector('.drive-ui')!.insertAdjacentHTML('beforeend','<button id="mp-hud" data-action="mp-open">RACE VIA CODE</button>');
    root.insertAdjacentHTML('beforeend',`<section data-panel="multiplayer" class="overlay" hidden><div class="panel mp-panel" role="dialog" aria-modal="true" aria-labelledby="mp-title"><div class="panel-head"><div><div class="eyebrow">2–5 PLAYERS</div><h2 id="mp-title">Race via code</h2></div><button data-action="mp-back" class="text-button">← BACK</button></div><div class="mp-options"><div><button id="mp-host" data-action="mp-host" class="primary">HOST RACE</button><div class="mp-code-wrap"><span>ROOM CODE</span><output id="mp-code" aria-label="Room code">— — — —</output></div></div><div><label for="mp-input">Room code</label><input id="mp-input" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" pattern="[A-Za-z]{4}" inputmode="text"><button id="mp-join" data-action="mp-join">CONNECT</button></div></div><div class="mp-invite" hidden><label>Invite link<input id="mp-invite" readonly aria-label="Race invite link"></label><button data-action="mp-copy" class="text-button">COPY LINK</button></div><button id="mp-reconnect" data-action="mp-reconnect" hidden>RECONNECT TO ROOM</button><div class="mp-rule"><label for="mp-ghost"><input type="checkbox" id="mp-ghost" checked><span>GHOST MODE </span></label><p id="mp-ghost-hint"></p></div><div class="lobby-settings"><label>Driver name<input id="mp-name" data-setting="driverName" maxlength="16" placeholder="Driver" autocomplete="nickname"></label><label>Weather<select id="mp-weather"><option value="clear">Dry</option><option value="rain">Wet</option><option value="fog">Fog</option></select></label><label>Route<select id="mp-route">${RACE_ROUTES.map(r=>`<option value="${r.id}">${r.name}</option>`).join("")}</select></label><label>Length<select id="mp-laps"><option value="1">1 lap / sprint</option><option value="3">3 laps</option></select></label><label>Vehicles<select id="mp-class"><option value="all">All vehicles</option><option value="cars">Cars only</option><option value="bikes">Bikes only</option><option value="road">Road / rally / utility</option></select></label><label>Start<select id="mp-rule"><option value="grid">Standing grid</option><option value="rolling">Rolling · 54 km/h</option></select></label></div><p id="mp-status" role="status" aria-live="polite"></p><ul id="mp-roster" class="mp-roster" aria-label="Room players"></ul><div class="mp-actions"><button id="mp-drive" data-action="mp-drive" hidden>DRIVE TOGETHER →</button><button id="mp-ready" data-action="mp-ready" hidden>READY ✓</button><button data-action="garage" class="text-button">VEHICLE</button><button id="mp-start" data-action="mp-start" class="primary" hidden>START RACE</button><button id="mp-leave" data-action="mp-leave" class="text-button" hidden>LEAVE ROOM</button></div><p class="mp-note">Internet required. Use the same version on every device.</p></div></section>`);
    const get=(id:string)=>root.querySelector<HTMLElement>('#'+id)!;
    this.invite=get('mp-invite') as HTMLInputElement;this.reconnect=get('mp-reconnect') as HTMLButtonElement;
    this.readyButton=get('mp-ready') as HTMLButtonElement;
    this.selections=['mp-route','mp-laps','mp-class','mp-rule','mp-weather'].map(id=>get(id) as HTMLSelectElement);
    for(const select of this.selections)select.addEventListener('change',()=>{
      const [route,laps,category,start,weather]=this.selections;
      const settings:RaceSettings={route:route.value as RaceSettings['route'],laps:route.value==='horizon'&&laps.value==='3'?3:1,vehicleClass:category.value as RaceSettings['vehicleClass'],startRule:start.value as RaceSettings['startRule'],weather:weather.value as RaceSettings['weather']};
      this.network.setRaceSettings(settings);this.refresh();
    });
    this.roster=get('mp-roster'); this.status=get('mp-status'); this.code=get('mp-code'); this.hud=get('mp-hud');
    this.host=get('mp-host') as HTMLButtonElement; this.join=get('mp-join') as HTMLButtonElement;
    this.start=get('mp-start') as HTMLButtonElement; this.leave=get('mp-leave') as HTMLButtonElement; this.drive=get('mp-drive') as HTMLButtonElement;
    this.ghost=get('mp-ghost') as HTMLInputElement;this.ghostHint=get('mp-ghost-hint');
    this.ghost.addEventListener('change',()=>{this.network.setGhost(this.ghost.checked);this.refresh();});
    this.input=get('mp-input') as HTMLInputElement;
    this.input.addEventListener('input',()=>{this.input.value=this.input.value.toUpperCase().replace(/[^A-Z]/g,'');});
    this.input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.join.click();}});
    const fromInvite=inviteCode(location.href);if(fromInvite)this.input.value=fromInvite;
    this.refresh();
  }
  refresh() {
    const n=this.network;
    this.invite.value=n.code?inviteURL(location.href,n.code):"";this.invite.closest<HTMLElement>(".mp-invite")!.hidden=!n.code;this.reconnect.hidden=n.host||!n.lastRoom||n.connected||n.busy;
    this.ghost.checked=n.ghost;
    this.ghost.disabled=n.busy||n.pendingRace||n.raceLocked||(!!n.code&&!n.host);
    this.ghostHint.textContent=(n.ghost?'Pass through players':'Player collisions on')+(n.code&&!n.host?' · Host controlled':'');
    this.status.textContent=n.status;
    this.status.hidden=!n.status;
    this.code.textContent=n.code||'— — — —';
    this.host.disabled=this.join.disabled=this.input.disabled=n.busy||!!n.code||n.connected;
    this.leave.hidden=!(n.busy||n.code||n.connected);
    this.start.hidden=!n.connected||!n.host;
    this.start.disabled=n.pendingRace||n.raceLocked||!n.raceReady;
    this.start.textContent=n.session?'REMATCH':'START RACE';
    const values=[n.raceSettings.route,String(n.raceSettings.laps),n.raceSettings.vehicleClass,n.raceSettings.startRule,n.raceSettings.weather||"clear"];
    this.selections.forEach((select,i)=>{select.value=values[i];select.disabled=n.busy||n.pendingRace||n.raceLocked||(!!n.code&&!n.host)||(i===1&&n.raceSettings.route!=='horizon');});
    this.readyButton.hidden=!n.connected;this.readyButton.disabled=n.pendingRace||n.raceLocked||!matchesClass(carSpec(n.localCar),n.raceSettings.vehicleClass);
    this.readyButton.textContent=!matchesClass(carSpec(n.localCar),n.raceSettings.vehicleClass)?'CHANGE VEHICLE':n.localReady?'READY ✓':'READY UP';
    this.readyButton.setAttribute('aria-pressed',String(n.localReady));
    this.drive.hidden=!n.connected;this.drive.disabled=n.pendingRace||n.raceLocked;
    this.hud.hidden=!n.code&&!n.connected;
    this.hud.textContent=n.connected?`ROOM ${n.code} · ${n.playerCount}/5 DRIVERS · ${n.latency} ms`:n.code?`ROOM ${n.code} · WAITING`:'RACE VIA CODE';
    this.roster.replaceChildren(...n.players.map(slot=>{const item=document.createElement('li');item.style.setProperty('--driver-color','#'+PLAYER_COLORS[slot].toString(16).padStart(6,'0'));const driver=n.drivers.get(slot);item.textContent=`${driver?.name||`Driver ${slot+1}`}${slot===0?' · HOST':''}${slot===n.slot?' · YOU':''} · ${carSpec(driver?.car||'vanta').name} · ${driver?.ready?'READY':'NOT READY'}${slot!==0?` · ${connectionQuality(driver?.latency||0)} ${driver?.latency||0} ms`:''}`;return item;}));
    this.roster.hidden=!n.code;

  }
}
