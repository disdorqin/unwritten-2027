const storageKey = 'unwritten.town-panel.collapsed.v1';
const toggle = document.querySelector<HTMLButtonElement>('#town-panel-toggle')!;
const controls = document.getElementById('town-panel-controls')!;
const panel = toggle.closest('.panel')!;

function showCollapsed(collapsed: boolean) {
  controls.hidden = collapsed;
  panel.classList.toggle('town-panel-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.textContent = collapsed ? '展开控制' : '收起控制';
}

let collapsed = false;
try {
  collapsed = localStorage.getItem(storageKey) === '1';
} catch {
  // The button still works when browser privacy settings block storage.
}
showCollapsed(collapsed);
toggle.hidden = false;
toggle.addEventListener('click', () => {
  collapsed = !collapsed;
  showCollapsed(collapsed);
  try {
    localStorage.setItem(storageKey, collapsed ? '1' : '0');
  } catch {
    // Keep the current state for this page.
  }
});

// Touch top-bar slimming (3.0 M2): on coarse pointers the panel fades after
// a few idle seconds so the top strip stops covering the view; touching or
// focusing the panel restores it at once and re-arms the timer. Fine
// pointers (desktop) never fade.
const coarsePointer = matchMedia('(pointer: coarse)');
let idleFadeTimer: number | undefined;
function armIdleFade() {
  if (!coarsePointer.matches) return;
  clearTimeout(idleFadeTimer);
  idleFadeTimer = window.setTimeout(() => panel.classList.add('town-panel-idle'), 6000);
}
function wakePanel() {
  panel.classList.remove('town-panel-idle');
  armIdleFade();
}
panel.addEventListener('pointerdown', wakePanel);
panel.addEventListener('focusin', wakePanel);
coarsePointer.addEventListener?.('change', wakePanel);
armIdleFade();
