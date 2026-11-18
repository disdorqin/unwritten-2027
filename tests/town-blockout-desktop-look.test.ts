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

function fixture(request?: () => Promise<void> | undefined) {
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
  const look = createDesktopLook(canvas as unknown as HTMLCanvasElement, () => true, () => {}, {
    onLockFailed: reason => failures.push(reason),
    onLockChange: locked => changes.push(locked),
  });
  const pointerDown = () => canvas.emit('pointerdown', {
    pointerType: 'mouse', button: 0, pointerId: 7, clientX: 0, clientY: 0,
  });
  return { doc, canvas, look, failures, changes, pointerDown, requests: () => requests };
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
