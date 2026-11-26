# F2 独立资产库（assets-source/friend2/）

本目录记录 F2 三条独立施工线的原创资产来源、许可与复用边界。

## FR-04 雪夜摄影小工具

- 交付：`tools/voxel-tavern/town-blockout/town-friend2-photo.ts`、`friend2-photo-render.ts`、`friend2-photo-preview.ts/.html`、`friend2-vite.fr04-preview.config.ts`。
- 资产：暖木框、雪夜框、灯火框三种边框，以及样例雪镇构图，全部为 Canvas 程序化绘制；无第三方图片、字体或水印素材。
- 许可：仓库 MIT（Original-Procedural-Canvas）。
- 边界：用户本地选图或注入 Canvas，日期/昵称水印可关闭，点击保存才生成 PNG；不自动上传、不读私密信息、不改全局相机、不接星石/存档/多人权威。

## FR-06 小镇导览手册

- 交付：`tools/voxel-tavern/town-blockout/town-friend2-guide.ts`、`friend2-guide-preview.ts/.html`、`friend2-vite.fr06-preview.config.ts`。
- 数据：17 条已稳定老镇地点、生活服务与基础操作说明；云海台/绝顶小屋明确标注“规划”，不作为当前可达。
- 许可：仓库 MIT（Original-Text/UI）。
- 边界：静态图文组件，数据与界面分离；不制作正式导航、剧情门、世界状态或存档；触控与键盘可搜索/分类/查看/返回。

## FR-09 可读性 UI 样板

- 交付与许可：待本包施工登记。