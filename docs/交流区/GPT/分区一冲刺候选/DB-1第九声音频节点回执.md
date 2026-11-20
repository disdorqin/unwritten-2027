已读：分区一冲刺领单 `e1931a7`、《任务书-钩子一号》、《任务书-声音与音乐故事线》§三、《矛盾裁定修订登记·第三轮》§一.3 与 `09fb26e` 普通整点候选。

# DB-1 · 第九声音频节点候选

基线 `e1931a717320edc87f223ccf0303256da2149881`。补丁 `DB-1-ninth-bell-audio.patch`，SHA-256 `bf19df15ff99fe70d137737617604cae1ffa3dd2c458e4cc60b02d5be7db81d3`。仅改塔钟音色实现和定向测试。

- 第九声复用现役塔钟的低阶泛音，经 1200 Hz 低通和 6 秒衰减的独立混响，尾音下坠 50 cents。WebAudio 按外部调度的时刻播放，HRTF 使用宿主换算后的听者坐标，西侧偏上须在实际摄像机/监听器姿态复验。宿主明确传入响度和湿声比，测试中的 −8 dB、0.3 是节点验证输入。
- 既有普通塔钟继续走原播放函数，节点回归验证每声六个原泛音、不加下坠、不改 2.020 秒间隔。普通整点八加一、共同时钟、迟到不回播、极光只抑第九声和零点排除由已审 `town-hook-one.ts` 规划器复跑。
- 三个文件共 **19/19 个 Node 测试用例**（原钟楼与规划器 17 个，新增音频 2 个；新增文件 18 处断言），`npm run typecheck` 通过，`git diff --check` 通过。命令 `node --import tsx --test tests/town-blockout-ninth-bell.test.ts tests/town-blockout-hook-one.test.ts tests/town-blockout-clocktower-function.test.ts`。新增两例为 WebAudio 参数及连接的记录型夹具，听感和实机声源方位尚待验。

## 生产接线剩余

以 `viewer.ts` 的 `dailyTowerChime(ceremonyState.now, ceremonyState.phase)` 为挂接处。此树的普通正钟仍是 3 声。新节点候选未挂现役，仓内仅 `town-hook-one.ts` 候选读取 `auroraAtHour`，无 O1/TX2 正式全图输入，个人第 3 次须由宿主按稳定身份确认在场计数。待补到场数据、正式极光值与双端同秒/方位实测后接普通回放。跨年零点排除，00:10 秀后落点和首晚 20:00 由既有分期裁定承接。
