import * as T from "three";
import { VehiclePhysics, R } from "../physics/VehiclePhysics";
import { Controls } from "../input/InputManager";
import { clamp, damp, lerp } from "../core/math";
export const cameraNames = [
  "CHASE",
  "WIDE CHASE",
  "BUMPER",
  "HOOD",
  "COCKPIT",
  "ORBIT",
  "FREE CAMERA",
];
export class CameraManager {
  mode = 0;
  orbitYaw = 0.6;
  orbitPitch = 0.21;
  distance = 8.5;
  photoFov = 50;
  roll = 0;
  drag = false;
  lastX = 0;
  lastY = 0;
  target = new T.Vector3();
  freePosition = new T.Vector3();
  freeYaw = 0;
  freePitch = 0;
  photo = false;
  private teleportSerial=-1;
  constructor(
    public camera: T.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    canvas.addEventListener("pointerdown", (e) => {
      if (this.photo || this.mode >= 5) {
        this.drag = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      this.orbitYaw -= (e.clientX - this.lastX) * 0.006;
      this.orbitPitch = clamp(
        this.orbitPitch + (e.clientY - this.lastY) * 0.004,
        -0.15,
        1.35,
      );
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    canvas.addEventListener("pointerup", () => (this.drag = false));
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.photo || this.mode >= 5) {
          this.distance = clamp(this.distance + e.deltaY * 0.01, 2.5, 40);
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }
  setMode(i: number) {
    this.mode = i % 7;
    if (this.mode === 6) {
      this.freePosition.copy(this.camera.position);
      this.orbitYaw = this.camera.rotation.y;
      this.orbitPitch = 0;
    }
  }
  update(
    dt: number,
    car: VehiclePhysics,
    visual: T.Object3D,
    state: string,
    t: number,
    input: Controls,
  ) {
    const q = visual.quaternion,
      forward = new T.Vector3(0, 0, -1).applyQuaternion(q),
      right = new T.Vector3(1, 0, 0).applyQuaternion(q),
      p = visual.position;
    let desired = new T.Vector3(),
      aim = new T.Vector3(),
      fov = 62,
      instant = this.teleportSerial!==car.teleportSerial;
    this.teleportSerial=car.teleportSerial;
    if (state === "menu" || state === "statistics" || state === "dev" || state === "garage") {
      const yaw =
          Math.atan2(-forward.x, -forward.z) +
          Math.PI * 0.84 +
          Math.sin(t * 0.07) * 0.16,
        d = state === "garage" ? 7.3 : 8.6;
      desired
        .copy(p)
        .add(new T.Vector3(Math.sin(yaw) * d, 2.2, Math.cos(yaw) * d));
      aim.copy(p).add(new T.Vector3(0, 0.1, 0));
      const screenRight = new T.Vector3().crossVectors(
        aim.clone().sub(desired).normalize(),
        new T.Vector3(0, 1, 0),
      );
      aim.addScaledVector(screenRight, state === "garage" ? -1.05 : -1.75);
      fov = 43;
      instant = true;
    } else if (this.photo || state === "photo" || this.mode === 5) {
      desired
        .copy(p)
        .add(
          new T.Vector3(
            Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch),
            Math.sin(this.orbitPitch),
            Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch),
          ).multiplyScalar(this.distance),
        );
      aim.copy(p);
      fov = this.photoFov;
      instant = true;
    } else if (this.mode === 6) {
      const f = new T.Vector3(
          -Math.sin(this.orbitYaw),
          0,
          -Math.cos(this.orbitYaw),
        ),
        r = new T.Vector3(Math.cos(this.orbitYaw), 0, -Math.sin(this.orbitYaw));
      this.freePosition
        .addScaledVector(f, (input.throttle - input.brake) * dt * 25)
        .addScaledVector(r, -input.steer * dt * 25);
      this.freePosition.y +=
        ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * dt * 18;
      desired.copy(this.freePosition);
      aim
        .copy(desired)
        .add(
          new T.Vector3(
            -Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch),
            -Math.sin(this.orbitPitch),
            -Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch),
          ),
        );
      instant = true;
    } else if (this.mode >= 2) {
      const positions = car.bike ? [[0,.15,-1.08],[0,.6,-.65],[0,1.40,-.26]] : car.spec.kit==="pickup" ? [[0,.25,-2.55],[0,.65,-1.55],[-.48,1.0,-.35]] : [
          [0, 0.1, -2.36],
          [0, 0.34, -1.33],
          [-0.44, 0.53, -0.06],
        ],
        a = positions[this.mode - 2];
      desired
        .copy(p)
        .add(
          new T.Vector3(...(a as [number, number, number])).applyQuaternion(q),
        );
      aim.copy(desired).addScaledVector(forward, 20);
      fov = this.mode === 4 ? 70 : 66;
      instant = true;
    } else {
      const distance = this.mode === 0 ? 7.3 + car.speed * 0.018 : 11;
      desired
        .copy(p)
        .addScaledVector(forward, -distance)
        .add(new T.Vector3(0, this.mode === 0 ? 2.45 : 3.9, 0));
      aim.copy(p).addScaledVector(forward, 7 + car.speed * 0.075);
      aim.y += 0.75;
      fov = lerp(62, 79, clamp(car.speed / 85, 0, 1));
      const from = p.clone().add(new T.Vector3(0, 0.55, 0)),
        dir = desired.clone().sub(from),
        length = dir.length();
      dir.normalize();
      const hit = car.physics.world.castRay(
        new R.Ray(from, dir),
        length,
        true,
        undefined,
        undefined,
        undefined,
        car.body,
      );
      if (hit)
        desired
          .copy(from)
          .addScaledVector(dir, Math.max(0.7, hit.timeOfImpact - 0.35));
    }
    this.camera.position.lerp(desired, instant ? 1 : 1 - Math.exp(-6.5 * dt));
    this.target.lerp(aim, instant ? 1 : 1 - Math.exp(-8 * dt));
    this.camera.lookAt(this.target);
    if (state === "photo") this.camera.rotateZ(this.roll);
    this.camera.fov = damp(this.camera.fov, fov, 8, dt);
    this.camera.updateProjectionMatrix();
  }
}
