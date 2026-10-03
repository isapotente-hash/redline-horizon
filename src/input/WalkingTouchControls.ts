import { InputManager } from './InputManager';

/** Independent captured fingers for movement and look, installed only on mobile. */
export class WalkingTouchControls {
  private enabled = false;
  private movePointer = -1;
  private lookPointer = -1;
  private lastX = 0;
  private lastY = 0;
  private readonly events = new AbortController();
  constructor(private joystick: HTMLElement, private thumb: HTMLElement, private look: HTMLElement,
    private input: InputManager, onLook: (x: number, y: number) => void) {
    const signal = this.events.signal;
    joystick.addEventListener('pointerdown', e => {
      if (!this.enabled || e.pointerType !== 'touch' || this.movePointer !== -1) return;
      e.preventDefault(); this.movePointer = e.pointerId;
      joystick.setPointerCapture(e.pointerId); this.move(e.clientX, e.clientY);
    }, {signal});
    joystick.addEventListener('pointermove', e => {
      if (this.enabled && e.pointerId === this.movePointer) {e.preventDefault(); this.move(e.clientX, e.clientY);}
    }, {signal});
    look.addEventListener('pointerdown', e => {
      if (!this.enabled || e.pointerType !== 'touch' || this.lookPointer !== -1) return;
      e.preventDefault(); this.lookPointer = e.pointerId; this.lastX = e.clientX; this.lastY = e.clientY;
      look.setPointerCapture(e.pointerId);
    }, {signal});
    look.addEventListener('pointermove', e => {
      if (!this.enabled || e.pointerId !== this.lookPointer) return;
      e.preventDefault(); onLook(e.clientX - this.lastX, e.clientY - this.lastY);
      this.lastX = e.clientX; this.lastY = e.clientY;
    }, {signal});
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      joystick.addEventListener(event, e => {if ((e as PointerEvent).pointerId === this.movePointer) this.resetMove();}, {signal});
      look.addEventListener(event, e => {if ((e as PointerEvent).pointerId === this.lookPointer) this.resetLook();}, {signal});
    }
    addEventListener('blur', () => this.reset(), {signal});
    document.addEventListener('visibilitychange', () => {if (document.hidden) this.reset();}, {signal});
  }
  private move(clientX: number, clientY: number) {
    const rect = this.joystick.getBoundingClientRect(), radius = rect.width * .35;
    const x = (clientX - rect.left - rect.width / 2) / radius, y = (clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y), scale = length > .12 ? Math.min(1, (length - .12) / .88) / length : 0;
    this.input.setFootMovement(-y * scale, x * scale);
    const visual = 1 / Math.max(1, length);
    this.thumb.style.transform = `translate(${x * visual * radius}px, ${y * visual * radius}px)`;
  }
  private resetMove() {
    const pointer = this.movePointer; this.movePointer = -1;
    this.input.setFootMovement(0, 0); this.thumb.style.transform = '';
    if (pointer !== -1 && this.joystick.hasPointerCapture(pointer)) this.joystick.releasePointerCapture(pointer);
  }
  private resetLook() {
    const pointer = this.lookPointer; this.lookPointer = -1;
    if (pointer !== -1 && this.look.hasPointerCapture(pointer)) this.look.releasePointerCapture(pointer);
  }
  private reset() {this.resetMove(); this.resetLook();}
  setEnabled(enabled: boolean) {this.enabled = enabled; if (!enabled) this.reset();}
  dispose() {this.setEnabled(false); this.events.abort();}
}
