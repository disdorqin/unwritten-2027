import { monthStops } from './museum-timeline';
import { networkStops } from './museum-network';
import { terraceStop } from './museum-terrace';

export type MuseumPosition = { x: number; y: number; z: number };

export function museumMap(content: HTMLElement, position: MuseumPosition, readMonths: readonly number[]) {
  const floor = position.y >= 3 ? 2 : 1;
  const tabs = document.createElement('div');
  tabs.className = 'museum-options museum-map-tabs';
  tabs.setAttribute('aria-label', '楼层');
  content.append(tabs);
  const map = document.createElement('div');
  map.className = 'museum-map';
  map.setAttribute('role', 'img');
  content.append(map);
  const legend = document.createElement('p');
  legend.className = 'museum-note museum-map-legend';
  content.append(legend);
  const buttons = [1, 2].map(number => {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = `${number} 楼`;
    control.onclick = () => render(number);
    tabs.append(control);
    return control;
  });

  function marker(text: string, x: number, z: number, type: string, label = text) {
    const node = document.createElement('span');
    node.className = `museum-map-marker ${type}`;
    node.style.left = `${(x + 29) / 51 * 100}%`;
    node.style.top = `${(z + 15) / 34 * 100}%`;
    node.textContent = text;
    node.title = label;
    map.append(node);
  }
  function render(level: number) {
    buttons.forEach((control, i) => control.setAttribute('aria-pressed', String(i + 1 === level)));
    map.classList.toggle('upper', level === 2);
    map.replaceChildren();
    marker('↑ 北', -25, -12, 'compass');
    marker('东梯', 17, 1, 'stair');
    if (level === 1) {
      marker('正门', 0, 15.5, 'anchor');
      marker('导览', 0, 10.3, 'anchor');
      for (const { month, x, z } of monthStops) {
        const read = readMonths.includes(month);
        marker(String(month), x, z, read ? 'month read' : 'month', `${month} 月${read ? ' · 已读' : ''}`);
      }
    } else {
      for (const stop of networkStops) {
        const text = stop.id === 'terminal' ? '检索台' : stop.id === 'screening' ? '放映室' : '档案柜';
        marker(text, stop.x, stop.z, 'anchor');
      }
      marker('露台', terraceStop.x, terraceStop.z, 'anchor');
      marker('外梯', -24, 13, 'stair');
    }
    if (level === floor && position.x > -29 && position.x < 22 && position.z > -15 && position.z < 19) {
      marker('◆', position.x, position.z, 'you', '你的位置');
    }
    const summary = level === 1 ? '西侧一至六月，东侧七至十二月。' : '东梯到展厅，穿过西门上露台，外梯回前庭。';
    map.setAttribute('aria-label', `${level} 楼示意图。${summary}你在 ${floor} 楼附近。`);
    legend.textContent = `${summary} ◆ 你的位置${level === 1 ? '　● 已读月份' : ''}`;
  }
  render(floor);
}
