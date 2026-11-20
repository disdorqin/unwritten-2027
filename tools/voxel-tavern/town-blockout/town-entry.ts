type TownEntryState = 'guide' | 'loading' | 'failed' | 'ready';

export function isMobileChatBrowser(userAgent: string, touchPoints = 0): boolean {
  return (touchPoints > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) &&
    /MicroMessenger\b|\bQQ\//i.test(userAgent);
}

export function createTownEntry(
  guideFirst: boolean,
  loadTown: () => Promise<unknown>,
  show: (state: TownEntryState) => void,
) {
  let loading: Promise<void> | undefined;
  function enter() {
    if (!loading) {
      show('loading');
      loading = Promise.resolve().then(loadTown).then(() => show('ready'), () => show('failed'));
    }
    return loading;
  }
  if (guideFirst) show('guide');
  else void enter();
  return enter;
}

if (typeof document !== 'undefined') {
  const embedded = isMobileChatBrowser(navigator.userAgent, navigator.maxTouchPoints);
  const entry = document.getElementById('town-entry')!;
  const loading = document.getElementById('town-entry-loading')!;
  const guide = document.getElementById('town-entry-guide')!;
  const failure = document.getElementById('town-entry-error')!;
  const copy = document.getElementById('town-entry-copy')!;
  const continueButton = document.getElementById('town-entry-continue')!;
  const retry = document.getElementById('town-entry-retry')!;
  const copyStatus = document.getElementById('town-entry-copy-status')!;
  const link = document.querySelector<HTMLInputElement>('#town-entry-link')!;
  const banner = document.getElementById('env-banner')!;
  const bannerMessage = document.getElementById('env-banner-message')!;
  const dismissBanner = document.getElementById('env-banner-dismiss')!;

  const enter = createTownEntry(embedded, async () => {
    await import('./town-panel');
    await import('./viewer');
  }, state => {
    guide.hidden = state !== 'guide';
    loading.hidden = state !== 'loading';
    failure.hidden = state !== 'failed';
    copy.hidden = state !== 'guide' && state !== 'failed';
    continueButton.hidden = state !== 'guide';
    retry.hidden = state !== 'failed';
    link.hidden = true;
    copyStatus.hidden = true;
    if (state === 'ready') {
      entry.hidden = true;
      document.body.classList.remove('town-entry-pending');
      if (embedded) {
        bannerMessage.textContent = '当前使用内置浏览器。拖动屏幕转向，也可在右上角菜单中用浏览器打开。';
        dismissBanner.hidden = false;
        banner.hidden = false;
      }
    }
  });

  continueButton.addEventListener('click', () => void enter());
  dismissBanner.addEventListener('click', () => { banner.hidden = true; });
  copy.addEventListener('click', async () => {
    const currentUrl = location.href;
    try {
      await navigator.clipboard.writeText(currentUrl);
      link.hidden = true;
      copyStatus.textContent = '链接已复制。';
    } catch {
      link.value = currentUrl;
      link.hidden = false;
      link.focus();
      link.select();
      copyStatus.textContent = '请长按上方链接复制。';
    }
    copyStatus.hidden = false;
  });
}
