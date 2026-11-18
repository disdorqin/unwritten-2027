export type TownChatScope = 'near' | 'town';
export type TownChatMessage = { id: number; name: string; scope: TownChatScope; text: string };
export type TownChatBubble = { text: string; until: number };

const maximumCodePoints = 100;
const maximumRows = 6;
const bubbleLifetimeMs = 4500;
export const chatBubbleFadeMs = 300;
const controls = /[\p{Cc}\p{Cf}\p{Cs}]/gu;

export function cleanTownChatText(value: string) {
  return [...value.replace(controls, '').trim()].slice(0, maximumCodePoints).join('');
}

export function parseTownChat(value: unknown): TownChatMessage | undefined {
  if (!value || typeof value !== 'object' || !('id' in value) ||
      !('name' in value) || !('scope' in value) || !('text' in value)) return undefined;
  const { id, name, scope, text } = value;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 65535 ||
      typeof name !== 'string' || (scope !== 'near' && scope !== 'town') || typeof text !== 'string') return undefined;
  const clean = cleanTownChatText(text);
  return clean ? { id, name, scope, text: clean } : undefined;
}

export function createTownChat(send: (scope: TownChatScope, text: string) => boolean, onFocus: () => void) {
  const panel = document.getElementById('town-chat');
  const form = document.querySelector<HTMLFormElement>('#town-chat-form');
  const input = document.querySelector<HTMLInputElement>('#town-chat-text');
  const channel = document.querySelector<HTMLButtonElement>('#town-chat-channel');
  const log = document.getElementById('town-chat-log');
  const ownBubble = document.getElementById('town-chat-self');
  const bubbles = new Map<number, TownChatBubble>();
  let scope: TownChatScope = 'near';
  let connected = false;
  let tokens = 2;
  let tokenAt = 0;
  let ownTimer = 0;

  function setConnected(value: boolean) {
    if (value === connected) return;
    connected = value;
    if (panel) panel.hidden = !value;
    if (value) {
      tokens = 2;
      tokenAt = performance.now();
      return;
    }
    input?.blur();
    if (input) input.value = '';
    log?.replaceChildren();
    bubbles.clear();
    window.clearTimeout(ownTimer);
    if (ownBubble) ownBubble.hidden = true;
  }

  function receive(message: TownChatMessage, self = false) {
    if (!connected || !log) return;
    const row = document.createElement('div');
    row.className = 'town-chat-row';
    if (message.scope === 'town') {
      const badge = document.createElement('span');
      badge.className = 'town-chat-town';
      badge.textContent = '全镇';
      row.append(badge);
    }
    const speaker = document.createElement('bdi');
    speaker.textContent = self ? '你' : message.name;
    row.append(speaker, ` · ${message.text}`);
    log.append(row);
    while (log.childElementCount > maximumRows) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;

    if (self) {
      if (!ownBubble) return;
      ownBubble.textContent = message.text;
      ownBubble.hidden = false;
      ownBubble.classList.remove('is-fading');
      window.clearTimeout(ownTimer);
      ownTimer = window.setTimeout(() => {
        ownBubble.classList.add('is-fading');
        ownTimer = window.setTimeout(() => { ownBubble.hidden = true; }, chatBubbleFadeMs);
      }, bubbleLifetimeMs - chatBubbleFadeMs);
    } else {
      bubbles.set(message.id, { text: message.text, until: performance.now() + bubbleLifetimeMs });
    }
  }

  channel?.addEventListener('click', () => {
    scope = scope === 'near' ? 'town' : 'near';
    channel.textContent = scope === 'near' ? '近场' : '全镇';
    channel.setAttribute('aria-label', `切换频道，当前${channel.textContent}`);
  });
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!connected || !input) return;
    const text = cleanTownChatText(input.value);
    if (!text) return;
    const now = performance.now();
    tokens = Math.min(2, tokens + (now - tokenAt) / 1500);
    tokenAt = now;
    if (tokens < 1 || !send(scope, text)) return;
    tokens--;
    input.value = '';
  });
  function limitInput() {
    if (!input) return;
    const codePoints = [...input.value.replace(controls, '')];
    const limited = codePoints.slice(0, maximumCodePoints).join('');
    if (limited !== input.value) input.value = limited;
  }
  input?.addEventListener('input', event => { if (!(event as InputEvent).isComposing) limitInput(); });
  input?.addEventListener('compositionend', limitInput);
  input?.addEventListener('focus', onFocus);
  input?.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      form?.requestSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      input.blur();
    }
  });
  window.addEventListener('keydown', event => {
    if (!connected || !input || event.key !== 'Enter' || event.repeat || event.defaultPrevented ||
        event.altKey || event.ctrlKey || event.metaKey || event.isComposing || document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button,input,select,textarea,a,[contenteditable]')) return;
    event.preventDefault();
    const panelToggle = document.getElementById('town-panel-toggle');
    if (panelToggle?.getAttribute('aria-expanded') === 'false') panelToggle.click();
    input.focus();
  });

  return {
    setConnected,
    receive,
    forget: (id: number) => bubbles.delete(id),
    focused: () => !!input && document.activeElement === input,
    bubble(id: number, now: number) {
      const bubble = bubbles.get(id);
      if (!bubble) return undefined;
      if (now >= bubble.until) { bubbles.delete(id); return undefined; }
      return bubble;
    },
  };
}
