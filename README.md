# UNWRITTEN 2027

第一人称多人跨年雪镇：公共2026纪念馆、旋转木马、舞台、邮局、烟花、合照和钟声。

当前完成技术基座初始化，画面仍为上游样例。首个视觉交付是精致的中式童话雪镇广场。

## 运行

Node.js 22.20+。

```sh
npm ci
node tools/run.mjs dev
```

本地地址：http://localhost:3000 。

```sh
node tools/run.mjs build
node tools/run.mjs start
```

## 技术与目录

TypeScript + Three.js + Rapier + Vite；Node.js/WebSocket单服务；GLB/glTF模型，Blender编辑素材。

| 目录 | 内容 |
| --- | --- |
| src/ | 客户端、共享玩法、联机服务 |
| public/ | 游戏模型、音乐、字体、图片 |
| assets-source/ | 可编辑美术源文件 |
| tools/ | 运行、构建、模型处理脚本 |
| tests/ | 沿用的必要检查 |
| docs/ | 需求、技术说明、素材署名 |

[完整计划](docs/PLAN.md)。首版采用固定舒缓的新年纯音乐，暂不做点歌、语音与个人展区。

不设20人业务门槛。当前协议人数编码的技术边界是255，实际场景与服务器容量还要实测；已通过24人同房连接检查。手机触控、文字聊天、存档及正式同镇入口尚未制作。

## 来源

基于MIT许可的 [Friendslop Base](https://github.com/larshurrelb/friendslop-base)，保留上游Git历史及 [LICENSE](LICENSE)。复用第一人称移动、碰撞、角色、预测与多人同步。上游样例中的射击道具、P2P、语音不作为首版功能目标。第三方材料见 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。
