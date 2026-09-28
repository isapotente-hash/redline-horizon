import { clamp, damp } from "../core/math";
export type Controls = {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  up: boolean;
  down: boolean;
};
export class InputManager {
  keys = new Set<string>();
  edges = new Set<string>();
  touch = new Set<string>();
  steer = 0;
  padName = "";
  private oldButtons: boolean[] = [];
  constructor() {
    addEventListener("keydown", (e) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      if (
        [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Tab",
          "ControlLeft",
          "ControlRight",
        ].includes(e.code)
      )
        e.preventDefault();
      if(e.altKey&&e.code==="Enter")e.preventDefault();
      if(e.ctrlKey && ["KeyW","KeyA","KeyS","KeyD","KeyR","KeyF","KeyQ","KeyE"].includes(e.code))e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.clear());
  }
  clear() {
    this.keys.clear();
    this.edges.clear();
    this.touch.clear();
    this.steer = 0;
  }
  take(k: string) {
    return this.edges.delete(k);
  }
  held(...ks: string[]) {
    return ks.some((k) => this.keys.has(k) || this.touch.has(k));
  }
  /** Camera keys never enter driving inputs or manual-assist override detection. */
  readCamera(): Controls {
    return {throttle:this.held("KeyI")?1:0,brake:this.held("KeyK")?1:0,steer:(this.held("KeyJ")?1:0)-(this.held("KeyL")?1:0),up:this.held("KeyO"),down:this.held("KeyU"),handbrake:false};
  }
  readFoot():Controls {
    return {throttle:this.held("KeyW","ArrowUp")?1:0,brake:this.held("KeyS","ArrowDown")?1:0,
      steer:(this.held("KeyA","ArrowLeft")?1:0)-(this.held("KeyD","ArrowRight")?1:0),handbrake:false,up:false,down:false};
  }
  read(dt: number): Controls {
    let steer =
        (this.held("KeyA", "ArrowLeft") ? 1 : 0) -
        (this.held("KeyD", "ArrowRight") ? 1 : 0),
      throttle = this.held("KeyW", "ArrowUp") ? 1 : 0,
      brake = this.held("KeyS", "ArrowDown") ? 1 : 0,
      handbrake = this.held("Space");
    const p = navigator.getGamepads?.()?.find((g) => g?.connected);
    if (p) {
      this.padName = p.id;
      const axis = p.axes[0] || 0;
      if (Math.abs(axis) > 0.12)
        steer = (-Math.sign(axis) * (Math.abs(axis) - 0.12)) / 0.88;
      throttle = Math.max(throttle, p.buttons[7]?.value || 0);
      brake = Math.max(brake, p.buttons[6]?.value || 0);
      handbrake ||= p.buttons[0]?.pressed || false;
      const codes: Record<number, string> = {
        2: "KeyR",
        3: "KeyC",
        4: "KeyQ",
        5: "KeyE",
        8: "KeyM",
        9: "Escape",
      };
      p.buttons.forEach((b, i) => {
        if (b.pressed && !this.oldButtons[i] && codes[i])
          this.edges.add(codes[i]);
        this.oldButtons[i] = b.pressed;
      });
    } else {this.padName = "";this.oldButtons.fill(false);}
    this.steer = damp(this.steer, clamp(steer, -1, 1), 8, dt);
    return {
      steer: this.steer,
      throttle,
      brake,
      handbrake,
      up: this.held("Space"),
      down: this.held("ControlLeft", "ControlRight"),
    };
  }
}
