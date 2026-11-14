# UNWRITTEN 2027：美术与资产制作

## 制作依据

参考红发魔女Amber的小红书笔记《2天手搓〈爱丽丝梦游仙境〉3D游戏(含教程》：
https://xhslink.cn/o/9EF2qFMCqwc
已读取原笔记正文及相关作者评论；未声称取得作者群内工程、完整视频逐帧教程或模型。
笔记采用Kimi统筹、Image 2制作二维设定、外部AI工具生成三维、Blender处理骨架、Godot组装。
本项目沿用其资产制作顺序，继续使用已经运行的Three.js多人基座。

## 统一设定

- 主题：朋友在雪夜小镇共同回望2026、迎接2027。主要感受是回忆、相聚、温暖。
- 视角：默认第一人称，以人眼高度检查近景；第三人称仅供玩家自愿使用。
- 建筑：中式乡村为主，少量童话木屋元素；木梁、灰瓦、小尺度院落、温暖窗光。
- 环境：雪山和森林围合；冰湖、湖岸木桥、灯塔；中央钟楼广场保持清楚的步行空间。
- 配色：雪白与夜蓝构成环境，深木色和灰瓦稳定建筑，红灯笼与暖金窗光集中于活动区域。
- 质感：精致、柔和、可近看。木纹、窗格、瓦檐、灯笼结构明确；不依靠大量装饰噪声。
- 人物：圆润卡通冬装访客，几种基本造型、帽子与围巾；复用已有骨架和基础动画。
- 音乐：舒缓的新年气氛纯音乐，固定曲目；首版不做点歌或麦克风。
- 世界规则：不可破坏地形，不放置方块；可在指定位置布置装饰，参与共同点亮。
- 首个样板：广场步行视角、钟楼、纪念馆入口、邮局一角、少量灯笼和积雪。

## 实际制作循环

1. 从本文件和docs/PLAN.md出发，先确定每件资产的用途、外观与可交互部分。
2. 生成广场氛围参考；独立资产另出白底图。角色采用统一比例T-pose前、左、后、右视图。
3. 先查可复用模型，缺少的主体才交外部AI三维工具；不要把整张广场插画一次转成单一模型。
4. Blender统一尺度、方向、材质和原点，清理多余网格；动件分离，角色沿用骨架或补绑骨。
5. 导出GLB，先检查全角度和近景，再接入Three.js；碰撞使用单独简化几何。
6. 同一场景中验证人眼高度、可走区域、门宽、模型遮挡和手机性能，再接玩法和联机事件。
7. 每次按具体位置、对象、期望修改。例如“纪念馆入口背光，看不清窗格；让门前暖光照亮立面”。
8. 固定一个小镇工程逐步迭代。概念图用于目标参照，不标成游戏实机截图。

## 第一批资产

| 资产 | 来源策略 | 必须拆开的部分 | 第一轮用途 |
| --- | --- | --- | --- |
| 广场钟楼 | 专属设计，优先AI三维/可复用模型改造 | 钟面/指针/钟体，便于跨年动作 | 主地标与钟声 |
| 纪念馆入口 | 统一建筑模块组成，正面精做 | 门、门框、立面、展板 | 月度长廊入口 |
| 新年邮局外观 | 和纪念馆共享木梁/瓦檐/窗格 | 门、邮筒、招牌区域 | 位置辨认与写信入口 |
| 红灯笼 | 可复用开放素材或Blender生成 | 灯体、流苏；发光材质独立 | 重复布置，实例化 |
| 路灯/长椅 | 可复用开放素材 | 灯光与灯具分离 | 走近观赏、后续坐下 |
| 冬装访客 | 改现有模型，沿用骨架 | 围巾、帽子可替换 | 保留基础动作与联机角色 |
| 木马 | 下一批，再选开放模型或AI主体 | 平台、中心轴、顶棚、马匹 | 一轮共同乘坐 |

## 单件资产图规范

道具：单个物体、白色背景、无地面投影、完整轮廓、不裁切；中性均匀照明，无文字水印。
建筑：白底独立资产，先出正面三分之四视角，再补正背左右；门洞能辨认，避免透视导致结构不一致。
角色：同一角色前/左/后/右四视图，严格同高、同衣饰、同中性T-pose；围巾避免遮住全部颈肩，四肢不相交。
四视图优先使用同一已确认形象编辑生成；不把四张不一致的人物直接混成一个模型。
灯光与积雪不能烘焙得过重；夜间气氛主要由游戏内灯光实现。

## 提示词：广场概念参考

Create a polished stylized 3D game environment concept for UNWRITTEN 2027, a warm Chinese-inspired winter village on New Year's Eve. Human eye-level first-person walking view across a small welcoming clocktower plaza; no visible hands or HUD. Chinese rural timber buildings, grey curved tiled roofs, refined wooden window lattices, a charming village clocktower, a public annual-memory museum entrance and a small post office framing the square. A few red lanterns and warm amber windows contrast with blue snow and a quiet night sky. Gentle snowfall, snow-covered pines and distant mountains, a glimpse of an icy lakeshore and timber bridge. Keep a clear walkable plaza suitable for friends meeting and taking a group photo. Soft rounded forms with fine architectural detail, handmade wood and plaster, appealing game-ready stylization, coherent scale, readable geometry, restrained lighting, human-scale immersion. A few small winter-clothed stylized visitors establish scale. Chinese village identity dominates; small fairy-tale timber accents are secondary. No voxel blocks, no cyberpunk, no neon, no giant palace, no isometric miniature, no typography, no logos, no watermark. This is visual concept art, not a claim of a rendered game build.

## 提示词：钟楼单件白底资产

A single refined stylized Chinese village clocktower for a warm winter social game, complete building fully visible on a pure white background, isolated with no ground shadow. Human-scale timber and pale plaster village architecture, grey gently curved tiled roof, subtle carved wooden brackets, one clearly readable round clockface, warm red trim used sparingly. Coherent rounded 3D game asset style, detailed enough to inspect at walking distance, buildable separate roof/walls/clockface, no attached landscape, no people, no decorative text, no watermark. Neutral even lighting; show a clean front three-quarter view, with the entrance unobstructed. Do not bake dramatic nighttime lighting into materials.

## 提示词：冬装角色四视图

Character turnaround sheet of the SAME friendly stylized winter village visitor, front / left profile / back / right profile, four orthographic views aligned at identical height and scale, strict neutral T-pose, full body visible, pure white background without cast shadows. Rounded appealing humanoid proportions, simple expressive face, padded winter coat, knitted scarf, warm boots and a removable knitted cap. Soft warm fabric colors with one muted red accent, consistent outfit and anatomy in every view. Arms level, legs straight and separated, fingers simplified for an efficient game rig. No landscape, no props in hands, no panels crossing the figure, no perspective distortion, no text or watermark.

## 当前三维生产接入状态

二维图像可在当前窗口生成；Blender后台脚本可运行。外部图生三维服务尚未连接。
插件目录检索到支持3D资产的fal，尚未安装/连接；没有据此声称已开通、已生成模型或已获得免费额度。
需要外部服务时先明确连接及费用，再提交生成；现有模型复用、设定和概念图可独立继续。
