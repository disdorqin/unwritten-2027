import {
  FRIEND3_WEATHER_ACCENTS,
  FRIEND3_WEATHER_AUDIO_DEFAULT_STATE,
  FRIEND3_WEATHER_REGIONS,
  createFriend3WeatherAudio,
  type Friend3WeatherAccentId,
  type Friend3WeatherAudioState,
  type Friend3WeatherFieldRegion,
  type Friend3WeatherRegion,
} from './town-blockout/town-friend3-weather-audio';

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const audio = createFriend3WeatherAudio();
const startButton = node<HTMLButtonElement>('#weather-start');
const stopButton = node<HTMLButtonElement>('#weather-stop');
const stateOutput = node<HTMLElement>('#weather-state');
const status = node<HTMLElement>('#weather-status');
const presetList = node<HTMLElement>('#weather-region-presets');
const weightList = node<HTMLElement>('#weather-weights');
const meterList = node<HTMLElement>('#weather-meters');
const hissBar = node<HTMLElement>('#weather-hiss-bar i');
const hissValue = node<HTMLElement>('#weather-hiss-value');
const summary = node<HTMLElement>('#weather-summary');
const indoor = node<HTMLInputElement>('#weather-indoor');
const indoorValue = node<HTMLOutputElement>('#weather-indoor-value');
const wind = node<HTMLInputElement>('#weather-wind');
const windValue = node<HTMLOutputElement>('#weather-wind-value');
const snow = node<HTMLInputElement>('#weather-snow');
const snowValue = node<HTMLOutputElement>('#weather-snow-value');
const master = node<HTMLInputElement>('#weather-master');
const masterValue = node<HTMLOutputElement>('#weather-master-value');
const muteButton = node<HTMLButtonElement>('#weather-mute');
const fieldRegion = node<HTMLSelectElement>('#weather-field-region');
const fieldSeverity = node<HTMLInputElement>('#weather-field-severity');
const fieldSeverityValue = node<HTMLOutputElement>('#weather-field-severity-value');
const fieldApply = node<HTMLButtonElement>('#weather-apply-field');
const accentList = node<HTMLElement>('#weather-accents');

const weightSliders = new Map<Friend3WeatherRegion, HTMLInputElement>();
const weightOutputs = new Map<Friend3WeatherRegion, HTMLOutputElement>();
const meterBars = new Map<Friend3WeatherRegion, HTMLElement>();
const meterValues = new Map<Friend3WeatherRegion, HTMLElement>();

function buildPresets() {
  for (const region of FRIEND3_WEATHER_REGIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f3w-preset';
    button.dataset.region = region.id;
    button.textContent = region.label;
    button.addEventListener('click', () => {
      audio.setRegionWeights({ [region.id]: 1 });
      syncControls();
      syncMeters();
      status.textContent = `区域预设：${region.label}。音量按 ${'2.0'} 秒平滑过渡。`;
    });
    presetList.append(button);
  }
}

function buildWeights() {
  for (const region of FRIEND3_WEATHER_REGIONS) {
    const row = document.createElement('label');
    row.className = 'f3w-weight';
    const label = document.createElement('span');
    label.textContent = region.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = region.id === 'town' ? '100' : '0';
    const output = document.createElement('output');
    output.textContent = input.value;
    input.addEventListener('input', () => {
      const weights: Partial<Record<Friend3WeatherRegion, number>> = {};
      for (const profile of FRIEND3_WEATHER_REGIONS) {
        const slider = weightSliders.get(profile.id);
        weights[profile.id] = slider ? Number(slider.value) / 100 : 0;
      }
      if (!weights.town && !weights.mountain && !weights.crater && !weights.summit) weights.town = 1;
      audio.setRegionWeights(weights);
      output.textContent = input.value;
      syncMeters();
    });
    row.append(label, input, output);
    weightList.append(row);
    weightSliders.set(region.id, input);
    weightOutputs.set(region.id, output);
  }
}

function buildMeters() {
  for (const region of FRIEND3_WEATHER_REGIONS) {
    const row = document.createElement('div');
    row.className = 'f3w-meter';
    row.dataset.region = region.id;
    const label = document.createElement('span');
    label.className = 'f3w-meter-label';
    label.textContent = region.label;
    const bar = document.createElement('div');
    bar.className = 'f3w-meter-bar';
    const fill = document.createElement('i');
    bar.append(fill);
    const value = document.createElement('output');
    value.textContent = '0.0%';
    row.append(label, bar, value);
    meterList.append(row);
    meterBars.set(region.id, fill);
    meterValues.set(region.id, value);
  }
}

function buildAccents() {
  for (const accent of FRIEND3_WEATHER_ACCENTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'f3w-accent';
    button.dataset.accent = accent.id;
    button.textContent = accent.label;
    button.addEventListener('click', () => {
      const played = audio.triggerAccent(accent.id as Friend3WeatherAccentId);
      status.textContent = played ? `已触发${accent.label}（限速单次）。` : '先开启环境音，或点缀音正在限速。';
    });
    accentList.append(button);
  }
}

function buildFieldOptions() {
  const regions: Friend3WeatherFieldRegion[] = ['town', 'foothill', 'alpine', 'summit', 'crater', 'map-edge'];
  for (const region of regions) {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    fieldRegion.append(option);
  }
}

function setSlider(input: HTMLInputElement, value: number) {
  input.value = String(Math.round(value));
}

function syncControls() {
  const state = audio.getState();
  for (const region of FRIEND3_WEATHER_REGIONS) {
    const slider = weightSliders.get(region.id);
    const output = weightOutputs.get(region.id);
    if (slider) setSlider(slider, state.weights[region.id] * 100);
    if (output) output.textContent = String(Math.round(state.weights[region.id] * 100));
    const preset = presetList.querySelector<HTMLButtonElement>(`[data-region="${region.id}"]`);
    if (preset) preset.setAttribute('aria-pressed', String(state.weights[region.id] > 0.98));
  }
  setSlider(indoor, state.indoor * 100);
  setSlider(wind, state.wind * 100);
  setSlider(snow, state.snow * 100);
  setSlider(master, state.masterVolume);
  indoorValue.textContent = String(Math.round(state.indoor * 100));
  windValue.textContent = String(Math.round(state.wind * 100));
  snowValue.textContent = String(Math.round(state.snow * 100));
  masterValue.textContent = String(Math.round(state.masterVolume));
  muteButton.setAttribute('aria-pressed', String(state.muted));
  muteButton.textContent = state.muted ? '取消静音' : '静音';
  startButton.textContent = !audio.isStarted()
    ? '开启区域环境音'
    : state.enabled
      ? '已开启'
      : '已暂停 · 点击恢复';
  stopButton.disabled = !audio.isStarted();
  stateOutput.textContent = audio.isStarted()
    ? state.enabled
      ? '运行中'
      : '已暂停'
    : '未开启';
}

function syncMeters() {
  const state = audio.getState();
  const targets = audio.getTargets();
  for (const region of FRIEND3_WEATHER_REGIONS) {
    const gain = targets.regions[region.id];
    const level = Math.min(100, (gain / 0.35) * 100);
    const bar = meterBars.get(region.id);
    const value = meterValues.get(region.id);
    if (bar) bar.style.width = `${level.toFixed(1)}%`;
    if (value) {
      value.textContent = `${(gain * 100).toFixed(1)}%`;
      value.dataset.gain = gain.toFixed(4);
    }
  }
  const hissLevel = Math.min(100, (targets.snowHiss / 0.1) * 100);
  hissBar.style.width = `${hissLevel.toFixed(1)}%`;
  hissValue.textContent = `${(targets.snowHiss * 100).toFixed(1)}%`;
  hissValue.dataset.gain = targets.snowHiss.toFixed(4);
  summary.textContent = `权重组：镇 ${Math.round(state.weights.town * 100)}% · 山 ${Math.round(state.weights.mountain * 100)}% · 坑 ${Math.round(state.weights.crater * 100)}% · 峰 ${Math.round(state.weights.summit * 100)}% · 室内 ${Math.round(state.indoor * 100)}%`;
}

startButton.addEventListener('click', () => {
  const ok = audio.start();
  syncControls();
  syncMeters();
  status.textContent = ok ? '区域环境音已开启；首次点击后才创建 AudioContext。' : '当前浏览器未能启动 WebAudio。';
});

stopButton.addEventListener('click', () => {
  audio.stop();
  syncControls();
  syncMeters();
  status.textContent = '已暂停区域环境音，音源保留以支持平滑恢复。';
});

indoor.addEventListener('input', () => {
  audio.setIndoor(Number(indoor.value) / 100);
  syncControls();
  syncMeters();
  status.textContent = `室内衰减：${indoor.value}%。`;
});
wind.addEventListener('input', () => {
  audio.setWeatherIntensity(Number(wind.value) / 100, audio.getState().snow);
  syncControls();
  syncMeters();
  status.textContent = `风力强度：${wind.value}%。`;
});
snow.addEventListener('input', () => {
  audio.setWeatherIntensity(audio.getState().wind, Number(snow.value) / 100);
  syncControls();
  syncMeters();
  status.textContent = `雪粒强度：${snow.value}%。`;
});
master.addEventListener('input', () => {
  audio.setMasterVolume(Number(master.value));
  syncControls();
  syncMeters();
  status.textContent = `主音量：${master.value}%。`;
});
muteButton.addEventListener('click', () => {
  const next = !audio.getState().muted;
  audio.setMuted(next);
  syncControls();
  syncMeters();
  status.textContent = next ? '已静音。' : '已取消静音。';
});

fieldSeverity.addEventListener('input', () => {
  fieldSeverityValue.textContent = fieldSeverity.value;
});
fieldApply.addEventListener('click', () => {
  const sample = {
    region: fieldRegion.value as Friend3WeatherFieldRegion,
    severity: Number(fieldSeverity.value) / 100,
    windStrength: audio.getState().wind,
    snowIntensityScale: 0.6 + audio.getState().snow * 0.95,
  };
  audio.updateFromField(sample);
  syncControls();
  syncMeters();
  status.textContent = `已按 F1 字段 ${sample.region} / severity ${fieldSeverity.value}% 更新区域权重。`;
});

buildPresets();
buildWeights();
buildMeters();
buildAccents();
buildFieldOptions();
syncControls();
syncMeters();
window.setInterval(syncMeters, 200);
status.textContent = '设置会即时保存到本模块状态；点击“开启区域环境音”后才创建声音。';

Object.assign(window, {
  __friend3WeatherAudioPreview: {
    getState: () => audio.getState(),
    getTargets: () => audio.getTargets(),
    isStarted: () => audio.isStarted(),
  },
});

window.addEventListener('pagehide', () => audio.dispose(), { once: true });