// Mobile viewport affordances: a fullscreen toggle, chat collapse on touch
// devices, and the pure decisions behind them. Fullscreen is best-effort —
// browsers without the element fullscreen API (iPhone Safari) simply never
// show the button and rely on the 100dvh sizing fallback in style.css.

// Same touch rule as touch-walk: a coarse pointer, or any touch pointer seen.
export function isTouchEnvironment(coarsePointer: boolean, touchSeen: boolean): boolean {
  return coarsePointer || touchSeen;
}

// Chat is now in the single corner menu and starts closed on every device.
export function chatStartsCollapsed(_touchEnvironment: boolean): boolean {
  return true;
}

type FullscreenCapable = {
  requestFullscreen?: unknown;
  webkitRequestFullscreen?: unknown;
} | null | undefined;

// Standard API, with the older WebKit prefix still used by some tablets.
export function fullscreenApiAvailable(target: FullscreenCapable): boolean {
  return !!target &&
    (typeof target.requestFullscreen === 'function' ||
     typeof target.webkitRequestFullscreen === 'function');
}

export function fullscreenButtonVisible(touchEnvironment: boolean, apiAvailable: boolean): boolean {
  return touchEnvironment && apiAvailable;
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

export type ViewportControls = {
  // Attempt to enter fullscreen from a user gesture (entering first person).
  // Silent on every failure: missing API, rejected promise, non-touch device.
  tryEnterFullscreen(): void;
};

export function createViewportControls(options: {
  fullscreenButton: HTMLButtonElement;
  chatPanel: HTMLElement;
  chatToggle: HTMLButtonElement;
  chatUnread: HTMLElement;
  chatLog: HTMLElement;
}): ViewportControls {
  const doc = document as FullscreenDocument;
  const root = document.documentElement as FullscreenElement;
  const coarse = matchMedia('(pointer: coarse)');
  let touchSeen = false;
  let chatCollapsed = false;
  let chatUserToggled = false;

  const touchEnvironment = () => isTouchEnvironment(coarse.matches, touchSeen);
  const apiAvailable = () => fullscreenApiAvailable(root);
  const fullscreenActive = () => !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);

  function syncFullscreenButton() {
    const visible = fullscreenButtonVisible(touchEnvironment(), apiAvailable());
    if (options.fullscreenButton.hidden === !visible) return;
    options.fullscreenButton.hidden = !visible;
  }

  function applyChatCollapsed() {
    const collapsed = chatCollapsed;
    options.chatPanel.classList.toggle('town-chat-collapsed', collapsed);
    options.chatToggle.setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed) options.chatUnread.hidden = true;
  }

  function syncChat() {
    if (!chatUserToggled) chatCollapsed = chatStartsCollapsed(touchEnvironment());
    applyChatCollapsed();
  }

  function sync() {
    syncFullscreenButton();
    syncChat();
  }

  coarse.addEventListener('change', sync);
  document.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || touchSeen) return;
    touchSeen = true;
    sync();
  }, true);

  options.fullscreenButton.addEventListener('click', () => {
    try {
      if (fullscreenActive()) {
        if (typeof doc.exitFullscreen === 'function') void doc.exitFullscreen().catch(()=>{});
        else doc.webkitExitFullscreen?.();
        return;
      }
      if (!apiAvailable()) return;
      if (typeof root.requestFullscreen === 'function') {
        void root.requestFullscreen()?.catch(() => { /* Gesture rejected; the button stays available. */ });
      } else {
        root.webkitRequestFullscreen?.();
      }
    } catch { /* Fullscreen is an enhancement; never break play over it. */ }
  });
  const syncPressed = () =>
    options.fullscreenButton.setAttribute('aria-pressed', String(fullscreenActive()));
  document.addEventListener('fullscreenchange', syncPressed);
  document.addEventListener('webkitfullscreenchange', syncPressed);

  options.chatToggle.addEventListener('click', () => {
    chatUserToggled = true;
    chatCollapsed = !options.chatPanel.classList.contains('town-chat-collapsed');
    applyChatCollapsed();
  });
  // A new chat row while collapsed lights the unread dot on the chip.
  new MutationObserver(records => {
    if (!options.chatPanel.classList.contains('town-chat-collapsed')) return;
    if (records.some(record => record.addedNodes.length > 0)) options.chatUnread.hidden = false;
  }).observe(options.chatLog, { childList: true });

  options.chatPanel.closest('dialog')?.addEventListener('close',()=>{
    chatCollapsed=true;
    applyChatCollapsed();
  });
  sync();
  syncPressed();

  return {
    tryEnterFullscreen() {
      if (!touchEnvironment() || !apiAvailable() || fullscreenActive()) return;
      try {
        if (typeof root.requestFullscreen === 'function') {
          void root.requestFullscreen()?.catch(() => { /* Silent by design. */ });
        } else {
          root.webkitRequestFullscreen?.();
        }
      } catch { /* Silent by design. */ }
    },
  };
}
