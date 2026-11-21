import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial,
} from 'three';

/**
 * Wind-waiting ground (§4 / revision chapter 1) at the glide launch point:
 * a cloth windsock on a frame and a wind-measuring prayer-flag pole —
 * deliberately separate from the summit prayer-flag pole. Wind signals
 * live in the scene only (sock, flags, banner cloud), never in UI bars.
 * Sway here is a local stand-in cycle; the ZB-20 wind feed replaces the
 * driver values when the interaction round wires it.
 */
export function createMainSummitWindGround(launch: { east: number; north: number; height: number }) {
  const group = new Group();
  group.name = 'main-summit-wind-ground';
  const disposers: (() => void)[] = [];
  const timber = new MeshLambertMaterial({ color: '#5d4630' });
  const iron = new MeshLambertMaterial({ color: '#3c4147' });
  const clothOrange = new MeshLambertMaterial({ color: '#e2703a' });
  const clothWhite = new MeshLambertMaterial({ color: '#e8e2cf' });
  disposers.push(() => { timber.dispose(); iron.dispose(); clothOrange.dispose(); clothWhite.dispose(); });
  const base = launch.height;

  // Windsock frame: pole + pivot arm + three-section cloth sock.
  const sockEast = launch.east + 4.2, sockNorth = launch.north + 1;
  const sockPole = new Mesh(new CylinderGeometry(.07, .1, 4.4, 6), timber);
  sockPole.name = 'wind-sock-frame';
  sockPole.position.set(sockEast, base + 2.2, -sockNorth);
  group.add(sockPole);
  disposers.push(() => sockPole.geometry.dispose());
  const sock = new Group();
  sock.name = 'wind-sock-cloth';
  sock.position.set(sockEast, base + 4.25, -sockNorth);
  const sockSections: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const section = new Mesh(new ConeGeometry(.3 - i * .07, .62, 8),
      i % 2 ? clothWhite : clothOrange);
    section.rotation.z = Math.PI / 2;
    section.position.x = .31 + i * .6;
    sock.add(section);
    sockSections.push(section);
    disposers.push(() => section.geometry.dispose());
  }
  group.add(sock);

  // Wind-measuring prayer-flag pole: tall pole, five pennants on a line.
  const poleEast = launch.east - 4.4, poleNorth = launch.north + 1.5;
  const pole = new Mesh(new CylinderGeometry(.06, .09, 6, 6), timber);
  pole.name = 'wind-measure-flag-pole';
  pole.position.set(poleEast, base + 3, -poleNorth);
  group.add(pole);
  disposers.push(() => pole.geometry.dispose());
  const flagColors = ['#3f6fb5', '#e8e2cf', '#c33f31', '#3f8a4f', '#e3b505'];
  const flags: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const flagMaterial = new MeshLambertMaterial({ color: flagColors[i]! });
    const flag = new Mesh(new BoxGeometry(.5, .34, .02), flagMaterial);
    flag.name = `wind-measure-flag-${i}`;
    flag.position.set(poleEast + .28, base + 5.6 - i * .5, -poleNorth);
    group.add(flag);
    flags.push(flag);
    disposers.push(() => { flag.geometry.dispose(); flagMaterial.dispose(); });
  }

  let disposed = false;
  return {
    group,
    sock, flags,
    /** Local stand-in wind cycle until the ZB-20 feed is wired. */
    update(seconds: number) {
      const gust = .5 + .5 * Math.sin(seconds * .4) + .25 * Math.sin(seconds * 1.7);
      sock.rotation.y = Math.sin(seconds * .23) * .5;
      sock.rotation.z = -.12 - gust * .1;
      sockSections.forEach((section, i) => {
        section.rotation.y = Math.sin(seconds * 2.1 + i * .8) * .18 * gust;
      });
      flags.forEach((flag, i) => {
        flag.rotation.y = Math.sin(seconds * 2.6 + i * 1.1) * .45 * gust;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}
