import { AmbientLight, BoxGeometry, Color, DirectionalLight, Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { mountTownC2R30VaultApproach } from './town-c2-r30-vault-approach.js';

/** C2-R03 art review only. The D-owned palace shell is not present in this
 * lane; a plain floor stands in so the vault anchors can be inspected alone. */
const scene = new Scene();
scene.background = new Color(0x1c2027);
const floor = new Mesh(
  new BoxGeometry(30, .2, 40),
  new MeshLambertMaterial({ color: 0x3a3f45 }),
);
floor.position.set(0, -.12, -116);
scene.add(floor);
const vault = mountTownC2R30VaultApproach({
  site: { domainId: 'review:c2-r30:vault', east: 0, north: 0, height: 0, yaw: 0 },
  supportsSite: () => true,
});
scene.add(vault.group);
scene.add(new AmbientLight(0xffffff, .9));
const moon = new DirectionalLight(0xbcd0e8, .5);
moon.position.set(10, 20, -100);
scene.add(moon);

const camera = new PerspectiveCamera(60, 1, .06, 200);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
document.querySelector('#scene')!.append(renderer.domElement);
const views = [
  { name: '狗石守位石座', east: -3.2, north: 109.5, height: 1.9, lookN: 112.3, lookY: .6 },
  { name: '宝库门前冷火盆', east: -5.4, north: 116.5, height: 2.2, lookN: 119.2, lookY: 1.0 },
] as const;
let selected = 0, frames = 0, last = performance.now();
addEventListener('keydown', e => { if (/^Digit[12]$/.test(e.code)) selected = Number(e.code.slice(-1)) - 1; });
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function render(t: number) {
  frames++; last = t;
  const v = views[selected]!;
  camera.position.set(v.east, v.height, -v.north);
  camera.lookAt(new Vector3(v.east, v.lookY, -v.lookN));
  renderer.render(scene, camera);
  document.querySelector('#hud')!.textContent = `${v.name} · ${renderer.info.render.calls} draws · ${vault.stats().pieceCount} pieces`;
  requestAnimationFrame(render);
}
Object.defineProperty(window, '__vaultReview', {
  value: { state: () => ({ frames, selected, draws: renderer.info.render.calls,
    pieces: vault.stats().pieceCount, siteCertified: vault.stats().siteCertified,
    lights: vault.stats().realLightCount, reviewOnly: true }) },
});
requestAnimationFrame(render);
