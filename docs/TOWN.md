# 钟楼广场样片

执行 `npm ci`、`node tools/run.mjs dev` 后打开 `/town.html`。
运行 `node tools/run.mjs build` 和 `node tools/run.mjs start` 也包含相同入口。
现有多人入口保持在 `/`；样片是同一项目内的单人美术与行走验收入口。

- 桌面：进入广场后 WASD、鼠标转向、空格跳跃；Esc 释放鼠标。
- 手机：方向键移动、在场景上滑动转向、跳跃按钮；尚待真机验收。
- 钟楼为真实 GLB 模型，钟面使用北京时间。当前外壳封闭，内部待制作。
- `src/shared/town.ts` 统一位置与碰撞，`src/client/rendering/town.ts` 负责外观。
- `Simulation` 接收可选地图配置，默认仍使用原基座地图；复用原角色控制器。
- 模型由 `tools/build-town-assets.py` 生成，源文件在 `assets-source/blender/clocktower.blend`。

模型生成：

```sh
blender --background --factory-startup --python tools/build-town-assets.py
```

当前内容：雪地、钟楼、铺石广场、长椅、灯笼、背景雪松与雪山。
钟楼是依据概念图进行的 Blender 脚本建模样件，尚未达到最终美术效果。
它不是外部 AI 图生三维服务的生成结果。

尚待实现：纪念馆、邮局、可进入的钟楼，以及与现有多人入口整合。
整合时客户端预测世界和服务端权威世界必须同时使用同一 TOWN_LAYOUT。
保留当前多人入口的人数、语音配置；不使用单人预览冒充联机地图验收。
