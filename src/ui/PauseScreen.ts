const action=(id:string,title:string,subtitle:string,icon:string)=>`<button data-action="${id}" class="pause-tile"><span class="pause-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${subtitle}</small></span><b aria-hidden="true">↗</b></button>`;
export function pauseMarkup(){return `<section data-panel="pause" class="overlay pause-overlay" aria-labelledby="pause-title">
  <div class="pause-shell">
    <header class="pause-header"><span class="pause-brand">REDLINE <b>HORIZON</b></span><span class="pause-live"><i></i> SESSION PAUSED</span></header>
    <div class="pause-layout">
      <div class="pause-main"><span class="pause-kicker">TAKE A BREATHER</span><h2 id="pause-title">BACK IN<br><em>A SECOND.</em></h2><p>Your next corner is waiting.</p>
        <button data-action="resume" class="pause-resume"><span aria-hidden="true">▶</span> RESUME DRIVE <b aria-hidden="true">→</b></button>
        <div class="pause-session"><div><span>YOUR VEHICLE</span><strong id="pause-vehicle">VANTA R1</strong></div><div><span>SESSION</span><strong id="pause-session">OPEN WORLD</strong></div></div>
      </div>
      <nav class="pause-options" aria-label="Pause options">
        ${action('restart','Restart session','Start this drive again','↻')}
        ${action('recover','Return to road','Get back on the asphalt','↟')}
        ${action('activities','Routes & practice','Choose your next stretch','⌁')}
        ${action('race','Horizon Circuit','Head to the starting grid','⚑')}
        ${action('garage','Garage','Change your ride or setup','◇')}
        ${action('settings','Settings','Graphics, audio & assists','☷')}
      </nav>
    </div>
    <footer class="pause-footer"><button data-action="menu">← MAIN MENU</button><span class="pause-key"><kbd>ESC</kbd> TO RESUME</span><button data-action="controls">CONTROLS ↗</button></footer>
  </div>
</section>`;}
