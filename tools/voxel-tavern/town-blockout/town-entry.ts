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

export function describeTownRelease(build: string, health: string | undefined) {
  const expected = /^[0-9a-f]{40}$/.test(build) ? build : undefined;
  const live = /^town-preview ([0-9a-f]{40})\s*$/.exec(health ?? '')?.[1];
  const label = expected ? expected.slice(0,8) : '本地构建';
  if (!live) return { label: '客户端 ' + label + ' · 服务器版本未确认', matched: false };
  if (!expected) return { label: '客户端 ' + label + ' · 服务器 ' + live.slice(0,8), matched: false };
  return { label: '客户端 ' + label + ' · 服务器 ' + live.slice(0,8) + (expected === live ? ' · 版本一致' : ' · 版本不一致，请重新加载'), matched: expected === live };
}

if (typeof document !== 'undefined') {
  const releaseStatus = document.getElementById('town-release-status');
  if (releaseStatus) {
    const build = import.meta.env.VITE_TOWN_RELEASE ?? 'local';
    releaseStatus.textContent = describeTownRelease(build, undefined).label;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 6000);
    void fetch('/healthz', {cache:'no-store', signal:abort.signal})
      .then(response => response.ok ? response.text() : undefined)
      .then(health => { releaseStatus.textContent = describeTownRelease(build, health).label; })
      .catch(() => {}).finally(() => clearTimeout(timeout));
  }
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
    const viewer=await import('./viewer');
    // Rear construction is triggered by the viewer's real approach.
    viewer.preparePublicSummit();
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
