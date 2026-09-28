import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeCar } from "../src/vehicles/CarModel";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
class Reader {
  result: any;
  onloadend: (() => void) | null = null;
  async readAsArrayBuffer(blob: Blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob: Blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    this.onloadend?.();
  }
}
Object.assign(globalThis, { FileReader: Reader });
const directory = path.resolve("assets/cars");
await mkdir(directory, { recursive: true });
const exporter = new GLTFExporter();
for (const [name, hero, color] of [
  ["VANTA_R1", true, "#b81120"],
  ["traffic_sport", false, "#ccd1d2"],
] as const) {
  const car = makeCar(hero, color);
  car.root.updateMatrixWorld(true);
  const glb = await exporter.parseAsync(car.root, {
    binary: true,
    onlyVisible: false,
  });
  await writeFile(
    path.join(directory, name + ".glb"),
    Buffer.from(glb as ArrayBuffer),
  );
  console.log(name, Buffer.byteLength(glb as ArrayBuffer), "bytes");
}
