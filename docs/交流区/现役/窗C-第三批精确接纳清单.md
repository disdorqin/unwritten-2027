# C 第三批｜精确接纳清单与跨线审合回执（2026-11-26）
 
候选 76727ca9f4300d0c74664ebbfb01511c0c47449e（lane-c）；本期起点 69768a22 的 tree 与集成 f8380557 完全相同；当前总控 479e2855。禁止整枝 merge 或按历史父链恢复旧物。本清单为实际 `git diff --name-only f8380557 HEAD -- src tools tests` 的139个路径完整互斥划分，另有窗C交接文档，不带证据/缓存。C2 13个文件原样来自24c56fb1（e7c00e2b仅文档）；其中 forge 已经由总控9ff4d378按相同blob接纳，跳过。其他126路径是C本期自有交付。与当前集成的路径交集仅已同blob的forge；与A d15a9e3c、B eba19280 的本期源码/测试路径交集为空（不等于组合语义无冲突）。

接纳顺序：C-S0可先审独立材质/连接廊/帧合同及定向测试；C-S1仅封闭候选与调查合同，不切井，不替换公共入口。C2-D应由C2源提交串行接纳，二矿出口补墙返修后取C2新blob而非覆盖回旧；C-S2必须与C2依赖同时在总控候选树构建（现有domain-host已引用C2真实桥）；C-S3为测试/评审工具，依赖前包。不能以单个文件先上线。除上述精确路径，不从lane-c取其他文件。 
### C2-D：原资产依赖，C2所有，取24c56fb1或经审修复后新SHA（13 文件）
```text
tools/voxel-tavern/town-blockout/town-c2-r30-city-vault.ts
tools/voxel-tavern/town-blockout/town-c2-r30-deep-bridge.ts
tools/voxel-tavern/town-blockout/town-c2-r30-deep-mouths.ts
tools/voxel-tavern/town-blockout/town-c2-r30-forge-exterior.ts
tools/voxel-tavern/town-blockout/town-c2-r30-layer-seams.ts
tools/voxel-tavern/town-blockout/town-c2-r30-palace-shell.ts
tools/voxel-tavern/town-blockout/town-c2-r30-remnant-ring.ts
tools/voxel-tavern/town-blockout/town-c2-r30-rooster-star-stone.ts
tools/voxel-tavern/town-blockout/town-c2-r30-tavern.ts
tools/voxel-tavern/town-blockout/town-c2-r30-vault-approach.ts
tools/voxel-tavern/town-blockout/town-c2-r30-warrior-domestic.ts
tools/voxel-tavern/town-blockout/underground-second-mine.ts
tools/voxel-tavern/town-blockout/underground-warrior-city-shell.ts
```

### C-S0：独立帧、材质和254m连接廊（4 文件）
```text
tools/voxel-tavern/town-blockout/town-c-r30-camp-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-deep-layer-contract.ts
tools/voxel-tavern/town-blockout/town-c-r30-depth-corridor.ts
tests/town-c-r30-deep-layer-contract.test.ts
```

### C-S1：井轴与封闭迁站候选（6 文件）
```text
src/shared/town-c-r30-return-bay.ts
tools/voxel-tavern/town-blockout/town-c-r30-return-bay.ts
tools/voxel-tavern/town-blockout/town-c-r30-return-relocation-candidate.ts
tools/voxel-tavern/town-blockout/town-c-r30-return-bore-candidate.ts
tools/voxel-tavern/town-blockout/town-c-r30-return-ride.ts
tools/voxel-tavern/town-blockout/town-c-r30-shaft-contract.ts
```

### C-S2：实际一矿/晶洞/下层宿主及布局源码，原子装配（61 文件）
```text
src/shared/town-c-r30-mainline-plan.ts
src/shared/town-c-r30-support-annex.ts
src/shared/town-c-r30-thin-wall-plan.ts
src/shared/underground-encounter-placement-plan.ts
src/shared/underground-mine-expansion-shell.ts
src/shared/underground-mine-layout.ts
tools/voxel-tavern/town-blockout/town-c-r30-approach-story.ts
tools/voxel-tavern/town-blockout/town-c-r30-c2-consumer.ts
tools/voxel-tavern/town-blockout/town-c-r30-camp-receipts.ts
tools/voxel-tavern/town-blockout/town-c-r30-creature-fragments.ts
tools/voxel-tavern/town-blockout/town-c-r30-crouch-route.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-endcaps.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-grove.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-host.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-monkey-seat.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-side-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-support.ts
tools/voxel-tavern/town-blockout/town-c-r30-crystal-vestibule.ts
tools/voxel-tavern/town-blockout/town-c-r30-deep-assembly.ts
tools/voxel-tavern/town-blockout/town-c-r30-deep-bank.ts
tools/voxel-tavern/town-blockout/town-c-r30-deep-host.ts
tools/voxel-tavern/town-blockout/town-c-r30-deep-retreat.ts
tools/voxel-tavern/town-blockout/town-c-r30-depth-stop.ts
tools/voxel-tavern/town-blockout/town-c-r30-encounter-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-encounter-survey.ts
tools/voxel-tavern/town-blockout/town-c-r30-horse-seat.ts
tools/voxel-tavern/town-blockout/town-c-r30-interlayer-lift.ts
tools/voxel-tavern/town-blockout/town-c-r30-lift-presentation.ts
tools/voxel-tavern/town-blockout/town-c-r30-main-gallery.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-arches.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-cargo-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-dressing.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-host.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-motion.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-repair-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-mainline-terminal.ts
tools/voxel-tavern/town-blockout/town-c-r30-mine-acoustics.ts
tools/voxel-tavern/town-blockout/town-c-r30-mine-creature-model.ts
tools/voxel-tavern/town-blockout/town-c-r30-ore-actions.ts
tools/voxel-tavern/town-blockout/town-c-r30-ore-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-ore-survey.ts
tools/voxel-tavern/town-blockout/town-c-r30-ore-wall-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-shallow-gallery.ts
tools/voxel-tavern/town-blockout/town-c-r30-shallow-wayfinding.ts
tools/voxel-tavern/town-blockout/town-c-r30-support-annex.ts
tools/voxel-tavern/town-blockout/town-c-r30-thin-wall-art.ts
tools/voxel-tavern/town-blockout/town-c-r30-tutorial-cart.ts
tools/voxel-tavern/town-blockout/town-c-r30-upper-aperture.ts
tools/voxel-tavern/town-blockout/town-c-r30-water-readout.ts
tools/voxel-tavern/town-blockout/town-c-r30-workbay.ts
tools/voxel-tavern/town-blockout/town-c-second-mine-domain.ts
tools/voxel-tavern/town-blockout/underground-camp-interactions.ts
tools/voxel-tavern/town-blockout/underground-camp-remains.ts
tools/voxel-tavern/town-blockout/underground-camp-scene.ts
tools/voxel-tavern/town-blockout/underground-crystal-cavern.ts
tools/voxel-tavern/town-blockout/underground-crystal-gate.ts
tools/voxel-tavern/town-blockout/underground-descent.ts
tools/voxel-tavern/town-blockout/underground-domain-host.ts
tools/voxel-tavern/town-blockout/underground-domain-scene.ts
tools/voxel-tavern/town-blockout/underground-dream-chain.ts
tools/voxel-tavern/town-blockout/underground-mainline-scene.ts
```

### C-S3：实际宿主回归、测绘、浏览器证据生成器（55 文件）
```text
tests/town-blockout-underground-dream-chain.test.ts
tests/town-c-r30-approach-story.test.ts
tests/town-c-r30-c2-integrated.test.ts
tests/town-c-r30-camp-art.test.ts
tests/town-c-r30-camp-receipts.test.ts
tests/town-c-r30-creature-pose.test.ts
tests/town-c-r30-crouch-route.test.ts
tests/town-c-r30-crystal-endcaps.test.ts
tests/town-c-r30-crystal-gate-actions.test.ts
tests/town-c-r30-crystal-grove.test.ts
tests/town-c-r30-crystal-host.test.ts
tests/town-c-r30-crystal-light-focus.test.ts
tests/town-c-r30-crystal-monkey-seat.test.ts
tests/town-c-r30-crystal-side-trail.test.ts
tests/town-c-r30-crystal-vestibule.test.ts
tests/town-c-r30-deep-assembly.test.ts
tests/town-c-r30-deep-bank.test.ts
tests/town-c-r30-deep-host.test.ts
tests/town-c-r30-deep-retreat.test.ts
tests/town-c-r30-descent-retry.test.ts
tests/town-c-r30-encounter-survey.test.ts
tests/town-c-r30-first-mine-journey.test.ts
tests/town-c-r30-horse-seat.test.ts
tests/town-c-r30-interlayer-lift.test.ts
tests/town-c-r30-lift-presentation.test.ts
tests/town-c-r30-main-gallery.test.ts
tests/town-c-r30-mainline-arches.test.ts
tests/town-c-r30-mainline-cargo.test.ts
tests/town-c-r30-mainline-host.test.ts
tests/town-c-r30-mainline-terminal.test.ts
tests/town-c-r30-mine-acoustics.test.ts
tests/town-c-r30-mine-posture.test.ts
tests/town-c-r30-ore-actions.test.ts
tests/town-c-r30-ore-survey.test.ts
tests/town-c-r30-pickaxe-receipt.test.ts
tests/town-c-r30-recovery-contact.test.ts
tests/town-c-r30-return-bay.test.ts
tests/town-c-r30-return-bore-candidate.test.ts
tests/town-c-r30-return-relocation-candidate.test.ts
tests/town-c-r30-return-ride.test.ts
tests/town-c-r30-shaft-contract.test.ts
tests/town-c-r30-shallow-gallery.test.ts
tests/town-c-r30-support-annex.test.ts
tests/town-c-r30-thin-wall.test.ts
tests/town-c-r30-tutorial-cart.test.ts
tests/town-c-r30-upper-aperture.test.ts
tests/town-c-r30-water-readout.test.ts
tests/town-c-r30-workbay.test.ts
tools/fixtures/town-c-r30-camp-review.ts
tools/fixtures/town-c-r30-crystal-host-review.ts
tools/fixtures/town-c-r30-deep-review.ts
tools/measure-town-c-r30-first-mine-walkable.mts
tools/measure-town-c-r30-first-mine.mts
tools/verify-town-c-r30-camp.mjs
tools/verify-town-c-r30-deep.mjs
```

 
## B↔C 独立审签与联合测绘
- B eba19280（实际候选eac4b4e0）的B-S0三文件与原blob一致，读代码并在原window-b只读复跑实际坡板/断口测试1/1，42个支撑三角对应真实木板；批准独立预制送总控，不批准生产挂载或跳跃跨断口。
- B-S3封闭返井：实际独立回归1/1，真实地表未切、候选封盖存在；B-S4原拓印、B-S5整装回滚review各1/1。四项合计4/4，B工作树未修改。S3可按封闭预制接纳，不是开孔许可。S4/5仅此次相关定向用例通过，不签全包生产。
- 原B实际测绘 axis(E−124.5,N177,H−24.222694396972656), yaw1.3631794670708894, roofSpan .005188394161017129, roofSamples1257, solidGap3.3762456746660194, reservationGap2.6172508087167277, routeGap .6410637054449796, grade 8.934161487632354e−14, apertureSide2.2, dockHeight−89.35458276044781, verticalSpan65.13188836347516。C 02fa06c1消费真实B数字复核原升降机迁站端，返程候选/原首坠完整回归4/4。开孔认证仍为测试输入，不等于已切井。
- **B-S4/S5生产接近线窄项打回**：town-b-r30-inscription-approach.ts surveyBR30InscriptionApproach 缺失finite foot及完整solids/track/route校验。实际运行函数，以原起点正确路线、3条远侧track、平地heightAt、foot三个NaN及空solids，输出invalid foot accepted 293 bodyGap Infinity。应拒绝非有限foot/route/track/box、反向min/max及缺失碰撞清单；明确三轨全支撑采样和A真正hostRoutes联合回归；不能仅用Infinity或NaN比较证明安全。B独立栈道和封闭井通过不受此影响。C不改B领地。
 
## C2真实壳复核与回传
- **C2-R04 二矿出口上墙缺失**：df8b36a9 desktop sealed.jpg实际渲染门楣两边黑空；源24c56fb1 underground-second-mine.ts 出口侧 jamb 循环仅从0到lintelBottom=3.24，中央lintel宽3.4且至5；E[-6,-1.7]及[1.7,6]的Y[3.24,5]无封闭墙，总缺口约15.136平方米。acceptsMouth的覆盖断言也只测到3.24。C2请补两个侧墙上部原岩石砖并纳入同源solid，保留精确3.4×3.24中间开口；补E±3/Y4朝N198横向实射线与jamb全高覆盖测试。C仅增加C-owned可逆封板，不能冒充修复C2外墙。C2复推后重跑贯穿。地宫较暗另由A/C2现有灯预算协调，不擅造照明权威。
 
## C第三批真实工作及剩余生产依赖
- a5ec23bb：四个实际层界封板，房/廊未受理时真实可见/碰撞挡住，批准后撤；实时撤销在下次sync前阻止移动，旧1155.69m/1168步双向回归保持。
- df8b36a9、71c19ea5、76727ca9：真实C/C2浏览器夹具，桌面及390×844触屏模拟，实际E/W、touch tap跨域/移动；矿廊19个可见支架矿灯、38组双向标志，灯玻璃不被木柱遮住，普通站姿净空保留，高身位碰撞封闭，无新增PointLight。最终灯位专项4/4。最终76727ca9桌面7机位和390×844触屏3机位均复跑通过，真实键盘2/触屏2、每组1次跨层及5次移动，0拒绝/0浏览器错误；最大机位100 draws/209544 tris，走廊1为28 draws/80582 tris。证据位于.evidence/c-r30-deep-review-76727ca9-{desktop,mobile}，各review.json绑定完整SHA；复看最终廊1图和前版4张关键图。短时机位数据不作正式设备帧率。
- 最终76727ca9根tsc/Vite client build/server tsc均执行通过（npm script PATH缺node，改直接执行同三命令）；构建及七个测试文件合在一次调用45秒超时，分开复跑后最终关键回归10/10：深层合同与真实C2贯穿4/4、原首坠一矿往返/返程井/晶门/矿石/上下井孔6/6。构建提示大bundle与libopus node:module externalized，非失败；P-OPT后置。
- 第三批不重新领取第一/二批已完成的模型。总控需接C-S0/S1，C2补墙后依序C2-D/C-S2/C-S3并核A的唯一viewer、movement/Presence、room registry和已受理动作。A须消费deepRooms、oreActions、waterSettle和原story/lift；B/A实际新井开孔、旧站退役须总控明文授权。首战/旧镐/星尘正典冲突仍需裁定。正式联机、真实手机、全图性能及上线均未验；本线不能发全线收工候选。未新建工作树/未启动独立子智能体。
