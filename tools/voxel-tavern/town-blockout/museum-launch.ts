import {
  AmbientLight, BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PerspectiveCamera, PointLight, RingGeometry, Scene, type WebGLRenderer,
} from 'three';

const parts = ['第一级', '第二级', '整流罩'] as const;
type Phase = 'assembly' | 'ready' | 'countdown' | 'flight' | 'complete';

export function createMuseumLaunch(renderer: WebGLRenderer, aspect: number) {
  const canvas = renderer.domElement;
  const panel = document.querySelector<HTMLElement>('#museum-launch')!;
  const status = panel.querySelector<HTMLOutputElement>('output')!;
  const pieces = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-rocket-part]'));
  const launch = panel.querySelector<HTMLButtonElement>('#rocket-launch')!;
  const scene = new Scene();
  scene.background = new Color('#101e32');
  const camera = new PerspectiveCamera(43, aspect, .05, 80);
  const white = new DirectionalLight('#ffedcf', 1.6);
  white.position.set(4, 6, 6);
  const rim = new DirectionalLight('#a6d6ff', 1.58);
  rim.position.set(-2, 2, -4);
  scene.add(white, rim, new AmbientLight('#b8c7e8', 1.42));
  const ivory = new MeshLambertMaterial({ color: '#efe6ce' });
  const steel = new MeshLambertMaterial({ color: '#687d92' });
  const midnight = new MeshLambertMaterial({ color: '#273a51' });
  const wood = new MeshLambertMaterial({ color: '#795346' });
  const copper = new MeshLambertMaterial({ color: '#bc8451' });
  const red = new MeshLambertMaterial({ color: '#b6534a' });
  const mark = new MeshBasicMaterial({ color: '#88bed0' });
  const warm = new MeshBasicMaterial({ color: '#ffe1a1' });
  const flame = new MeshBasicMaterial({ color: '#ffc37a' });
  const inactive = new MeshLambertMaterial({ color: '#405164' });
  const activeLamp = new MeshBasicMaterial({ color: '#ded198' });
  const fittedLamp = new MeshBasicMaterial({ color: '#94cfbc' });
  const box = new BoxGeometry();
  function block(parent: Group, paint: MeshLambertMaterial | MeshBasicMaterial,
    x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new Mesh(box, paint);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }
  function ring(parent: Group, paint: MeshLambertMaterial | MeshBasicMaterial,
    y: number, top: number, base: number, h: number) {
    const mesh = new Mesh(new CylinderGeometry(top, base, h, 12), paint);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  }

  const pad = new Group();
  scene.add(pad);
  block(pad, wood, 0, -.23, 0, 3.18, .32, 2.55);
  block(pad, copper, 0, -.068, 0, 3.19, .045, 2.56);
  block(pad, midnight, 0, -.025, 0, 3.08, .055, 2.45);
  for (const side of [-1, 1]) {
    block(pad, copper, side * 1.47, .008, 0, .016, .012, 2.29);
    block(pad, copper, 0, .008, side * 1.11, 2.92, .012, .016);
    for (const z of [-1.03, 1.03]) {
      block(pad, copper, side * 1.36, .026, z, .13, .065, .13);
      block(pad, warm, side * 1.36, .067, z, .066, .042, .066);
    }
  }
  // Assembly and countdown share the same three lamps on the front edge of the display.
  const stageLamps = [-.46, 0, .46].map(x => {
    block(pad, copper, x, .018, .99, .34, .027, .14);
    block(pad, midnight, x, .032, .99, .29, .019, .10);
    return block(pad, inactive, x, .049, .99, .22, .024, .054);
  });
  const woodInset = new MeshLambertMaterial({ color: '#573e39' });
  block(pad, woodInset, 0, -.224, 1.279, 2.70, .10, .011);
  block(pad, woodInset, 1.595, -.224, 0, .011, .10, 2.12);
  for (const x of [-1.25, 1.25]) {
    block(pad, copper, x, -.224, 1.288, .064, .047, .014);
    block(pad, copper, 1.601, -.224, x * .74, .015, .047, .064);
  }
  ring(pad, copper, .09, .69, .76, .18);
  ring(pad, steel, .20, .55, .65, .075);
  for (let i = 0; i < 12; i++) {
    const turn = i * Math.PI / 6;
    block(pad, mark, Math.sin(turn) * .89, .022, Math.cos(turn) * .89, .069, .023, .069);
  }

  const rocket = new Group();
  scene.add(rocket);
  const segments = parts.map(() => {
    const group = new Group();
    rocket.add(group);
    return group;
  });
  const [first, second, nose] = segments;
  ring(first, steel, .321, .30, .155, .18);
  ring(first, ivory, .803, .292, .324, .81);
  ring(first, red, 1.073, .301, .307, .105);
  ring(first, steel, 1.208, .275, .296, .072);
  for (let i = 0; i < 4; i++) {
    const lug = new Group();
    lug.rotation.y = i * Math.PI / 2;
    first.add(lug);
    block(lug, steel, 0, .54, .322, .052, .23, .079);
    block(lug, copper, 0, .67, .318, .046, .074, .06);
    block(lug, midnight, 0, .843, .313, .056, .154, .026);
  }
  ring(second, ivory, 1.510, .224, .272, .527);
  ring(second, red, 1.674, .237, .242, .115);
  ring(second, steel, 1.787, .234, .238, .046);
  ring(nose, ivory, 1.954, .18, .235, .289);
  ring(nose, ivory, 2.187, .065, .18, .178);
  ring(nose, copper, 2.321, .028, .065, .09);
  for (let i = 0; i < 6; i++) {
    const turn = i * Math.PI / 3;
    block(second, steel, Math.sin(turn) * .25, 1.45, Math.cos(turn) * .25, .042, .08, .042);
  }
  const exhaust = ring(rocket, flame, .12, .13, .025, .39);
  const sweepMaterial = new MeshBasicMaterial({
    color: '#ffe2a7', transparent: true, opacity: 0, depthWrite: false,
  });
  const sweep = new Mesh(new RingGeometry(.92, 1, 36), sweepMaterial);
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = .044;
  pad.add(sweep);
  const completionSeal = new Group();
  completionSeal.position.y = .252;
  pad.add(completionSeal);
  ring(completionSeal, copper, .038, .27, .28, .073);
  ring(completionSeal, midnight, .080, .229, .238, .022);
  const sealMark = block(completionSeal, fittedLamp, 0, .095, 0, .18, .016, .18);
  sealMark.rotation.y = Math.PI / 4;
  const glow = new PointLight('#ffb773', 0, 5, 2);
  glow.position.set(0, .29, .48);
  scene.add(glow);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let phase: Phase = 'assembly';
  let fitted = 0;
  let elapsed = 0;
  let lastCount = 0;
  let onComplete: (() => void) | undefined;
  const arrivalDuration = .34;
  const arrivals = [0, 0, 0];

  function setStageLamps() {
    stageLamps.forEach((lamp, index) => {
      if (phase === 'countdown') lamp.material = index < lastCount ? activeLamp : inactive;
      else if (phase === 'flight') lamp.material = activeLamp;
      else if (index < fitted) lamp.material = fittedLamp;
      else lamp.material = index === fitted ? activeLamp : inactive;
    });
  }
  function updateAssembly(dt: number) {
    segments.forEach((segment, index) => {
      arrivals[index] = Math.max(0, arrivals[index] - dt);
      const lift = reducedMotion.matches ? 0 : (arrivals[index] / arrivalDuration) ** 2;
      segment.position.set(.10 * lift, .32 * lift, 0);
      segment.rotation.z = -.12 * lift;
    });
  }

  function say(text: string) {
    status.textContent = text;
  }
  function updateControls() {
    pieces.forEach((button, index) => {
      button.disabled = phase !== 'assembly' || index < fitted;
      button.dataset.fitted = String(index < fitted);
      button.textContent = index < fitted ? `${parts[index]} · 已装` : parts[index];
      segments[index].visible = index < fitted;
    });
    launch.disabled = phase !== 'ready' && phase !== 'complete';
    launch.textContent = phase === 'complete' ? '重玩' : '点火发射';
    setStageLamps();
  }
  function reset() {
    phase = 'assembly';
    elapsed = 0;
    fitted = 0;
    lastCount = 0;
    rocket.position.y = 0;
    rocket.visible = true;
    exhaust.visible = false;
    sweep.visible = false;
    completionSeal.visible = false;
    glow.intensity = 0;
    arrivals.fill(0);
    updateAssembly(0);
    updateControls();
    say('先装第一级，再接第二级和整流罩。');
  }
  pieces.forEach((button, index) => {
    button.onclick = () => {
      if (phase !== 'assembly') return;
      if (index !== fitted) {
        say(`请先装${parts[fitted]}。`);
        return;
      }
      arrivals[index] = reducedMotion.matches ? 0 : arrivalDuration;
      updateAssembly(0);
      fitted++;
      if (fitted === parts.length) phase = 'ready';
      updateControls();
      say(phase === 'ready' ? '装配完成，可以点火。' : `接下来装${parts[fitted]}。`);
      (phase === 'ready' ? launch : pieces[fitted]).focus({ preventScroll: true });
    };
  });
  launch.onclick = () => {
    if (phase === 'complete') {
      reset();
      pieces[0].focus({ preventScroll: true });
    } else if (phase === 'ready') {
      phase = 'countdown';
      elapsed = 0;
      lastCount = 3;
      updateControls();
      say('模拟点火倒计时 3');
    }
  };
  function update(dt: number) {
    if (!active) return;
    if (arrivals.some(time => time > 0)) updateAssembly(dt);
    if (phase === 'countdown') {
      elapsed += dt;
      const count = Math.max(0, Math.ceil(3 - elapsed));
      if (count !== lastCount) {
        lastCount = count;
        if (count > 0) say(`模拟点火倒计时 ${count}`);
        setStageLamps();
      }
      if (elapsed < 3) return;
      elapsed -= 3;
      phase = 'flight';
      setStageLamps();
      say('模拟点火，模型升空。');
    } else if (phase === 'flight') {
      elapsed += dt;
    }
    if (phase !== 'flight') return;
    const moving = !reducedMotion.matches;
    exhaust.visible = moving;
    sweep.visible = moving && elapsed < .72;
    if (moving) {
      rocket.position.y = elapsed * (.7 + elapsed * 2.1);
      exhaust.scale.y = 1.4 + Math.sin(elapsed * 39) * .34;
      glow.intensity = 5 * Math.max(0, 1 - elapsed);
      sweep.scale.set(1 + elapsed * .5, 1 + elapsed * .5, 1);
      sweepMaterial.opacity = .58 * Math.max(0, 1 - elapsed / .72);
    }
    if (elapsed >= 1.45) {
      phase = 'complete';
      rocket.visible = false;
      exhaust.visible = false;
      sweep.visible = false;
      completionSeal.visible = true;
      glow.intensity = 0;
      updateControls();
      say('模拟任务完成，已记入参观护照。');
      onComplete?.();
    }
  }
  function resize(nextAspect: number) {
    camera.aspect = nextAspect;
    const distance = Math.max(1.25, .92 / nextAspect);
    camera.position.set(3.65 * distance, 1.43 + 2.1 * distance, 4.9 * distance);
    camera.lookAt(0, nextAspect < .95 ? .50 : .03, 0);
    camera.updateProjectionMatrix();
  }
  resize(aspect);
  return {
    open(complete: () => void) {
      onComplete = complete;
      active = true;
      panel.hidden = false;
      document.body.classList.add('museum-inspecting');
      canvas.setAttribute('aria-label', '四月航天馆三维模型展台');
      reset();
      pieces[0].focus({ preventScroll: true });
    },
    close() {
      if (!active) return;
      active = false;
      onComplete = undefined;
      panel.hidden = true;
      document.body.classList.remove('museum-inspecting');
      canvas.setAttribute('aria-label', '雪镇建模预览');
    },
    resize, update,
    get active() { return active; },
    render() { renderer.render(scene, camera); },
  };
}
