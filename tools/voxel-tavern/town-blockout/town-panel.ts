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
