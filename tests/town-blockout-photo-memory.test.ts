import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import { townCeremonyMidnight } from '../src/presence/ceremony-arrival.ts';
import { createTownPhotoMemory } from '../src/presence/town-photo-memory.ts';
import { townPhotoCaption, townPlazaPhotoLocation } from '../src/shared/town-photo-caption.ts';
import { createPlazaGroupPhoto } from '../tools/voxel-tavern/town-blockout/plaza-group-photo.ts';

const townPoints = new Map([['plaza', townPlazaPhotoLocation]]);
const memory = () => createTownPhotoMemory({
  photoPoints: townPoints,
  midnight: { pointId: 'plaza', captureAt: townCeremonyMidnight },
  canVisit: (visitor, owner) => visitor === 'visitor' && owner === 'owner',
});

test('the midnight capture issues the same receipt only to the frozen attendance', () => {
  const photos = memory();
  const present = ['owner', 'visitor', 'visitor'];
  assert.equal(photos.recordMidnight('town-2027', townCeremonyMidnight - 1, present), false);
  assert.equal(photos.recordMidnight('https://example.com/upload.png', townCeremonyMidnight, present), false);
  assert.equal(photos.recordMidnight('town-2027', townCeremonyMidnight, present), true);
  present.push('late');
  assert.deepEqual(photos.midnightFor('owner'), {
    id: 'town-2027', source: 'midnight', pointId: 'plaza', capturedAt: townCeremonyMidnight,
    caption: '中央广场 · 2027-01-01',
  });
  assert.equal(photos.midnightFor('visitor'), photos.midnightFor('owner'));
  assert.equal(photos.midnightFor('absent'), undefined);
  assert.equal(photos.midnightFor('late'), undefined);
  assert.equal(photos.recordMidnight('retry', townCeremonyMidnight, ['late']), false);
  assert.equal(photos.midnightFor('late'), undefined);
  assert.ok(Object.isFrozen(photos.midnightFor('owner')));
});

test('three personal frames and one midnight centerpiece preserve owner and visitor permissions', () => {
  const photos = memory();
  assert.equal(photos.recordSelfie('owner', 'upload', 'missing-place', townCeremonyMidnight), undefined);
  assert.equal(photos.recordSelfie('owner', 'https://example.com/upload.png', 'plaza', townCeremonyMidnight), undefined);
  assert.equal(photos.recordSelfie('owner', 'data:image/png;base64,AA==', 'plaza', townCeremonyMidnight), undefined);
  assert.equal(photos.recordSelfie('owner', 'blob:example', 'plaza', townCeremonyMidnight), undefined);
  const first = photos.recordSelfie('owner', 'capture-first', 'plaza', townCeremonyMidnight - 1);
  const second = photos.recordSelfie('owner', 'capture-second', 'plaza', townCeremonyMidnight);
  assert.equal(first?.caption, '中央广场 · 2026-12-31');
  assert.equal(second?.caption, '中央广场 · 2027-01-01');
  assert.equal(photos.recordSelfie('other-owner', 'capture-first', 'plaza', townCeremonyMidnight), undefined);
  assert.equal(photos.setHomeFrame('owner', 0, first!.id), false);
  assert.equal(photos.setHomeFrame('owner', 4, first!.id), false);
  assert.equal(photos.setHomeFrame('owner', 4, null), false);
  assert.equal(photos.setHomeFrame('visitor', 1, first!.id), false);
  assert.equal(photos.setHomeFrame('owner', 1, 'https://example.com/upload.png'), false);
  assert.equal(photos.recordMidnight('town-2027', townCeremonyMidnight, ['owner']), true);
  assert.equal(photos.setHomeFrame('owner', 1, 'town-2027'), false);
  assert.equal(photos.setHomeFrame('owner', 1, first!.id), true);
  assert.equal(photos.setHomeFrame('owner', 3, second!.id), true);
  const centerpiece = photos.midnightFor('owner');
  assert.ok(centerpiece);
  assert.deepEqual(photos.homeFramesFor('visitor', 'owner'), { personal: [first, null, second], centerpiece });
  assert.deepEqual(photos.homeFramesFor('absent', 'absent'), { personal: [null, null, null], centerpiece: null });
  assert.equal(photos.homeFramesFor('uninvited', 'owner'), undefined);
  assert.equal(photos.setHomeFrame('owner', 1, null), true);
  assert.deepEqual(photos.homeFramesFor('owner', 'owner'), { personal: [null, null, second], centerpiece });
});

test('the photo stamp derives its date from the capture clock rather than the device timezone', () => {
  assert.equal(townPhotoCaption(townPlazaPhotoLocation, townCeremonyMidnight - 1), '中央广场 · 2026-12-31');
  assert.equal(townPhotoCaption(townPlazaPhotoLocation, townCeremonyMidnight), '中央广场 · 2027-01-01');
  assert.equal(townPhotoCaption(townPlazaPhotoLocation, Number.MAX_SAFE_INTEGER), undefined);
  assert.equal(townPhotoCaption(townPlazaPhotoLocation, NaN), undefined);
});

class FakeElement {
  hidden = false;
  disabled = false;
  width = 0;
  height = 0;
  value = '';
  readonly children: (FakeElement | string)[] = [];
  readonly dataset = {};
  onchange?: () => void;
  strokes = 0;
  readonly captions: string[] = [];

  append(...children: (FakeElement | string)[]) { this.children.push(...children); }
  setAttribute() {}
  add(option: { value: string }) { this.value ||= option.value; }
  getContext() {
    return {
      drawImage() {}, fillRect() {}, measureText: () => ({ width: 40 }),
      fillText: (text: string) => { this.captions.push(text); },
      strokeRect: () => { this.strokes++; },
    };
  }
}

test('the existing plaza renderer paints the same place and date with or without a frame', t => {
  const replacements = {
    document: { createElement: () => new FakeElement(), body: new FakeElement() },
    Option: class { constructor(_label: string, readonly value: string) {} },
  };
  for (const [key, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });

  let now = townCeremonyMidnight - 4_000;
  const player = { id: 1, name: '镇民', east: 224, north: 182, height: 12, active: true };
  const preview = new FakeElement();
  const photo = createPlazaGroupPhoto({
    now: () => now, ownId: () => player.id, request: () => true, leave: () => undefined,
    nearby: () => [player], announce: () => undefined, open: () => preview as unknown as HTMLElement,
  });
  const invite = { type: 'event', kind: 'plaza-photo-invite', id: 1, captureAt: townCeremonyMidnight } as const;
  photo.receive(invite);
  photo.receive({ ...invite, kind: 'plaza-photo-lineup', people: [player] });
  photo.update(player);
  now = townCeremonyMidnight;
  const frame = photo.update(player);
  assert.ok(frame?.shutter);
  const source = new FakeElement();
  source.width = 1200;
  source.height = 800;
  photo.capture(source as unknown as HTMLCanvasElement, new PerspectiveCamera(), frame);
  const wrapper = preview.children[0] as FakeElement;
  const output = wrapper.children[0] as FakeElement;
  const frameSelector = wrapper.children[2] as FakeElement;
  assert.equal(output.captions.at(-1), '中央广场 · 2027-01-01');
  assert.equal(output.strokes, 1);
  frameSelector.value = 'none';
  frameSelector.onchange?.();
  assert.equal(output.captions.filter(caption => caption === '中央广场 · 2027-01-01').length, 2);
  assert.equal(output.strokes, 1);
});
