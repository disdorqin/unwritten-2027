import { Mesh, MeshLambertMaterial, PlaneGeometry } from 'three';
import { summitAssemblyAnchor, type mountMainSummitAssembly } from './main-summit-assembly';
import { mainSummitBounds, mainSummitLayout, mainSummitSpec } from './main-summit-block';

type Assembly = ReturnType<typeof mountMainSummitAssembly>;
type Foot = Readonly<{ east: number; north: number; height: number }>;

export const za22GateSeamNorth = summitAssemblyAnchor.north + mainSummitBounds.south;

/** Use the same survey and collision aperture as the P-1/P-7 assembly. */
export function mountZa22MountainGate(assembly: Assembly, host: { open(title: string, detail: string): void }) {
  const [width, plazaNorth] = mainSummitSpec.arrivalPlaza;
  const plazaSouth = mainSummitBounds.south;
  const geometry = new PlaneGeometry(width, plazaNorth - plazaSouth);
  const material = new MeshLambertMaterial({
    color: '#a8b5c3', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const plaza = new Mesh(geometry, material);
  plaza.name = 'za22-main-summit-arrival-floor';
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, assembly.arrivalHeight, -(plazaSouth + plazaNorth) / 2);
  plaza.visible = false;
  assembly.group.add(plaza);

  const board = assembly.stations.gate.guardroom.at(-1)!;

  function surfaceAt(east: number, north: number, radius = .27) {
    if (![east, north, radius].every(Number.isFinite) || radius < 0) return;
    const localEast = east - summitAssemblyAnchor.east;
    const localNorth = north - summitAssemblyAnchor.north;
    if (localNorth < plazaSouth || localNorth > plazaNorth - radius || Math.abs(localEast) > width / 2 - radius) return;
    return assembly.stations.heightAt(localEast, localNorth);
  }

  function acceptsStep(fromEast: number, fromNorth: number, toEast: number, toNorth: number, radius = .27) {
    if (![fromEast, fromNorth, toEast, toNorth, radius].every(Number.isFinite) || radius < 0) return false;
    if ((fromNorth < za22GateSeamNorth) === (toNorth < za22GateSeamNorth)) return true;
    const part = (za22GateSeamNorth - fromNorth) / (toNorth - fromNorth);
    const crossingEast = fromEast + part * (toEast - fromEast);
    const aperture = mainSummitLayout.gate.clearWidth / 2 - radius;
    return Math.abs(crossingEast - summitAssemblyAnchor.east) <= aperture;
  }

  return {
    surfaceAt,
    acceptsStep,
    update(position: Foot) { plaza.visible = position.north >= za22GateSeamNorth; },
    action({ east, north, height }: Foot) {
      if (Math.abs(height - board.height) > .43 ||
          Math.hypot(east - summitAssemblyAnchor.east - board.east,
            north - summitAssemblyAnchor.north - board.north) > 1.55) return;
      return {
        label: '查看山门班次',
        run() {
          host.open('山门班次与登记', '主峰缆车二线由云海台站通往绝顶站，单程约四分钟。登上绝顶后可到小屋登记领取雪翼。');
        },
      };
    },
    dispose() {
      plaza.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
