import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export type CarVisual = {
  root: T.Group;
  body: T.Group;
  steers: T.Object3D[];
  wheels: T.Object3D[];
  steering: T.Object3D;
  paint: T.MeshPhysicalMaterial;
  alloy: T.MeshStandardMaterial;
  glass: T.MeshPhysicalMaterial;
  brake: T.MeshStandardMaterial;
  head: T.MeshStandardMaterial;
  lights: T.SpotLight[];
};
export function makeCar(hero = true, color = "#b81120"): CarVisual {
  const root = new T.Group();
  root.name = hero ? "VANTA_R1" : "VANTA_TRAFFIC";
  const body = new T.Group();
  body.name = "body";
  root.add(body);
  const paint = new T.MeshPhysicalMaterial({
    name: "paint",
    color,
    metalness: 0.68,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.075,
  });
  const alloy = new T.MeshStandardMaterial({
      name: "alloy",
      color: "#92989e",
      metalness: 0.92,
      roughness: 0.22,
    }),
    glass = new T.MeshPhysicalMaterial({
      name: "glass",
      color: "#11202a",
      metalness: 0.25,
      roughness: 0.09,
      transparent: true,
      opacity: 0.83,
      clearcoat: 1,
    });
  const carbon = new T.MeshStandardMaterial({
      name: "carbon",
      color: "#101318",
      metalness: 0.2,
      roughness: 0.38,
    }),
    rubber = new T.MeshStandardMaterial({
      name: "rubber",
      color: "#131519",
      roughness: 0.85,
    }),
    interior = new T.MeshStandardMaterial({
      name: "interior",
      color: "#15181c",
      roughness: 0.8,
    }),
    red = new T.MeshStandardMaterial({
      name: "caliper",
      color: "#bb121b",
      metalness: 0.4,
      roughness: 0.3,
    });
  const brake = new T.MeshStandardMaterial({
      name: "brake_led",
      color: "#fa1829",
      emissive: "#ff0514",
      emissiveIntensity: 0.7,
    }),
    head = new T.MeshStandardMaterial({
      name: "head_led",
      color: "#d8efff",
      emissive: "#d8efff",
      emissiveIntensity: 2.4,
    });
  function mesh(g: T.BufferGeometry, m: T.Material, p: T.Object3D = body) {
    const o = new T.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    p.add(o);
    return o;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: T.Material = paint,
    p: T.Object3D = body,
    r = 0.02,
  ) {
    const o = mesh(
      hero && r > 0
        ? new RoundedBoxGeometry(w, h, d, 2, r)
        : new T.BoxGeometry(w, h, d),
      m,
      p,
    );
    o.position.set(x, y, z);
    return o;
  }
  function panel(points: number[][], m: T.Material, p: T.Object3D = body) {
    const g = new T.BufferGeometry(),
      verts: number[] = [];
    for (let i = 1; i < points.length - 1; i++)
      verts.push(...points[0], ...points[i], ...points[i + 1]);
    g.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    const mm = m.clone();
    mm.side = T.DoubleSide;
    mm.name = m.name;
    return mesh(g, mm, p);
  }
  function tube(
    points: number[][],
    radius: number,
    m: T.Material,
    p: T.Object3D = body,
  ) {
    return mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(
          points.map((a) => new T.Vector3(...(a as [number, number, number]))),
        ),
        hero ? 24 : 8,
        radius,
        5,
        false,
      ),
      m,
      p,
    );
  }
  const width = (z: number) =>
      0.77 +
      0.29 *
        Math.pow(Math.max(0, Math.sin((Math.PI * (z + 2.42)) / 4.76)), 0.3),
    height = (z: number) =>
      0.62 +
      0.12 * Math.sin((Math.PI * (z + 2.42)) / 4.76) +
      0.06 * Math.exp(-(((z - 1.4) / 0.6) ** 2));
  const vertices: number[] = [],
    indices: number[] = [],
    N = hero ? 96 : 24,
    M = hero ? 20 : 8;
  for (let j = 0; j <= N; j++) {
    const z = -2.42 + (j / N) * 4.76,
      d = Math.min(Math.abs(z + 1.43), Math.abs(z - 1.43));
    for (let i = 0; i <= M; i++) {
      const u = (i / M) * 2 - 1,
        lift = 0.105 * Math.exp(-((d / 0.68) ** 2)) * Math.abs(u) ** 3;
      vertices.push(
        u * width(z),
        height(z) - 0.12 * Math.abs(u) ** 4 + 0.06 * Math.abs(u) ** 12 + lift,
        z,
      );
    }
  }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < M; i++) {
      const a = j * (M + 1) + i;
      indices.push(a, a + M + 1, a + 1, a + 1, a + M + 1, a + M + 2);
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  mesh(geo, paint);
  // End caps meet the exact hood/deck edge; the shell has no open nose or tail.
  for(const j of [0,N]) {
    const ps:number[]=[],ix:number[]=[];
    for(let i=0;i<=M;i++){const k=(j*(M+1)+i)*3;ps.push(vertices[k],vertices[k+1],vertices[k+2],vertices[k],.28,vertices[k+2]);}
    for(let i=0;i<M;i++){const a=i*2;if(j===0)ix.push(a,a+2,a+1,a+1,a+2,a+3);else ix.push(a,a+1,a+2,a+1,a+3,a+2);}
    const cap=new T.BufferGeometry();cap.setAttribute('position',new T.Float32BufferAttribute(ps,3));cap.setIndex(ix);cap.computeVertexNormals();mesh(cap,paint);
  }
  box(1.44,.05,4.70,0,.28,-.04,carbon);
  const lining=carbon.clone();lining.side=T.DoubleSide;
  for(const x of [-.78,.78])for(const z of [-1.43,1.43]) {
    const backing=mesh(new T.CylinderGeometry(.32,.32,.025,hero?32:16),lining);
    backing.rotation.z=Math.PI/2;backing.position.set(x,.365,z);
  }
  // Opaque cabin lining and painted sills hide daylight beneath the glass.
  for(const side of [-1,1])box(.08,.16,2.56,side*.80,.755,.15,paint);
  for(const side of [-1,1]){
    tube([[side*.83,.81,-1.12],[side*.84,.81,1.45]],.028,paint);
  }
  for (const s of [-1, 1]) {
    const ps: number[] = [],
      is: number[] = [];
    for (let j = 0; j <= N; j++) {
      const z = -2.42 + (j / N) * 4.76,
        d = Math.min(Math.abs(z + 1.43), Math.abs(z - 1.43)),
        top = height(z) - 0.06 + 0.105 * Math.exp(-((d / 0.68) ** 2)),
        bottom = d < 0.41 ? 0.365 + Math.sqrt(0.41 * 0.41 - d * d) : 0.28;
      ps.push(
        s * width(z),
        top,
        z,
        s * (width(z) - 0.03),
        Math.min(top - 0.01, bottom),
        z,
      );
    }
    for (let j = 0; j < N; j++) {
      const a = j * 2;
      if (s === 1) is.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else is.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(ps, 3));
    g.setIndex(is);
    g.computeVertexNormals();
    mesh(g, paint);
    box(0.075, 0.09, 1.9, s * 1.01, 0.265, 0, carbon);
    box(0.07, 0.028, 0.17, s * 0.975, 0.69, 0.15, alloy);
    box(0.23, 0.09, 0.28, s * 1.015, 0.91, -0.64, paint);
    box(0.02, 0.06, 0.21, s * 1.132, 0.919, -0.61, glass);
    panel(
      [
        [s * 0.88, 0.73, 0.53],
        [s * 0.99, 0.64, 0.82],
        [s * 0.985, 0.38, 0.89],
        [s * 0.94, 0.42, 0.52],
      ],
      carbon,
    );
    for (let j = 0; j < 3; j++)
      box(0.026, 0.018, 0.3, s * 0.991, 0.44 + j * 0.065, 0.74, alloy);
    tube(
      [
        [s * 0.87, 0.82, -0.96],
        [s * 0.976, 0.73, -0.78],
        [s * 1.01, 0.35, -0.6],
        [s * 1.017, 0.33, 0.42],
        [s * 0.986, 0.69, 0.43],
      ],
      0.004,
      carbon,
    );
    panel(
      [
        [s * 0.815, 0.81, -1.09],
        [s * 0.65, 1.21, -0.48],
        [s * 0.64, 1.2, 0.64],
        [s * 0.835, 0.82, 1.37],
      ],
      glass,
    );
    tube(
      [
        [s * 0.84, 0.81, -1.12],
        [s * 0.66, 1.22, -0.48],
        [s * 0.65, 1.23, 0.64],
        [s * 0.85, 0.81, 1.44],
      ],
      0.029,
      paint,
    );
  }
  box(1.31, 0.055, 1.12, 0, 1.235, 0.08, paint, body, 0.028);
  panel(
    [
      [-0.82, 0.81, -1.12],
      [0.82, 0.81, -1.12],
      [0.65, 1.215, -0.48],
      [-0.65, 1.215, -0.48],
    ],
    glass,
  );
  panel(
    [
      [-0.65, 1.22, 0.64],
      [0.65, 1.22, 0.64],
      [0.835, 0.82, 1.45],
      [-0.835, 0.82, 1.45],
    ],
    glass,
  );
  box(1.79, 0.18, 0.14, 0, 0.48, -2.33);
  box(1.89, 0.065, 0.28, 0, 0.27, -2.25, carbon);
  box(0.75, 0.12, 0.04, 0, 0.46, -2.414, carbon);
  for (const s of [-1, 1]) {
    box(0.32, 0.13, 0.06, s * 0.66, 0.46, -2.36, carbon);
    const led = box(0.44, 0.026, 0.08, s * 0.63, 0.705, -2.14, head);
    led.rotation.y = s * -0.18;
    box(0.39, 0.03, 0.12, s * 0.63, 0.653, -2.17, carbon);
    for (let j = 0; j < 3; j++)
      box(0.027, 0.08, 0.05, s * 0.66 + (j - 1) * 0.073, 0.46, -2.4, carbon);
  }
  const badge = box(0.05, 0.028, 0.09, 0, 0.68, -2.05, alloy);
  badge.rotation.y = 0.18;
  box(1.79, 0.2, 0.18, 0, 0.49, 2.28);
  box(1.75, 0.12, 0.3, 0, 0.27, 2.18, carbon);
  box(1.83, 0.035, 0.2, 0, 0.875, 2.1, carbon);
  for (const s of [-1, 1]) {
    for (let j = 0; j < 2; j++)
      box(0.62, 0.02, 0.035, s * 0.5, 0.65 + j * 0.058, 2.343, brake);
    box(0.06, 0.1, 0.08, s * 0.64, 0.81, 2.08, carbon);
    for (let j = 0; j < 2; j++) {
      const o = mesh(new T.CylinderGeometry(0.057, 0.06, 0.17, 12), alloy);
      o.rotation.x = Math.PI / 2;
      o.position.set(s * (0.65 + j * 0.14), 0.31, 2.3);
      const inner = mesh(new T.CircleGeometry(0.043, 12), carbon);
      inner.position.set(o.position.x, 0.31, 2.391);
    }
  }
  for (let j = 0; j < 7; j++)
    box(0.025, 0.13, 0.38, -0.6 + j * 0.2, 0.25, 2.15, carbon);
  for (let j = 0; j < 5; j++)
    box(1.2, 0.012, 0.024, 0, 0.827, 1.57 + j * 0.072, carbon);
  box(1.7, 0.11, 1.65, 0, 0.26, 0.1, interior);
  box(1.6, 0.16, 0.37, 0, 0.75, -0.72, interior);
  box(0.22, 0.16, 0.98, 0, 0.5, 0.1, carbon);
  for (const s of [-1, 1]) {
    box(0.47, 0.12, 0.5, s * 0.44, 0.42, 0.24, interior);
    const seat = box(0.43, 0.64, 0.15, s * 0.44, 0.72, 0.51, interior);
    seat.rotation.x = -0.13;
    box(0.24, 0.2, 0.13, s * 0.44, 1.03, 0.55, interior);
    for (const x of [-0.2, 0.2])
      box(0.025, 0.5, 0.05, s * 0.44 + x, 0.73, 0.39, red);
  }
  box(
    0.29,
    0.13,
    0.015,
    -0.44,
    0.87,
    -0.542,
    new T.MeshStandardMaterial({
      color: "#183a4a",
      emissive: "#33a6bf",
      emissiveIntensity: 0.3,
    }),
  );
  const steering = new T.Group();
  steering.name = "steering_wheel";
  steering.position.set(-0.44, 0.79, -0.35);
  steering.rotation.x = -0.28;
  body.add(steering);
  mesh(new T.TorusGeometry(0.16, 0.019, 8, 24), carbon, steering);
  box(0.26, 0.025, 0.026, 0, 0, 0, alloy, steering);
  box(0.027, 0.13, 0.025, 0, -0.07, 0, carbon, steering);
  box(0.085, 0.067, 0.035, 0, 0, 0.015, paint, steering);
  const steers: T.Object3D[] = [],
    wheels: T.Object3D[] = [],
    names = ["FL", "FR", "RL", "RR"];
  for (let i = 0; i < 4; i++) {
    const s = i % 2 === 0 ? -1 : 1,
      front = i < 2,
      pivot = new T.Group();
    pivot.name = "steer_" + names[i];
    pivot.position.set(s * (front ? 0.95 : 0.97), 0.365, front ? -1.43 : 1.43);
    root.add(pivot);
    steers.push(pivot);
    const wheel = new T.Group();
    wheel.name = "wheel_" + names[i];
    pivot.add(wheel);
    wheels.push(wheel);
    const tire = mesh(
      new T.TorusGeometry(0.277, 0.088, hero ? 12 : 8, hero ? 48 : 20),
      rubber,
      wheel,
    );
    tire.rotation.y = Math.PI / 2;
    tire.scale.z = 1.58;
    const barrel = mesh(
      new T.CylinderGeometry(0.246, 0.246, 0.2, hero ? 40 : 20),
      alloy,
      wheel,
    );
    barrel.rotation.z = Math.PI / 2;
    const disk = mesh(
      new T.CylinderGeometry(0.205, 0.205, 0.02, hero ? 36 : 18),
      new T.MeshStandardMaterial({
        name: "rotor",
        color: "#62666b",
        metalness: 0.87,
        roughness: 0.42,
      }),
      wheel,
    );
    disk.rotation.z = Math.PI / 2;
    disk.position.x = s * 0.103;
    for (const face of [-1, 1]) {
      const lip = mesh(
        new T.TorusGeometry(0.238, 0.011, 6, hero ? 48 : 20),
        alloy,
        wheel,
      );
      lip.rotation.y = Math.PI / 2;
      lip.position.x = face * 0.126;
      for (let j = 0; j < (hero ? 10 : 5); j++) {
        const a = (j / (hero ? 10 : 5)) * Math.PI * 2,
          o = box(
            0.025,
            0.21,
            0.027,
            face * 0.132,
            Math.cos(a) * 0.125,
            Math.sin(a) * 0.125,
            alloy,
            wheel,
            0.004,
          );
        o.rotation.x = a;
      }
      const hub = mesh(
        new T.CylinderGeometry(0.051, 0.051, 0.018, 12),
        alloy,
        wheel,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = face * 0.137;
    }
    if (hero) {
      box(0.065, 0.15, 0.083, s * 0.12, 0.07, 0.155, red, pivot);
      for (let j = 0; j < 40; j++) {
        const a = (j / 40) * Math.PI * 2,
          o = box(
            0.2,
            0.007,
            0.012,
            0,
            Math.cos(a) * 0.364,
            Math.sin(a) * 0.364,
            carbon,
            wheel,
            0,
          );
        o.rotation.x = a;
      }
    }
  }
  // Merge only static meshes. Wheel, suspension and steering pivots remain editable.
  function batch(group: T.Object3D) {
    group.updateMatrixWorld(true);
    const buckets = new Map<T.Material, T.Mesh[]>();
    for (const o of [...group.children])
      if (o instanceof T.Mesh && !Array.isArray(o.material)) {
        const a = buckets.get(o.material) || [];
        a.push(o);
        buckets.set(o.material, a);
      }
    for (const [mat, items] of buckets) {
      if (items.length < 2) continue;
      const gs = items.map((o) => {
        const g = o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone();
        if (!g.getAttribute("uv"))
          g.setAttribute(
            "uv",
            new T.BufferAttribute(
              new Float32Array(g.getAttribute("position").count * 2),
              2,
            ),
          );
        g.applyMatrix4(o.matrix);
        return g;
      });
      const g = mergeGeometries(gs, false);
      if (g) {
        for (const o of items) {
          group.remove(o);
          o.geometry.dispose();
        }
        mesh(g, mat, group);
      }
      gs.forEach((g) => g.dispose());
    }
  }
  batch(body);
  wheels.forEach(batch);
  batch(steering);
  return {
    root,
    body,
    steers,
    wheels,
    steering,
    paint,
    alloy,
    glass,
    brake,
    head,
    lights: [],
  };
}
export function addHeadlights(car: CarVisual) {
  for (const s of [-1, 1]) {
    const light = new T.SpotLight("#e8f1ff", 0, 115, 0.28, 0.55, 1.2);
    light.position.set(s * 0.63, 0.7, -2.15);
    light.target.position.set(s * 0.63, 0.25, -42);
    car.root.add(light, light.target);
    car.lights.push(light);
  }
}
