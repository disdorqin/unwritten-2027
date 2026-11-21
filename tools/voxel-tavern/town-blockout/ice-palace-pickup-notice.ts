let noticeTimer: ReturnType<typeof setTimeout> | undefined;

/** This notice is used until the ordinary ZB-22 bag can supply its shared corner notifier. */
export function announceIcePalacePickup(message: string) {
  if (typeof document === 'undefined') return;
  let notice = document.getElementById('ice-palace-pickup-notice');
  if (!notice) {
    notice = document.createElement('output');
    notice.id = 'ice-palace-pickup-notice';
    notice.setAttribute('role', 'status');
    Object.assign(notice.style, {
      position: 'fixed',
      right: 'max(16px, env(safe-area-inset-right))',
      top: 'max(55px, calc(env(safe-area-inset-top) + 49px))',
      zIndex: '22',
      color: '#ecf7fa',
      fontSize: '13px',
      textShadow: '0 1px 3px #162438',
      pointerEvents: 'none',
    });
    document.body.append(notice);
  }
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.remove(), 2_400);
}
