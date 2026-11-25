# B2 续建 · 缆车修缮交互宿主（对批 25 `b13b29cb`）— 窗 B 交付，A 公共批接线

缺口清单里 B2 的最后一格「修缮交互宿主未建」，本包补上。

## 内容（`cable-repair-host.patch`，实测 3/3、tsc 0；依赖 B2 权威包先落状态机叶子）

`town-cable-repair-host.ts`——客户端的手，不持有任何修缮状态：

- `actions(state, player)`：按最新广播状态＋玩家站位给出当前可做的修缮动作（带进度标签：敲锈 n/9、紧缆 n/3），顺序门全在状态机口径内：锈满 9 才出拉闸、拉闸后才出撬缆、对齐后才出紧缆、配重在塔上扛（`take-weight` 取最低未挂序号）、到机房架前挂（手里有块才出）。
- `sync(state)`：每帧广播后把「手里有没有块」与权威 `carriedWeight` 对齐，本地不自作主张。
- `cableWakeEvent(kind)`：**wake 宿主映射就地落实**——雪橇撞击与**滚成的大雪球**可震醒，普通手掷雪团永不映射（状态机的 'snowball' 词在此收口）。此口径已在旗标规格里报总控候确认，本包按保守侧先行实现，总控若改判只动此一函数。

测试含一条端到端：全程只点宿主给出的动作，把一线从 dormant 走到 full-line。

## A 窗接线（viewer 公共批）

1. 每线建一宿主：`createCableRepairHost(line, anchors)`，anchors 取 D3 实体落点（锈闸/缆轮＝半山站机房 m26/m06、配重塔 m27、挂架＝机房内架位）。
2. presence 收到 `cable-line` 帧 → `host.sync(frame 对应 state)`，动作链每帧以 `host.actions(state, playerPos)` 注入情境动作（标签/事件现成）；玩家触发 → 把 `action.event` 发 presence（权威 `applyEvent` 回帧为准，客户端不预演状态）。
3. 震醒侧：雪橇/大雪球对站体结构的撞击事件走 `cableWakeEvent` 映射后上报；夜停运门 `cableServiceOpen` 管乘车、不管修缮（夜里照样能修，这正是「夜里弄醒」的玩法面）。
