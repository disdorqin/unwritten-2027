# 3.0-R 窗C现役交接卡
2026-11-26，owner GPT-C / lane-c，正式工作树 D:\computer learning\game_exe\kuanian\.worktrees\window-c，DevSpace ws_c5db0ef9a4。基线 integration f8380557，C当前实际候选 ae0ac6a8、a796f96c 均已推远端。未入干，未上线。仅本卡随本线推进更新；公共任务看板由总控登记。迁移后空 node_modules 已用本窗 .npm-cache 离线按锁恢复148依赖，未新建工作树；证据仅落本窗 .evidence/c-r30-camp/，不推缓存或证据堆。

## C-R01 井口契约 · 第一独立包待审
- ae0ac6a8：town-c-r30-shaft-contract.ts、underground-domain-host.ts、对应测试。现役 host.shaftContract 输出已登记入口/返程/保护区、深层接口；不替代进入或故事授权。定向12/12、check通过。现役宿主/旧坑基线实测，B新坑尚未核；变换不符时深接缝 blocked，不创建第二域变换。
- B接口：井口 E−120/N185/H−24.2227（现役 rim H10.7773 −35），井口圆保护半径2.58333；绞盘操作脚 E−121.087857/N181.739066/H−24.2227，保护半径0.97；绞盘基座 E−120.746773/N180.605020 r1.2；起重机 E−119.801065/N179.608558 r1.2；蛇石预留 E−122.644613/N180.348308 r1.32；灯房中心 E−131.846535/N192.723964 r3.7。后五点基线同高。矿运线末段 E−137.624176/N194.454545→E−126.571987/N187.090214→绞盘脚，保护半宽1.25。使用 surface.protectedAt(e,n,margin) 及 surface.protection；这些保留净空是本窗施工建议，B对新地形确认支持和通行，不改已认证锚点。井口/蛇石/设备功能不删。
- A/总控接线：firstMine.entry=E−119/N189/H−90、returnToSurface=井口脚，深度线−73，首层房E[−180,30] N[70,280] H[−128,−64]。原 well bridge、entry、lift、handoff 仍是既有受理路径；公共 viewer/presence 不抢写。
- C2接口：复用4b6b866b二矿定义，host.shaftContract.deep.kind===registered 时读取 frame/room/connections/feet；二矿 origin E5.528569570846/N149.482467680295/H−140 yaw4.504772120661；首矿深巷出口E7.485619423136/N149.070210629836/H−91，二矿入口同E/N/H−140；近/远岸E128.822710/N123.510274、E150.350259/N118.975446；出口E197.319455/N109.081277/H−140。房E[−20,220] N[30,220] H[−155,−129]，城侧未注册，不假造接收脚。供C2独立施工，本窗不改深层景物。B↔C独立审核、C2另验消费。

## C-R03 一矿营地样板 · 第一独立美术包待审
- a796f96c：town-c-r30-camp-art.ts、underground-camp-remains.ts、domain-host/scene、独立浏览器预览及测试。原493家具、六间宿舍、食堂、献灯龛、旧镐/火点数据保留；新增3道岩木承重拱（118件）、20件实体火池构件，火焰/暖池为静态美术零新增PointLight、非治疗权威。局部岩面纹理替代营地纯色面，源三角不变；其余矿道材质保持。宿主真实通行查询接营地实体碰撞，火池不能穿，原恢复脚点可站。
- 验证：根check过；营地/宿主定向29/29+新增实物1/1；实际宿主Chrome D3D11六机位（入口/火池/宿舍/食堂/纪念龛/出口）0 page errors，可信W通过2.7m，入口采样35 draws/70330 tris；手动抽看入口/火池图，当前岩面已非纯色平板，仍需配对美术审；预览相机照明不代表live光照，也不是正式设备FPS。复验 node tools/verify-town-c-r30-camp.mjs，图证 .evidence/c-r30-camp/。
- R4/R5样板先过配对B/C2视觉核收再扩展，不报全一矿完成。

## 下一件
C-R02：复用现有 underground-dream-chain.ts/underground-descent.ts/underground-lift-*，修首次坠落与重复下矿、空笼返程；重点查当前会话内 firstFall 状态与断线重连权威消费，不能另造持久化。先完善本窗现役叶件，A接公共移动/Presence。C-R04等C2新模型的真实域侧接口，继续−165/−190正式注册及跨层受理；不提前开放封库或核心。
本轮已读 Muse 新文件：现役全套及 f8380557 开工令、项目脑§7、第二轮整体建模/六窗重编/接口规程、40图册、第三轮地牢酒馆、全图贯穿线。实际可用六路只读并行；未运行独立子智能体。阻塞仅B新坑边界与配对审核，不阻塞C-R02/一矿样板迭代。
