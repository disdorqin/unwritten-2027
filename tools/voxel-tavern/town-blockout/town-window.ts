import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, Vector3,
} from 'three';
import type { TownActivity, TownActivityContext } from './town-activity';

export type TownWindow = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  yaw: number;
  ground: number;
  style: 'museum' | 'post' | 'tavern';
  /** Position to aim for if a bench, counter or stairs occupy the natural approach. */
  approach?: readonly [x: number, z: number];
};

const styles = {
  museum: { frame: '#714633', handle: '#d7a35f', glass: '#d69d62', horizontal: 6, vertical: 2 },
  post: { frame: '#704b39', handle: '#cb9a59', glass: '#d29a62', horizontal: 2, vertical: 1 },
  tavern: { frame: '#895137', handle: '#d5a06b', glass: '#d59154', horizontal: 3, vertical: 1 },
} as const;
const windowKey = 'townWindows';
const frameMaterial = new MeshLambertMaterial();
const glassMaterial = new MeshBasicMaterial();
const windowGeometry = new BoxGeometry();
const halfOpen = Math.PI * .39;
const standStep = .15;
const standAttempts = 6;
const calm = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Part = { slot: number; transform: Matrix4; glass: boolean; tint: Color };
type Leaf = { side: number; hinge: number; parts: Part[] };
type Sash = { pivot: Matrix4; leaves: Leaf[]; angle: number; open: boolean };

export function addTownWindow(root: Group, definition: TownWindow) {
  const windows = (root.userData[windowKey] ??= []) as TownWindow[];
  windows.push(definition);
}

function buildWindows(root: Group, definitions: TownWindow[]) {
  let frames = 0, panes = 0;
  const template = new Object3D();
  const turn = new Matrix4();
  const placement = new Matrix4();
  const sashes = definitions.map(definition => {
    const { x, y, z, yaw, width, height, style } = definition;
    const palette = styles[style];
    const frameWidth = style === 'museum' ? .049 : .053;
    const leafWidth = width / 2 - .014;
    const pivot = new Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    const leaves: Leaf[] = [-1, 1].map(side => {
      const parts: Part[] = [];
      const center = -side * leafWidth / 2;
      function part(tint: string, u: number, v: number, w: number, h: number, d: number, layer = 0, glass = false) {
        template.position.set(center + u, v, layer);
        template.scale.set(w, h, d);
        template.updateMatrix();
        parts.push({ slot: glass ? panes++ : frames++, transform: template.matrix.clone(), glass, tint: new Color(tint) });
      }
      part(palette.glass, 0, 0, leafWidth - .045, height - .045, .031, 0, true);
      for (const end of [-1, 1]) {
        part(palette.frame, end * (leafWidth - frameWidth) / 2, 0, frameWidth, height, .105);
        part(palette.frame, 0, end * (height - frameWidth) / 2, leafWidth, frameWidth, .105);
        part(palette.handle, side * (leafWidth / 2 - .02), end * (height / 2 - .15), .065, .11, .035, -.06);
      }
      for (let row = 1; row <= palette.horizontal; row++) {
        const v = height * (row / (palette.horizontal + 1) - .5);
        part(palette.frame, 0, v, leafWidth, .036, .070);
      }
      for (let col = 1; col <= palette.vertical; col++) {
        const u = leafWidth * (col / (palette.vertical + 1) - .5);
        part(palette.frame, u, 0, .035, height, .070);
      }
      part(palette.handle, -side * (leafWidth / 2 - .044), -.13, .046, .16, .058, -.061);
      return { side, hinge: side * width / 2, parts };
    });
    return { pivot, leaves, angle: 0, open: false };
  });
  const frame = new InstancedMesh(windowGeometry, frameMaterial, frames);
  frame.name = '可开启窗框';
  const glass = new InstancedMesh(windowGeometry, glassMaterial, panes);
  glass.name = '可开启窗扇';
  frame.instanceMatrix.setUsage(DynamicDrawUsage);
  glass.instanceMatrix.setUsage(DynamicDrawUsage);
  root.add(frame, glass);

  function place(sash: Sash) {
    for (const leaf of sash.leaves) {
      turn.makeRotationY(leaf.side * sash.angle).setPosition(leaf.hinge, 0, 0);
      turn.premultiply(sash.pivot);
      for (const part of leaf.parts) {
        (part.glass ? glass : frame).setMatrixAt(part.slot, placement.multiplyMatrices(turn, part.transform));
      }
    }
  }
  for (const sash of sashes) {
    for (const leaf of sash.leaves) for (const part of leaf.parts) {
      (part.glass ? glass : frame).setColorAt(part.slot, part.tint);
    }
    place(sash);
  }
  const maxWidth = Math.max(...definitions.map(window => window.width));
  for (const mesh of [frame, glass]) {
    mesh.computeBoundingSphere();
    mesh.boundingSphere!.radius += maxWidth;
  }
  return {
    toggle(index: number) {
      const sash = sashes[index];
      sash.open = !sash.open;
    },
    isOpen(index: number) { return sashes[index].open; },
    update(dt: number) {
      let moved = false;
      for (const sash of sashes) {
        const target = sash.open ? halfOpen : 0;
        if (sash.angle === target) continue;
        const step = Math.min(1, Math.max(0, dt) * 8);
        sash.angle = calm() || Math.abs(target - sash.angle) < .002
          ? target : sash.angle + (target - sash.angle) * step;
        place(sash);
        moved = true;
      }
      if (moved) {
        frame.instanceMatrix.needsUpdate = true;
        glass.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

export function createWindowActivity(
  context: TownActivityContext,
  architecture: ReadonlyMap<string, Group>,
  isObstructed: (east: number, north: number, feet: number) => boolean,
): TownActivity {
  const spots: TownActivity['spots'] = [];
  const updates: ((dt: number) => void)[] = [];
  for (const [id, root] of architecture) {
    const definitions = root.userData[windowKey] as TownWindow[] | undefined;
    if (!definitions?.length) continue;
    const controls = buildWindows(root, definitions);
    updates.push(controls.update);
    definitions.forEach((definition, index) => {
      const { x, y, z, yaw, ground, approach } = definition;
      const [approachX, approachZ] = approach ?? [x - 1.4 * Math.sin(yaw), z - 1.4 * Math.cos(yaw)];
      const first = root.localToWorld(new Vector3(approachX, ground, approachZ));
      // Continue from the window toward the player side, in world metres even for scaled landmarks.
      const inward = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).transformDirection(root.matrixWorld);
      const stand = first.clone();
      for (let step = 1; isObstructed(stand.x, -stand.z, stand.y); step++) {
        if (step > standAttempts) {
          console.warn(`[town-window] Skipped blocked interaction for ${id} window ${index + 1}`,
            [first.x, -first.z, first.y]);
          return;
        }
        stand.copy(first).addScaledVector(inward, step * standStep);
      }
      const face = root.localToWorld(new Vector3(x, y, z));
      spots.push({
        x: stand.x, n: -stand.z, ground: stand.y, range: 1.34,
        available: () => architecture.get(id) === root,
        get label() { return controls.isOpen(index) ? '关闭窗户' : '打开窗户'; },
        run() {
          if (!root.parent) return;
          controls.toggle(index);
          context.face(face.x, -face.z, face.y);
          context.announce(controls.isOpen(index) ? '窗户已打开' : '窗户已关闭');
        },
      });
    });
  }
  return { spots, update(dt) { updates.forEach(update => update(dt)); } };
}
