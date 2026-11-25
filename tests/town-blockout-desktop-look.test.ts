import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDesktopLook, type DesktopLookLockFailure,
} from '../tools/voxel-tavern/town-blockout/desktop-look.ts';

type Handler = (event: never) => void;

class FakeEmitter {
  private handlers = new Map<string, Set<Handler>>();
  addEventListener(type: string, handler: Handler) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, set = new Set());
    set.add(handler);
  }
  emit(type: string, event: unknown = {}) {
    for (const handler of this.handlers.get(type) ?? []) {
      (handler as (event: unknown) => void)(event);
    }
  }
}

class FakeDocument extends FakeEmitter {
  pointerLockElement: unknown = null;
  defaultView = null;
  exitPointerLock() {
    this.pointerLockElement = null;
    this.emit('pointerlockchange');
  }
}

class FakeCanvas extends FakeEmitter {
  constructor(readonly ownerDocument: FakeDocument) { super(); }
  requestPointerLock: (() => Promise<void> | undefined) | undefined;
  focus() {}
  hasPointerCapture() { return false; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function fixture(request?: () => Promise<void> | undefined, fallback = false) {
  const doc = new FakeDocument();
  const canvas = new FakeCanvas(doc);
  let requests = 0;
  if (request) {
    canvas.requestPointerLock = () => {
      requests++;
      return request();
    };
  }
  const failures: DesktopLookLockFailure[] = [];
  const changes: boolean[] = [];
  const turns: number[][] = [];
  let allowed = true;
  let primaryCount = 0;
  const look = createDesktopLook(canvas as unknown as HTMLCanvasElement, () => allowed, (yaw, pitch) => turns.push([yaw, pitch]), {
    onLockFailed: reason => failures.push(reason),
    onLockChange: locked => changes.push(locked),
    onFallbackPrimary: fallback ? () => { primaryCount++; } : undefined,
  });
  function pointer(type: string, timeStamp = 0, clientX = 0, { button = 0, pointerId = 7 } = {}) {
    canvas.emit(type, { pointerType: 'mouse', button, pointerId, clientX, clientY: 0, timeStamp });
  }
  return {
    doc, canvas, look, failures, changes, turns, pointer,
    pointerDown: () => pointer('pointerdown'),
    setAllowed: (next: boolean) => { allowed = next; },
    requests: () => requests,
    primaryCount: () => primaryCount,
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10));

test('desktop look: missing Pointer Lock API reports unsupported and stays retryable', () => {
  const { look, failures, pointerDown } = fixture();
  pointerDown();
  assert.deepEqual(failures, ['unsupported']);
  look.engage();
  assert.deepEqual(failures, ['unsupported', 'unsupported']);
});

test('desktop look: rejected request reports rejected and clears the pending flag', async () => {
  const { failures, pointerDown, requests } = fixture(
    () => Promise.reject(new Error('denied')));
  pointerDown();
  await settle();
  assert.deepEqual(failures, ['rejected']);
  pointerDown();
  assert.equal(requests(), 2);
  await settle();
  assert.deepEqual(failures, ['rejected', 'rejected']);
});

test('desktop look: pointerlockerror reports error and clears the pending flag', () => {
  const { doc, failures, look, requests } = fixture(() => new Promise<void>(() => {}));
  look.engage();
  assert.equal(requests(), 1);
  doc.emit('pointerlockerror');
  assert.deepEqual(failures, ['error']);
  look.engage();
  assert.equal(requests(), 2);
});

test('desktop look: pending request auto-clears after 1.5 s when the browser stays silent', async () => {
  // Safari-style request: returns undefined, never fires lock events.
  const { pointerDown, requests } = fixture(() => undefined);
  pointerDown();
  pointerDown();
  assert.equal(requests(), 1);
  await new Promise(resolve => setTimeout(resolve, 1650));
  pointerDown();
  assert.equal(requests(), 2);
});

test('desktop look: lock and unlock report onLockChange, engage is a no-op while locked', async () => {
  let doc!: FakeDocument;
  let canvas!: FakeCanvas;
  const made = fixture(() => {
    doc.pointerLockElement = canvas;
    doc.emit('pointerlockchange');
    return Promise.resolve();
  });
  doc = made.doc;
  canvas = made.canvas;
  made.pointerDown();
  await settle();
  assert.deepEqual(made.changes, [true]);
  made.look.engage();
  assert.equal(made.requests(), 1);
  doc.pointerLockElement = null;
  doc.emit('pointerlockchange');
  assert.deepEqual(made.changes, [true, false]);
});

test('desktop look: engage() requests once and ignores repeats while pending', () => {
  const { look, requests } = fixture(() => new Promise<void>(() => {}));
  look.engage();
  look.engage();
  assert.equal(requests(), 1);
});

test('desktop fallback: unsupported lock consumes the first click, and a later left tap acts once', () => {
  const { pointer, failures, primaryCount } = fixture(undefined, true);
  pointer('pointerdown', 0);
  pointer('pointerup', 40);
  assert.deepEqual(failures, ['unsupported']);
  assert.equal(primaryCount(), 0);

  pointer('pointerdown', 100);
  pointer('pointerdown', 110);
  pointer('pointerup', 140);
  pointer('pointerup', 142);
  pointer('click', 145);
  pointer('dblclick', 146);
  pointer('pointerdown', 200, 0, { button: 2 });
  pointer('pointerup', 230, 0, { button: 2 });
  assert.equal(primaryCount(), 1);
});

test('desktop fallback: pending presses do not act, and the explicit lock control can retry', async () => {
  let rejectFirst!: (reason?: unknown) => void;
  const attempt = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
  const first = fixture(() => {
    if (first.requests() === 1) return attempt;
    first.doc.pointerLockElement = first.canvas;
    first.doc.emit('pointerlockchange');
    return Promise.resolve();
  }, true);
  const { pointer, primaryCount } = first;
  pointer('pointerdown', 0);
  pointer('pointerup', 40);
  pointer('pointerdown', 100);
  rejectFirst(new Error('denied'));
  await settle();
  pointer('pointerup', 140);
  assert.equal(first.requests(), 1);
  assert.equal(primaryCount(), 0);

  pointer('pointerdown', 200);
  pointer('pointerup', 240);
  assert.equal(primaryCount(), 1);
  assert.equal(first.requests(), 1);

  first.look.engage();
  assert.deepEqual(first.changes, [true]);
  pointer('pointerdown', 300);
  pointer('pointerup', 340);
  first.doc.exitPointerLock();
  pointer('pointerdown', 400);
  pointer('pointerup', 440);
  assert.equal(first.requests(), 3);
  assert.equal(primaryCount(), 1);
});

test('desktop fallback: a silent browser reaches fallback after the request deadline', {
  concurrency: true,
}, async () => {
  const { failures, pointer, primaryCount, requests } = fixture(() => undefined, true);
  pointer('pointerdown', 0);
  pointer('pointerup', 40);
  pointer('pointerdown', 100);
  pointer('pointerup', 140);
  assert.equal(primaryCount(), 0);
  await new Promise(resolve => setTimeout(resolve, 1650));
  assert.deepEqual(failures, ['error']);
  pointer('pointerdown', 2000);
  pointer('pointerup', 2040);
  assert.equal(requests(), 1);
  assert.equal(primaryCount(), 1);
});

test('desktop fallback: drag, long press, modal and cancelled gestures never fire', () => {
  const { pointer, look, primaryCount, setAllowed, turns } = fixture(undefined, true);
  pointer('pointerdown', 0);
  pointer('pointerup', 40);

  pointer('pointerdown', 100);
  pointer('pointermove', 120, 25);
  pointer('pointermove', 140, 0);
  pointer('pointerup', 160);
  assert.deepEqual(turns, [[.075, -0], [-.075, -0]]);
  pointer('pointerdown', 200);
  pointer('pointerup', 620);
  pointer('pointerdown', 700);
  pointer('pointerup', 740, 25);
  pointer('pointerdown', 800);
  setAllowed(false);
  pointer('pointerup', 840);
  pointer('pointerdown', 900);
  setAllowed(true);
  pointer('pointerup', 940);
  pointer('pointerdown', 1000);
  pointer('pointercancel', 1020);
  pointer('pointerup', 1040);
  pointer('pointerdown', 1100);
  pointer('lostpointercapture', 1120);
  pointer('pointerup', 1140);
  pointer('pointerdown', 1200);
  look.release();
  pointer('pointerup', 1240);
  assert.equal(primaryCount(), 0);

  pointer('pointerdown', 1300);
  pointer('pointerup', 1320, 0, { pointerId: 8 });
  pointer('pointerup', 1340, 2);
  assert.equal(primaryCount(), 1);
});
