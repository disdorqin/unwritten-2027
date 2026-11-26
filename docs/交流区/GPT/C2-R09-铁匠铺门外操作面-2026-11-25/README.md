# C2-R09 铁匠铺门外操作面审图

- 候选：`town-c2-r30-forge-exterior.ts`
- 场景：既有 `underground-warrior-city-candidate`＋`underground-warrior-forge-hall`＋C2-R09 门外层
- 坐标：勇士城局部 ENY；`y` 为构件底面；未声明世界锚或生产交互。
- 内容：石构高门与门阶、砧架/待锻铁料、淬火槽外沿、炭料、工具架、街面铺石与接缝。
- 规模：95 件、9 个实例批次、37 个实体碰撞盒、0 真实灯、0 交互 socket、0 loot/presence/registration 变更。

## 机位

- `gate-front-day/night.png`：街面正视高门，门楣、两侧石柱、门内炉火与前景砧架同框。
- `anvil-yard-day.png`：第一人称眼高看砧架、铁料与炉门。
- `quench-edge-day.png`：东侧看淬火槽外沿、炭料与工具架。
- `street-seam-day.png`：街面铺石、接缝与高门纵深。

## 实测

- D3D11 headless Chrome，1280×720，20 秒近景样本：**240.06 FPS**，76 calls／88,308 triangles。
- 可信 W 键从街面连续步行 **7.8m／0 拒绝**。
- 页面错误 0、控制台错误 0、失败请求 0。
- 5/5 定向测试通过；类型检查通过。
- 这是 review-only 候选，不是生产挂载、C 认证世界帧或 Live 认证。
