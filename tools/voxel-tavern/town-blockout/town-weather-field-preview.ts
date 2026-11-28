import {
  townWeatherCrater, townWeatherFieldAt, townWeatherMapDepth, townWeatherMapWidth,
  type TownWeatherFieldBase,
} from '../../../src/shared/town-weather-field.ts';

type Weather = 'clear-snow' | 'wind' | 'whiteout';
type Mode = 'snow' | 'visibility' | 'severity';
type Transect = 'north' | 'east';

const profiles: Record<Weather, TownWeatherFieldBase> = {
  'clear-snow': { intensity: 1, fogNear: 360, fogFar: 1300, pilingRate: .25, targetCover: .18, visibilityMeters: null },
  wind: { intensity: 2.45, fogNear: 200, fogFar: 890, pilingRate: .65, targetCover: .64, visibilityMeters: null },
  whiteout: { intensity: 4, fogNear: 0, fogFar: 12, pilingRate: 1.25, targetCover: 1, visibilityMeters: 12 },
};

const landmarks = [
  { id: 'town', label: '小镇广场', east: 206, north: 182, elevation: 30 },
  { id: 'foothill', label: '山脚', east: 300, north: 430, elevation: 150 },
  { id: 'alpine', label: '高山区', east: 300, north: 560, elevation: 420 },
  { id: 'summit', label: '主峰', east: 350, north: 676, elevation: 800 },
  { id: 'crater', label: '陨石坑', east: townWeatherCrater.east, north: townWeatherCrater.north, elevation: 130 },
  { id: 'edge', label: '地图西缘', east: 4, north: 400, elevation: 30 },
] as const;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Illustrative relief for the map preview; production passes the real grid heightAt. */
function demoElevation(east: number, north: number): number {
  if (north <= 384) return 30;
  const t = Math.min(1, (north - 384) / (676 - 384));
  const lateral = 1 - .45 * smoothstep(220, 520, Math.abs(east - 300));
  return 30 + 770 * t * lateral;
}

function demoEdge(east: number, north: number): number {
  return Math.max(0, Math.min(east, townWeatherMapWidth - east, north, townWeatherMapDepth - north));
}

function sampleAt(weather: Weather, east: number, north: number) {
  return townWeatherFieldAt({
    base: profiles[weather],
    position: { east, north, elevation: demoElevation(east, north), edgeDistance: demoEdge(east, north) },
    windEast: 0,
    windNorth: -1,
    windStrength: weather === 'clear-snow' ? 0 : weather === 'wind' ? .5 : 1,
  });
}

function severityColor(value: number): string {
  const t = clamp01(value);
  const r = Math.round(mix(52, 225, t));
  const g = Math.round(mix(86, 94, t));
  const b = Math.round(mix(150, 92, t));
  return `rgb(${r},${g},${b})`;
}

function snowColor(value: number): string {
  const t = clamp01(value / 6);
  return `rgb(${Math.round(mix(104, 255, t))},${Math.round(mix(150, 248, t))},${Math.round(mix(206, 252, t))})`;
}

function visibilityColor(value: number): string {
  const t = clamp01((value - 10) / 70);
  return `rgb(${Math.round(mix(220, 78, t))},${Math.round(mix(74, 205, t))},${Math.round(mix(64, 114, t))})`;
}

function colorFor(mode: Mode, sample: ReturnType<typeof sampleAt>): string {
  if (mode === 'severity') return severityColor(sample.severity);
  if (mode === 'visibility') return visibilityColor(sample.visibilityMeters);
  return snowColor(sample.intensity);
}

const mapCanvas = $<HTMLCanvasElement>('map');
const chartCanvas = $<HTMLCanvasElement>('chart');
const weatherButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-weather]')];
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
const transectButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-transect]')];
const readout = $<HTMLDivElement>('readout');
const summary = $<HTMLDivElement>('summary');
const chartTitle = $<HTMLElement>('chart-title');
const clockNode = $<HTMLElement>('clock');

let weather: Weather = 'whiteout';
let mode: Mode = 'visibility';
let transect: Transect = 'north';
let visibleEdge = 0;

const mapView = { west: -260, east: 660, south: 0, north: 820 };

function mapTransform(east: number, north: number, width: number, height: number) {
  return {
    x: (east - mapView.west) / (mapView.east - mapView.west) * width,
    y: (mapView.north - north) / (mapView.north - mapView.south) * height,
  };
}

function drawMap() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = mapCanvas.clientWidth, height = mapCanvas.clientHeight;
  if (!width || !height) return;
  mapCanvas.width = Math.round(width * dpr);
  mapCanvas.height = Math.round(height * dpr);
  const context = mapCanvas.getContext('2d')!;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const cell = 3;
  for (let py = 0; py < height; py += cell) {
    const north = mapView.north - (py / height) * (mapView.north - mapView.south);
    for (let px = 0; px < width; px += cell) {
      const east = mapView.west + (px / width) * (mapView.east - mapView.west);
      const sample = sampleAt(weather, east, north);
      context.fillStyle = colorFor(mode, sample);
      context.fillRect(px, py, cell + 1, cell + 1);
    }
  }

  // Grid/contour guides.
  context.strokeStyle = 'rgba(9,18,32,.22)';
  context.lineWidth = 1;
  for (let east = 0; east <= 600; east += 100) {
    const a = mapTransform(east, mapView.south, width, height);
    context.beginPath(); context.moveTo(a.x, 0); context.lineTo(a.x, height); context.stroke();
  }
  for (let north = 0; north <= 800; north += 100) {
    const a = mapTransform(mapView.west, north, width, height);
    context.beginPath(); context.moveTo(0, a.y); context.lineTo(width, a.y); context.stroke();
  }

  // Town outline and landmarks.
  context.strokeStyle = 'rgba(255,255,255,.35)';
  context.setLineDash([5, 5]);
  const bounds = mapTransform(0, 800, width, height);
  context.strokeRect(bounds.x, 0, mapTransform(townWeatherMapWidth, 0, width, height).x - bounds.x, height);
  context.setLineDash([]);

  for (const landmark of landmarks) {
    const point = mapTransform(landmark.east, landmark.north, width, height);
    context.fillStyle = '#111827';
    context.strokeStyle = '#f8fafc';
    context.lineWidth = 2;
    context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = '#f8fafc';
    context.strokeStyle = 'rgba(9,14,24,.85)';
    context.lineWidth = 3;
    context.font = '600 12px system-ui, sans-serif';
    context.strokeText(landmark.label, point.x + 9, point.y + 4);
    context.fillText(landmark.label, point.x + 9, point.y + 4);
  }

  // Selected transect.
  const path = transectPath();
  context.strokeStyle = 'rgba(255,255,255,.85)';
  context.lineWidth = 2;
  context.beginPath();
  path.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function transectPath() {
  const width = mapCanvas.clientWidth, height = mapCanvas.clientHeight;
  if (transect === 'north') {
    return [mapTransform(300, 0, width, height), mapTransform(300, 800, width, height)];
  }
  return [mapTransform(-240, 182, width, height), mapTransform(townWeatherMapWidth + 20, 182, width, height)];
}

function transectSamples(): { x: number; label: string; value: ReturnType<typeof sampleAt> }[] {
  const rows: { x: number; label: string; value: ReturnType<typeof sampleAt> }[] = [];
  if (transect === 'north') {
    for (let north = 0; north <= 800; north += 2) {
      rows.push({ x: north, label: 'N', value: sampleAt(weather, 300, north) });
    }
  } else {
    for (let east = -240; east <= 660; east += 2) {
      rows.push({ x: east, label: 'E', value: sampleAt(weather, east, 182) });
    }
  }
  return rows;
}

function drawChart(rows: { x: number; value: ReturnType<typeof sampleAt> }[]) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = chartCanvas.clientWidth, height = chartCanvas.clientHeight;
  if (!width || !height) return;
  chartCanvas.width = Math.round(width * dpr);
  chartCanvas.height = Math.round(height * dpr);
  const context = chartCanvas.getContext('2d')!;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const pad = { left: 46, right: 18, top: 18, bottom: 26 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  context.strokeStyle = 'rgba(148,163,184,.3)';
  context.lineWidth = 1;
  for (let row = 0; row <= 4; row++) {
    const y = pad.top + plotHeight * row / 4;
    context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
    context.fillStyle = '#94a3b8';
    context.font = '11px ui-monospace, monospace';
    context.fillText(String(Math.round(100 - row * 25)), 12, y + 4);
  }

  const maxSnow = 6.5;
  const drawCurve = (pick: (value: ReturnType<typeof sampleAt>) => number, max: number, color: string) => {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    rows.forEach((row, index) => {
      const x = pad.left + (index / (rows.length - 1)) * plotWidth;
      const y = pad.top + plotHeight * (1 - clamp01(pick(row.value) / max));
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  };
  drawCurve(value => value.intensity, maxSnow, '#7dd3fc');
  drawCurve(value => value.severity * 100, 100, '#fbbf24');
  drawCurve(value => value.visibilityMeters, 80, '#fb7185');

  context.fillStyle = '#94a3b8';
  context.font = '11px ui-monospace, monospace';
  const start = rows[0].x, end = rows[rows.length - 1].x;
  context.fillText(`${start}`, pad.left, height - 8);
  const endText = `${end}`;
  context.fillText(endText, width - pad.right - context.measureText(endText).width, height - 8);
  context.fillText(transect === 'north' ? '北向剖面（N 0 → 800）' : '东西向剖面（E -240 → 660）', pad.left, 12);
}

function updateReadout() {
  readout.innerHTML = landmarks.map(landmark => {
    const value = sampleAt(weather, landmark.east, landmark.north);
    return `<tr>
      <td>${landmark.label}</td>
      <td>${value.region}</td>
      <td>${value.severity.toFixed(2)}</td>
      <td>${value.intensity.toFixed(2)}</td>
      <td>${Math.round(value.visibilityMeters)} m</td>
      <td>${value.windStrength.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const rows = transectSamples();
  const maxDelta = rows.reduce((worst, row, index) => {
    if (index === 0) return worst;
    return Math.max(worst, Math.abs(row.value.severity - rows[index - 1].value.severity));
  }, 0);
  summary.innerHTML = `
    <span>基础天气 <b>${weather}</b></span>
    <span>场覆盖 <b>${mode}</b></span>
    <span>剖面最大 1 m 步进 Δ <b>${maxDelta.toFixed(4)}</b></span>
    <span>同一状态 · 同一位置 <b>全场一致</b></span>`;
}

function redraw() {
  drawMap();
  const rows = transectSamples();
  drawChart(rows);
  updateReadout();
  weatherButtons.forEach(button => button.classList.toggle('active', button.dataset.weather === weather));
  modeButtons.forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  transectButtons.forEach(button => button.classList.toggle('active', button.dataset.transect === transect));
  clockNode.textContent = `${weather} · ${mode} · ${transect === 'north' ? '北线' : '东西线'}`;
}

weatherButtons.forEach(button => button.addEventListener('click', () => {
  weather = button.dataset.weather as Weather;
  redraw();
}));
modeButtons.forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode as Mode;
  redraw();
}));
transectButtons.forEach(button => button.addEventListener('click', () => {
  transect = button.dataset.transect as Transect;
  redraw();
}));

let frame = 0;
function resizeLoop() {
  frame += 1;
  const nextEdge = mapCanvas.clientWidth;
  if (nextEdge !== visibleEdge) {
    visibleEdge = nextEdge;
    redraw();
  }
  if (frame > 2) {
    window.__FR15_PREVIEW__ = {
      ready: true,
      setWeather(next: Weather) { weather = next; redraw(); },
      setMode(next: Mode) { mode = next; redraw(); },
      setTransect(next: Transect) { transect = next; redraw(); },
      state() {
        const rows = transectSamples();
        const maxDelta = rows.reduce((worst, row, index) => index === 0 ? worst
          : Math.max(worst, Math.abs(row.value.severity - rows[index - 1].value.severity)), 0);
        return {
          weather, mode, transect,
          maxSeverityStep: maxDelta,
          landmarks: landmarks.map(landmark => ({
            id: landmark.id,
            ...sampleAt(weather, landmark.east, landmark.north),
          })),
        };
      },
    };
    return;
  }
  requestAnimationFrame(resizeLoop);
}

redraw();
requestAnimationFrame(resizeLoop);

declare global {
  interface Window {
    __FR15_PREVIEW__?: {
      ready: boolean;
      setWeather(weather: Weather): void;
      setMode(mode: Mode): void;
      setTransect(transect: Transect): void;
      state(): {
        weather: Weather; mode: Mode; transect: Transect; maxSeverityStep: number;
        landmarks: Array<{ id: string } & ReturnType<typeof sampleAt>>;
      };
    };
  }
}
