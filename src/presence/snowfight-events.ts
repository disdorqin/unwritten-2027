// D1 团队雪仗二进制事件（沿 P2b 0xFF 事件层扩展，kind 3–6；kind 1/2 为雪球投掷/命中）。
// 客户端→服务端：PLACE（请求放墙，层高由服务端按列高裁定）、WALL_HIT（雪球命中墙的模拟端报告）。
// 服务端→客户端：WALL_SET（块落定/受损后的权威状态）、WALL_CLEAR（块塌落批量移除）。
// 车道 B 追加 kind 7 SLED_SMASH（雪橇高速撞穿一层墙的骑乘端报告，服务端裁定销毁，见 decode/encode）。
import { SNOWBALL_EVENT_PREFIX } from './snowball-events.js';
import { WALL_TOWN_CAP, type SnowfightTeam, type WallBlock } from './snowfight.js';

export const SNOWFIGHT_PLACE = 3;
export const SNOWFIGHT_WALL_HIT = 4;
export const SNOWFIGHT_WALL_SET = 5;
export const SNOWFIGHT_WALL_CLEAR = 6;
export const SNOWFIGHT_SLED_SMASH = 7;

const PLACE_BYTES = 8;
// 13 字节：刻意避开 12 字节 presence 位置记录的长度，避免被服务端分发误判为状态记录。
const WALL_HIT_BYTES = 13;
// 8 字节：gx/gy u16 + 速度 u8 + 保留字节；同样避开 12 字节（理由同 WALL_HIT 注）。
const SLED_SMASH_BYTES = 8;
const WALL_SET_BYTES = 12;
const MAX_GRID_X = 1280; // 640 m / 0.5 m
const MAX_GRID_Y = 1024; // 512 m / 0.5 m
export const WALL_CLEAR_CHUNK = 40;

export type SnowfightClientEvent =
  | { kind: 'place'; gx: number; gy: number }
  | { kind: 'wall-hit'; gx: number; gy: number; layer: number; ballId: number; throwerId: number }
  | { kind: 'sled-smash'; gx: number; gy: number; speed: number };

export type SnowfightRelayEvent =
  | { kind: 'wall-set'; gx: number; gy: number; layer: number; hp: number; ownerId: number; team: SnowfightTeam }
  | { kind: 'wall-clear'; blocks: readonly { gx: number; gy: number; layer: number }[] };

type Binary = ArrayBuffer | ArrayBufferView;

function viewOf(bytes: Binary): DataView {
  return ArrayBuffer.isView(bytes)
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new DataView(bytes);
}

function frame(kind: number, length: number): DataView {
  const view = new DataView(new ArrayBuffer(length));
  view.setUint8(0, SNOWBALL_EVENT_PREFIX);
  view.setUint8(1, kind);
  return view;
}

function bytesOf(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function validCell(gx: number, gy: number): boolean {
  return Number.isInteger(gx) && Number.isInteger(gy) && gx >= 0 && gy >= 0 && gx < MAX_GRID_X && gy < MAX_GRID_Y;
}

export function encodeWallPlace(gx: number, gy: number): Uint8Array {
  const view = frame(SNOWFIGHT_PLACE, PLACE_BYTES);
  view.setUint16(2, gx, true);
  view.setUint16(4, gy, true);
  return bytesOf(view);
}

export function encodeWallHit(event: { gx: number; gy: number; layer: number; ballId: number; throwerId: number }): Uint8Array {
  const view = frame(SNOWFIGHT_WALL_HIT, WALL_HIT_BYTES);
  view.setUint16(2, event.gx, true);
  view.setUint16(4, event.gy, true);
  view.setUint8(6, event.layer);
  view.setUint16(8, event.ballId, true);
  view.setUint16(10, event.throwerId, true);
  view.setUint8(12, 0); // 保留字节（帧长 13，见 WALL_HIT_BYTES 注）
  return bytesOf(view);
}

/** 雪橇撞穿报告：speed 为骑乘端实测 m/s（取整），服务端只作 >6 闸门与上限合理性校验。 */
export function encodeSledSmash(event: { gx: number; gy: number; speed: number }): Uint8Array {
  const view = frame(SNOWFIGHT_SLED_SMASH, SLED_SMASH_BYTES);
  view.setUint16(2, event.gx, true);
  view.setUint16(4, event.gy, true);
  view.setUint8(6, Math.max(0, Math.min(255, Math.round(event.speed))));
  view.setUint8(7, 0); // 保留字节（帧长 8，见 SLED_SMASH_BYTES 注）
  return bytesOf(view);
}

export function encodeWallSet(block: WallBlock): Uint8Array {
  const view = frame(SNOWFIGHT_WALL_SET, WALL_SET_BYTES);
  view.setUint16(2, block.gx, true);
  view.setUint16(4, block.gy, true);
  view.setUint8(6, block.layer);
  view.setUint8(7, block.hp);
  view.setUint16(8, block.ownerId, true);
  view.setUint8(10, block.team);
  return bytesOf(view);
}

export function encodeWallClear(blocks: readonly { gx: number; gy: number; layer: number }[]): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let i = 0; i < blocks.length; i += WALL_CLEAR_CHUNK) {
    const chunk = blocks.slice(i, i + WALL_CLEAR_CHUNK);
    const view = frame(SNOWFIGHT_WALL_CLEAR, 3 + chunk.length * 5);
    view.setUint8(2, chunk.length);
    chunk.forEach((block, j) => {
      const offset = 3 + j * 5;
      view.setUint16(offset, block.gx, true);
      view.setUint16(offset + 2, block.gy, true);
      view.setUint8(offset + 4, block.layer);
    });
    frames.push(bytesOf(view));
  }
  return frames;
}

export function decodeSnowfightClientEvent(bytes: Binary): SnowfightClientEvent | undefined {
  const view = viewOf(bytes);
  if (view.byteLength < 2 || view.getUint8(0) !== SNOWBALL_EVENT_PREFIX) return undefined;
  const kind = view.getUint8(1);
  if (kind === SNOWFIGHT_PLACE && view.byteLength === PLACE_BYTES) {
    const gx = view.getUint16(2, true);
    const gy = view.getUint16(4, true);
    return validCell(gx, gy) ? { kind: 'place', gx, gy } : undefined;
  }
  if (kind === SNOWFIGHT_WALL_HIT && view.byteLength === WALL_HIT_BYTES) {
    const gx = view.getUint16(2, true);
    const gy = view.getUint16(4, true);
    const layer = view.getUint8(6);
    const ballId = view.getUint16(8, true);
    const throwerId = view.getUint16(10, true);
    if (!validCell(gx, gy) || layer > 3 || !throwerId) return undefined;
    return { kind: 'wall-hit', gx, gy, layer, ballId, throwerId };
  }
  if (kind === SNOWFIGHT_SLED_SMASH && view.byteLength === SLED_SMASH_BYTES) {
    const gx = view.getUint16(2, true);
    const gy = view.getUint16(4, true);
    const speed = view.getUint8(6);
    if (!validCell(gx, gy)) return undefined;
    return { kind: 'sled-smash', gx, gy, speed };
  }
  return undefined;
}

export function decodeSnowfightRelay(bytes: Binary): SnowfightRelayEvent[] | null {
  const view = viewOf(bytes);
  if (!view.byteLength) return null;
  const events: SnowfightRelayEvent[] = [];
  let offset = 0;
  while (offset < view.byteLength) {
    if (offset + 2 > view.byteLength || view.getUint8(offset) !== SNOWBALL_EVENT_PREFIX) return null;
    const kind = view.getUint8(offset + 1);
    if (kind === SNOWFIGHT_WALL_SET) {
      if (offset + WALL_SET_BYTES > view.byteLength) return null;
      const gx = view.getUint16(offset + 2, true);
      const gy = view.getUint16(offset + 4, true);
      const layer = view.getUint8(offset + 6);
      const hp = view.getUint8(offset + 7);
      const ownerId = view.getUint16(offset + 8, true);
      const team = view.getUint8(offset + 10);
      if (!validCell(gx, gy) || layer > 3 || hp < 1 || hp > 3 || (team !== 0 && team !== 1)) return null;
      events.push({ kind: 'wall-set', gx, gy, layer, hp, ownerId, team: team as SnowfightTeam });
      offset += WALL_SET_BYTES;
    } else if (kind === SNOWFIGHT_WALL_CLEAR) {
      if (offset + 3 > view.byteLength) return null;
      const count = view.getUint8(offset + 2);
      if (count < 1 || count > WALL_TOWN_CAP || offset + 3 + count * 5 > view.byteLength) return null;
      const blocks: { gx: number; gy: number; layer: number }[] = [];
      for (let j = 0; j < count; j++) {
        const at = offset + 3 + j * 5;
        const gx = view.getUint16(at, true);
        const gy = view.getUint16(at + 2, true);
        const layer = view.getUint8(at + 4);
        if (!validCell(gx, gy) || layer > 3) return null;
        blocks.push({ gx, gy, layer });
      }
      events.push({ kind: 'wall-clear', blocks });
      offset += 3 + count * 5;
    } else return null;
  }
  return events;
}
