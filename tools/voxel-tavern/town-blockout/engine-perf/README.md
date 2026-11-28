# 独立性能引擎 v0.1｜Friend1 / lane-friend
## 定位与禁止事项
同一游戏内可移植的客户端性能子系统，不是另一套地图或玩法引擎。纯核心只读描述符/typed arrays，通过adapter消费Three场景；模型、支撑、碰撞、联机由原owner保持权威。新增任何模型可注册owner/id/revision/bounds/staticGeometry/coverageRequired，无需重写核心、无需在核心列出镇名、山名或资产名。旧模型未适配时保留原渲染路径。性能引擎不会使任意复杂模型自动零成本：动态、透明、交互、骨骼等不安全合批须原样回退。现阶段不接生产viewer。
## 已建模块与扩展任务
|路径|当前实现|Friend1后续|
|---|---|---|
|index.ts|单一公开入口|版本化API，不暴露内部可变对象|
|residency.ts/core/planner.ts|距离/滞回/必保覆盖规划|移动预测、多玩家本地视角、动态预算|
|core/contracts.ts/core/registry.ts/core/engine.ts|通用描述符、端口、登记、逐帧驻留规划|增量索引/变更订阅、快照、真正流送执行器|
|cache/resource-cache.ts|字节预算、LRU、引用租约、释放|CPU/GPU分池、共享材质纹理引用、GPU上下文丢失、内存高水位|
|streaming/build-coordinator.ts|异步任务去重、取消、过期结果释放|真正Worker池、优先级更新、限并发、重试、传输所有权|
|streaming/budget-queue.ts|分片优先队列、字节/预计时间预算、实测超预算|上传切片、饥饿防护、适应帧时、任务失败恢复|
|rendering/visibility.ts|保守可见性决定|固定chunk bounds、视锥/保守遮挡，proof key含scene revision+camera epoch，转向后过期证据失效|
|rendering/batching.ts|安全合批初筛|分块几何合并、实例化、透明/交互/阴影等回退、HLOD及接缝|
|simulation/visual-scheduler.ts|纯视觉任务分频，不追赶爆发|远处粒子/动画/音效预算；权威仿真不接此调度|
|metrics/frame-profiler.ts|完整帧分位数和长帧|CPU各阶段、真实异步GPU计时、上传、缓存命中、内存、冷/热启动|
|adapters/|通用Three世界包围盒登记样例|Three GPU端口/Worker/宿主桥|
## 冻结接口与数据流
登记→按位置规划→查CPU/GPU缓存→异步构建→预算上传→替换时保留原网格→只改变可见集合→按引用释放。渲染key=(owner,id,revision,tier)，yaw绝不参与驻留/网格生成key；遮挡proof例外，需包含相机版本。BuildCoordinator共享一个Promise，调用方只能由单一协调者接收结果并转移所有权，不能多个消费者各自dispose；取消旧revision，过期/错误不替换当前可用资源。缓存put成功后获得资源所有权；失败由调用者释放；显示期间持lease，hide后释放。帧队列仅对可切割同步工作给软时限，记录不可抢占超预算；bytes是预估提交字节而非实际GPU带宽。coverageRequired仍需原始可见兜底，规划器不能凭空生成地形；任何没有ready资源的情况回退旧宿主。模型若改变revision，先准备新资源，再原子交换显示；卸载永远不影响地形support/blocked。
### 适配器示例
新资产由宿主注册如 owner=expansion, id=bridge-01, revision=git-or-content-rev, bounds=实际世界米制包围盒, staticGeometry=true, coverageRequired=false。核心无需知道bridge类型。Three adapter检查world matrix（缩放/旋转/平移）、材质状态及交互标签，拆空间块，能安全优化才使用新路径；旧资产也可逐批迁移。实际几何、LOD简化、Worker和GPU端口须Friend1实现，不把当前纯逻辑称作已运行引擎。
## 实施顺序与收工门
F0 契约冻结和CI（总控已初始化）；F1 生产浏览器真实测绘与归因；F2 Worker/缓存/预算及新增未知资产fixture；F3 Three adapter/静态合批、HLOD、遮挡；F4 视觉分频/物理查询建议（不改权威）；F5 接线候选、长帧专项、冷热/手机/全图复测。每一阶段交可运行实际模块及新增断言，不准以TODO、空函数、单元测试绿冒称生产完成。A/D2/总控单写公共宿主；F提交精确接线补丁，不直接修改其文件。
## 自动化检查
从仓库根执行：
- node tools/check-engine-perf-boundary.mjs
- node node_modules/typescript/bin/tsc -p tools/voxel-tavern/engine-perf-tsconfig.json --noEmit
- node --import tsx --test tests/town-engine-perf-*.test.ts
GitHub Actions verify-engine-perf.yml 只负责架构/功能确定性检查；共享CI runner不能证明玩家电脑FPS。核心禁止外部/adapter依赖，adapter允许three及内部接口；跨宿主访问只能由总控桥传入。静态检查不是恶意代码沙箱。
发布证据门：node --import tsx tools/check-engine-perf-release.mjs <evidence.json>。缺真实原始报告直接失败；JSON格式见下。发布门只检查声明和阈值，不能替代总控实机/视觉/碰撞及SHA审核。每个PC/真实手机、8个场景至少3个配对，>=120连续帧/arm，固定条件、交错顺序、完整长帧；不删除异常数据。60/30FPS目标约16.7/33.3ms，脚本按17/34ms容差检测，并列目标达成；转向未达到目标时至少P95下降30%才通过暂定候选门，不能标作绝对达标。实际全局发布门仍由总控决定，不自动部署。
证据schema（字段说明，非实际数据）：scope=production-browser; baselineSha/candidateSha完整40位; checks={sameContent,sameQuality,coverage,collision,interaction,multiplayer,rollback}全为true且可核；runs=[{runId,deviceClass:'pc'|'mobile-real',case:'plaza-turn'|'crater-turn'|'front-turn'|'rear-turn'|'walk-stream'|'sled'|'cable'|'cold-entry',sameConditions,hardware,viewport,dpr,quality,rawEvidence,errorCount,baseline:FrameCounters[],candidate:FrameCounters[]}]; gpuMs不支持时null。原始证据留.evidence/或审核附件，不提交巨量缓存/私密数据。CI不自动运行伪造证据，不得为了通过阈值隐藏模型、改画质、缩短路线。
## 研究依据
Sodium: https://github.com/CaffeineMC/sodium/blob/dev/common/src/main/java/net/caffeinemc/mods/sodium/client/render/chunk/RenderSectionManager.java 及 ChunkBuilder、OcclusionCuller，参考队列/区块构建与异步遮挡，不复制上游代码。现有专项P32-1..5为唯一任务源；另见现役架构验收细则。
