# 酒馆技术样板（待用户验收）

用户已认可第二版的方块风格和基础结构，当前沿用同一方案精修。本轮第三版新增 `refine-tavern.mjs`：柱脚与檐下支撑、窗台窗楣与窗帘、中文字牌、护墙板、抽屉拉环与脚踏杆、茶具托盘、账本、悬杯架和室内陈设。另修正酒架与书架嵌入墙体、细节被遮挡的问题。前端类型检查、生产构建、六个浏览器视角和整栋连续行走复测通过；浏览器无运行错误。门面、吧台、二楼近景见 `assets-source/voxel-tavern-v3-*.jpg`。

只验证候选路线，不替换主游戏、不迁移全镇。采用 MIT 的 [Voxelize](https://github.com/voxelize/voxelize)：发布版 Rust crate / npm client 固定为 3.0.0，Three.js 0.183.2。上游当前主分支与同版本公开包的依赖不同，不能直接混用。

基础版由 `build-tavern.mjs` 逐块搭建墙面、地板、半砖/阶梯瓦顶，再添加 1/16 米窗格和家具构件。本轮精修后有 4263 件构件、2003 个体素单元、396 种复合形状；这些数值只描述数据规模，不代表美术质量验收。`textures.ts` 制作原创 16 像素材质；`block-template.json` 保存公开引擎的注册表格式模板。没有加载 Blender GLB。

第二版已完成前端类型检查、生产构建、Windows Chrome 实际渲染外观/大堂/二楼/阳台、昼夜切换。连续碰撞行走测试通过：从门外进大堂，沿楼梯上二楼，经过房间走到阳台；仅在测试起点放置角色，途中由前进和转向输入驱动物理控制器，没有中途传送。测试修正了楼梯入口、横梁净空和顶部扶手出口。

尚未验收：用户要求的参考视频②③的最终精雕美术、坐下/舞蹈、真实手机性能及多人容量。新增细节提高了绘制批次数，后续仍需优化。旧版曾验证 Rust 编译和双 WebSocket 客户端位置同步；本轮改动的 Rust 注册表代码尚未重新编译，不能将旧联机结果当作新版联机验收。全镇保持原样。

## 查看与运行

在此目录运行 `npm ci --ignore-scripts`，再运行 `node build-tavern.mjs`。

离线建筑查看：`node node_modules/vite/bin/vite.js build`，然后 `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5179`，打开本机 `http://127.0.0.1:5179/?snapshot=1`。第二版 `snapshot.ts` 由搭建脚本生成注册表和九个地图块，实际 Voxelize 客户端负责网格生成与碰撞；这是离线创作场景，不是实时服务器录屏。

在线测试另需 Rust stable 与 protoc：先 `cargo build` 重新验证第二版注册表代码，再 `cargo run --manifest-path Cargo.toml`。运行生产预览，打开不带 `snapshot` 参数的地址。Vite 代理 `/ws/` 与 `/info` 到 4000 端口。当前第二版以离线建筑验收为主。

`node check-network.cjs`（Linux）启动真实 Rust 二进制、验证双客户端位置同步并退出；加 `--capture` 可重新导出地图快照。先 `cargo build`。

`python verify.py` 使用本机已有的隔离 Playwright MCP 对生产构建截图，产物在忽略的 `artifacts/`。当前开发预打包会使依赖包的 Worker 路径失效；生产构建实测正常，应使用上述生产预览验收。

第二版预览截图保存在仓库 `assets-source/voxel-tavern-v2-*.jpg`。用户要求完整外观、完整室内和连续行走，不能缩为局部样件。收到用户对酒馆方向和精度的反馈后再决定下一轮；未获得酒馆验收前不迁移全镇。
