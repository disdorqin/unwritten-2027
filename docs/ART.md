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

## 本轮概念与建模参考图（18张）

使用内置图像生成完成。全局图以此前广场图和钟楼图为风格参照；独立建筑共用全局图与广场图，重点室内再引用相应建筑外观。图像在本对话中逐张交付，属于概念/建模参考，不标作游戏实机或已生成模型。

| 编号 | 图像 | 用途 |
| --- | --- | --- |
| 01 | 全镇鸟瞰 | 全镇空间和风格概念 |
| 02 | 2026纪念馆外观 | 白底独立建模参考 |
| 03 | 新年邮局外观 | 白底独立建模参考 |
| 04 | 酒馆外观 | 白底独立建模参考 |
| 05 | 纪念馆内部—月度长廊 | 室内动线、家具与互动位置参考 |
| 06 | 邮局内部—写信与投递 | 室内动线、家具与互动位置参考 |
| 07 | 广场露天舞台 | 白底独立建模参考 |
| 08 | 旋转木马 | 白底独立建模参考 |
| 09 | 冬日集市 | 白底独立建模参考 |
| 10 | 雪镇住店 | 白底独立建模参考 |
| 11 | 酒馆内部—聊天与小舞台 | 室内动线、家具与互动位置参考 |
| 12 | 住店内部—雪景客房 | 室内动线、家具与互动位置参考 |
| 13 | 湖岸灯塔外观 | 白底独立建模参考 |
| 14 | 普通民居外观 | 白底独立建模参考 |
| 15 | 钟楼内部—机械与登楼 | 室内动线、家具与互动位置参考 |
| 16 | 灯塔内部—观景灯室 | 室内动线、家具与互动位置参考 |
| 17 | 新年愿望树 | 白底独立建模参考 |
| 18 | 湖岸木桥 | 白底独立建模参考 |

此前两张为广场人眼视角与钟楼独立外观；加本轮共20张参考。首轮先锁定美术语言和主体轮廓；背面/侧面、精确尺度、碰撞与动件分离在相应资产建模前处理，不把单张透视图当作完整施工图。

### 本轮提示词集

01 全镇鸟瞰：保持已有广场和钟楼风格；从附近山坡俯看整个紧凑的人尺度村镇，中央钟楼广场、馆与邮局临广场、左上住宅住店、右侧集市酒馆舞台、下方木马游乐、后方湖岸木桥与灯塔，雪山和森林围合。暖金窗光和克制红灯笼对比夜蓝积雪；道路清楚，不画成浮空微缩岛，不添加标签或UI。这是艺术布局概念，不是精确工程地图。

#### 02 2026纪念馆外观

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: the PUBLIC ANNUAL MEMORY MUSEUM from the square: a modest but important single-storey Chinese timber exhibition hall with a broad welcoming front portico, three structural bays, a central double doorway and two lateral lattice-window bays. A longer rear volume can contain a linear monthly exhibition route. Low stone steps and an accessible side path, coherent refined roof brackets, warm wood, symmetrical readable facade. Show front and one side clearly. Leave the entrance signboard blank; no museum objects or interior scenes outside. Generous clear entry for visitors. Detailed near-view game asset.

#### 03 新年邮局外观

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: the SMALL NEW YEAR POST OFFICE from the plaza: a cozy single-storey timber and cream plaster shop, one main rectangular room, gently pitched grey tiled roof, central entry and a wide street-facing wood-framed service window. Muted red door trim and a small blank wooden hanging sign establish the postal identity. Include one red cylindrical postal pillar-box near the entry as a separate clearly distinguishable prop with a small gap from the building; no other scenery. Door and window have actual thickness. Preserve modest village scale and refined craftsmanship.

#### 04 酒馆外观

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: the VILLAGE TAVERN at the winter market: a warm two-storey Chinese timber inn-like tavern with a clear wide double entrance, broad inviting lattice windows, small covered front veranda, upper floor balcony, and one squat stone chimney. Spacious lower room for gathering and a small interior performance corner. Blank hanging wooden tavern sign. Visually distinct from museum and post office through two-storey massing, carved balcony and chimney, while retaining same roof and material family. No beer brand, no barrels strewn outside, no landscape.

#### 05 纪念馆内部—月度长廊

Create ONE human-eye-height INTERIOR environment concept for the annual-memory museum in the reference, same soft detailed Chinese timber/plaster game-art style. View from entrance down a generous continuous exhibition hall with a gently turning linear time-gallery route, repeated wooden beam bays corresponding to twelve months. Warm wood framing, cream plaster walls, wood/stone floor, soft lantern-like ceiling lights and daylight-blue snow seen outside lattice windows. Along the sides: a coherent modular family of blank image-and-text display frames, low glass artifact cases, and a few recessed small immersive scene alcoves. Keep the central path open, visitors can approach every display; a subtle continuous bronze floor inlay guides the timeline. Modest welcoming village museum rather than a palace. Comfortable reading illumination, refined close-up joinery and materials, clear real room dimensions. No actual news claims, no recognizable real people, no personal memorabilia, no invented event text, no lettering or UI. Architectural visualization for building the interior, not a photoreal museum photograph. No collage or section diagrams.

#### 06 邮局内部—写信与投递

Create ONE wide human-eye-height INTERIOR concept inside the small post office from the reference, maintaining its modest rectangular footprint, exposed warm wooden beams, pale plaster and latticed windows. A welcoming postal counter against one side, a wooden pigeonhole shelf of letters behind it, THREE clearly separated simple recipient slots on a small freestanding mail cabinet, and two writing desks with chairs, paper, envelopes and modest lamps. The three recipient choices will be game UI later, so NO labels or text. One window looks out on a blue snowy village evening; warm cozy lighting inside. Small muted red touches and a hanging Chinese knot, not cluttered decoration. Leave a wide unobstructed aisle from entrance to counter and desk. Refined stylized 3D game interior, tactile wood and paper, coherent scale suitable for first-person exploration. Show actual furniture relationships and accessible surfaces. No people, no brand, no watermark, no UI, no exaggerated giant hall.

#### 07 广场露天舞台

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: a small COVERED OUTDOOR PERFORMANCE STAGE from the square. Open-front Chinese timber pavilion, grey tiled snow-tipped roof, warm wooden raised rectangular stage floor, modest red side curtains drawn back, simple pale scenic backdrop with no writing, wooden side rails, two safe broad stair entrances, empty central performance area large enough for several dancing avatars. Four structural timber posts frame but do not obstruct performance. A few integrated lantern fixtures kept neutral. No instruments or audience furniture on stage. No closed auditorium, no gigantic theatre, no extraneous platform diorama, no people. Clearly show the open playable floor and access steps; roof and stage form one coherent buildable asset.

#### 08 旋转木马

UNWRITTEN 2027 standalone CAROUSEL modeling reference. Use the whole-town image only as style/design reference. One elegant compact carousel fully visible against pure white background, front three-quarter view, no landscape, no crowd, no text or watermark. Warm cream, muted festive red and soft antique gold, restrained Chinese-village decorative motifs that blend with timber grey-tile surroundings. A gently scalloped tent-like canopy, central structural column, circular wooden rotating platform with safe low edge, six stylized carved horses on vertical poles at spaced intervals, clear entrance gap and two low steps. Softly rounded refined 3D game asset with believable mechanism and construction, accessible ride seats, coherent horse scale; no oversized ornamental clutter. Show canopy, central axis, platform and horses as visually distinct components intended to animate separately later. Neutral even studio illumination, no baked glow or fireworks, no floor shadow, no toy product packaging.

#### 09 冬日集市

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: the WINTER MARKET as one small coherent open-front timber MARKET HALL with three adjoining vendor bays under a continuous grey-tile roof, open covered arcade, clear central side access, simple wooden counters, a few baskets and neutral wrapped gift boxes. Each bay is readable and separable for modular construction. Modest red fabric valances and hanging lantern hooks, muted wood and cream plaster. Market merchandise suggests winter keepsakes and small crafts, no food labels, no copyrighted logos. Complete single structure and shallow stone footprint visible, not a sprawling bazaar or collage of separate buildings. Distinguish its open arcade from a closed shop. No snow piles hiding counter construction.

#### 10 雪镇住店

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: a welcoming compact TWO-STOREY VILLAGE GUESTHOUSE, visibly different from the tavern. Long modest Chinese courtyard-inn proportions, front ground-floor reception doorway, small covered porch, upper wooden gallery serving three guest-room doors, grey tiled roof with delicate lifted eaves, several cream-plaster wall bays. A blank vertical hanging wooden inn sign and one empty guest notice board, no writing. Show front and left side so the side stair access to upper rooms is legible. Warm refined craftsmanship, simple railing geometry, coherent footprint. No extravagant palace, no giant lobby, no guest figures, no attached scenery.

#### 11 酒馆内部—聊天与小舞台

Create ONE polished first-person eye-height INTERIOR concept of the Chinese timber village tavern in the reference. Large but intimate main gathering room with a few round wooden tables and benches, low friendly drinks/tea counter along the left wall, a contained stone hearth, and a SMALL INTERIOR PERFORMANCE CORNER at the far end with red curtains and a clear raised wooden floor for two or three dancers. Show a safe stair to an upper balcony, structurally plausible exposed beams, latticed windows overlooking snowy night outside. Warm amber lighting without oversaturated orange, creamy plaster, rich carved wood, a few red New Year accents. Plenty of circulation between tables so friends can sit or walk up to the stage. Stage has a simple stool and one resting instrument only, no sound system complexity, no nightclub or neon. No people, no text, no brand or UI. Detailed soft stylized 3D game environment matching the reference, natural near-view craftsmanship. Interior layout is an artistic design proposal, not a literal building survey.

#### 12 住店内部—雪景客房

Create ONE eye-height interior concept for a modest cozy guest room in the Chinese winter village guesthouse shown in reference. Actual small room, exposed timber and cream plaster, wooden floor, one simple comfortable bed with ivory duvet and muted red wool blanket, a small writing desk and chair, a lantern-like bedside lamp, wardrobe nook and two neatly placed slippers. A large wooden lattice window with shutters shows a view of snowy roofs and distant lake at blue evening; a window-side bench for quiet sitting. Clear route from doorway to bed, desk and window; furniture correctly human-scaled and built from simple reusable modules. Refined soft stylized 3D game art, tactile linen and wood, restrained welcoming golden light. No people, no luxury hotel, no excessive props, no text or branding, no interface. Show interior spatial relationships clearly in one wide shot.

#### 13 湖岸灯塔外观

UNWRITTEN 2027 standalone lakeshore LIGHTHOUSE architectural modeling reference, STYLE references attached. One complete compact human-enterable village lighthouse, fully visible on seamless pure white background with generous margins, neutral studio daylight, no landscape/water/people/text/watermark. Softly tapering ivory plaster and grey stone tower with timber-framed entry, a few small wood-trimmed windows, a safe upper viewing balcony, a glazed lantern room capped with a modest Chinese grey-tile pavilion roof. Warm timber details, stone foundation and very restrained red accent near entrance unite it with the referenced village. A subtle fairy-tale shape but believable architecture. Clearly show entry door, balcony rails, lantern enclosure and roof as separate buildable components; no light beam baked into the mesh. Thin snow on ledges. Refined soft stylized 3D game asset, readable at walking distance, not a maritime industrial structure or huge pagoda. Front three-quarter view.

#### 14 普通民居外观

UNWRITTEN 2027 stylized 3D architectural modeling-reference series. Input images are STYLE references. Same detailed soft Chinese timber village architecture, grey gently curved tiled roof, pale warm plaster, brown exposed beams, stone foundation, understated red New Year accents. One standalone complete building, generous white margins, seamless PURE WHITE background, neutral even studio light, front three-quarter view, no landscape, no people, no surrounding props, no text/watermark, no night emission baked into texture. Entire silhouette, roof and footprint visible. No voxel/blocky style, no European chalet dominance, no excessive tiny ornament. Clear physically buildable doors and windows. Thin light snow on roof only. Subject: a SMALL SINGLE-FAMILY VILLAGE HOUSE used as reusable background architecture. One storey plus a modest loft under a grey curved-tile pitched roof, cream plaster and exposed warm wood, small covered entrance porch, one side chimney, two clearly readable latticed windows and simple wooden front door. Strong cozy silhouette with carefully modeled eaves and stone steps. Fewer ornamental details than museum or tavern, so several copies can form the upper-left residential lanes. Standalone house with only its own narrow foundation, no tree, fence, garden, person, or separate hut. Not a European chalet. No exaggerated roof curls.

#### 15 钟楼内部—机械与登楼

Create ONE human-eye-height interior architectural concept for the Chinese timber CLOCKTOWER shown in reference. View inside its compact upper clock chamber, tall exposed timber posts and braces, pale plaster and stone lower walls. A coherent modest bronze-and-dark-iron clock mechanism stands BEHIND the translucent round exterior clockface, with a few readable gears, axle and hanging weights, enclosed by a low wooden safety rail. A narrow but walkable timber stair rises along one wall to the open bell-pavilion above, with handrail and proper landings; a large bronze bell partly visible through upper opening. Slender lattice side window shows snow roofs and blue night. Soft warm lamps reveal wood joints and mechanism without steampunk clutter. Maintain believable chamber size of the provided tower, clear floor space for a few visitors. Detailed soft stylized 3D game environment; no humans, no signage, no text overlays, no watermark, no UI, no fantastical infinite gears.

#### 16 灯塔内部—观景灯室

Create ONE first-person eye-height interior concept INSIDE THE UPPER LANTERN ROOM of the village lighthouse in reference, matching its octagonal glazed timber pavilion and Chinese grey-tile roof. A compact central brass lantern and simple lens housing stand on a sturdy base, surrounded by a walkable perimeter with a low protective inner rail. Wooden-framed glass windows give a panoramic view of the blue snowy lake, arched timber bridge, distant warm village and pines. A small stair opening in the floor has a proper guardrail and leads down the tower; show clear route around the lantern to the exterior viewing balcony door. Exposed Chinese timber roof braces, warm small lamps, ivory plaster stair shaft, tactile refined stylized 3D game materials. Avoid oversized industrial optics, no huge room inconsistent with the narrow tower, no people, no lettering, no HUD, no watermark. Calm warm-vs-cool night mood, clear architectural details.

#### 17 新年愿望树

UNWRITTEN 2027 standalone WISH TREE modeling reference, same refined soft stylized Chinese snowy town aesthetic as the provided style references. ONE broad graceful leafless village tree with a strong readable branching silhouette, light snow resting on upper branches, a restrained collection of muted red wish ribbons and blank small wooden tags tied sparsely so branches remain visible. A low circular timber seat surrounds the trunk, with two clear access gaps and a small attached blank wish-writing shelf. Tree stands in its own narrow circular stone planting ring only. Entire crown, trunk and base fully visible on pure white background with generous margins; neutral even lighting, no cast ground shadow, no plaza/people/buildings, no text, watermark, neon or sparkling magic. Tangible wood and fabric, clearly separable trunk/branches/ribbons/seat for game asset creation. No tangled dense foliage; distinctive warm gathering point, coherent scale for several friends.

#### 18 湖岸木桥

UNWRITTEN 2027 standalone TIMBER FOOTBRIDGE modeling reference. Input images are style/design references for a Chinese winter village. ONE complete modest gently arched pedestrian bridge, entire bridge visible on seamless pure white background, no water, scenery, people or text. Refined warm timber beams and planks, slightly arched walking deck, safe elegant wooden handrails with simple lattice details matching village windows, sturdy wooden supports on two small stone abutments. Low rise walkable slope at both ends, clear wide deck for friends to cross, realistic structural joinery. Thin snow only on railing tops and deck edges so walking surface and construction remain readable. A few simple brass lantern fixtures at posts with no baked bright glow. Front three-quarter side view showing both ends, supports and path. Soft detailed stylized 3D game asset, coherent human scale, not a giant ceremonial bridge or enclosed covered bridge, no diorama island base, no watermark.
