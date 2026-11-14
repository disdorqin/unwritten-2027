import type { Box } from "./level.js";

// This open doorway stays in the same authoritative town and player room.
export const MUSEUM_BOXES: Box[] = [
  { p: [-18, 0.05, -5], s: [10, 0.1, 10], color: "#b29a76" },
  { p: [-23, 2, -5], s: [0.2, 4, 10], color: "#d7c7ad" },
  { p: [-13, 2, -5], s: [0.2, 4, 10], color: "#d7c7ad" },
  { p: [-18, 2, -10], s: [10, 4, 0.2], color: "#d7c7ad" },
  { p: [-21.25, 2, 0], s: [3.5, 4, 0.2], color: "#d7c7ad" },
  { p: [-14.75, 2, 0], s: [3.5, 4, 0.2], color: "#d7c7ad" },
  { p: [-18, 3.6, 0], s: [3, 0.8, 0.2], color: "#795a3a" },
  { p: [-18, 4.1, -5], s: [10.6, 0.2, 10.6], color: "#e2ebf2" },
];
export const MUSEUM_EXHIBITS = [
  { id: "welcome", title: "留住这一年的共同记忆", position: [-21, 1.9, -9.8],
    text: "欢迎来到2026纪念馆。这里将收藏属于大家的公共年度记忆，从互联网、生活、影视到体育，沿着月份重新走过这一年。\n\n当前开放的是首个空间与阅读样件，尚未上架经过核实的年度事件。" },
  { id: "months", title: "十二个月的时间长廊", position: [-18, 1.9, -9.8],
    text: "未来的展览将按一月至十二月排列。重要事件配合可参与的场景，其余以图文呈现。\n\n每一项内容都需要核对日期、来源和素材授权，再交由策展者筛选。当前没有用占位文字冒充真实事件。" },
  { id: "visit", title: "和朋友一起参观", position: [-15, 1.9, -9.8],
    text: "你仍在朋友所在的同一座小镇，可以互相看见并通过文字聊天。走近展板，点击阅读；关闭阅读窗口后继续散步。\n\n想写给未来的自己？离馆后穿过广场，到右侧新年邮局的书桌旁写信。信件不会出现在公共聊天中。" },
] as const;
export function museumExhibitNear(player?: { x: number; y: number; z: number }) {
  if (!player || player.y > 3 || player.y < 0 || player.x <= -22.8 || player.x >= -13.2 || player.z <= -9.9 || player.z >= 0) return;
  return MUSEUM_EXHIBITS.find(exhibit => Math.hypot(player.x - exhibit.position[0], player.z - exhibit.position[2]) <= 2.4);
}
