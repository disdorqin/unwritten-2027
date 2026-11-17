import {
  BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, Scene, SRGBColorSpace,
} from 'three';

const boardEast = 219.8;
const boardNorth = 173.2;
const timber = '#674838';
const boardEdge = '#8a6448';
const ice = '#c6dce8';

function boardFace() {
  const canvas = document.createElement('canvas');
  canvas.width = 448;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#203746';
  ctx.fillRect(0, 0, 448, 256);
  ctx.strokeStyle = '#c6a06b';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 15, 416, 226);
  ctx.strokeStyle = '#68828c';
  ctx.lineWidth = 1;
  ctx.strokeRect(23, 22, 402, 212);
  ctx.beginPath();
  ctx.moveTo(78, 157);
  ctx.lineTo(370, 157);
  ctx.stroke();

  ctx.fillStyle = '#fff3d7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 74px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('雪仗榜', 224, 105);
  ctx.fillStyle = '#c3dae5';
  ctx.font = '32px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('靠近查看', 224, 193);
  for (const x of [48, 400]) {
    ctx.strokeStyle = '#9cb8cb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      const angle = arm * Math.PI / 3;
      ctx.moveTo(x, 66);
      ctx.lineTo(x + 11 * Math.cos(angle), 66 + 11 * Math.sin(angle));
    }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function addTownSnowBoard(scene: Scene, heightAt: (east: number, north: number) => number) {
  const ground = heightAt(boardEast, boardNorth);
  const board = new Group();
  board.name = 'Clock plaza snow fight board';
  board.position.set(boardEast, ground, -boardNorth);
  const parts = [
    ...[-.69, .69].flatMap(x => [
      { x, y: .08, z: 0, w: .34, h: .24, d: .42, color: '#6c7d8e' },
      { x, y: .82, z: 0, w: .19, h: 1.54, d: .22, color: timber },
      { x, y: .24, z: 0, w: .23, h: .11, d: .27, color: boardEdge },
    ]),
    { x: 0, y: 1.55, z: 0, w: 1.78, h: 1.01, d: .24, color: timber },
    { x: 0, y: 1.08, z: 0, w: 1.85, h: .12, d: .31, color: boardEdge },
    { x: 0, y: 2.05, z: 0, w: 1.96, h: .14, d: .48, color: boardEdge },
    { x: 0, y: 2.14, z: 0, w: 1.94, h: .07, d: .46, color: ice },
    { x: -.48, y: 2.19, z: .04, w: .79, h: .055, d: .27, color: '#deebf4' },
    { x: .52, y: 2.185, z: -.055, w: .57, h: .045, d: .29, color: '#deebf4' },
    { x: -.82, y: 2.12, z: .24, w: .22, h: .09, d: .06, color: ice },
    { x: .7, y: 2.11, z: -.24, w: .31, h: .075, d: .06, color: ice },
  ];
  const frame = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), parts.length);
  const shape = new Object3D();
  parts.forEach(({ x, y, z, w, h, d, color }, index) => {
    shape.position.set(x, y, z);
    shape.scale.set(w, h, d);
    shape.updateMatrix();
    frame.setMatrixAt(index, shape.matrix);
    frame.setColorAt(index, new Color(color));
  });
  frame.computeBoundingSphere();

  const faces = new InstancedMesh(new PlaneGeometry(1.55, .886), new MeshBasicMaterial({ map: boardFace() }), 2);
  shape.scale.setScalar(1);
  for (const [index, side] of [1, -1].entries()) {
    shape.position.set(0, 1.55, side * .122);
    shape.rotation.y = side === 1 ? 0 : Math.PI;
    shape.updateMatrix();
    faces.setMatrixAt(index, shape.matrix);
  }
  faces.computeBoundingSphere();
  board.add(frame, faces);
  board.updateMatrix();
  board.matrixAutoUpdate = false;
  scene.add(board);
  return { x: boardEast, n: boardNorth, ground };
}
