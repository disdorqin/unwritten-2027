export const PRESENCE_PATH = '/presence';
export const MAX_SESSIONS = 64;
export const MAX_VISIBLE = 48;
export const RECORD_BYTES = 12;
export const MASCOT_ACTOR_ID = 0xfffe;
export const CELL_METRES = 32;
export const TOWN_BOUNDS = { width: 640, depth: 512, height: 655.35 } as const;

export type PresenceRecord = {
  id: number;
  east: number;
  north: number;
  height: number;
  yaw: number;
  seq: number;
};

export type PresenceTier = { minOnline: number; radius: number; hz: number };
export const BASE_TIER: PresenceTier = { minOnline: 0, radius: 80, hz: 10 };

export function readRecord(data: Uint8Array): PresenceRecord | undefined {
  if (data.byteLength !== RECORD_BYTES) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    id: view.getUint16(0, true), east: view.getUint16(2, true), north: view.getUint16(4, true),
    height: view.getUint16(6, true), yaw: view.getUint16(8, true), seq: view.getUint16(10, true),
  };
}

export function writeSnapshot(records: readonly PresenceRecord[]): Buffer {
  const output = Buffer.allocUnsafe(1 + records.length * RECORD_BYTES);
  output[0] = records.length;
  for (const [i, record] of records.entries()) {
    const offset = 1 + i * RECORD_BYTES;
    output.writeUInt16LE(record.id, offset);
    output.writeUInt16LE(record.east, offset + 2);
    output.writeUInt16LE(record.north, offset + 4);
    output.writeUInt16LE(record.height, offset + 6);
    output.writeUInt16LE(record.yaw, offset + 8);
    output.writeUInt16LE(record.seq, offset + 10);
  }
  return output;
}

export function validName(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) return undefined;
  const name = value.trim();
  return name && Array.from(name).length <= 24 ? name : undefined;
}

export function checkTiers(input: readonly PresenceTier[]): readonly PresenceTier[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3 ||
      input[0]?.minOnline !== 0 || input[0]?.radius !== BASE_TIER.radius || input[0]?.hz !== BASE_TIER.hz) {
    throw new Error('Presence tiers must start with T0 [0 online, 80 m, 10 Hz].');
  }
  return input.map((tier, i) => {
    const before = input[i - 1];
    if (!Number.isInteger(tier.minOnline) || tier.minOnline > MAX_SESSIONS ||
        !Number.isFinite(tier.radius) || tier.radius < 1 || !Number.isFinite(tier.hz) || tier.hz < 1 ||
        (before && (tier.minOnline <= before.minOnline || tier.radius > before.radius || tier.hz > before.hz))) {
      throw new Error('Invalid presence tier: threshold must rise, radius and rate may only shrink.');
    }
    return { minOnline: tier.minOnline, radius: tier.radius, hz: tier.hz };
  });
}
