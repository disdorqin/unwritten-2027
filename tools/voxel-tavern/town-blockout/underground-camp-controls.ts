type CampPrompt = {
  id: string;
  label: string;
};

export function mountUndergroundCampControls(
  hint: HTMLElement,
  keys: Document | HTMLElement,
  interactions: {
    prompt(): CampPrompt | undefined;
    press(expectedId: string): Promise<unknown>;
    update(): unknown;
    cancelSeat(): void;
  },
  onError: (error: unknown) => void,
) {
  hint.setAttribute('aria-live', 'polite');
  let disposed = false;
  let pending = false;
  let displayed: CampPrompt | undefined;

  function update() {
    if (disposed) return;
    interactions.update();
    displayed = interactions.prompt();
    const text = displayed ? `E · ${displayed.label}` : '';
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = !text;
  }

  async function keydown(event: Event) {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.defaultPrevented || event.code !== 'KeyE' || event.repeat || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey || pending || !displayed) return;
    const target = event.target;
    if (target && 'closest' in target &&
        (target as Element).closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"])')) return;
    event.preventDefault();
    pending = true;
    try {
      await interactions.press(displayed.id);
    } catch (error) {
      onError(error);
    } finally {
      pending = false;
      update();
    }
  }

  keys.addEventListener('keydown', keydown);
  update();
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      keys.removeEventListener('keydown', keydown);
      interactions.cancelSeat();
      hint.hidden = true;
      hint.textContent = '';
    },
  };
}
