import { museumExhibitNear } from "../shared/museum";

export function setupMuseum(pauseForPanel: () => void) {
  document.getElementById("hud")!.insertAdjacentHTML("beforeend", '<button id="museum-read" hidden></button>');
  document.getElementById("app")!.insertAdjacentHTML("beforeend", '<dialog id="museum-panel" aria-labelledby="museum-title"><small>2026 纪念馆 · 首展导览</small><h2 id="museum-title"></h2><p id="museum-text"></p><form method="dialog"><button autofocus>关闭阅读，继续参观</button></form></dialog>');
  const button = document.getElementById("museum-read") as HTMLButtonElement;
  const panel = document.getElementById("museum-panel") as HTMLDialogElement;
  let exhibit: ReturnType<typeof museumExhibitNear>;
  function show() {
    if (!exhibit || panel.open) return false;
    pauseForPanel();
    document.getElementById("museum-title")!.textContent = exhibit.title;
    document.getElementById("museum-text")!.textContent = exhibit.text;
    panel.showModal();
    return true;
  }
  button.onclick = show;
  // Preserve native dialog focus handling and keep game movement/Tab shortcuts out.
  panel.addEventListener("keydown", event => event.stopPropagation());
  panel.addEventListener("keyup", event => event.stopPropagation());
  return {
    open: show,
    update(player?: { x: number; y: number; z: number }) {
      exhibit = museumExhibitNear(player);
      button.hidden = !exhibit;
      if (exhibit) button.textContent = `E · 阅读：${exhibit.title}`;
      if (!exhibit && panel.open) panel.close();
    },
    reset() { exhibit = undefined; button.hidden = true; if (panel.open) panel.close(); },
  };
}
