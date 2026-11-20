import {
  BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace,
} from 'three';

type Point = { east: number; north: number };
type Sign = Point & { label: string; facing: 'south' | 'north' | 'east'; width: number };
type SignVolume = Point & { height: number; width: number; depth: number; rise: number };
type FloorAt = (east: number, north: number, radius: number) => number | undefined;

export type MainSummitApproachConfig = {
  terminal: Point;
  terraceTurnNorth: number;
  gateArrival: Point;
  frontStamp: Point;
  stampInteractionRadius: number;
};

type WalkSurface = {
  floorAt: FloorAt;
  blocked: (east: number, north: number, height: number, radius: number, standingHeight: number) => boolean;
};

const bodyRadius = .27;
const bodyHeight = 1.8;
const maxStepHeight = .43;
const samplingStep = .02;
const postHalfWidth = .075;
const postHeight = 1.25;

function signFootprints(sign: Sign) {
  return [
    { width: postHalfWidth * 2, depth: postHalfWidth * 2, base: 0, rise: postHeight },
    {
      width: sign.facing === 'east' ? .08 : sign.width,
      depth: sign.facing === 'east' ? sign.width : .08,
      base: postHeight - .08,
      rise: .42,
    },
  ];
}

function signClearance(sign: SignVolume, east: number, north: number, feet: number, radius: number, standingHeight: number) {
  if (feet + standingHeight <= sign.height || feet >= sign.height + sign.rise) return Infinity;
  const dx = Math.max(Math.abs(sign.east - east) - sign.width / 2, 0);
  const dn = Math.max(Math.abs(sign.north - north) - sign.depth / 2, 0);
  return Math.hypot(dx, dn) - radius;
}

export function createMainSummitApproach(config: MainSummitApproachConfig) {
  const { terminal, terraceTurnNorth, gateArrival, frontStamp, stampInteractionRadius } = config;
  const stampSide = Math.sign(gateArrival.east - frontStamp.east);
  if (!Number.isFinite(stampInteractionRadius) || terminal.north >= terraceTurnNorth ||
      terraceTurnNorth >= gateArrival.north ||
      !stampSide || stampInteractionRadius <= bodyRadius) {
    throw new RangeError('The mountain approach requires ordered terrace anchors and an accessible stamp side.');
  }

  const turn = { east: terminal.east, north: terraceTurnNorth };
  const gateApproach = { east: gateArrival.east, north: terraceTurnNorth };
  const junction = { east: gateArrival.east, north: frontStamp.north };
  // Approach the stamp from the gate apron, keeping the original P-4 anchor and interaction radius.
  const stampStop = {
    east: frontStamp.east + stampSide * stampInteractionRadius * .8,
    north: frontStamp.north,
  };
  const gateRoute = [terminal, turn, gateApproach, gateArrival];
  const stampRoute = [gateApproach, junction, stampStop];
  const signs: readonly Sign[] = [
    { label: '主峰山门 ↑', east: terminal.east + 1.35, north: terminal.north + 1.15, facing: 'south', width: 1.35 },
    { label: '主峰山门', east: gateApproach.east - 2.3, north: gateApproach.north + .4, facing: 'east', width: 1.2 },
    { label: '前山登记碑', east: stampStop.east + stampSide * 1.2, north: stampStop.north - 1.25,
      facing: 'north', width: 1.2 },
  ];

  function survey({ floorAt, blocked }: WalkSurface) {
    const signVolumes = signs.flatMap(sign => {
      const height = floorAt(sign.east, sign.north, postHalfWidth);
      if (height === undefined || !Number.isFinite(height)) return [];
      return signFootprints(sign).map(footprint => ({
        ...footprint, east: sign.east, north: sign.north, height: height + footprint.base,
      }));
    });
    function walk(points: readonly Point[]) {
      let sampleCount = 0;
      let unsupported = 0;
      let blockedSamples = 0;
      let minimumSignClearance = Infinity;
      let maxStep = 0;
      let length = 0;
      let previousHeight: number | undefined;
      let initialHeight: number | undefined;

      for (let index = 1; index < points.length; index++) {
        const from = points[index - 1]!;
        const to = points[index]!;
        const span = Math.hypot(to.east - from.east, to.north - from.north);
        const samples = Math.max(1, Math.ceil(span / samplingStep));
        length += span;
        for (let sample = index === 1 ? 0 : 1; sample <= samples; sample++) {
          const fraction = sample / samples;
          const east = from.east + (to.east - from.east) * fraction;
          const north = from.north + (to.north - from.north) * fraction;
          const height = floorAt(east, north, bodyRadius);
          sampleCount++;
          if (height === undefined || !Number.isFinite(height)) {
            unsupported++;
            previousHeight = undefined;
            continue;
          }
          initialHeight ??= height;
          if (previousHeight !== undefined) maxStep = Math.max(maxStep, Math.abs(height - previousHeight));
          previousHeight = height;
          if (blocked(east, north, height, bodyRadius, bodyHeight)) blockedSamples++;
          for (const sign of signVolumes) {
            minimumSignClearance = Math.min(minimumSignClearance,
              signClearance(sign, east, north, height, bodyRadius, bodyHeight));
          }
        }
      }

      return {
        length, sampleCount, unsupported, blockedSamples, initialHeight, finalHeight: previousHeight,
        maxStep, minimumSignClearance,
        traversable: unsupported === 0 && blockedSamples === 0 && minimumSignClearance >= 0 && maxStep <= maxStepHeight,
      };
    }

    return { gate: walk(gateRoute), stamp: walk(stampRoute), unsupportedSigns: signs.length - signVolumes.length / 2 };
  }

  return { gateRoute, stampRoute, stampStop, signs, survey };
}

export function mountMainSummitApproachSigns(owner: Group, approach: ReturnType<typeof createMainSummitApproach>, floorAt: FloorAt) {
  const elevations = approach.signs.map(sign => floorAt(sign.east, sign.north, postHalfWidth));
  if (elevations.some(height => height === undefined || !Number.isFinite(height))) {
    throw new RangeError('A mountain approach sign is off its surveyed terrace.');
  }

  const group = new Group();
  group.name = 'main-summit-approach-signs';
  const wood = new MeshLambertMaterial({ color: '#68462e' });
  const panel = new MeshLambertMaterial({ color: '#26343c' });
  const headings = { south: 0, north: Math.PI, east: Math.PI / 2 };
  const disposePanels: Array<() => void> = [];
  const boxes = approach.signs.flatMap((sign, index) => {
    const height = elevations[index]!;
    const frame = new Group();
    frame.name = sign.label;
    frame.position.set(sign.east, height, -sign.north);
    frame.rotation.y = headings[sign.facing];
    group.add(frame);
    const post = new Mesh(new BoxGeometry(postHalfWidth * 2, postHeight, postHalfWidth * 2), wood);
    post.position.y = postHeight / 2;
    const board = new Mesh(new BoxGeometry(sign.width, .42, .08), panel);
    board.position.y = postHeight + .13;
    frame.add(post, board);
    disposePanels.push(() => {
      post.geometry.dispose();
      board.geometry.dispose();
    });

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#26343c';
        ctx.fillRect(0, 0, 512, 160);
        ctx.strokeStyle = '#cfad73';
        ctx.lineWidth = 5;
        ctx.strokeRect(8, 8, 496, 144);
        ctx.fillStyle = '#f8e8c5';
        ctx.font = 'bold 64px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sign.label, 256, 84, 458);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const face = new Mesh(new PlaneGeometry(sign.width - .04, .38), new MeshBasicMaterial({ map: texture }));
        face.position.set(0, board.position.y, .041);
        frame.add(face);
        disposePanels.push(() => {
          face.geometry.dispose();
          face.material.dispose();
          texture.dispose();
        });
      }
    }

    return signFootprints(sign).map(({ width, depth, base, rise }) => ({
      east: sign.east, north: sign.north, height: height + base, width, depth, rise,
    }));
  });
  owner.add(group);

  let disposed = false;
  return {
    group,
    boxes,
    blocked(east: number, north: number, height: number, radius: number, standingHeight: number) {
      return !disposed && boxes.some(box => signClearance(box, east, north, height, radius, standingHeight) < 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposePanels) dispose();
      wood.dispose();
      panel.dispose();
    },
  };
}
