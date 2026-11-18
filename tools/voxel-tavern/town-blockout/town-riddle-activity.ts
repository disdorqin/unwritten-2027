import { Vector3, type Group } from 'three';
import type { WorkshopRiddleWall } from './landmark-market';
import type { TownActivityContext, TownActivitySpot } from './town-activity';
import { createRiddleGame, selectRiddles, type RiddleSave } from './town-riddle-state';
import './town-riddle.css';

type RiddleEffects = { celebrate?: () => void; chime?: () => void };

function browserStorage() {
  try { return window.localStorage; }
  catch { return undefined; }
}

export function createRiddleActivity(
  context: Pick<TownActivityContext, 'open' | 'announce'>,
  group: Group | undefined,
  effects: RiddleEffects = {},
) {
  const wall = group?.userData.riddleWall as WorkshopRiddleWall | undefined;
  let session: ReturnType<typeof createRiddleGame> | undefined;
  let activeCount = selectRiddles(new Date()).length;
  let previousDate = '';
  let nextSync = 0;

  function game() {
    return session ??= createRiddleGame(browserStorage());
  }

  function paint(record: RiddleSave) {
    activeCount = record.groupIds.length;
    previousDate = record.date;
    const solved = new Set(record.solvedIds);
    const litSlots = new Set(record.groupIds.flatMap((id, slot) => solved.has(id) ? [slot] : []));
    wall?.update(activeCount, litSlots);
  }

  function syncNearby() {
    if (!wall) return;
    const now = Date.now();
    if (now < nextSync && nextSync - now <= 1000) return;
    nextSync = now + 1000;
    const day = game().sync(new Date(now));
    if (day.date !== previousDate) paint(day);
  }

  function open(slot: number) {
    paint(game().refresh());
    if (slot >= activeCount) return;
    const panel = context.open('灯谜墙', '翻开灯笼下的纸条，猜对点亮这盏灯。');
    const card = document.createElement('section');
    card.className = 'riddle-card';
    panel.append(card);

    function render(notice = '', effect: 'shake' | 'flip' | '' = '') {
      const entry = game().view(slot);
      card.replaceChildren();
      card.className = 'riddle-card' + (effect ? ` riddle-card--${effect}` : '');
      if (!entry) {
        card.textContent = '今日题组已刷新，请选一盏挂好的灯笼。';
        return;
      }

      const heading = document.createElement('h3');
      heading.textContent = `灯笼 ${String(slot + 1).padStart(2, '0')}`;
      const paper = document.createElement('p');
      paper.className = 'riddle-paper';
      paper.textContent = entry.question;
      card.append(heading, paper);

      if (entry.hint) {
        const hint = document.createElement('p');
        hint.className = 'riddle-hint';
        hint.textContent = `乔麦提示 · ${entry.hint}`;
        card.append(hint);
      }

      const feedback = document.createElement('p');
      feedback.className = 'riddle-feedback';
      feedback.setAttribute('role', 'status');
      if (entry.solvedAnswer) {
        feedback.textContent = `谜底 · ${entry.solvedAnswer}`;
        card.append(feedback);
        return;
      }
      if (entry.attempts >= 3) {
        feedback.textContent = '这盏灯今日已锁定，明天再来。';
        card.append(feedback);
        return;
      }

      const submit = (value: string) => {
        const result = game().answer(slot, value, entry);
        paint(game().sync());
        switch (result.kind) {
          case 'solved':
            effects.chime?.();
            window.dispatchEvent(new CustomEvent('town-activity-event', { detail: result.event }));
            if (result.fullLight) {
              context.announce('今日全亮');
              effects.celebrate?.();
            }
            render('', 'flip');
            break;
          case 'wrong':
            render(result.attempts === 1 ? '再想想' : '', result.attempts === 1 ? 'shake' : '');
            break;
          case 'stale':
            render('今日题组已刷新。');
            break;
          case 'empty':
            feedback.textContent = '请输入谜底。';
            break;
          default:
            render();
        }
      };

      if (entry.options) {
        const actions = document.createElement('div');
        actions.className = 'riddle-options';
        actions.setAttribute('role', 'group');
        actions.setAttribute('aria-label', '选择谜底');
        for (const option of entry.options) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = option;
          button.onclick = () => submit(option);
          actions.append(button);
        }
        card.append(actions);
      } else {
        const form = document.createElement('form');
        form.className = 'riddle-answer';
        const label = document.createElement('label');
        label.textContent = '谜底';
        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        label.append(input);
        const button = document.createElement('button');
        button.type = 'submit';
        button.textContent = '提交谜底';
        form.append(label, button);
        form.onsubmit = event => { event.preventDefault(); submit(input.value); };
        card.append(form);
      }
      feedback.textContent = notice || `还可猜 ${3 - entry.attempts} 次`;
      card.append(feedback);
    }

    render();
  }

  const spots: TownActivitySpot[] = group && wall ? wall.stands.map((stand, slot) => {
    const position = group.localToWorld(new Vector3(...stand));
    return {
      x: position.x, n: -position.z, ground: position.y, range: 1.05,
      label: `猜灯谜 · ${String(slot + 1).padStart(2, '0')}`,
      available: () => slot < activeCount,
      run: () => open(slot),
    };
  }) : [];

  return { spots, syncNearby, getProgress: () => game().getProgress() };
}
