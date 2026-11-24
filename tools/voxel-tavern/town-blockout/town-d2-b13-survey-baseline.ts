const surveyCopySource = Object.freeze({
  path: 'docs/交流区/Muse/设计-全图文字件总表-2026-11-22.md',
  lines: '134-138',
});

export const b13SurveyBaseline = Object.freeze({
  integrationBaseline: Object.freeze({
    branch: 'town-blockout-lane-d2',
    integrationCommit: '5ce6a55d',
    package: 'B13 测绘线底本包',
  }),

  surveyLine: Object.freeze({
    source: surveyCopySource,
    stationIds: Object.freeze(['M4', 'M5', 'M6', 'M7'] as const),
    canonicalPlateLines: Object.freeze({
      M4: Object.freeze(['M4', '入云', '过此入云海 · 跟着铃走'] as const),
      M5: Object.freeze(['M5', '鞍口', '风口 · 站稳了再量'] as const),
      M6: Object.freeze(['M6', '雪原', '离顶不远 · 话别多说'] as const),
      M7: Object.freeze(['M7', '望顶', '绝顶在望 · 一步一喘'] as const),
    }),
    elevationRow: Object.freeze({
      status: '缺·未定稿',
      stationIds: Object.freeze(['M4', 'M5', 'M6', 'M7'] as const),
      approved: false,
      source: surveyCopySource,
      note: '四站高程行尚未定稿；本底本不提供高程行、数值或占位文案。',
    }),
  }),

  d03GateAudit: Object.freeze({
    status: '阻塞',
    officialValidGatePositions: '0/12',
    officialGateCount: 0,
    requiredGateCount: 12,
    oldPreviewCandidateRejection: '12/12',
    oldPreviewCandidatesRejected: 12,
    oldPreviewCandidateCount: 12,
    nominalLengthMetres: 6037.881,
    officialPositionsExported: false,
    gateGeometryExported: false,
    sources: Object.freeze([
      Object.freeze({
        path: 'docs/交流区/提单/D-03-绝顶雪橇十二旗门正式测绘门禁.md',
        lines: '3-7,22-29',
      }),
      Object.freeze({
        path: 'docs/交流区/GPT/2026-11-21-窗D-D03十二门否决测绘与B13底本移交.md',
        lines: '17-42',
      }),
    ]),
    note: '6037.881m 是标称全长，不是已落位路线；旧预览候选仅用于否决审计，不得挂载为正式旗门。',
  }),

  b13ColdRouteEvidence: Object.freeze({
    custody: 'B13 托管·冷路证据',
    status: '未验、未放行',
    frameLimitMs: 50,
    originalFourRunPeakFrameMs: Object.freeze([66.6, 62.5, 79.1, 91.7] as const),
    acquisitionFrame: Object.freeze({
      frame: 68,
      frameMs: 83.3,
      totalFrames: 192,
      evidenceCommit: 'feda50e',
    }),
    source: Object.freeze({
      path: 'docs/交流区/Muse/回执-D窗首份-对账与移交清点-2026-11-21.md',
      lines: '41-46',
    }),
    note: '上述峰帧均为历史证据，不是放行；只有同路线、同冷启负载、同设备的新峰帧不超过 50ms 且结果可追溯，才能改变状态。',
  }),

  legacyTownSurveyDifference: Object.freeze({
    source: Object.freeze({
      path: 'tools/voxel-tavern/town-blockout/town-survey.ts',
      symbol: 'surveyPlateLines',
    }),
    canonicalSource: surveyCopySource,
    summary: '旧模块三行由 ZB-17 信标漂移表派生为“觇标／标尺／方位”；当前总表已改为“编号／站名／副行”，M4–M7 三行均不同。旧模块保持不改，当前刻字正典以新总表为准。',
    stations: Object.freeze([
      Object.freeze({
        station: 'M4',
        legacyLines: Object.freeze(['觇标 M4', '标尺 0.830', '方位 83°00′'] as const),
        canonicalLines: Object.freeze(['M4', '入云', '过此入云海 · 跟着铃走'] as const),
      }),
      Object.freeze({
        station: 'M5',
        legacyLines: Object.freeze(['觇标 M5', '标尺 0.940', '方位 94°00′'] as const),
        canonicalLines: Object.freeze(['M5', '鞍口', '风口 · 站稳了再量'] as const),
      }),
      Object.freeze({
        station: 'M6',
        legacyLines: Object.freeze(['觇标 M6', '标尺 1.050', '方位 105°00′'] as const),
        canonicalLines: Object.freeze(['M6', '雪原', '离顶不远 · 话别多说'] as const),
      }),
      Object.freeze({
        station: 'M7',
        legacyLines: Object.freeze(['觇标 M7', '标尺 1.160', '方位 116°00′'] as const),
        canonicalLines: Object.freeze(['M7', '望顶', '绝顶在望 · 一步一喘'] as const),
      }),
    ]),
  }),
});
