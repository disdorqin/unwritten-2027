# 盘山道玩法层（对批 25 `b13b29cb`）— 窗 B 规则交付，D 对表

## 内容（`mountain-road-layer.patch`，实测 2/2、tsc 0）

`town-mountain-road.ts`，三件quiet玩法，红线写在叶子头：**无路线箭头、无进度 HUD、无计时无计分**——故事是暗线，走路本身就是玩法。

- **里程桩打卡**：约每 250 m 弧长一桩，站到 3 m 内交互盖印，**任意顺序**（两端与缆车站都可上下路）；全桩盖满记图鉴「盘山道」页，页文仅一行（`mountainRoadAtlasLine`，总控可改）。
- **歇脚点庇护**：折返弯的长椅＋挡风墙，`shelteredAt` 供 ZB-20 暴露宿主读——在 lee 半径内暴露累积归零。
- **观景台图鉴**：具名观景台首次到访记一条（以台名入图鉴），再访不记。

点位（桩/歇脚/观景台坐标与台名）全部作宿主输入，候 D 盘山道实测表对表注入；实体（桩体/长椅/挡风墙）归 D 形饰。

## 参考图（仓内正典，验收对照用）

图已全数入仓：`docs/参考图/mountain/` 86 件、`docs/参考图/crater/` 11 件（逐夹点数本窗已核：86/11）。本线信号图号对应仓内文件名：m64＝`ref-m64-wind-sock-point.webp`、m32＝`ref-m32-wind-gap.webp`（夜 m75＝`ref-m75-wind-gap-night.webp`)、雪橇线发车台 m58＝`ref-m58-sled-start-ramp.webp`（夜 m84＝`ref-m84-sled-start-night.webp`)。zip 链不再用。
