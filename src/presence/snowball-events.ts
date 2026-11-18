export const SNOWBALL_EVENT_PREFIX = 0xff;
const THROW = 1;
const HIT = 2;
const THROW_BYTES = 16;
const HIT_BYTES = 8;
const RELAY_ID_BYTES = 2;
const COORDINATE_SCALE = 100;
const DIRECTION_SCALE = 32767;

export type SnowballThrow = {
  ballId: number;
  east: number;
  north: number;
  height: number;
  dirX: number;
  dirY: number;
  dirZ: number;
};

export type SnowballHit = {
  ballId: number;
  throwerId: number;
  zone: 'head' | 'torso';
};

export type SnowballClientEvent = ({ kind: 'throw' } & SnowballThrow) | ({ kind: 'hit' } & SnowballHit);
export type SnowballRelayEvent = ({ kind: 'throw'; throwerId: number } & SnowballThrow)
  | ({ kind: 'hit'; confirmerId: number } & SnowballHit);
type Binary = ArrayBuffer | ArrayBufferView;

function viewOf(bytes: Binary): DataView {
  return ArrayBuffer.isView(bytes)
    ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new DataView(bytes);
}

function frame(kind: number, length: number, ballId: number): DataView {
  const view = new DataView(new ArrayBuffer(length));
  view.setUint8(0, SNOWBALL_EVENT_PREFIX);
  view.setUint8(1, kind);
  view.setUint16(2, ballId, true);
  return view;
}

function bytesOf(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function coordinate(value: number): number {
  return Math.max(0, Math.min(65535, Math.round(value * COORDINATE_SCALE)));
}

function writeThrow(event: SnowballThrow, throwerId?: number): Uint8Array {
  const relayed = throwerId !== undefined;
  const view = frame(THROW, THROW_BYTES + (relayed ? RELAY_ID_BYTES : 0), event.ballId);
  const origin = relayed ? 6 : 4;
  if (relayed) view.setUint16(4, throwerId, true);
  view.setUint16(origin, coordinate(event.east), true);
  view.setUint16(origin + 2, coordinate(event.north), true);
  view.setUint16(origin + 4, coordinate(event.height), true);
  const length = Math.hypot(event.dirX, event.dirY, event.dirZ) || 1;
  view.setInt16(origin + 6, Math.round(event.dirX * DIRECTION_SCALE / length), true);
  view.setInt16(origin + 8, Math.round(event.dirY * DIRECTION_SCALE / length), true);
  view.setInt16(origin + 10, Math.round(event.dirZ * DIRECTION_SCALE / length), true);
  return bytesOf(view);
}

function writeHit(event: SnowballHit, confirmerId?: number): Uint8Array {
  const relayed = confirmerId !== undefined;
  const view = frame(HIT, HIT_BYTES + (relayed ? RELAY_ID_BYTES : 0), event.ballId);
  view.setUint16(4, event.throwerId, true);
  if (relayed) view.setUint16(6, confirmerId, true);
  // The last byte reserves the size promised by the protocol's 8 B / 10 B envelope.
  view.setUint8(relayed ? 8 : 6, event.zone === 'head' ? 1 : 0);
  return bytesOf(view);
}

export function encodeSnowballThrow(event: SnowballThrow): Uint8Array {
  return writeThrow(event);
}

export function encodeSnowballHit(event: SnowballHit): Uint8Array {
  return writeHit(event);
}

export function encodeSnowballRelay(event: SnowballRelayEvent): Uint8Array {
  return event.kind === 'throw' ? writeThrow(event, event.throwerId) : writeHit(event, event.confirmerId);
}

function readThrow(view: DataView, offset: number, origin: number): SnowballThrow | undefined {
  const dirX = view.getInt16(origin + 6, true) / DIRECTION_SCALE;
  const dirY = view.getInt16(origin + 8, true) / DIRECTION_SCALE;
  const dirZ = view.getInt16(origin + 10, true) / DIRECTION_SCALE;
  const length = Math.hypot(dirX, dirY, dirZ);
  if (length < .5 || length > 2) return undefined;
  return {
    ballId: view.getUint16(offset + 2, true),
    east: view.getUint16(origin, true) / COORDINATE_SCALE,
    north: view.getUint16(origin + 2, true) / COORDINATE_SCALE,
    height: view.getUint16(origin + 4, true) / COORDINATE_SCALE,
    dirX: dirX / length,
    dirY: dirY / length,
    dirZ: dirZ / length,
  };
}

function readHit(view: DataView, offset: number, zoneOffset: number): SnowballHit | undefined {
  const zone = view.getUint8(zoneOffset);
  const throwerId = view.getUint16(offset + 4, true);
  if (!throwerId || zone > 1 || view.getUint8(zoneOffset + 1)) return undefined;
  return { ballId: view.getUint16(offset + 2, true), throwerId, zone: zone ? 'head' : 'torso' };
}

export function decodeSnowballClientEvent(bytes: Binary): SnowballClientEvent | undefined {
  const view = viewOf(bytes);
  if (view.byteLength < 2 || view.getUint8(0) !== SNOWBALL_EVENT_PREFIX) return undefined;
  const kind = view.getUint8(1);
  if (kind === THROW && view.byteLength === THROW_BYTES) {
    const value = readThrow(view, 0, 4);
    return value && { kind: 'throw', ...value };
  }
  if (kind === HIT && view.byteLength === HIT_BYTES) {
    const value = readHit(view, 0, 6);
    return value && { kind: 'hit', ...value };
  }
  return undefined;
}

export function decodeSnowballEvents(bytes: Binary): SnowballRelayEvent[] | null {
  const view = viewOf(bytes);
  if (!view.byteLength) return null;
  const events: SnowballRelayEvent[] = [];
  let offset = 0;
  while (offset < view.byteLength) {
    if (offset + 2 > view.byteLength || view.getUint8(offset) !== SNOWBALL_EVENT_PREFIX) return null;
    const kind = view.getUint8(offset + 1);
    if (kind !== THROW && kind !== HIT) return null;
    const size = (kind === THROW ? THROW_BYTES : HIT_BYTES) + RELAY_ID_BYTES;
    if (offset + size > view.byteLength) return null;
    if (kind === THROW) {
      const value = readThrow(view, offset, offset + 6);
      const throwerId = view.getUint16(offset + 4, true);
      if (!value || !throwerId) return null;
      events.push({ kind: 'throw', throwerId, ...value });
    } else {
      const value = readHit(view, offset, offset + 8);
      const confirmerId = view.getUint16(offset + 6, true);
      if (!value || !confirmerId || confirmerId === value.throwerId) return null;
      events.push({ kind: 'hit', confirmerId, ...value });
    }
    offset += size;
  }
  return events;
}
