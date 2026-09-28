import * as T from "three";
import { RoadNetwork, Road } from "./RoadNetwork";
import { VehiclePhysics } from "../physics/VehiclePhysics";

/** Small, non-solid pickups with simulation-time animation and cooldowns. */
export class BoostManager {
  root = new T.Group();
  pickups: { road: Road; d: number; offset: number; mesh: T.Group; position: T.Vector3; cooldown: number; phase: number }[] = [];
  private elapsed = 0;
  private delta = new T.Vector3();
  constructor(roads: RoadNetwork) {
    this.root.name = "Five-second boost orbs";
    const coreGeometry = new T.SphereGeometry(.5, 16, 12);
    const haloGeometry = new T.SphereGeometry(.75, 16, 12);
    const ringGeometry = new T.TorusGeometry(.85, .045, 6, 24);
    const coreMaterial = new T.MeshBasicMaterial({ color: 0x8cffff });
    const haloMaterial = new T.MeshBasicMaterial({ color: 0x16dfff, transparent: true, opacity: .18, depthWrite: false });
    const ringMaterial = new T.MeshBasicMaterial({ color: 0x27edff });
    for (const road of roads.roads) {
      let ordinal = 0;
      for (let d = 220; d < road.length - 60; d += 480) {
        const i = Math.min(road.samples.length - 2, Math.round(d / road.length * (road.samples.length - 1)));
        const sample = road.samples[i];
        // Alternate sides and lateral position so following one lane misses pickups.
        const offset = [-.28, .30, -.22, .24][ordinal++ % 4] * road.width;
        const position = sample.p.clone().addScaledVector(sample.r, offset);
        position.y += 1.1;
        const mesh = new T.Group();
        mesh.add(new T.Mesh(coreGeometry, coreMaterial), new T.Mesh(haloGeometry, haloMaterial), new T.Mesh(ringGeometry, ringMaterial));
        mesh.position.copy(position);
        this.root.add(mesh);
        this.pickups.push({road, d: sample.d, offset, mesh, position, cooldown: 0, phase: ordinal * 1.7});
      }
    }
  }
  update(dt: number, car: VehiclePhysics) {
    this.elapsed += dt;
    let pickedUp = false;
    for (const orb of this.pickups) {
      orb.cooldown = Math.max(0, orb.cooldown - dt);
      orb.mesh.visible = orb.cooldown === 0 && orb.position.distanceToSquared(car.position)<500**2;
      if(!orb.mesh.visible)continue;
      orb.mesh.position.y = orb.position.y + Math.sin(this.elapsed * 2.8 + orb.phase) * .14;
      orb.mesh.rotation.y = this.elapsed * 1.4 + orb.phase;
      if (orb.cooldown > 0 || car.contacts < 2 || car.signedSpeed < 1) continue;
      this.delta.copy(car.position).sub(orb.mesh.position);
      // A compact collection zone includes the car's half-width, never the whole lane.
      if (Math.abs(this.delta.y) < 1.6 && Math.hypot(this.delta.x, this.delta.z) < 1.35) {
        car.activateBoost();
        orb.cooldown = 12;
        orb.mesh.visible = false;
        pickedUp = true;
      }
    }
    return pickedUp;
  }
}
