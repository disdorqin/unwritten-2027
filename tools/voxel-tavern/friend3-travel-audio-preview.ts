import {
  FRIEND3_TRAVEL_SOUNDS,
  createFriend3TravelAudio,
  type Friend3TravelSound,
  type Friend3TravelSoundId,
} from './town-blockout/town-friend3-travel-audio';

const audio = createFriend3TravelAudio();
const loopState = new Map<Friend3TravelSoundId, boolean>();

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const volume = node<HTMLInputElement>('#volume');
const volumeValue = node<HTMLOutputElement>('#volume-value');
const muteButton = node<HTMLButtonElement>('#mute');
const stopAllButton = node<HTMLButtonElement>('#stop-all');
const status = node<HTMLElement>('#audio-status');
const soundList = node<HTMLElement>('#sound-list');

type Card = {
  article: HTMLElement;
  state: HTMLElement;
  play: HTMLButtonElement;
  loop?: HTMLButtonElement;
};

const cards = new Map<Friend3TravelSoundId, Card>();

function announce(message: string) {
  status.textContent = message;
}

function updateGlobal() {
  const settings = audio.getSettings();
  volume.value = String(settings.volume);
  volumeValue.textContent = String(settings.volume);
  muteButton.setAttribute('aria-pressed', String(settings.muted));
  muteButton.textContent = settings.muted ? '取消静音' : '静音';
}

function updateCard(sound: Friend3TravelSound, card: Card) {
  const playing = audio.isPlaying(sound.id);
  const looping = loopState.get(sound.id) === true;
  card.article.dataset.playing = String(playing);
  card.state.textContent = playing ? (looping ? '循环中' : '播放中') : '待试听';
  card.play.textContent = playing ? '停止' : '试听';
  card.play.setAttribute('aria-pressed', String(playing));
  card.play.setAttribute('aria-label', `${playing ? '停止' : '试听'}${sound.label}`);
  if (card.loop) {
    card.loop.textContent = `循环: ${looping ? '开' : '关'}`;
    card.loop.setAttribute('aria-pressed', String(looping));
  }
}

function updateCards() {
  for (const sound of FRIEND3_TRAVEL_SOUNDS) {
    const card = cards.get(sound.id);
    if (card) updateCard(sound, card);
  }
}

function buildCard(sound: Friend3TravelSound): Card {
  const article = document.createElement('article');
  article.className = 'f3-sound';
  article.dataset.sound = sound.id;
  article.dataset.playing = 'false';
  article.setAttribute('aria-label', `${sound.label}音效`);

  const header = document.createElement('header');
  const heading = document.createElement('div');
  heading.className = 'f3-sound-heading';
  const title = document.createElement('h2');
  title.textContent = sound.label;
  const state = document.createElement('span');
  state.className = 'f3-sound-state';
  state.textContent = '待试听';
  heading.append(title, state);
  const wave = document.createElement('span');
  wave.className = 'f3-wave';
  wave.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) wave.append(document.createElement('i'));
  header.append(heading, wave);

  const description = document.createElement('p');
  description.textContent = sound.description;

  const actions = document.createElement('div');
  actions.className = 'f3-sound-actions';
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'f3-sound-play';
  play.textContent = '试听';
  play.setAttribute('aria-pressed', 'false');
  play.setAttribute('aria-label', `试听${sound.label}`);
  actions.append(play);

  let loop: HTMLButtonElement | undefined;
  if (sound.loopable) {
    loop = document.createElement('button');
    loop.type = 'button';
    loop.className = 'f3-sound-loop';
    loop.textContent = '循环: 关';
    loop.setAttribute('aria-pressed', 'false');
    loop.setAttribute('aria-label', `${sound.label}循环`);
    actions.append(loop);
  }

  article.append(header, description, actions);
  const card: Card = { article, state, play, loop };

  play.addEventListener('click', () => {
    if (audio.isPlaying(sound.id)) {
      audio.stop(sound.id);
      announce(`已停止${sound.label}。`);
    } else {
      const started = audio.play(sound.id, loopState.get(sound.id) === true);
      announce(
        started
          ? `正在试听${sound.label}${loopState.get(sound.id) ? '（循环）' : ''}。首次试听已启动音频上下文。`
          : '当前浏览器未能启动 WebAudio 上下文。',
      );
    }
    updateCard(sound, card);
  });

  if (loop) {
    loop.addEventListener('click', () => {
      const next = loopState.get(sound.id) !== true;
      loopState.set(sound.id, next);
      if (audio.isPlaying(sound.id)) {
        audio.stop(sound.id);
        audio.play(sound.id, next);
      }
      announce(`${sound.label}循环已${next ? '开启' : '关闭'}。`);
      updateCard(sound, card);
    });
  }

  return card;
}

for (const sound of FRIEND3_TRAVEL_SOUNDS) {
  const card = buildCard(sound);
  cards.set(sound.id, card);
  soundList.append(card.article);
}

volume.addEventListener('input', () => {
  audio.setVolume(Number(volume.value));
  updateGlobal();
});

muteButton.addEventListener('click', () => {
  const next = !audio.getSettings().muted;
  audio.setMuted(next);
  updateGlobal();
  announce(next ? '已静音。' : '已取消静音。');
});

stopAllButton.addEventListener('click', () => {
  audio.stopAll();
  updateCards();
  announce('已停止全部试听。');
});

window.addEventListener('pagehide', () => audio.dispose(), { once: true });

updateGlobal();
updateCards();
window.setInterval(updateCards, 250);