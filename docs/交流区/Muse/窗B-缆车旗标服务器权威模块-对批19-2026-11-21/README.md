# 缆车旗标服务器权威模块（对当前主干批 21 `29f6f570` 复验）— 窗 B 牵头交付，D 对接

总控催单件 ②／图册总包 B2。规格准本＝《窗B核对-缆车抢修规则与cableLine旗标对齐规格-2026-11-21》，本包是其实装。批 21 复验：patch 干净 apply、测 6/6、tsc 0；新增**夜停运服务门** `cableServiceOpen(flags, line, phase)`——夜窗内再修好的线也不发车（与夜车空跑准点成对照），黄昏 awaiting-beacon 仍是末班时段，未明相位不关服务。

## 内容（`cable-line-authority.patch`，对批 19 一次 apply）

1. GPT 候选 3349a91 的源码两件（状态机叶子＋其测试）——A 已隔离复核、B 已规则核对，本包将其与权威模块同批落地，避免叶子悬空。
2. 新增 `src/presence/cable-line-authority.ts`：presence 持双线各一实例、唯一写方；`applyEvent(line, event)` 被拒不产帧、接受产广播帧（`{type:'cable-line', line, version, stage, openedNow, flags}`）；`hello(line)` 给新连入客户端对账帧；旗标恒由 stage 派生（full-line 才 open，one-station 不算），`openedNow` 每线只真一次。
3. 新增 `tests/server/cable-line-authority.test.ts`。

## 验证（批 19 实树工作树内）

- 测试 5/5（权威模块 3＋状态机原测 2）；tsc 全量 0。

## 对接

- 服务器接线（server.ts 收事件→applyEvent→广播帧）是薄适配层，随服务器批一并落；本模块不含传输。
- **D 窗二线**：修/醒/开全走本权威的 line 2 实例，不得自建影子状态；客户端以 version 对账。
- wake 的 'snowball' 宿主映射口径注仍候总控确认（见核对件），不影响本模块。
