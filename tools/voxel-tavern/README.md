# 酒馆技术样板（待用户验收）

只验证候选路线，不替换主游戏、不迁移全镇。采用 MIT 的 [Voxelize](https://github.com/voxelize/voxelize)：发布版 Rust crate / npm client 固定为 3.0.0，Three.js 0.183.2。上游当前主分支与同版本公开包的依赖不同，不能直接混用。

建筑来自 `build-tavern.mjs` 的 1/16 米构件，生成 1255 件构件、995 个体素单元、312 种复合形状。`server.rs` 从同一份构件盒生成渲染面与碰撞盒。没有加载此前的 Blender GLB。

已完成：Rust 编译、前端类型检查与生产构建；两个真实 WebSocket 客户端加入同一世界并收到位置更新；Windows Chrome 实际显示外观、大堂和二楼，重力落地停在对应楼板。小样本服务端 RSS 约 120–126 MiB。此数值不能当作全镇容量结论。

尚未通过：参考视频要求的精雕美术、完整楼梯/门口连续行走、坐下/舞蹈、真实手机、多人压力测试。外观约 449 draw calls，材质批次需要合并。当前墙柱有重叠面、山墙与屋顶收口仍需修整；不能把本样板当成最终建筑质量。

## 查看与运行

在此目录运行 `npm ci --ignore-scripts`，再运行 `node build-tavern.mjs`。

离线建筑查看：`node node_modules/vite/bin/vite.js build`，然后 `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5179`，打开本机 `http://127.0.0.1:5179/?snapshot=1`。`snapshot.ts` 是真实 Rust 服务端输出的注册表与九个地图块，使用相同客户端重新生成网格并进行碰撞；此查看器不联机。

在线测试另需 Rust stable 与 protoc：`cargo run --manifest-path Cargo.toml`，然后运行生产预览，打开不带 `snapshot` 参数的地址。Vite 代理 `/ws/` 与 `/info` 到 4000 端口。当前本机 Rust 依赖索引下载尚未完成；Linux 已实际编译和运行。

`node check-network.cjs`（Linux）启动真实 Rust 二进制、验证双客户端位置同步并退出；加 `--capture` 可重新导出地图快照。先 `cargo build`。

`python verify.py` 使用本机已有的隔离 Playwright MCP 对生产构建截图，产物在忽略的 `artifacts/`。当前开发预打包会使依赖包的 Worker 路径失效；生产构建实测正常，应使用上述生产预览验收。

预览截图保存在仓库 `assets-source/voxel-tavern-*.png`。收到用户对酒馆方向和精度的反馈后再决定下一轮；未获得酒馆验收前不迁移全镇。
