export {};

const settings = document.querySelector<HTMLDialogElement>('#town-settings')!;
const toggle = document.querySelector<HTMLButtonElement>('#town-panel-toggle')!;
const close = document.querySelector<HTMLButtonElement>('#town-settings-close')!;

toggle.addEventListener('click', () => {
  if(settings.open){settings.close();return;}
  if (document.pointerLockElement) document.exitPointerLock();
  settings.dispatchEvent(new Event('town-menu-opening'));
  settings.showModal();
  toggle.setAttribute('aria-expanded','true');
});
close.addEventListener('click', () => settings.close());
settings.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
// Both pointer-down and pointer-up must be outside the drawer. Dragging
// a volume slider or scrolling through its edge must not close it.
let outsideDown=false;
function outside(event:MouseEvent){
 const r=settings.getBoundingClientRect();
 return event.target===settings&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);
}
settings.addEventListener('pointerdown',event=>{outsideDown=outside(event);});
settings.addEventListener('pointercancel',()=>{outsideDown=false;});
settings.addEventListener('click',event=>{if(outsideDown&&outside(event))settings.close();outsideDown=false;});

