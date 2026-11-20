# ZA-29 双岗场景交接

底本 `88e536e8`，候选 `81c89fc0` + `eab4c3ab`。只含 `town-za29-guard-scenes.ts` 和定向测试。

| 岗位 | 在岗站位 | 近前触达锚 |
| --- | --- | --- |
| 山口赵满仓 | E302.35 / N665.10 / Y347.000 | E300 / N664.95。进门前从 N663.25 横路 E312 至 E302 均可直见，炉箱 E303.20/N664.85。 |
| 坑口石九斤 | E−68.4 / N161.1 / Y10.777 | E−68.4 / N159。脚印按坑口真实地表转入 B-01 螺旋。 |

两处各 13 枚魂脚印，配常驻岗物与空岗踏痕。山域挂 `cloudRoute.scene`（`cloudRoute.assembly()` 存在时），使用 `cloudRoute.surfaceAt(e,n,0)`；西域挂 `ensureWestCraterRoad()` 所得的 `road.group`，用 `road.heightAt`。挂载函数 `mountZa29GuardPost(owner, kind, surfaceAt)` 返回 `anchors.guard/approach/emptyPost/footprints`、`setDuty({guardPresent,showNightSigns})` 和回收接口。班次由 ZB-28 消费 ZB-17 作息事实；触发、对白、反馈与门禁迁移归 ZB-28。

真实地表扫步与五个门前眼位命中已过，原路线双向走位净空保留。两处仍待进入联调预览验证。验收覆盖白天守卫反馈、无守卫时自然通行和空岗/魂脚印显形。
