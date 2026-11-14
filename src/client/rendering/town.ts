import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BENCHES, LANTERNS, TOWN, TOWN_LAYOUT } from "../../shared/town";

/** Rendering only; shared/town owns placement and authority-side collision. */
export class SnowTown {
  root = new THREE.Group();
  loaded: Promise<void>;
  private hour?: THREE.Object3D;
  private minute?: THREE.Object3D;
  private hourRest?: THREE.Quaternion;
  private minuteRest?: THREE.Quaternion;
  private spin = new THREE.Quaternion();
  private handAxis = new THREE.Vector3(0, 0, 1);
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color("#17283e");
    scene.fog = new THREE.Fog("#263a51", 35, 105);
    scene.add(this.root);
    this.root.name = "SnowTown";
    this.root.add(new THREE.HemisphereLight("#c4ddff", "#6d4b32", 1.8));
    const moon = new THREE.DirectionalLight("#c6dcff", 2.8);
    moon.position.set(-14, 25, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28 });
    moon.shadow.normalBias = 0.04;
    this.root.add(moon);
    // Hide the simplified clocktower collider; its GLB supplies the visible shell.
    for (const b of TOWN_LAYOUT.level) {
      if (b.kind === "collision") continue;
      this.box(b.p, b.s, b.color);
    }
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 13.5, 0.035, 64), this.material("#9aa6af"));
    plaza.position.y = 0.018; plaza.receiveShadow = true; this.root.add(plaza);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.065, 4, 64), this.material("#d5c3a2"));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.065; this.root.add(ring);
    this.box([0, 0.025, 19], [4, 0.05, 16], "#9aa6af");
    // Post office shell is shared with physics; these are its roof and furnishings.
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.3, 1.8, 4), this.material("#52616c"));
    roof.rotation.y = Math.PI / 4; roof.scale.z = 0.88; roof.position.set(17, 4.5, -4);
    roof.castShadow = true; this.root.add(roof);
    const roofSnow = new THREE.Mesh(new THREE.ConeGeometry(6.2, 1.7, 4), this.material("#e2ebf2"));
    roofSnow.rotation.copy(roof.rotation); roofSnow.scale.copy(roof.scale); roofSnow.position.set(17, 4.61, -4); this.root.add(roofSnow);
    for (const x of [13.15, 20.85]) for (const z of [-7.35, -0.35]) this.box([x, 1.8, z], [0.2, 3.6, 0.2], "#795033");
    for (const z of [-7.32, -0.32]) this.box([17, 3.45, z], [7.9, 0.2, 0.2], "#795033");
    this.box([17, 1.325, -4.9], [0.5, 0.025, 0.34], "#f2e5c9");
    this.box([18, 1.42, -5], [0.2, 0.18, 0.22], "#a6402e");
    this.box([19.2, 1.1, -7.3], [2, 2.2, 0.35], "#805438");
    for (let i = 0; i < 4; i++) this.box([19.2, 0.4 + i * 0.5, -7.05], [1.85, 0.07, 0.4], "#bd9e70");
    const deskLamp = new THREE.PointLight("#ffd7a2", 26, 9, 2);
    deskLamp.position.set(17, 2.8, -4); this.root.add(deskLamp);
    const signCanvas = document.createElement("canvas"); signCanvas.width = 512; signCanvas.height = 128;
    const context = signCanvas.getContext("2d")!;
    context.fillStyle = "#71472e"; context.fillRect(0, 0, 512, 128);
    context.fillStyle = "#fae6b7"; context.font = "56px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText("新年邮局", 256, 64);
    const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.77), new THREE.MeshBasicMaterial({ map: signTexture }));
    sign.position.set(17, 3.15, -0.38); this.root.add(sign);
    for (const [x, y, z] of BENCHES) {
      this.box([x, y + 0.25, z], [3.1, 0.16, 0.75], "#805236");
      this.box([x, y + 0.7, z - 0.3], [3.1, 0.9, 0.13], "#684329");
      for (const dx of [-1.1, 1.1]) this.box([x + dx, 0.25, z], [0.15, 0.5, 0.65], "#3c3430");
      this.box([x, y + 1.18, z - 0.3], [3.15, 0.09, 0.2], "#e9eff4");
    }
    for (const [x, , z] of LANTERNS) {
      this.box([x, 1.6, z], [0.18, 3.2, 0.18], "#67452f");
      this.box([x + 0.38, 3.15, z], [0.95, 0.14, 0.2], "#67452f");
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 8), new THREE.MeshStandardMaterial({
        color: "#a93727", emissive: "#ff9b4d", emissiveIntensity: 0.8, roughness: 0.8,
      }));
      body.scale.y = 1.25; body.position.set(x + 0.7, 2.7, z); this.root.add(body);
      this.box([x + 0.7, 2.12, z], [0.06, 0.35, 0.06], "#bc9b56");
      const light = new THREE.PointLight("#ffbb75", 10, 8, 2);
      light.position.copy(body.position); this.root.add(light);
    }
    // One draw call for the pine canopies; no textures or external dependencies.
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 3, 7), this.material("#324c4b"), 108);
    const snow = new THREE.InstancedMesh(new THREE.ConeGeometry(0.76, 1.7, 7), this.material("#d6e2eb"), 108);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      const angle = i / 36 * Math.PI * 2, radius = 33 + (i % 4) * 2;
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      this.box([x, 1, z], [0.35, 2, 0.35], "#6d5542");
      for (let j = 0; j < 3; j++) {
        dummy.position.set(x, 2 + j * 1.12, z);
        dummy.scale.setScalar(1.5 - j * 0.3); dummy.updateMatrix(); trees.setMatrixAt(i * 3 + j, dummy.matrix);
        dummy.position.y += 0.65; dummy.updateMatrix(); snow.setMatrixAt(i * 3 + j, dummy.matrix);
      }
    }
    trees.castShadow = true; this.root.add(trees, snow);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(11 + i % 3 * 3, 18 + i % 4 * 3, 5), this.material("#657d91"));
      m.position.set(-65 + i * 16, 6, -65 - i % 2 * 8); this.root.add(m);
    }
    const positions = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      positions[i * 3] = Math.sin(i * 137.5) * (14 + i % 42);
      positions[i * 3 + 1] = 9 + i % 47;
      positions[i * 3 + 2] = Math.cos(i * 99.7) * (16 + i % 43);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.root.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: "#dbe9f9", size: 0.055, transparent: true, opacity: 0.7 })));
    this.loaded = new GLTFLoader().loadAsync(new URL("models/clocktower.glb", document.baseURI).href).then(g => {
      g.scene.name = "Clocktower"; g.scene.position.set(...TOWN.tower);
      g.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.hour = g.scene.getObjectByName("Clock_HourHand");
      this.minute = g.scene.getObjectByName("Clock_MinuteHand");
      this.hourRest = this.hour?.quaternion.clone(); this.minuteRest = this.minute?.quaternion.clone();
      this.root.add(g.scene); this.update();
    });
  }
  private material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    return this.materials.get(color)!;
  }
  private box(p: readonly number[], s: readonly number[], color: string) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), this.material(color));
    m.position.set(p[0], p[1], p[2]); m.castShadow = true; m.receiveShadow = true; this.root.add(m); return m;
  }
  update(now = Date.now()) {
    const date = new Date(now + 8 * 3600_000);
    const minutes = date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const hours = date.getUTCHours() % 12 + minutes / 60;
    // Exported hand meshes lie in glTF's XY plane. Compose from their rest poses.
    if (this.minute && this.minuteRest) this.minute.quaternion.copy(this.minuteRest).multiply(this.spin.setFromAxisAngle(this.handAxis, -minutes / 60 * Math.PI * 2));
    if (this.hour && this.hourRest) this.hour.quaternion.copy(this.hourRest).multiply(this.spin.setFromAxisAngle(this.handAxis, -Math.PI / 6 - hours / 12 * Math.PI * 2));
  }
}
