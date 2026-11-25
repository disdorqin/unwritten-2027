# 窗 D · P-3/R2 生产接缝实走

## 当前门槛

`lane-d@19d28c8` 仍登记「生产 R2 下段待正式宿主和合流线补证」。`90019a5` 的浏览器附件属于独立雪带预览，下段明确未接 R2。独立雪带证据仍可随上段留档。

按 `85471a3`，同一生产制品做两次原生输入。先从上段连续滑过真实合流门、进入 R2 并滑到底，再从下段靠同一门验证拒绝。保留逐物理步 ENY、速度及碰撞，连续画面覆盖两次操作。模型接缝高差只附报。正式宿主与真实线位确定前，模板保留空项。

## 取件与操作

1. 从正式可部署组合固定 viewer 构建 SHA、D 线位 SHA、上段与 R2 路线标识、合流门和其有效碰撞标识、R2 运行终点标识。把实际值填进 `p3-r2-expected.template.json` 的副本 `expected.json`。如已有同制品接缝高差，填写 `seamOffsets`，每项用 `{ "label": "测点说明", "offsetMetres": 实测数值 }`。不以高差数值判定通过。
2. 在可显示浏览器窗口的已组装制品上启用以下只读取证挂点。从安装了窗 D 现有锁定依赖和 Chromium 的项目根运行 recorder。按终端提示开始、结束每次录像区间。在浏览器里使用平时的键盘或触屏上橇与行进，可走实际回程或用正式场景已有的玩法抵达反向起点。两次操作保持同一页面，同一构建及同一 gate。每次采样从门前实际靠近前开始；下滑过线后继续到运行终点，反向被拒后至少保留一拍仍在进门一侧的实况。
3. 回传原始 `p3-r2-capture.json`、同目录连续 WebM、`expected.json`、构建出处与采样挂点 diff。成功时工具也保存 `p3-r2-result.json`。失败时保留原始 JSON 和已录视频以便复核，修复后使用新的输出目录。证据回分区二，正式路由回填同步分区一。

```sh
node /path/to/p3-r2-proof.mjs record \
  http://127.0.0.1:5813/tools/voxel-tavern/town-blockout.html \
  /path/to/new-evidence-dir /path/to/expected.json

node /path/to/p3-r2-proof.mjs verify \
  /path/to/new-evidence-dir/p3-r2-capture.json /path/to/expected.json
```

## 生产组合的只读采样接口

取证 URL 参数为 `p3-r2-proof=1`。仅在该参数下，将**实际装载的生产宿主、线位、门、有效碰撞及终点**汇入 manifest，一次性抛给浏览器收集器。探针可临时以只读取值方式挂在构建副本，提交审核时附挂点 diff。窗口录制参考 `f91b441:tools/verify-main-summit-snow-preview.mjs` 的 Playwright、Chromium、网络错误收集方式。录制依赖真实时钟及手工浏览器输入。

```ts
window.dispatchEvent(new CustomEvent('p3-r2-proof', {
  detail: { kind: 'manifest', data: mountedProductionFacts },
}));
window.dispatchEvent(new CustomEvent('p3-r2-proof', {
  detail: { kind: 'step', data: completedNativeStep },
}));
```

`mountedProductionFacts` 包含 `viewer: 'town-blockout'`、`mount: 'production'`，以及模板中除 `seamOffsets` 外的七个字段。依赖齐备后才发一次。保留构建和已挂载线路来源，不从模板回填实际值。

逐步事件来自发布 viewer 的固定步回调。以目前结构为参照，在 `viewer.ts` 的 `walkClock.advance` 内从现役 `sledRide.step` 调用前后取样，在实际 SledWorld 阻挡查询、合流判定和下游终点回调处汇总本步况。应当记录每个原生雪橇步，包括发生门阻挡的未移动步。反向若由碰撞门规则提前拒绝，记录真实尝试及其生效的碰撞门。两侧 ENY 使用已登记正式世界坐标，归一化口径全程一致。

| 步数据字段 | 取值来源 |
| --- | --- |
| `tick`、`simSeconds`、`dtSeconds` | 原生固定步序号、累计时钟和该步时长。浏览器收集器另记 `atMs`。 |
| `from`、`to` | 碰撞及合流逻辑前后的 `{ east, north, y }`，Y 为雪橇/角色物理位置。 |
| `fromRoute`、`toRoute` | 同次原生步的有效路线标识，上段、R2 对应 manifest 中两项。R2 的接收、下滑、终点都归属正式 R2。 |
| `speed`、`sweptMetres` | 步后原生速度（m/s）；碰撞/门判定前实际提交给物理的水平扫掠长度（m），包括插值分段时的本步扫掠总长。用真实计算的尝试移动，不用已走距离反推。 |
| `airborneBefore`、`airborne`、`discontinuity` | 步前腾空标记；步中任意起飞或步后为空中时记 `airborne=true`；瞬移、重置或跨坐标系跳跃记 `discontinuity=true`。 |
| `collisionChecks`、`contacts` | 本步真实碰撞查询次数；命中项 `{ id, blocking }`。正向检测应正常运行，反向拒绝须留下实际门碰撞标识。 |
| `gate` | 通常为 `null`。实际触发合流门时填 `{ id, direction, result }`。正向由生产门判定实际进入 R2，填 `downhill/accepted`；反向实际门拒绝，填 `reverse/rejected`。 |
| `bottom` | 通常为 `null`。真实 R2 终点触发时填该终点标识。 |

验证器检查步序、时间和物理连续性，拒绝空探针、孤立样场、漏步、提前停滑、腾空、意外阻挡或反向穿门。验收人员仍应对看片段和挂点，确认标记从同一制品的生产路径发出。正式宿主未挂前只有工具交接，P-3 上段与隔离样场的原有验收状态沿用既有裁定。

已验证脚本语法及五项拒绝检查。用窗 D 原始 Chromium 预览证据（附件 `14546343322` 的 `snow-preview-browser.json`）测试，验证器明确拒收。发布入口错、生产探针缺失、没有逐步轨迹及原生步格式不完整的检查也均拒绝。生产 R2 两次实走尚待正式挂载。
