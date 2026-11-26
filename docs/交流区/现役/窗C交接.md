# 3.0-R 窗C现役交接卡
2026-11-26，owner GPT-C / lane-c，正式工作树 D:\computer learning\game_exe\kuanian\.worktrees\window-c，DevSpace ws_c5db0ef9a4。基线 integration f8380557，C当前实际候选 ae0ac6a8、a796f96c、64be686e、9b58826b、4a1f7a41、b098ff81、dd121cc5、1394be4f、c139c54a、41a1d26d、54331f32 均已推远端。未入干，未上线。仅本卡随本线推进更新；公共任务看板由总控登记。迁移后空 node_modules 已用本窗 .npm-cache 离线按锁恢复148依赖，未新建工作树；证据仅落本窗 .evidence/c-r30-camp/，不推缓存或证据堆。

## C-R01 井口契约 · 第一独立包待审
- ae0ac6a8：town-c-r30-shaft-contract.ts、underground-domain-host.ts、对应测试。现役 host.shaftContract 输出已登记入口/返程/保护区、深层接口；不替代进入或故事授权。定向12/12、check通过。现役宿主/旧坑基线实测，B新坑尚未核；变换不符时深接缝 blocked，不创建第二域变换。
- B接口：井口 E−120/N185/H−24.2227（现役 rim H10.7773 −35），井口圆保护半径2.58333；绞盘操作脚 E−121.087857/N181.739066/H−24.2227，保护半径0.97；绞盘基座 E−120.746773/N180.605020 r1.2；起重机 E−119.801065/N179.608558 r1.2；蛇石预留 E−122.644613/N180.348308 r1.32；灯房中心 E−131.846535/N192.723964 r3.7。后五点基线同高。矿运线末段 E−137.624176/N194.454545→E−126.571987/N187.090214→绞盘脚，保护半宽1.25。使用 surface.protectedAt(e,n,margin) 及 surface.protection；这些保留净空是本窗施工建议，B对新地形确认支持和通行，不改已认证锚点。井口/蛇石/设备功能不删。
- A/总控接线：firstMine.entry=E−119/N189/H−90、returnToSurface=井口脚，深度线−73，首层房E[−180,30] N[70,280] H[−128,−64]。原 well bridge、entry、lift、handoff 仍是既有受理路径；公共 viewer/presence 不抢写。
- C2接口：复用4b6b866b二矿定义，host.shaftContract.deep.kind===registered 时读取 frame/room/connections/feet；二矿 origin E5.528569570846/N149.482467680295/H−140 yaw4.504772120661；首矿深巷出口E7.485619423136/N149.070210629836/H−91，二矿入口同E/N/H−140；近/远岸E128.822710/N123.510274、E150.350259/N118.975446；出口E197.319455/N109.081277/H−140。房E[−20,220] N[30,220] H[−155,−129]，城侧未注册，不假造接收脚。供C2独立施工，本窗不改深层景物。B↔C独立审核、C2另验消费。

## C-R03 一矿营地样板 · 第一独立美术包待审
- a796f96c：town-c-r30-camp-art.ts、underground-camp-remains.ts、domain-host/scene、独立浏览器预览及测试。原493家具、六间宿舍、食堂、献灯龛、旧镐/火点数据保留；新增3道岩木承重拱（118件）、20件实体火池构件，火焰/暖池为静态美术零新增PointLight、非治疗权威。局部岩面纹理替代营地纯色面，源三角不变；其余矿道材质保持。宿主真实通行查询接营地实体碰撞，火池不能穿，原恢复脚点可站。
- 验证：根check过；营地/宿主定向29/29+新增实物1/1；实际宿主Chrome D3D11六机位（入口/火池/宿舍/食堂/纪念龛/出口）0 page errors，可信W通过2.7m，入口采样35 draws/70330 tris；手动抽看入口/火池图，当前岩面已非纯色平板，仍需配对美术审；预览相机照明不代表live光照，也不是正式设备FPS。复验 node tools/verify-town-c-r30-camp.mjs，图证 .evidence/c-r30-camp/。
- R4/R5样板先过配对B/C2视觉核收再扩展，不报全一矿完成。

## C-R02 入梦及升降笼 · 两独立候选待审（续建）
- 64be686e：真实现役 dream-chain 修复首次坠落错 trip/重复请求/25秒前落地、重复乘笼到站早于黑场取回执、同trip多个等待者及回执重试、远离绞盘仍攒进度。空笼仍调用原 lift；没有新增权威。根check及29项专项通过。当前 client chain 仍为会话内合成，不宣称多人持久化；A/总控使用现有地下 entry-store、trip-id-store、well-bridge、mine-lift/handoff 作唯一服务端接线。
- 9b58826b：实际宿主新增井壁、木铁笼、暖灯、半沉破笼残骸与本地碰撞；只在行程可见时启用笼内真光，不新增常驻光。根check、29项宿主/行程/实物专项过（随后最终形态定向1/1）；Chrome D3D11 上中深井/残骸4机位、0错误，实景抽看后补半沉断框，复验通过；.evidence/c-r30-lift/，node tools/verify-town-c-r30-camp.mjs lift。A的viewer单写接线：每帧读取 dreamChain.presentationTrip()；有trip且未黑场/未切域，调用 undergroundDomain.mounted.shaftRide?.sample(trip,now)，把返回 eye ENY 用同一正式camera呈现（不写玩家脚点/Presence）；无trip时 hide()。保留原黑场、实际受理落地、起身、控制锁。当前原viewer仍只晃地表相机，不能报已播真实下降；回程另侧空笼召唤站尚待实际接收锚/实体；原笼往返语义不改。B配对审，A公共相机接线。

## C-R04 深层世界帧与实体衔接 · 4a1f7a41 待审
C2等帧已优先交付。C方正式放置坐标契约 town-c-r30-deep-layer-contract.ts / 宿主 deepLayerContract，仅在已登记−140匹配时给出；frame c-certified 只签发放置坐标，不等同生产宿主已注册。原二矿不变；勇士城与原地宫壳本地入口实测可站。地宫原壳 archive/2026-11-25/baseline-d 的 blob 9ab161e8691ea32662f389527ebb57f1d3fe0947，仅测试用仓内快照复核，正式原壳须总控取回/C2接入，不生产引用fixture。
|层|世界原点 ENH|yaw|局部入口 ENH|世界入口 ENH|
|---|---|---|---|---|
|-140|(5.528570,149.482468,-140)|4.504772121|(0,2,0)|(7.485619,149.070211,-140)|
|-165|(327.463270,81.666183,-165)|6.075568447|(1,0,0)|(328.441795,81.460054,-165)|
|-190|(619.552961,20.136818,-187.6)|4.504772121|(0,.5,0)|(620.042223,20.033754,-187.6)|
二矿出口(197.319455,109.081277,-140)，城出口(502.619232,44.769177,-165)，地宫门前(722.983045,-1.650967,-190)，可站守位前脚(742.259986,-5.711699,-190)不是离域/开门。局部(0,105.7,-2.4)是门前过渡，不能当初始入口；(0,125.8,-2.4)实际被封库挡住，改可站125.4且止于锁闭。入口台阶从−187.6下降至−190。
- **C2接口纠正请求**：已读 C2远端805f01e2；其 town-c2-r30-layer-seams.ts 的 resolveSeam 目前 north = offset - (x*sin - z*cos)，在yaw=0把北反向。必须改用 C方 r30LayerWorld，或 north=offset + east*sin(yaw) + north*cos(yaw)；Three输入z=-localNorth时，north=offset+x*sin-z*cos。入口/出口必须使用各自local.height，不能给地宫入口统一加−2.4。复核实际group.localToWorld，不要把C2的错误旧测试作为正典。frames/feet从C方只读消费，不再手填；C2继续挂真实各层模型。C2新装饰候选尚未入干，故本包接收脚核的是已有局部城与D原壳，不能假定C2最新版所有碰撞已核。
- 两条实体围合斜廊 town-c-r30-depth-corridor.ts：134m/120m，落差25m/22.6m，坡度19.23%/19.48%，宽3.4m，名义顶3.5m、梁下净空3.24m；两端2m水平落脚，连续岩地/侧壁/顶/稀疏木铁支架。地面网格和 r30LinkPassage 共同取样，逐0.4m射线核对，6项专项+check通过；必须由真实端点 supports 接受后 mountR30DepthCorridor，不写移动/授权，尚未在生产默认路径挂载。房间建议城 origin(318,11,-178) 195×104×22；地宫 origin(613,-30,-202) 137×74×23，层间缓坡覆盖另需A/总控登记既有域切换及安全重连，不自行启动房间。
- B已读最新交接：其井口保护r3.8/绞盘r1.4较C最低保护更宽，中心/高程一致；尚需共同实际支持、返程实走；未完成B四包独立配对审，不能签收。B↔C配对、C2消费核验、总控串行入干；无新主干提交，未自合。

## C-R04 续建 · 二矿宿主、49米实体换层站、上层实孔（三独立候选）
- b098ff81：现役 underground-domain-host.ts 调用 town-c-r30-deep-host.ts；复用 mountRegisteredSecondMineDomain 和同一个 accepted water reader。在实际宿主 mounted.sync() 收到有效水位后惰性建场景；只有 readAcceptedDomainFoot() 报告已接受的二矿域且脚点在其房界时启用可见性/通行；支持 supportsArrival 做物理落点预检而非切域。水位丢失则隐藏及拒绝新通行，重连复用场景；12/12专项和check通过。A须传真实已接受域脚而不是相机/高度猜测。默认viewer没有传此项，不宣称正式跨层已通。
- dd121cc5：town-c-r30-interlayer-lift.ts，一矿深巷与二矿入口垂直对齐49m；上下铁架站、围栏、木铁横梁、滑轮组、井筒、铁轨及移动笼体实际挂入现役mine root。上层局部中心(-13,-91,134)，下层局部ENH(0,2,0)；上下各2.3m连续可走接近段，铁栏/立柱参与原宿主碰撞；接受行程才显示井筒和笼体。三机位D3D11、0页面错误，精修后458件；独立预览通过，非联机原生跨层。复验 node tools/verify-town-c-r30-camp.mjs deep，证据.evidence/c-r30-interlayer/。本包13项定向过。
- 1394be4f：上层真地板开孔 town-c-r30-upper-aperture.ts，从既有三角源精确裁掉 2.2×2.2=4.84m²，保持其他楼板、墙和屋顶。安装动态岩网格只由已登记 seam 和真实下层开孔认证触发；静止或权限缺失实物金属板封闭；已接受行程中板面隐藏、护栏出现且步行查询拒绝进入敞开的孔。真实raycast验证开孔，19项相关回归、check通过。上层孔 local X[-14.1,-11.9] Z[132.9,135.1] H=-91；下层屋顶对应 local E[-1.1,1.1] N[.9,3.1] ceiling=5，C2负责切其真实房顶，使用 splitR30LiftAperture 分为四条剩余矩形，不能只隐藏整屋顶。C2需要从C方 r30InterlayerLiftSite 与前包 r30DeepFrames 只读消费。双方开孔均验前保持安全封闭。
- A/总控：host 的 interlayerRide 端口 {read(),now(),lowerOpeningCertified()} 消费既有唯一运输/行程权威；R30InterlayerRide 带 linkId=mine1-mine2-lift、id/riderId/fromDomain/toDomain/departedAt/travelMs；现有行程20–30秒，sampleR30InterlayerRide 给镜头位，不改变玩家脚点，实际落地由已接受 handoff 决定。不能用客户端 E 直接构造受理回执。上层自动实际切孔通过才允许展示行程。生产深层 room、跨域切换、运输权限、多人状态及持久化仍未接线；C2下层开孔未实现/验证，严禁开井假通。
- C2远端9374d37d交接仍记“未收到帧”，请总控安排直接读取lane-c的4a1f7a41（上一节）及本组三包。不可把旧交接当本窗未交，也不可把本窗候选视为已入干。C2原R09隐藏碰撞返工不重复做。

## B 独立窄范围审回（e2bf9a31）
已读实际远端差分和B现役卡，diff --check 通过；审查 B 的 relief、meteor-crater(-surface)、中央丘保护、三作业实物 survey、physical-kit 和六灯坐标。井口仍以R55/30封盖及−35底面，旧授权不删；六灯位置含已移位haulage-turn(15,-6)，同一碰撞渠道、安装回滚及拆除原则一致。用B源码已声明的平底20m圆、中央丘21m外界、workFace半径8及保护圆，0.05m平面覆盖采样C保护区：井口8379/8379、绞盘1791/1791、起重机1791/1791、操作脚1174/1174、蛇石2184/2184均覆盖；灯房C r3.7 中1688/17191点未被B r3.3或其他平底圆覆盖（例E−128.146535/N192.723964）。这不等同实测高度异常；B需扩大灯房平底保护至至少3.7m或用实际最终三角+脚底查询证明余边高度/净空合格。半宽1.25m归程走廊采样21100点，51点未在平底圆，第一点约E−138.3173/N193.4143、在进坑坡接头附近，需联合A/B/C检查实际坡度而非假定必平。不得用中心高程代替整个保护区。B尚待联合真实宿主/原生返程/全独立审查，以上为限范围审回，不签全包通过；未切B工作树、未复跑B新网格。总控按窄包串行挑取，本窗无权限推主干。

## 2026-11-26 续建 · C-R03 一矿姿态、晶洞接入及美术
- c139c54a：宿主 passageAt/floorAt(e,n,posture) 支持1.8m standing /1.1m crouching，原坍塌净高1.3m不改；resolveMineStep 按≤.08m连续步进与≤.22m阶差核实际碰撞、canStandUp 检查起身，给定眼高1.0/1.67。9/9定向及check过。现役公共viewer仍未消费姿态输入，A需接已有移动与镜头，不可直接在矮洞中站立。
- 41a1d26d：实际晶洞 host + 连续石路实体，原9046件全保留。局部N[-10.5,98.9]连续109.4m北向范围、主路宽4→6.4m，接原观景台与码头；按实际 tall/solid 模型 AABB 扣占位，非正式地面外不开放。真实矿道末端 Z140 处裁开14㎡闭岩墙，仅在晶洞房间及场景认证之后执行；现役铁闸闭/半开拒绝，开门消费现有 createUndergroundMineGate；与上层井孔裁剪可叠加，不覆写前一次网格。实际 return switch 在洞口，物理脚点与原门禁可双向移交。测试使用实际 gate（清敌输入为fixture），不是线上受理。12/12晶洞/井孔定向通过，逐.2m实际支撑与射线吻合。浏览器同源5机位及可信W驱动2.7m、0错，实际复看图后启用R30暗岩层理/晶体细纹/水面去棋盘纹理并复验。证据.evidence/c-r30-crystal-host/；node tools/verify-town-c-r30-camp.mjs crystal。独立相机照明与测试门禁，不是Live。洞室主路之外的地形探索和怪物/矿点授权仍待，不把整180×120m报可行走。
- A/总控：现役宿主 crystalBridge={acceptsFrame(frame,room),readGateStage(),readLightBudget()} 与 readAcceptedDomainFoot，使用 host.crystalHost.contract 直接接已有 createUndergroundMineGate 的 winch/crystalSwitch/passage。域 underground/crystal，frame E26.310952 N158.389914 H−90.936 yaw4.504772120661；建议独立房 origin(E−9,N35,H−95.936) width169/depth226/height40。矿侧门槛 E15.547177 N160.657328 H−91，洞侧 E16.623555 N160.430586 H−91；同高相距1.1m，连续石面连接；回程开关 E18.379571 N158.578855 H−91。已有门禁不放宽清敌、可达、真实落点条件。房/门认证缺失时默认闭合，不通过高度猜域。禁止将客户端fixture的 acceptsFrame:true 或已清敌输入用作生产授权。

## 2026-11-26 续建 · C-R04 深层总装和统一移动口
- 54331f32：town-c-r30-deep-assembly.ts / host.deepAssembly。真实接收场景由C2提供本地Group、passageLocal（必须实测支撑高度及净空而不只是canStand任意高度）、acceptsMouth及dispose；由C现役host唯一施加前批r30DeepFrames，非局部单位根直接拒绝。A/总控 acceptsLayer/acceptsLink 确认独立房、C2 acceptsSecondMineMouth 与各scene.acceptsMouth 确认真实墙口，双侧脚点和房间均验才挂254m实体斜廊。撤销认证或水位丢失时相应通路fail-closed。不生产引用旧palace fixture，不重复建城。
- C2四个墙口必须实物开通：二矿 N198/E0，城 E0/N0；城 E180/N0，地宫 N0/E0；四口净宽3.4/净高3.24m（以各自局部实际地面为底），只切门洞，不整面删墙。与上一批井筒顶孔是独立接口。r30DeepMouths/r30DeepTransitContracts 提供完整数据。域 underground/warrior-city、underground/palace；两条斜廊独立域 underground/link/minus140-to-minus165 和 underground/link/minus165-to-minus190；建议房 origin(195,78,-167) 135×34×31 与 origin(501,17,-190) 121×31×29。前批−165/−190房继续复用。所有域仍待A/总控正式Presence配置。
- A唯一移动口：domainPassageAt(domain,e,n,posture)、resolveUndergroundStep(fromAcceptedFoot,to,posture)、canStandUpInDomain。根据已受理域而不是高度选地形；拒绝不符accepted foot的请求、>3m单步；连续.08m碰撞扫掠。deepAssembly.resolveHandoff 只识别已有实际接受脚与同坐标的双向域边界，返回待受理proposal，不写玩家位置。C2真实开口未确认时不开廊。实际测试注入既有城体及D旧壳审图快照（仅测试），显式fixture房/墙口接受，检查真实两个场景世界变换、254m实体廊逐.25m支撑、内部射线吻合、域切换前拒绝新域通行、撤销接受及水位缺失；端点射线在浮点精确边界可能丢失，内点用射线，端点用双侧实体支撑验。未将fixture认证冒充真实C2已开口。根check、10/10本组跨包回归及build通过；构建既有大chunk警告，P-OPT仍后置。C2尚未交生产原壳/实际开口；本窗仅提供宿主，未宣布完整多人贯穿。
- 截止本轮主干仍f8380557、C2 9374d37d、B e2bf9a31。C2交接仍称未收到世界帧，本窗前批4a1f7a41和本次54331f32已在lane-c，需总控直接登记依赖、C2读取后返接；未篡改其他卡。B灯房审回仍待回执。候选全部自审/定向通过，配对与总控串行入干尚未发生，不能合并旧历史父链。未新建工作树。

## 下一件
优先 C-R03 主矿道、旧支护与探索空间的实际精修（先复看营地样板的配对审；不改矿点或遭遇权威）；同时待C2真实二矿顶孔、四墙口/地宫原壳及B返修候选到达即消费，真实跨层和返程由A/总控按统一接口连通并联调。不开封库/核心。此轮新增3个独立源码提交，未满足本线收工门槛。最新现役看板/项目脑无新增裁定，实际多路只读检查，未运行独立子智能体。
