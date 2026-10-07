// Lucide 1.8.0 icons, ISC/MIT license: licenses/LUCIDE.txt.
const icons: Record<string, string> = {
  exit: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  autopilot: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  photo: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  pause: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

/** One set of actions and event bindings, reflowed by the device-specific CSS. */
export const drivingBarMarkup = (wallet: string) => `<header class="topbar driving-bar">
  <nav class="driving-actions" aria-label="Driving controls">
    <button type="button" data-action="vehicle-toggle" id="vehicle-toggle" class="toolbar-action toolbar-exit" aria-label="Exit vehicle" aria-keyshortcuts="Shift">${icon('exit')}<span class="toolbar-label">EXIT</span><kbd>SHIFT</kbd></button>
    <button type="button" data-action="autopilot" id="autopilot-toggle" class="toolbar-action toolbar-auto" aria-label="Autopilot off" aria-keyshortcuts="F" aria-pressed="false">${icon('autopilot')}<span class="toolbar-auto-copy"><span class="toolbar-label">AUTOPILOT</span><span class="toolbar-status">OFF</span></span><kbd>F</kbd></button>
    <button type="button" data-action="photo" class="toolbar-action toolbar-photo" aria-label="Photo mode" aria-keyshortcuts="P">${icon('photo')}<span class="toolbar-label">PHOTO</span><kbd>P</kbd></button>
    <button type="button" data-action="map" class="toolbar-action toolbar-map" aria-label="Map" aria-keyshortcuts="M">${icon('map')}<span class="toolbar-label">MAP</span><kbd>M</kbd></button>
    <button type="button" data-action="pause" class="toolbar-action toolbar-pause" aria-label="Pause" aria-keyshortcuts="Escape">${icon('pause')}<span class="toolbar-pause-label">PAUSE</span><kbd>ESC</kbd></button>
  </nav>
  ${wallet}
</header>`;
