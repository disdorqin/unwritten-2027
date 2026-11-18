import { tavernWaiterLines } from './tavern-waiter';

type Dice = readonly [number, number, number];
type Result = 'win' | 'lose' | 'retry' | 'draw';

function roll(): Dice {
  const random = new Uint8Array(1);
  function face() {
    do { crypto.getRandomValues(random); } while (random[0] >= 252);
    return random[0] % 6 + 1;
  }
  return [face(), face(), face()];
}

const sum = (dice: Dice) => dice[0] + dice[1] + dice[2];
export function compareTavernDice(player: Dice, opponent: Dice, previousTies: number): Result {
  const gap = sum(player) - sum(opponent);
  return gap > 0 ? 'win' : gap < 0 ? 'lose' : previousTies < 2 ? 'retry' : 'draw';
}

export function openTavernDice(panel: HTMLElement, lose: () => string) {
  let ties = 0;
  const speech = document.createElement('p');
  speech.textContent = tavernWaiterLines.骰子[0];
  const tray = document.createElement('p');
  tray.setAttribute('role', 'status');
  const shake = document.createElement('button');
  shake.type = 'button';
  shake.textContent = '摇盅';
  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = '离桌';
  const dialog = panel.closest('dialog');
  let pending: ReturnType<typeof setTimeout> | undefined;
  function cancel() { clearTimeout(pending); pending = undefined; }
  done.onclick = () => { cancel(); dialog?.close(); };
  dialog?.addEventListener('close', cancel, { once: true });
  shake.onclick = () => {
    const player = roll();
    const opponent = roll();
    tray.textContent = '摇盅中…';
    speech.textContent = tavernWaiterLines.骰子[1];
    shake.disabled = true;
    pending = setTimeout(() => {
      pending = undefined;
      if (!panel.isConnected || !dialog?.open) return;
      const outcome = compareTavernDice(player, opponent, ties);
      const totals = `你 ${player.join('、')}（${sum(player)} 点），田小勤 ${opponent.join('、')}（${sum(opponent)} 点）`;
      const result = outcome === 'win' ? '你赢了。'
        : outcome === 'lose' ? lose() : outcome === 'retry' ? '平点，再摇一次。' : '连续三次平点，和局。';
      tray.textContent = `${totals}。 ${result}`;
      speech.textContent = outcome === 'retry' ? tavernWaiterLines.骰子[3] : '';
      ties = outcome === 'retry' ? ties + 1 : 0;
      shake.textContent = outcome === 'retry' ? '重摇' : '再邀一局';
      shake.disabled = false;
    }, 900);
  };
  panel.replaceChildren(speech, tray, shake, done);
}
