# 钟楼广场样片

执行 `npm ci`、`node tools/run.mjs dev` 后打开 `/town.html`。
运行 `node tools/run.mjs build` 和 `node tools/run.mjs start` 也包含相同入口。
多人主入口在 `/`，已经使用同一雪镇地图；`/town.html` 是单人美术与行走验收入口。

- 桌面：进入广场后 WASD、鼠标转向、空格跳跃；Esc 释放鼠标。
- 手机：方向键移动、在场景上滑动转向、跳跃按钮；尚待真机验收。
- 钟楼为真实 GLB 模型，钟面使用北京时间。当前外壳封闭，内部待制作。
- `src/shared/town.ts` 统一位置与碰撞，`src/client/rendering/town.ts` 负责外观。
- `Simulation` 接收可选地图配置，默认仍使用原基座地图；实际游戏的服务端与客户端都传入 TOWN_LAYOUT，复用原角色控制器。
- 模型由 `tools/build-town-assets.py` 生成，源文件在 `assets-source/blender/clocktower.blend`。

模型生成：

```sh
blender --background --factory-startup --python tools/build-town-assets.py
```

当前内容：雪地、钟楼、铺石广场、长椅、灯笼、背景雪松与雪山。
钟楼是依据概念图进行的 Blender 脚本建模样件，尚未达到最终美术效果。
它不是外部 AI 图生三维服务的生成结果。

已加入同房文字聊天；服务器决定昵称和身份，消息最多300字、同房保留最近50条，暂不持久化聊天历史。
30项核心及服务端测试与生产构建通过，包括24个真实WebSocket客户端在雪镇同房、移动快照和聊天隔离。
上述是协议与物理验证，浏览器实玩与手机真机验收仍待完成。

尚待实现：纪念馆、邮局、可进入的钟楼和更多游戏互动。
