import * as T from "three";
import { VehiclePhysics } from "../physics/VehiclePhysics";
import { Settings } from "../core/SaveManager";
export class Particles {
  root = new T.Group();
  count = 480;
  positions = new Float32Array(this.count * 3);
  colors = new Float32Array(this.count * 3);
  alphas = new Float32Array(this.count);
  sizes = new Float32Array(this.count);
  life = new Float32Array(this.count);
  velocity = new Float32Array(this.count * 3);
  gravity=new Float32Array(this.count);
  flash=new T.PointLight(0xff9a35,0,22,2);
  cursor = 0;
  geometry = new T.BufferGeometry();
  rainGeometry = new T.BufferGeometry();
  rainPositions = new Float32Array(1200 * 6);
  rain: T.LineSegments;
  skids: T.InstancedMesh;
  skidIndex = 0;
  skidClock = 0;
  dummy = new T.Object3D();
  private readonly point=new T.Vector3();private readonly smoke=new T.Color('#bbc1c9');private readonly dust=new T.Color('#b7aa8b');private readonly sprayColor=new T.Color('#b1c2ce');
  private readonly fire=new T.Color('#ff791d');private readonly bright=new T.Color('#fff2ac');private readonly dark=new T.Color('#48443f');private readonly nitro=new T.Color('#65dfff');
  private lastShift=-1;private lastBoost=-1;private exhaustClock=0;
  constructor() {
    this.geometry.setAttribute(
      "position",
      new T.BufferAttribute(this.positions, 3),
    );
    this.geometry.setAttribute("color", new T.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("alpha", new T.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute("size", new T.BufferAttribute(this.sizes, 1));
    const mat = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      vertexShader:
        "attribute float alpha;attribute float size;varying float a;varying vec3 c;void main(){a=alpha;c=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=min(160.,size*450./max(1.,-p.z));}",
      fragmentShader:
        "varying float a;varying vec3 c;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(c,(1.-r)*(1.-r)*a);}",
    });
    const points = new T.Points(this.geometry, mat);
    points.frustumCulled = false;
    this.root.add(points,this.flash);
    this.rainGeometry.setAttribute(
      "position",
      new T.BufferAttribute(this.rainPositions, 3),
    );
    this.rain = new T.LineSegments(
      this.rainGeometry,
      new T.LineBasicMaterial({
        color: "#b5c6d7",
        transparent: true,
        opacity: 0.33,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.root.add(this.rain);
    this.skids = new T.InstancedMesh(
      new T.PlaneGeometry(0.22, 0.9),
      new T.MeshBasicMaterial({
        color: "#11151b",
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: T.DoubleSide,
      }),
      800,
    );
    this.skids.count = 0;
    this.skids.frustumCulled = false;
    this.root.add(this.skids);
  }
  emit(p: T.Vector3, color: T.Color, size: number) {
    const i = this.cursor++ % this.count;
    const j=i*3;this.positions[j]=p.x;this.positions[j+1]=p.y;this.positions[j+2]=p.z;
    this.colors[j]=color.r;this.colors[j+1]=color.g;this.colors[j+2]=color.b;
    this.velocity[j]=(Math.random()-.5)*1.7;this.velocity[j+1]=Math.random()+.5;this.velocity[j+2]=(Math.random()-.5)*1.7;
    this.gravity[i]=0;
    this.life[i] = 1;
    this.sizes[i] = size;
  }
  explode(p:T.Vector3,severity:number) {
    this.flash.position.copy(p);this.flash.position.y+=1;this.flash.intensity=170*severity;
    for(let n=0;n<100;n++) {
      const i=this.cursor%this.count,smoke=n>60;
      this.emit(p,smoke?this.dark:n%3?this.fire:this.bright,smoke?1.2:.4);
      const a=Math.random()*Math.PI*2,r=(4+Math.random()*14)*severity;
      this.velocity[i*3]=Math.cos(a)*r;this.velocity[i*3+1]=(2+Math.random()*9)*severity;this.velocity[i*3+2]=Math.sin(a)*r;
      this.gravity[i]=smoke?-1:8;this.life[i]=smoke?1.5:.45+Math.random()*.45;
    }
  }
  update(dt: number, car: VehiclePhysics, s: Settings, active: boolean) {
    const changed=this.lastShift>=0&&this.lastShift!==car.shiftSerial,boosted=this.lastBoost>=0&&this.lastBoost!==car.boostSerial;
    this.lastShift=car.shiftSerial;this.lastBoost=car.boostSerial;this.exhaustClock+=dt;
    if(active&&car.speed>5&&(changed||boosted||(car.boosting&&this.exhaustClock>.075))){
      this.exhaustClock=0;this.point.copy(car.position).addScaledVector(car.forward,-car.chassis.halfLength-1);this.point.y-=.18;
      const i=this.cursor%this.count;this.emit(this.point,car.boosting?this.nitro:this.fire,.17);this.life[i]=.12;
      this.velocity[i*3]=-car.forward.x*3;this.velocity[i*3+1]=.1;this.velocity[i*3+2]=-car.forward.z*3;
    }
    this.flash.intensity*=Math.exp(-9*dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.6;
      this.velocity[i*3+1]-=this.gravity[i]*dt;
      this.alphas[i] = Math.max(0, this.life[i]) * 0.5;
      for (let j = 0; j < 3; j++)
        this.positions[i * 3 + j] += this.velocity[i * 3 + j] * dt;
      this.sizes[i] += dt * 0.7;
    }
    const slipping = Math.abs(car.slip) > 0.18 && car.speed > 9,
      offroad = car.surface === "GRAVEL" || car.surface === "GRASS",
      spray = s.weather === "rain" && car.speed > 12;
    if (
      active &&
      car.contacts > 2 &&
      (slipping || offroad || spray) &&
      car.speed > 5
    ) {
      for (let n=0;n<(car.bike?1:2);n++) {
        const side=car.bike?0:n===0?-1:1,p = this.point.copy(car.position)
          .addScaledVector(car.right, side * car.chassis.halfWidth)
          .addScaledVector(car.forward, -car.chassis.halfLength);
        p.y -= 0.42;
        this.emit(
          p,
          spray ? this.sprayColor : offroad ? this.dust : this.smoke,
          0.3,
        );
      }
    }
    for (const name of ["position", "color", "alpha", "size"])
      this.geometry.getAttribute(name).needsUpdate = true;
    this.rain.visible = s.weather === "rain" && active;
    this.rainGeometry.setDrawRange(0,Math.floor(1200*(.15+.85*s.rainIntensity))*2);
    (this.rain.material as T.LineBasicMaterial).opacity=.15+s.rainIntensity*.22;
    if (this.rain.visible) {
      for (let i = 0; i < 1200; i++) {
        const j = i * 6;
        let x = this.rainPositions[j],
          y = this.rainPositions[j + 1] - dt * 24,
          z = this.rainPositions[j + 2];
        if (
          y < car.position.y - 5 ||
          Math.abs(x - car.position.x) > 35 ||
          Math.abs(z - car.position.z) > 35
        ) {
          x = car.position.x + (Math.random() - 0.5) * 60;
          y = car.position.y + Math.random() * 26;
          z = car.position.z + (Math.random() - 0.5) * 60;
        }
        this.rainPositions[j]=x;this.rainPositions[j+1]=y;this.rainPositions[j+2]=z;this.rainPositions[j+3]=x-.08;this.rainPositions[j+4]=y+1.1;this.rainPositions[j+5]=z+.1;
      }
      this.rainGeometry.getAttribute("position").needsUpdate = true;
    }
    this.skidClock += dt;
    if (
      active &&
      slipping &&
      !offroad &&
      s.weather !== "rain" &&
      this.skidClock > 0.025
    ) {
      this.skidClock = 0;
      for (let n=0;n<2;n++) {
        const side=n===0?-1:1,p = this.point.copy(car.position)
          .addScaledVector(car.right, side * 0.97)
          .addScaledVector(car.forward, -1.43);
        p.y = car.roads.nearest(p.x, p.z).height + 0.025;
        this.dummy.position.copy(p);
        this.dummy.rotation.set(
          -Math.PI / 2,
          0,
          Math.atan2(-car.forward.x, -car.forward.z),
        );
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.skids.setMatrixAt(this.skidIndex++ % 800, this.dummy.matrix);
      }
      this.skids.count = Math.min(800, this.skidIndex);
      this.skids.instanceMatrix.needsUpdate = true;
    }
  }
}
