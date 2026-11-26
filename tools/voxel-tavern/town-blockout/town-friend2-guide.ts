export type Friend2GuideCategory = 'landmark' | 'service' | 'controls';

export type Friend2GuideEntry = {
  readonly id: string;
  readonly name: string;
  readonly category: Friend2GuideCategory;
  readonly area: string;
  readonly summary: string;
  readonly howTo: string;
  readonly status: 'current' | 'planned';
  readonly tags: readonly string[];
};

export const FRIEND2_GUIDE_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'landmark', label: '镇内地点' },
  { id: 'service', label: '生活服务' },
  { id: 'controls', label: '操作指南' },
] as const;

export type Friend2GuideCategoryId = (typeof FRIEND2_GUIDE_CATEGORIES)[number]['id'];

export const FRIEND2_GUIDE_ENTRIES = [
  {
    id: 'plaza',
    name: '中央广场',
    category: 'landmark',
    area: '老镇中心',
    summary: '出生点与跨年集会地，四周连接钟楼、酒馆、纪念馆与集市。',
    howTo: '从出生点面向钟楼；E 键与节庆设施互动，夜间注意第十三声提示。',
    status: 'current',
    tags: ['出生点', '跨年', '钟楼'],
  },
  {
    id: 'clocktower',
    name: '大钟楼',
    category: 'landmark',
    area: '广场北侧',
    summary: '整点钟声与第十三声的时间中枢，内部可沿楼梯登临。',
    howTo: '广场北侧正门进入；沿主楼梯上行，留意整点报时与观景窗。',
    status: 'current',
    tags: ['钟声', '第十三声', '观景'],
  },
  {
    id: 'tavern',
    name: '未写酒馆',
    category: 'landmark',
    area: '广场东侧',
    summary: '暖光木质酒馆，可调酒、听醉话碎片并查看二楼陈设。',
    howTo: '推门进入后靠近吧台按 E；调酒面板可试配酒单，二楼楼梯可通行。',
    status: 'current',
    tags: ['调酒', 'NPC', '室内'],
  },
  {
    id: 'museum',
    name: '纪念馆',
    category: 'landmark',
    area: '广场西侧',
    summary: '四区展陈与航天展台，可旋转查看展品并盖纪念戳。',
    howTo: '从正门进入；靠近展台按 E 查看，拖动旋转、滚轮或双指缩放。',
    status: 'current',
    tags: ['展陈', '纪念戳', '航天'],
  },
  {
    id: 'post-office',
    name: '邮局',
    category: 'service',
    area: '广场南侧',
    summary: '寄送明信片与查看留言的室内服务点。',
    howTo: '进入邮局后靠近柜台按 E；明信片只做本地展示，不自动上传。',
    status: 'current',
    tags: ['明信片', '留言'],
  },
  {
    id: 'bus-station',
    name: '汽车站',
    category: 'service',
    area: '广场东南',
    summary: '永不启程的车票与午夜广播所在的候车厅。',
    howTo: '候车厅内可查看班次牌与长椅；广播按场景时间触发。',
    status: 'current',
    tags: ['候车', '广播'],
  },
  {
    id: 'inn',
    name: '未写客栈',
    category: 'service',
    area: '广场东北',
    summary: '老镇住宿与室内休息点，木构与暖灯陈设完整。',
    howTo: '从主街入口进入；楼梯、客房与公共区域可正常步行。',
    status: 'current',
    tags: ['住宿', '室内'],
  },
  {
    id: 'mirror-lake',
    name: '镜湖',
    category: 'landmark',
    area: '老镇西侧',
    summary: '西静钓、中滑冰、东冰上夺宝、北冰雕岛四个分区。',
    howTo: '沿西侧道路步行抵达；冰面活动靠近对应站点按 E 开始。',
    status: 'current',
    tags: ['冰钓', '滑冰', '冰雕'],
  },
  {
    id: 'ice-palace',
    name: '冰晶宫',
    category: 'landmark',
    area: '镜湖北侧',
    summary: '寒源开关与冬至安雪礼所在的大型冰构建筑。',
    howTo: '由镜湖北侧进入前院；仪轨点位按 E 查看，未启用时会如实提示。',
    status: 'current',
    tags: ['冰晶', '仪轨', '前院'],
  },
  {
    id: 'wish-tree',
    name: '许愿树',
    category: 'landmark',
    area: '老镇北带',
    summary: '挂有愿望与灯饰的老树，是北带散步路线的地标。',
    howTo: '沿北带步道步行靠近；夜间灯饰更清晰，适合拍照。',
    status: 'current',
    tags: ['许愿', '夜景', '拍照'],
  },
  {
    id: 'town-hall',
    name: '镇公所',
    category: 'service',
    area: '广场南侧',
    summary: '空置镇长椅与地窖入口所在的公共建筑。',
    howTo: '从正门进入；地窖入口按 E 交互，内部光线较暗。',
    status: 'current',
    tags: ['镇长', '地窖'],
  },
  {
    id: 'crater-station',
    name: '坑口站',
    category: 'landmark',
    area: '西北坑区',
    summary: '客货列换乘与坑区工业带入口；当前为可达的历史工业区。',
    howTo: '沿西北动线步行或乘环镇列车抵达；站台与步道可通行。',
    status: 'current',
    tags: ['列车', '坑区', '站台'],
  },
  {
    id: 'cloud-terrace',
    name: '云海台',
    category: 'landmark',
    area: '前山高处（规划）',
    summary: '前山通往主峰域的云海平台，当前施工中，未作为已开放导览点。',
    howTo: '规划路线：盘山道→缆车/步道→云海台；具体开放以现场为准。',
    status: 'planned',
    tags: ['前山', '云海', '规划'],
  },
  {
    id: 'summit-hut',
    name: '绝顶小屋',
    category: 'landmark',
    area: '主峰绝顶（规划）',
    summary: '主峰域的绝顶休息点与雪翼滑翔起点，当前施工中。',
    howTo: '规划路线：云海台转场→主峰步道→绝顶；未开放前请勿按导览前往。',
    status: 'planned',
    tags: ['主峰', '雪翼', '规划'],
  },
  {
    id: 'move',
    name: '移动与视角',
    category: 'controls',
    area: '基础操作',
    summary: 'WASD 移动，鼠标拖动/指针锁定转向，Shift 疾跑，空格跳跃。',
    howTo: '桌面用键鼠；触屏用左侧摇杆与右侧拖动，按钮尺寸已按触控放大。',
    status: 'current',
    tags: ['WASD', '鼠标', '触控'],
  },
  {
    id: 'interact',
    name: '互动键 E',
    category: 'controls',
    area: '基础操作',
    summary: '靠近可交互点位时按 E：坐下、开门、查看展品、开始活动。',
    howTo: '面向目标靠近到提示出现，再按 E；界面会显示当前情境动作。',
    status: 'current',
    tags: ['E 键', '交互', '提示'],
  },
  {
    id: 'photo',
    name: '拍照与查看',
    category: 'controls',
    area: '基础操作',
    summary: '纪念馆展品可拖动旋转；摄影小工具只做本地构图与保存。',
    howTo: '进入纪念馆展台按 E 查看；摄影工具从独立入口打开，不改变全局相机。',
    status: 'current',
    tags: ['拍照', '展品', '旋转'],
  },
] as const satisfies readonly Friend2GuideEntry[];

export function normalizeFriend2GuideQuery(value: string): string {
  return value.trim().slice(0, 40).toLowerCase();
}

export function filterFriend2Guide(
  entries: readonly Friend2GuideEntry[],
  query: string,
  category: Friend2GuideCategoryId,
): Friend2GuideEntry[] {
  const keyword = normalizeFriend2GuideQuery(query);
  return entries.filter(entry => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!keyword) return true;
    const haystack = [entry.name, entry.area, entry.summary, entry.howTo, ...entry.tags].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });
}

export function friend2GuideCounts(entries: readonly Friend2GuideEntry[]) {
  return {
    total: entries.length,
    current: entries.filter(entry => entry.status === 'current').length,
    planned: entries.filter(entry => entry.status === 'planned').length,
  };
}

export function friend2GuideCategoryLabel(category: Friend2GuideCategory): string {
  switch (category) {
    case 'landmark':
      return '镇内地点';
    case 'service':
      return '生活服务';
    case 'controls':
      return '操作指南';
  }
}