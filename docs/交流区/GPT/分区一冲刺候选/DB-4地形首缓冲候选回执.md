# DB-4 / A-04 地形首提交候选

- 基线是线上 `75859a094757c5dcee8b874eef86ec37f4204907`。依据是 `e1931a7` A/B 调度、A-04 提单与 `feda50e` 冷帧实录。生产改动只在 `tools/voxel-tavern/town-blockout/terrain-mesh.ts`。步行块的属性持有原连续 CPU backing 的局部视图，块内绘制从 0 开始。俯视动态索引、全景、材质、导航、房屋与 B13 时序沿用原实现。切换两种视图后，GPU 上可能同时保有分块与俯视缓冲。
- A6 固定为 `district:513:366 → district:550:412` 的旧实录目标点，E543.6 / N412 / Y11.8934618，朝西，视口 1000×650，DPR1。Three 0.183.2 `WebGLAttributes` 连接到记录型 GL，按同一视锥依次送入两版可见块。两版均是 33 块、270,336 tris，`bufferData` 由 4 次、76,723,200 B 变为 132 次、30,007,296 B，降 60.89%。原步行属性 172 组、俯视 679,824 个索引、全景 231,120 个顶点的属性均逐字节相等。这一记录型口径只验证地形提交字节，冷帧用时待测。
- 定向测试 7/7。含 92 门（52 老城、38 新区、2 装饰），门册分区 9 / 28 / 14 / 20 / 21，新增和缺失均为 0。`tsc` 定向严格检查、`git diff --check` 及在候选源上反向 `git apply --check` 都已通过。
- 正式交付仍待原 Windows Intel UHD / ANGLE D3D11 / Chrome 146 用同路线、雪量 2.45、中画质和同视口复走。旧轨迹首外景地形上传 47.8 ms、相邻峰值 83.3 ms。保留冷帧 ≤50 ms 门槛。整场绘制与三角预算也以完整产品帧测为准。

## 复核命令

```bash
node --import tsx --test tests/town-blockout-terrain-mesh.test.ts tests/town-blockout-house-portals.test.ts tests/town-blockout-shared-home.test.ts
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --resolveJsonModule tools/voxel-tavern/town-blockout/terrain-mesh.ts tests/town-blockout-terrain-mesh.test.ts
git diff --check
git apply --reverse --check ../DB-4-terrain-chunk-upload.patch
```

补丁 `DB-4-terrain-chunk-upload.patch`，SHA-256 `89f8fb84b0e654946cb14f881fa289e60442fd8643ea96927df4b3e34e8418ee`。定量记录 `db4-terrain-comparison.json`，原始测试 `db4-directed-test.log`。
