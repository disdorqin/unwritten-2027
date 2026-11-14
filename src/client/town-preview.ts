import * as THREE from "three";
import { SnowTown } from "./rendering/town";
import { initPhysics, Simulation } from "../shared/simulation";
import { TOWN_LAYOUT } from "../shared/town";
import { STEP } from "../shared/level";
import { BUTTON } from "../shared/protocol";

async function boot() {
  await initPhysics();
  const sim = new Simulation(true, TOWN_LAYOUT);
  const player = sim.addPlayer(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 150);
  camera.rotation.order = "YXZ";
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  document.querySelector("#world")!.append(renderer.domElement);
  const town = new SnowTown(scene); await town.loaded;
  document.querySelector("#status")!.textContent = "场景已就绪 · 钟面显示北京时间";
  const keys = new Set<string>(); let yaw = 0, pitch = -0.25, active = false;
  const test = import.meta.env.DEV && new URLSearchParams(location.search).has("test");
  const button = document.querySelector<HTMLButtonElement>("#enter")!;
  button.onclick = async () => {
    active = true; button.hidden = true;
    if (!matchMedia("(pointer:coarse)").matches && !test) {
      try { await renderer.domElement.requestPointerLock(); }
      catch { active = false; button.hidden = false; button.textContent = "点击重试鼠标控制"; }
    }
  };
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && !matchMedia("(pointer:coarse)").matches) { active = false; keys.clear(); button.hidden = false; }
  });
  addEventListener("keydown", e => { if (active && ["KeyW","KeyA","KeyS","KeyD","Space","ShiftLeft"].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
  addEventListener("keyup", e => keys.delete(e.code));
  const clear = () => keys.clear(); addEventListener("blur", clear); document.addEventListener("visibilitychange", clear);
  const look = (dx: number, dy: number) => { yaw -= dx * 0.003; pitch = THREE.MathUtils.clamp(pitch + dy * 0.003, -1.45, 1.45); };
  addEventListener("mousemove", e => { if (document.pointerLockElement === renderer.domElement) look(e.movementX, e.movementY); });
  let touch: { id: number; x: number; y: number } | undefined;
  renderer.domElement.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" && active) { touch = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); }
  });
  renderer.domElement.addEventListener("pointermove", e => {
    if (touch?.id === e.pointerId) { look(e.clientX - touch.x, e.clientY - touch.y); touch.x = e.clientX; touch.y = e.clientY; }
  });
  const end = () => { touch = undefined; };
  renderer.domElement.addEventListener("pointerup", end); renderer.domElement.addEventListener("pointercancel", end);
  document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach(b => {
    b.onpointerdown = e => { if (!active) return; b.setPointerCapture(e.pointerId); keys.add(b.dataset.key!); e.preventDefault(); };
    b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.key!);
  });
  addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  let last = performance.now(), accumulator = 0, seq = 0;
  renderer.setAnimationLoop(now => {
    accumulator += Math.min((now - last) / 1000, 0.1); last = now;
    while (accumulator >= STEP) {
      sim.motor(player, { seq: ++seq, x: active ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0,
        z: active ? Number(keys.has("KeyW")) - Number(keys.has("KeyS")) : 0, yaw, pitch,
        buttons: (keys.has("Space") ? BUTTON.JUMP : 0) | (keys.has("ShiftLeft") ? BUTTON.SPRINT : 0) });
      sim.step(); accumulator -= STEP;
    }
    const s = player.state; camera.position.set(s.x, s.y + 0.65, s.z);
    camera.rotation.set(-pitch, yaw, 0); town.update(); renderer.render(scene, camera);
  });
  if (import.meta.env.DEV) Object.assign(window, { __town: { sim, player, scene, town, camera, renderer } });
  addEventListener("pagehide", () => { renderer.setAnimationLoop(null); sim.dispose(); renderer.dispose(); }, { once: true });
}
boot().catch(e => { document.querySelector("#error")!.textContent = "加载失败，请刷新重试：" + e.message; });
