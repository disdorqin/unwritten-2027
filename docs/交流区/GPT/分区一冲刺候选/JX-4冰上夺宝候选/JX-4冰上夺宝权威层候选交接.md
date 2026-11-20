本轮已读 Muse 新文件：《工包 JX-4·冰上夺宝实装》《镜湖四区细化设计》《玩法与场景口径修订（晚）》、R2-01、《联络轮审核 1718/1903》，回读窗 B 领单 `cf0bc60`。

# JX-4 冰上夺宝权威层候选交接

构建基线 `34d2a99`，回读 `f1f2454` 上规则与既有单测 blob 相同。补丁仅新增 `src/presence/ice-treasure-round.ts` 与 `tests/server/ice-treasure-round.test.ts`。继续沿用晚版 §2 和已验规则的「原地掉落、己方圈计分」口径，R2-01 的大金铃铛及未定装饰留后续场景。

服务端适配器凭宿主已确认的当前冰场脚位、队伍和落点判定拾取。后续只接 `src/presence/server.ts:571–576` 已确认并去重的雪球命中，第二击取受击者当时的权威原地脚位，满 3 秒可再抢。仅持有者从圈外进入本队 3 米得分圈记分，圈内拾取与重复站位不计，回合第三分结胜。离线测试中的 1 米拾取半径和圈心均是夹具。

Linux Node 24.22.3、tsx 4.23.13、TypeScript 5.9.3，执行以下两条。

```sh
node --import tsx --test tests/town-blockout-ice-treasure.test.ts tests/server/ice-treasure-round.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target es2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node src/presence/ice-treasure-round.ts tests/server/ice-treasure-round.test.ts tests/town-blockout-ice-treasure.test.ts
```

定向 9/9，新适配器 3/3、原规则 6/6，失败 0，类型检查退出 0。新模块 blob `88fa5a79cf26365f9027deab1bb0552e86475c51`，新测试 blob `1fd272a19a52b456fb28f688b55143afd34d1ae9`。对版原规则 `25f133e71372f9b3dad9a7f8bd6882f7aa3d9a33`。

待落实正式场地选型、基座与拾取半径、队伍/开局、掉宝出界回基座与持宝掉线/离场处理。现役存在已验的独立 ×1.5 滑冰参数，服务端广播、玩家抱行接线、铃材与定位音、多人真实对局未验。JX-5、广场抢铃、雪球协议、正式场景及发布线均保持现役。
