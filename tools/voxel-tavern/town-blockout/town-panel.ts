export {};

const settings = document.querySelector<HTMLDialogElement>('#town-settings')!;
const toggle = document.querySelector<HTMLButtonElement>('#town-panel-toggle')!;
const close = document.querySelector<HTMLButtonElement>('#town-settings-close')!;

toggle.addEventListener('click', () => {
  if (document.pointerLockElement) document.exitPointerLock();
  settings.showModal();
});
close.addEventListener('click', () => settings.close());
