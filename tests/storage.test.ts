import { test } from "node:test";
import assert from "node:assert/strict";
import { getStored, setStored, removeStored, readRoomSession } from "../src/client/storage.js";

function withStorage(run: (values: Map<string, string>) => void) {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try { run(values); } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
}

test("room sessions survive normal writes and tolerate corrupt or wrong-shaped old data", () => {
  withStorage(values => {
    assert.equal(readRoomSession(), undefined);
    for (const invalid of ["{", "null", "[]", '"text"', '{"code":"ABCDEF","token":12}']) {
      values.set("friendslop:session", invalid);
      assert.equal(readRoomSession(), undefined);
    }
    const session = { code: "ABCDEF", token: "saved-reconnect-token" };
    assert.equal(setStored("sessionStorage", "friendslop:session", JSON.stringify(session)), true);
    assert.deepEqual(readRoomSession(), session);
    assert.equal(removeStored("sessionStorage", "friendslop:session"), true);
    assert.equal(readRoomSession(), undefined);
  });
});

test("denied browser Storage access cannot throw into entry or welcome handling", () => {
  const originals = ["localStorage", "sessionStorage"].map(area => [area, Object.getOwnPropertyDescriptor(globalThis, area)] as const);
  try {
    for (const [area] of originals) Object.defineProperty(globalThis, area, {
      configurable: true, get() { throw new DOMException("Disabled by browser", "SecurityError"); },
    });
    assert.equal(getStored("localStorage", "friendslop:name"), null);
    assert.equal(setStored("localStorage", "friendslop:name", "访客"), false);
    assert.equal(setStored("sessionStorage", "friendslop:session", "{}"), false);
    assert.equal(removeStored("sessionStorage", "friendslop:session"), false);
    assert.equal(readRoomSession(), undefined);
  } finally {
    for (const [area, original] of originals) {
      if (original) Object.defineProperty(globalThis, area, original);
      else Reflect.deleteProperty(globalThis, area);
    }
  }
});

test("storage quota failures preserve the existing reconnect session", () => {
  withStorage(() => {
    const session = { code: "ABCDEF", token: "previous-token" };
    setStored("sessionStorage", "friendslop:session", JSON.stringify(session));
    const store = globalThis.sessionStorage;
    store.setItem = () => { throw new DOMException("Quota full", "QuotaExceededError"); };
    assert.equal(setStored("sessionStorage", "friendslop:session", "replacement"), false);
    assert.deepEqual(readRoomSession(), session);
  });
});
