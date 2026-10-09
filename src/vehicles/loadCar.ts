import {modelLoaded} from "../core/Loading";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import url from "../../assets/cars/VANTA_R1.glb?url";
import { CarVisual, addHeadlights } from "./CarModel";
export async function loadCar(): Promise<CarVisual> {
  const gltf = await new GLTFLoader().loadAsync(url,e=>modelLoaded(0,e)),
    root = (gltf.scene.getObjectByName("VANTA_R1") || gltf.scene) as T.Group;
  modelLoaded(0);
  const mats = new Map<string, T.Material>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        mats.set(m.name.replace(/\.\d+$/, ""), m);
    }
  });
  const paint = mats.get("paint") as T.MeshPhysicalMaterial,
    glass = mats.get("glass") as T.MeshPhysicalMaterial,
    alloy = mats.get("alloy") as T.MeshStandardMaterial,
    brake = mats.get("brake_led") as T.MeshStandardMaterial,
    head = mats.get("head_led") as T.MeshStandardMaterial;
  paint.metalness = .55;
  paint.roughness = .18;
  paint.clearcoat = 1;
  paint.clearcoatRoughness = .07;
  paint.envMapIntensity = 1.15;
  alloy.roughness = .24;
  glass.color.set('#24313b');
  glass.metalness=.05;glass.roughness=.09;glass.envMapIntensity=1.05;
  // Share each tunable material across glass panels and independently exported parts.
  root.traverse((o) => {
    if (o instanceof T.Mesh && !Array.isArray(o.material)) {
      const m = mats.get(o.material.name.replace(/\.\d+$/, ""));
      if (m) o.material = m;
    }
  });
  const car: CarVisual = {
    root,
    body: root.getObjectByName("body") as T.Group,
    steering: root.getObjectByName("steering_wheel")!,
    steers: ["FL", "FR", "RL", "RR"].map(
      (n) => root.getObjectByName("steer_" + n)!,
    ),
    wheels: ["FL", "FR", "RL", "RR"].map(
      (n) => root.getObjectByName("wheel_" + n)!,
    ),
    paint,
    glass,
    alloy,
    brake,
    head,
    lights: [],
  };
  addHeadlights(car);
  return car;
}
