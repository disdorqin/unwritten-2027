import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page, name: string, room?: string) {
  await page.goto(`/?test=1&fresh=1${room ? `&room=${room}` : ""}`);
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByLabel("Your name").fill(name);
  await page.locator(room ? "#join" : "#create").click();
  await expect(page.locator("#hud")).toBeVisible();
  return (await page.locator("#room-code").textContent())!;
}
const state = (page: Page) => page.evaluate(() => (window as any).__friendslop.state);

async function walk(page: Page, points: number[][]) {
  await page.evaluate(async points => {
    const game = (window as any).__friendslop;
    for (const [x, z] of points) {
      const started = performance.now();
      game.input("ShiftLeft", true); game.input("KeyW", true);
      try {
        while (performance.now() - started < 20000) {
          const dx = x - game.state.x, dz = z - game.state.z;
          if (Math.hypot(dx, dz) < 0.45) break;
          game.look(Math.atan2(-dx, -dz), 0);
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      } finally { game.input("KeyW", false); game.input("ShiftLeft", false); }
    }
  }, points);
}

test("snow town: two rendered clients, shared movement, safe chat and reconnect", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const room = await enter(page, "雪夜旅人");
  const friend = await context.newPage();
  friend.on("pageerror", error => errors.push(error.message));
  await enter(friend, "钟楼朋友", room);
  await expect(page.locator("#player-count")).toHaveText("2 人在线");
  await expect(page.locator("#enable-voice")).toBeHidden();
  const id = (await state(page)).id;
  await expect.poll(() => friend.evaluate(id => (window as any).__friendslop.scene.avatars.has(id), id)).toBe(true);
  const before = await state(page);
  await page.evaluate(() => (window as any).__friendslop.input("KeyW", true));
  try {
    await expect.poll(async () => (await state(page)).z).toBeLessThan(before.z - 2);
    await expect.poll(() => friend.evaluate(id => (window as any).__friendslop.scene.avatars.get(id)?.root.position.z, id)).toBeLessThan(before.z - 1);
  } finally {
    await page.evaluate(() => (window as any).__friendslop.input("KeyW", false));
  }
  const text = "新年见！<img src=x onerror=alert(1)>";
  await page.locator("#chat-text").fill(text);
  await page.locator("#chat-form button").click();
  await expect(friend.locator("#chat-messages")).toContainText(`雪夜旅人：${text}`);
  await expect(friend.locator("#chat-messages img")).toHaveCount(0);
  const friendId = (await state(friend)).id;
  await friend.reload();
  await expect(friend.locator("#loading")).toBeHidden();
  await friend.locator("#join").click();
  await expect(friend.locator("#hud")).toBeVisible();
  expect((await state(friend)).id).toBe(friendId);
  await expect(friend.locator("#chat-messages")).toContainText(text);
  await page.screenshot({ path: "test-results/town-desktop.png" });
  expect(errors).toEqual([]);
});

test("mobile viewport: real touch movement, release, look and chat", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await enter(page, "手机朋友");
    await page.locator("#resume").tap();
    await expect(page.locator("#pause")).toBeHidden();
    const button = page.getByRole("button", { name: "前进", exact: true });
    await expect(button).toBeVisible();
    const rect = (await button.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    const cdp = await context.newCDPSession(page);
    const before = await state(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
    await expect.poll(async () => (await state(page)).z).toBeLessThan(before.z - 1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const stopped = await state(page);
    await page.waitForTimeout(500);
    expect(Math.abs((await state(page)).z - stopped.z)).toBeLessThan(0.6);
    const yaw = (await state(page)).yaw;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y: 330 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 260, y: 330 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => Math.abs((await state(page)).yaw - yaw)).toBeGreaterThan(0.1);
    await page.locator("#chat-text").fill("手机也能说话");
    await page.locator("#chat-form button").tap();
    await expect(page.locator("#chat-messages")).toContainText("手机朋友：手机也能说话");
    await page.screenshot({ path: "test-results/town-mobile.png" });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("museum: walk through doorway, read and close without moving or changing camera", async ({ page }) => {
  await enter(page, "纪念馆访客");
  // Enter the existing unlocked controls mode before driving the shared motor.
  await page.locator("#chat-text").focus();
  await walk(page, [[-18, 4], [-18, -8]]);
  await expect(page.locator("#museum-read")).toBeVisible();
  await page.locator("#chat-text").blur();
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#museum-title")).toHaveText("十二个月的时间长廊");
  const before = await state(page);
  await page.keyboard.down("w");
  await page.waitForTimeout(400);
  await page.keyboard.up("w");
  expect(Math.abs((await state(page)).z - before.z)).toBeLessThan(0.2);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => (window as any).__friendslop.cameraMode)).toBe("first");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});


test("post office: keyboard access, modal isolation and save without local draft storage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page, "邮局访客");
  await page.locator("#chat-text").focus();
  await walk(page, [[17, 5], [17, -1.5]]);
  await expect(page.locator("#post-open")).toBeVisible();
  await page.locator("#chat-text").blur();
  await page.keyboard.press("e");
  await expect(page.locator("#post-panel")).toBeVisible();
  expect(await page.locator("#post-panel").evaluate(panel => panel.matches(":modal"))).toBe(true);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "unwritten:letter-draft") throw new DOMException("Storage unavailable", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.locator("#post-text").fill("愿新的一年还能和朋友相聚。");
  await expect(page.locator("#post-status")).toContainText("无法保留草稿");
  await page.locator("#post-close").focus();
  const before = await state(page);
  await page.keyboard.press("Tab");
  await page.keyboard.down("w");
  await page.waitForTimeout(400);
  await page.keyboard.up("w");
  expect((await state(page)).z).toBeCloseTo(before.z, 1);
  expect(await page.evaluate(() => (window as any).__friendslop.cameraMode)).toBe("first");
  await page.locator("#post-save").click();
  await expect(page.locator("#post-status")).toContainText("信已收好");
  await expect(page.locator("#post-text")).toHaveValue("");
  await expect(page.locator("#chat-messages")).not.toContainText("愿新的一年");
  await page.keyboard.press("Escape");
  await expect(page.locator("#post-panel")).toBeHidden();
  expect(errors).toEqual([]);
});
