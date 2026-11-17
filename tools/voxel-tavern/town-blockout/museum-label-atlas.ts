import {
  BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, SRGBColorSpace,
} from 'three';

export type OpaqueMuseumLabel = {
  source: HTMLCanvasElement;
  parent: Group;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  yaw: number;
};

const sourceWidth = 512;
const padding = 16;
const pageSize = 2048;
const tileWidth = sourceWidth + padding * 2;
const columns = Math.floor(pageSize / tileWidth);
type Tile = { x: number; y: number; source: HTMLCanvasElement };
type Page = { heights: number[]; tiles: Tile[]; labels: { label: OpaqueMuseumLabel; tile: Tile }[] };

function paintTile(ink: CanvasRenderingContext2D, tile: Tile) {
  const { x, y, source } = tile;
  const { width, height } = source;
  ink.drawImage(source, x, y);
  // Extend each tile's real edge pixels so linear/mipmap filtering cannot pick up neighboring ink.
  ink.drawImage(source, 0, 0, width, 1, x, y - padding, width, padding);
  ink.drawImage(source, 0, height - 1, width, 1, x, y + height, width, padding);
  ink.drawImage(source, 0, 0, 1, height, x - padding, y, padding, height);
  ink.drawImage(source, width - 1, 0, 1, height, x + width, y, padding, height);
  for (const i of [0, 1]) for (const j of [0, 1]) {
    ink.drawImage(source, i * (width - 1), j * (height - 1), 1, 1,
      x + (i ? width : -padding), y + (j ? height : -padding), padding, padding);
  }
}

function renderPage(page: Page, smallLabels: Mesh[]) {
  const canvas = document.createElement('canvas');
  canvas.width = page.heights.filter(Boolean).length * tileWidth;
  canvas.height = Math.max(...page.heights);
  const ink = canvas.getContext('2d')!;
  for (const tile of page.tiles) paintTile(ink, tile);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  type Batch = { positions: number[]; uv: number[]; indices: number[] };
  const batches = new Map<Group, [Batch | undefined, Batch | undefined]>();
  for (const { label, tile } of page.labels) {
    const pair = batches.get(label.parent) ?? [undefined, undefined];
    if (!batches.has(label.parent)) batches.set(label.parent, pair);
    const kind = label.height <= 1.2 ? 1 : 0;
    const batch = pair[kind] ?? (pair[kind] = { positions: [], uv: [], indices: [] });
    const first = batch.positions.length / 3;
    const east = Math.cos(label.yaw) * label.width / 2;
    const north = -Math.sin(label.yaw) * label.width / 2;
    const top = label.y + label.height / 2;
    const bottom = label.y - label.height / 2;
    const left = tile.x / canvas.width;
    const right = (tile.x + tile.source.width) / canvas.width;
    const upper = 1 - tile.y / canvas.height;
    const lower = 1 - (tile.y + tile.source.height) / canvas.height;
    for (const [side, y, u, v] of [[-1, top, left, upper], [1, top, right, upper],
      [-1, bottom, left, lower], [1, bottom, right, lower]]) {
      batch.positions.push(label.x + side * east, y, label.z + side * north);
      batch.uv.push(u, v);
    }
    batch.indices.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
  }
  for (const [parent, pair] of batches) for (const [kind, batch] of pair.entries()) {
    if (!batch) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(batch.uv, 2));
    geometry.setIndex(batch.indices);
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Museum sign atlas';
    parent.add(mesh);
    if (kind === 1) smallLabels.push(mesh);
  }
}

export function addOpaqueMuseumLabels(labels: readonly OpaqueMuseumLabel[], smallLabels: Mesh[]) {
  const pages: Page[] = [];
  const placed = new Map<HTMLCanvasElement, { page: Page; tile: Tile }>();
  for (const label of [...labels].sort((a, b) => b.source.height - a.source.height)) {
    let place = placed.get(label.source);
    if (!place) {
      const height = label.source.height + padding * 2;
      let page = pages.find(candidate => candidate.heights.some(y => y + height <= pageSize));
      if (!page) {
        page = { heights: Array(columns).fill(0), tiles: [], labels: [] };
        pages.push(page);
      }
      const col = page.heights.findIndex(y => y + height <= pageSize);
      const tile = { x: col * tileWidth + padding, y: page.heights[col] + padding, source: label.source };
      page.heights[col] += height;
      page.tiles.push(tile);
      placed.set(label.source, place = { page, tile });
    }
    place.page.labels.push({ label, tile: place.tile });
  }
  for (const page of pages) renderPage(page, smallLabels);
}
