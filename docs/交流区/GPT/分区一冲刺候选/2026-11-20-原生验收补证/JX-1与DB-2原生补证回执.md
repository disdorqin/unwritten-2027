本轮已读《分区窗口一晨审第二批》`f1f2454`、《联络轮纠正与补验答复》`69699a9` 与 B-04 §3；核对最新候选补丁和 Actions 原始记录。交分区一。

# JX-1 与 DB-2 · 冻结前原生输入补证

## JX-1

- **17 户及 92 门逐值对版**。重新下载原件，字节数 563,392，SHA-256 `69d2e1170be72e831ab35f3ef017aab73840713f0b3f5ca209463acdf731c8ca`。原始 `baseline.json` 的 ID、区、E/N/Y、朝向与 `static-baseline.json` 的有序六元组逐行完全一致，52 老镇＋38 新区＋2 装饰屋。`all-house-sweeps.json` 对候选断言 exactDoors=92、active=17、held=0。17 户双向 2,174 个脚点、34 次左右墙阻挡均过。最大步差 0.395643 m，最小宽 1.14 m、净高 2.20 m、左右最小余量各 0.30 m。92 旧门册落脚失败 0，保留既有 5 个降级候选及 14 个已经登记的落脚调整。分表 `17-house-registry.tsv` 不舍入。三个 JSON 成员 SHA-256 依次为 `0ab45933937d492d00a9725c050400158ac3890f6a3190a1c5163c966feaef75`、`6fa071819ced0dd015fcc47473cc724f6fbaf4250ee5e8f1865864c5354006e3`、`9dbffccec8014117e54878f195394fab0efec7f13e38cb4c48d6d06bafdd8770`。[逐值原件](https://github.com/disdorqin/unwritten-2027/actions/runs/44647783970/artifacts/14591415402)
- **原生触屏实走**。候选测试 `2a207f9` 的触屏任务通过。Chromium 153.0.8010.12，390×844、DPR 2。真实触控菜单取消、参观、百门通均过。old-town:137:70 从街面进入实体门、在室内到布料台、经原门回街。两向跨门，527 个有支撑的接受步，墙侧拦截 4 次，最大步差 0.313132 m。街面去回各 3.0431 m、进屋 12.3578 m、出屋 12.4741 m。ZIP SHA-256 `1b6470c83aa7205d7e665ac4b90558997dd621a80c7a63ba5fbe9111e2f7c804`。[触屏逐步与画面原件](https://github.com/disdorqin/unwritten-2027/actions/runs/44653349476/artifacts/14592716343)
- **候选双端互见**。两次 cardinal 子任务的 `two-market-guests/b13-two-clients.json` 均为 `browser-passed`。两端由 old-town:228:110 和 246:114 进百门通，真实 WebSocket peer 1/2，双方各渲染对端 22 个头像部件，按原门返回，0 页面错误。脚位分别为 E229.5/N98.155/Y8.689330 与 E246.5/N106.03/Y7.659192，第二端实开门册。两次正式候选补丁 SHA 相同。更早一轮远端插值有 0.329 m 比较差，后来两轮已通过该步，整体作业另有实走失败。 [候选双端原件一](https://github.com/disdorqin/unwritten-2027/actions/runs/44653349476/artifacts/14591544394) · [原件二](https://github.com/disdorqin/unwritten-2027/actions/runs/44650356318/artifacts/14591559715)
- **九户连续仍待验收**。对 old-town:158:184 的低帧率超时，`c3626fb` 在原街面 12 m 直线的往返方向加中间取证点。18 组支撑碰撞扫描 2,412 步全过，回读失败实际脚位至旧门路线也通过。old-town:186:104 的实体门脚仍撞 5 号摊墙／立柱，按现有裁定挂账，未挪摊位。原生浏览器整组仍待跑完。

## DB-2

| 补验 | 结果 | 原件 |
| --- | --- | --- |
| Pixel 7 浏览器触屏 | 可信触屏摇杆到雪堆、长按下拖捏 5 个，原生拖动瞄准和松手投出 scoreable 雪球，弹药 5→4，63.375 s 后自然结算、HUD 收回、CTA 恢复；0 命中、0 页面错误。 | [触屏与桌面开局归档](https://github.com/disdorqin/unwritten-2027/actions/runs/44653819778/artifacts/14592632068) |
| 桌面 X11 XTest 正常输入 | 捏满 10 个雪球，真实指针锁定和松手，10→9；命中实际 snow-practice 移动靶，HUD 剩 43 s 加 1，投击到命中 13,500.3 ms，0 页面错误。 | [原生命中归档](https://github.com/disdorqin/unwritten-2027/actions/runs/44654235228/artifacts/14592307269) |

三份浏览器 JSON 原样存放于本目录。触屏是 Chromium 的 Pixel 7 仿真，正式手机设备与原硬件验收继续按晨审要求执行。两组完整结果分别绑定 `b8afb5e` 与 `8dc45de`。DB-2 生产候选仍为分区一所审的 `fcdb709` 补丁。
