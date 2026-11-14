import { POST_DESK } from "../shared/town";
import { randomHex } from "../net/channel";

export function setupPostOffice(options: {
  send: (message: unknown) => void;
  pauseForPanel: () => void;
  canSave: () => boolean;
}) {
  document.getElementById("hud")!.insertAdjacentHTML("beforeend", `<button id="post-open" hidden>写给2027的信</button>`);
  document.getElementById("app")!.insertAdjacentHTML("beforeend", `<aside id="post-panel" role="dialog" aria-modal="true" aria-labelledby="post-title" hidden><button id="post-close" aria-label="关闭写信窗口">×</button><small>新年邮局</small><h2 id="post-title">写给 2027</h2><p>留一封信，给新一年的自己。</p><form id="post-form"><label for="post-text">信件内容</label><textarea id="post-text" maxlength="2000" rows="8" placeholder="亲爱的2027年的我……" required></textarea><p class="post-note">信件会保存到小镇服务器，由小镇维护者整理查看。草稿保留在当前设备。</p><button id="post-save" type="submit">把信交给邮局</button></form><p id="post-status" role="status"></p></aside>`);
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const open = byId<HTMLButtonElement>("post-open"), panel = byId<HTMLElement>("post-panel");
  const text = byId<HTMLTextAreaElement>("post-text"), save = byId<HTMLButtonElement>("post-save");
  const status = byId<HTMLElement>("post-status");
  let draft = { id: randomHex(16), text: "" };
  try {
    const stored = JSON.parse(localStorage.getItem("unwritten:letter-draft") ?? "null");
    if (typeof stored?.id === "string" && typeof stored?.text === "string") draft = stored;
  } catch { /* A malformed old draft must not prevent the game from opening. */ }
  text.value = draft.text;
  let pending = false, timeout: ReturnType<typeof setTimeout> | undefined;
  function finish(message: string) {
    pending = false; clearTimeout(timeout); text.disabled = save.disabled = false; status.textContent = message;
  }
  open.onclick = () => {
    options.pauseForPanel(); panel.hidden = false; text.focus();
  };
  byId<HTMLButtonElement>("post-close").onclick = () => { panel.hidden = true; };
  panel.addEventListener("keydown", e => { if (e.key === "Escape") { panel.hidden = true; e.stopPropagation(); } });
  text.oninput = () => {
    draft = { id: randomHex(16), text: text.value };
    localStorage.setItem("unwritten:letter-draft", JSON.stringify(draft));
  };
  byId<HTMLFormElement>("post-form").onsubmit = e => {
    e.preventDefault(); if (pending || !text.value.trim()) return;
    if (!options.canSave()) { finish("此入口暂不支持保存信件，请保留草稿。"); return; }
    pending = true; text.disabled = save.disabled = true; status.textContent = "邮局正在收信…";
    localStorage.setItem("unwritten:letter-draft", JSON.stringify(draft));
    options.send({ type: "letter", request: draft.id, text: text.value.trim() });
    timeout = setTimeout(() => finish("尚未收到保存确认，草稿已保留，可以重试。"), 8000);
  };
  return {
    update(player?: { x: number; y: number; z: number }) {
      open.hidden = !player || player.y > 3 || Math.hypot(player.x - POST_DESK[0], player.z - POST_DESK[2]) > 3;
    },
    message(message: { type: string; request?: string; message?: string; receipt?: { id: string } }) {
      if (message.request !== draft.id) return;
      if (message.type === "letter-error") finish(message.message ?? "未能保存，请重试。");
      if (message.type === "letter-saved") {
        finish(`信已收好。收信编号：${message.receipt?.id.slice(-8) ?? ""}`);
        localStorage.removeItem("unwritten:letter-draft");
        draft = { id: randomHex(16), text: "" }; text.value = "";
      }
    },
    reset() { panel.hidden = true; open.hidden = true; finish(""); },
  };
}
