import {
  BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NearestFilter, SRGBColorSpace,
} from 'three';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;

/**
 * 章一 · 测绘线地表段 M1：坑沿北高点、哨棚下坡 20 m（方位 358°、半径 84 m）。
 * 觇标 = 齐腰石柱 + 黄铜三角牌（站号 M1；读数待 B 窗测绘线读数表——
 * 由信标漂移表推导，授权后补文，此处不编读数）。
 * The plate faces the crater (south): the shed and the approach see it.
 */
export function buildCraterSurveyM1(road: Road) {
  const { east: cx, north: cn } = road.anchor;
  const bearing = (358 * Math.PI) / 180;
  const east = cx + 84 * Math.sin(bearing);
  const north = cn + 84 * Math.cos(bearing);
  const height = road.heightAt(east, north);
  if (height === undefined || !Number.isFinite(height)) return undefined;
  const group = new Group();
  group.name = 'crater-survey-m1';
  const stone = new MeshStandardMaterial({ color: 0x8a8378, roughness: 1, flatShading: true });
  const brass = new MeshStandardMaterial({ color: 0xa98a56, roughness: .45, metalness: .65 });
  const base = new Mesh(new BoxGeometry(1.1, .18, 1.1), stone);
  base.position.set(east, height + .09, -north);
  base.name = 'survey-m1-base';
  group.add(base);
  const pillar = new Mesh(new BoxGeometry(.5, 1.15, .5), stone);
  pillar.position.set(east, height + .18 + .575, -north);
  pillar.name = 'survey-m1-pillar';
  group.add(pillar);
  const plate = new Mesh(new BoxGeometry(.72, .52, .06), brass);
  plate.position.set(east, height + 1.12, -north + .28);
  plate.name = 'survey-m1-plate';
  group.add(plate);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#b08d4f'; ctx.fillRect(0, 0, 256, 192);
      ctx.strokeStyle = '#3d2c1c'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, 236, 172);
      ctx.fillStyle = '#3d2c1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText('M1', 128, 78);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(104, 168); ctx.lineTo(152, 168); ctx.closePath(); ctx.stroke();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      const face = new Mesh(
        new BoxGeometry(.66, .46, .01),
        new MeshBasicMaterial({ map: texture }),
      );
      face.position.set(east, height + 1.12, -north + .32);
      face.name = 'survey-m1-face';
      group.add(face);
    }
  }
  return { group, site: { id: 'survey-m1', east, north, height, radius: 1 } };
}
