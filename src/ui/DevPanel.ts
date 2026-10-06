import {DevTools} from '../core/DevTools';

export class DevPanel {
  private panel:HTMLElement;
  private password:HTMLInputElement;
  private form:HTMLFormElement;
  private content:HTMLElement;
  private error:HTMLElement;
  constructor(root:HTMLElement,private dev:DevTools){
    root.querySelector('.home-actions')!.insertAdjacentHTML('beforeend','<button data-action="dev-open" class="home-link"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 8h30v24H5Zm4 7 6 5-6 5m10 0h10"/></svg><span>DEV PANEL</span><b aria-hidden="true">↗</b></button>');
    root.insertAdjacentHTML('beforeend',`<section data-panel="dev" class="overlay" hidden>
      <div class="panel dev-panel" role="dialog" aria-modal="true" aria-labelledby="dev-title">
        <div class="panel-head"><h2 id="dev-title">Dev panel</h2><button data-action="dev-close" class="text-button">← BACK</button></div>
        <form id="dev-login">
          <label for="dev-password">Password</label>
          <input id="dev-password" type="password" inputmode="numeric" autocomplete="off" required aria-describedby="dev-error">
          <p id="dev-error" role="alert"></p><button class="primary" type="submit">UNLOCK</button>
        </form>
        <div id="dev-content" hidden>
          <div class="dev-wallet"><span>COINS</span><strong id="dev-balance"></strong></div>
          <div class="dev-grid">
            <section><h3>COINS</h3><form id="dev-coins-form"><label for="dev-amount">Amount</label><div class="dev-coin-input"><input id="dev-amount" type="number" min="1" step="1" value="10000" required><button type="submit">ADD</button></div></form>
              <label class="dev-toggle"><span>Unlimited coins</span><input id="dev-unlimited" type="checkbox" data-dev-toggle="unlimited-coins"></label>
            </section>
            <section><h3>GARAGE</h3><div class="stack"><button data-cheat="unlock-all" class="primary">UNLOCK EVERYTHING</button><button data-cheat="unlock-cars">ALL VEHICLES</button><button data-cheat="unlock-upgrades">ALL UPGRADES</button><button data-cheat="max-power">FIT MAX POWER</button></div></section>
            <section><h3>DRIVING</h3><label class="dev-toggle"><span>Unlimited boost</span><input id="dev-boost" type="checkbox" data-dev-toggle="boost"></label><label class="dev-toggle"><span>Disable police</span><input id="dev-police" type="checkbox" data-dev-toggle="no-police"></label><button data-cheat="reset-car">RESET CAR & CLEAR WANTED</button></section>
            <section><h3>SESSION</h3><div class="stack"><button data-cheat="disable">TURN OFF CHEAT TOGGLES</button><button id="dev-lock">LOCK PANEL</button></div><p class="dev-hint">Coins & unlocks save. Toggles reset on reload.</p></section>
          </div>
          <p id="dev-status" role="status" aria-live="polite"></p>
        </div>
      </div>
    </section>`);
    this.panel=root.querySelector('[data-panel="dev"]')!;
    this.password=this.panel.querySelector('#dev-password')!;
    this.form=this.panel.querySelector('#dev-login')!;
    this.content=this.panel.querySelector('#dev-content')!;
    this.error=this.panel.querySelector('#dev-error')!;
    this.form.addEventListener('submit',e=>{
      e.preventDefault();const accepted=this.dev.unlock(this.password.value);this.password.value='';
      this.password.setAttribute('aria-invalid',String(!accepted));
      this.error.textContent=accepted?'':'Incorrect password';
      if(!accepted){this.password.focus();return;}
      this.form.hidden=true;this.content.hidden=false;this.panel.classList.add('dev-unlocked');this.refresh();
      this.panel.querySelector<HTMLInputElement>('#dev-amount')!.focus();
    });
    this.panel.querySelector('#dev-coins-form')!.addEventListener('submit',e=>{e.preventDefault();this.run('coins',this.panel.querySelector<HTMLInputElement>('#dev-amount')!.value);});
    this.panel.addEventListener('click',e=>{
      const target=(e.target as HTMLElement).closest<HTMLElement>('[data-cheat]');
      if(target)this.run(target.dataset.cheat!);
    });
    this.panel.addEventListener('change',e=>{const input=e.target as HTMLInputElement;if(input.dataset.devToggle)this.run(input.dataset.devToggle,input.checked);});
    this.panel.querySelector('#dev-lock')!.addEventListener('click',()=>{this.lock();this.focus();});
    this.panel.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.panel.querySelector<HTMLButtonElement>('[data-action="dev-close"]')!.click();}
      if(e.key!=='Tab')return;
      const focusable=Array.from(this.panel.querySelectorAll<HTMLElement>('button,input')).filter(el=>el.getClientRects().length&&!el.hasAttribute('disabled'));
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
  }
  lock(){this.dev.lock();this.password.value='';this.password.removeAttribute('aria-invalid');this.form.hidden=false;this.content.hidden=true;this.error.textContent='';this.panel.classList.remove('dev-unlocked');this.panel.querySelector('#dev-status')!.textContent='';}
  focus(){this.password.focus();}
  private run(action:string,value?:string|boolean){this.panel.querySelector('#dev-status')!.textContent=this.dev.execute(action,value);this.refresh();}
  private refresh(){
    this.panel.querySelector('#dev-balance')!.textContent=this.dev.save.unlimitedCoins?'∞':this.dev.save.coins.toLocaleString();
    this.panel.querySelector<HTMLInputElement>('#dev-unlimited')!.checked=this.dev.save.unlimitedCoins;
    this.panel.querySelector<HTMLInputElement>('#dev-boost')!.checked=this.dev.infiniteBoost;
    this.panel.querySelector<HTMLInputElement>('#dev-police')!.checked=this.dev.noPolice;
  }
}
