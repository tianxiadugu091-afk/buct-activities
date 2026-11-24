/* =====================================================================
   北京化工大学 · 第二课堂 600 分官方细则配置与计分引擎
   严格对应五大模块（基础评定 80% + 拓展评定 20%）全部 37 项细则，
   全程支持「纯选项点选 / 步进计数」，零打字录入与精准封顶核算。
   ===================================================================== */
(function (global) {
  const BUCT_MODULES = [
    {
      key: 'moral',
      name: '道德与思想素质',
      shortName: '德育思想',
      max: 180,
      baseMax: 144,
      extMax: 36,
      color: '#ef4444',
      match: /德育|思想|党团|宏德|宣讲|青年大学习|献血/,
    },
    {
      key: 'academic',
      name: '学术与科技创新',
      shortName: '学术科创',
      max: 120,
      baseMax: 96,
      extMax: 24,
      color: '#3b82f6',
      match: /学术|科创|创新|创业|大创|萌芽杯|挑战杯|沙龙|外语角|职业规划|编程|科技/,
    },
    {
      key: 'sports',
      name: '体育与身心健康',
      shortName: '体育身心',
      max: 100,
      baseMax: 80,
      extMax: 20,
      color: '#f97316',
      match: /体育|身心|心理|体测|跑步|球|平板支撑|运动会|奔跑在北化/,
    },
    {
      key: 'aesthetic',
      name: '美学与人文素养',
      shortName: '美育人文',
      max: 100,
      baseMax: 80,
      extMax: 20,
      color: '#ec4899',
      match: /美育|人文|艺术|音乐|文艺|书画|演出|展览|戏剧|舞蹈|乐团|电影|观影/,
    },
    {
      key: 'labor',
      name: '劳动与社会实践',
      shortName: '劳育实践',
      max: 100,
      baseMax: 80,
      extMax: 20,
      color: '#10b981',
      match: /劳育|劳动|实践|志愿|公益|宿舍|社会实践|北化我代言/,
    },
  ];

  const BUCT_MODULE_MAP = Object.fromEntries(BUCT_MODULES.map((m) => [m.key, m]));
  const BUCT_TOTAL_CAP = BUCT_MODULES.reduce((sum, m) => sum + m.max, 0); // 600

  const BUCT_RUBRIC_GROUPS = {
    sports_comp: {
      cap: 20,
      label: '体育竞赛参与（运动员/组织者与观众合计上限 20 分）',
    },
    aes_act: {
      cap: 30,
      label: '美育类活动（演员/作者/参赛者与观众合计上限 30 分）',
    },
  };

  const BUCT_RUBRIC_ITEMS = [
    /* ==================== 1. 道德与思想素质（180 = 基础144 + 拓展36） ==================== */
    {
      key: 'moral_base_demo',
      module: 'moral',
      section: 'base',
      title: '班级民主评议',
      hint: '班级民主评议两档：优秀 35 分 / 良好 25 分',
      kind: 'chips',
      cap: 35,
      options: [
        { label: '未评', score: 0 },
        { label: '良好', score: 25 },
        { label: '优秀', score: 35 },
      ],
    },
    {
      key: 'moral_base_act',
      module: 'moral',
      section: 'base',
      title: '德育类活动',
      hint: '宏德讲坛 / 院周 / 主题党团日等，10 分/次，上限 50 分',
      kind: 'stepper',
      unit: '次',
      step: 10,
      maxCount: 5,
      cap: 50,
      activityEligible: true,
    },
    {
      key: 'moral_base_qndxx',
      module: 'moral',
      section: 'base',
      title: '青年大学习',
      hint: '全勤满分 35 分，缺勤 1 次扣 3 分，扣完为止',
      kind: 'miss_stepper',
      fullScore: 35,
      deductPerMiss: 3,
      maxMiss: 11,
      cap: 35,
    },
    {
      key: 'moral_base_conduct',
      module: 'moral',
      section: 'base',
      title: '学生行为准则',
      hint: '满分 40 分；餐饮浪费/禁烟区吸烟/大功率电器等通报每次扣 20 分',
      kind: 'chips',
      cap: 40,
      options: [
        { label: '未填', score: 0 },
        { label: '良好无违规', score: 40 },
        { label: '通报1次', score: 20 },
        { label: '通报2次+', score: 0, zeroTag: true },
      ],
    },
    {
      key: 'moral_base_discipline',
      module: 'moral',
      section: 'base',
      title: '学校纪律处分（扣分项）',
      hint: '警告 -80 / 严重警告 -100 / 记过 -120 / 留校察看 -144',
      kind: 'chips',
      cap: 144,
      deductOnly: true,
      options: [
        { label: '无处分', score: 0 },
        { label: '警告', score: -80 },
        { label: '严重警告', score: -100 },
        { label: '记过', score: -120 },
        { label: '留校察看', score: -144 },
      ],
    },
    {
      key: 'moral_ext_honor',
      module: 'moral',
      section: 'ext',
      title: '德育荣誉 / 先进榜样 / 主题宣讲团',
      hint: '同一类荣誉取最高级别，集体获奖按半数计分，上限 30 分',
      kind: 'award',
      cap: 30,
      collectiveHalf: true,
      options: [
        { label: '无', score: 0 },
        { label: '院级', score: 5 },
        { label: '校级', score: 16 },
        { label: '地市级', score: 20 },
        { label: '省部级', score: 24 },
        { label: '国家级', score: 30 },
      ],
    },
    {
      key: 'moral_ext_cadre',
      module: 'moral',
      section: 'ext',
      title: '学生组织 / 社团 / 班级骨干评定',
      hint: '各项不累加：优秀 20 分 / 称职 10 分，上限 20 分',
      kind: 'chips',
      cap: 20,
      options: [
        { label: '无', score: 0 },
        { label: '称职', score: 10 },
        { label: '优秀', score: 20 },
      ],
    },
    {
      key: 'moral_ext_deed',
      module: 'moral',
      section: 'ext',
      title: '好人好事 / 义务献血 / 应急突出表现',
      hint: '拾金不昧、义务献血、见义勇为、抢险救灾等计 20 分',
      kind: 'chips',
      cap: 20,
      activityEligible: true,
      options: [
        { label: '无', score: 0 },
        { label: '已认定', score: 20 },
      ],
    },
    {
      key: 'moral_ext_pub',
      module: 'moral',
      section: 'ext',
      title: '发表德育类文章或作品',
      hint: '公开刊物、校级及以上媒体平台发表计 10 分',
      kind: 'chips',
      cap: 10,
      options: [
        { label: '未发表', score: 0 },
        { label: '已发表', score: 10 },
      ],
    },

    /* ==================== 2. 学术与科技创新（120 = 基础96 + 拓展24） ==================== */
    {
      key: 'acad_base_comp',
      module: 'academic',
      section: 'base',
      title: '竞赛完赛 / 萌芽杯·大创结题 / 创业实训',
      hint: '提交完赛作品、大创/萌芽杯结题或参与创业实训计 25 分',
      kind: 'chips',
      cap: 25,
      activityEligible: true,
      options: [
        { label: '未参与', score: 0 },
        { label: '已完赛/结题', score: 25 },
      ],
    },
    {
      key: 'acad_base_act',
      module: 'academic',
      section: 'base',
      title: '学术科创相关活动',
      hint: '科研零距离 / 师生下午茶 / 职规赛 / 云同桌 / 外语角等，15 分/次，上限 30 分',
      kind: 'stepper',
      unit: '次',
      step: 15,
      maxCount: 2,
      cap: 30,
      activityEligible: true,
    },
    {
      key: 'acad_base_lec',
      module: 'academic',
      section: 'base',
      title: '学术科创专题讲座 / 报告',
      hint: '导师微沙龙 / 学长伴我行 / 名师教我学 / 领导力面对面，6 分/次，上限 24 分',
      kind: 'stepper',
      unit: '次',
      step: 6,
      maxCount: 4,
      cap: 24,
      activityEligible: true,
    },
    {
      key: 'acad_base_study',
      module: 'academic',
      section: 'base',
      title: '刻苦学习与自主学习',
      hint: '满分 30 分；无故不参加教学活动每 1 学时扣 5 分，扣完为止',
      kind: 'chips',
      cap: 30,
      options: [
        { label: '未填', score: 0 },
        { label: '全勤满分', score: 30 },
        { label: '缺1学时', score: 25 },
        { label: '缺2学时', score: 20 },
        { label: '缺3学时', score: 15 },
        { label: '缺4学时', score: 10 },
        { label: '缺5学时', score: 5 },
      ],
    },
    {
      key: 'acad_ext_award',
      module: 'academic',
      section: 'ext',
      title: '学术科创竞赛获奖 / 大创评级',
      hint: '按学生手册118页计分（常规上限20，集体半数）；挑战杯/互联网+国奖记本节满分24',
      kind: 'award',
      cap: 24,
      collectiveHalf: true,
      activityEligible: true,
      options: [
        { label: '无', score: 0 },
        { label: '院级/优秀', score: 4 },
        { label: '校级三等', score: 6 },
        { label: '校级二等', score: 8 },
        { label: '校一/省三', score: 10 },
        { label: '省级二等', score: 12 },
        { label: '省一/国三', score: 15 },
        { label: '国二/大创国级', score: 18 },
        { label: '常规上限', score: 20 },
        { label: '挑战杯/互联网+国重大', score: 24, noHalf: true },
      ],
    },
    {
      key: 'acad_ext_paper',
      module: 'academic',
      section: 'ext',
      title: '学术论文 / 专利成果',
      hint: '当学期取得教务处认定的学术论文、专利等成果计 20 分',
      kind: 'chips',
      cap: 20,
      options: [
        { label: '无', score: 0 },
        { label: '已认定', score: 20 },
      ],
    },

    /* ==================== 3. 体育与身心健康（100 = 基础80 + 拓展20） ==================== */
    {
      key: 'sports_base_comp_player',
      module: 'sports',
      section: 'base',
      group: 'sports_comp',
      title: '体育类竞赛（组织者 / 运动员）',
      hint: '10 分/次，与体育竞赛观众合计上限 20 分',
      kind: 'stepper',
      unit: '次',
      step: 10,
      maxCount: 2,
      cap: 20,
      activityEligible: true,
    },
    {
      key: 'sports_base_comp_aud',
      module: 'sports',
      section: 'base',
      group: 'sports_comp',
      title: '体育类竞赛（观众）',
      hint: '2 分/次，与组织者/运动员合计上限 20 分',
      kind: 'stepper',
      unit: '次',
      step: 2,
      maxCount: 10,
      cap: 20,
      activityEligible: true,
    },
    {
      key: 'sports_base_act',
      module: 'sports',
      section: 'base',
      title: '体育 / 心理健康类活动',
      hint: '作为组织者或参与者参加，10 分/次，上限 20 分',
      kind: 'stepper',
      unit: '次',
      step: 10,
      maxCount: 2,
      cap: 20,
      activityEligible: true,
    },
    {
      key: 'sports_base_run',
      module: 'sports',
      section: 'base',
      title: '“奔跑在北化”跑步打卡',
      hint: '完成学期打卡计划计 30 分，未完成不计分',
      kind: 'chips',
      cap: 30,
      activityEligible: true,
      options: [
        { label: '未完成', score: 0 },
        { label: '已完成打卡', score: 30 },
      ],
    },
    {
      key: 'sports_base_test',
      module: 'sports',
      section: 'base',
      title: '国家大学生体质测试',
      hint: '合格及免测计 20 分，不合格计 0 分',
      kind: 'chips',
      cap: 20,
      options: [
        { label: '未测/不合格', score: 0 },
        { label: '合格/免测', score: 20 },
      ],
    },
    {
      key: 'sports_ext_award',
      module: 'sports',
      section: 'ext',
      title: '体育类竞赛获奖',
      hint: '按学生手册119页（1-3名一等/4-6二等/7-9三等），集体半数，上限 20 分',
      kind: 'award',
      cap: 20,
      collectiveHalf: true,
      activityEligible: true,
      options: [
        { label: '无', score: 0 },
        { label: '优秀奖', score: 2 },
        { label: '校级三等', score: 5 },
        { label: '校级二等', score: 8 },
        { label: '校级一等', score: 10 },
        { label: '省市三等', score: 12 },
        { label: '省市二等', score: 15 },
        { label: '省市一/国奖', score: 20 },
      ],
    },
    {
      key: 'sports_ext_fitness',
      module: 'sports',
      section: 'ext',
      title: '全民健身与身心素质民主认定',
      hint: '班级民主认定两档：优秀 15 分 / 良好 10 分',
      kind: 'chips',
      cap: 15,
      options: [
        { label: '未评', score: 0 },
        { label: '良好', score: 10 },
        { label: '优秀', score: 15 },
      ],
    },
    {
      key: 'sports_ext_pub',
      module: 'sports',
      section: 'ext',
      title: '发表体育 / 心理类文章作品',
      hint: '公开刊物、校级及以上媒体平台发表计 10 分',
      kind: 'chips',
      cap: 10,
      options: [
        { label: '未发表', score: 0 },
        { label: '已发表', score: 10 },
      ],
    },

    /* ==================== 4. 美学与人文素养（100 = 基础80 + 拓展20） ==================== */
    {
      key: 'aes_base_act_actor',
      module: 'aesthetic',
      section: 'base',
      group: 'aes_act',
      title: '美育类活动（演员 / 作者 / 参赛者）',
      hint: '10 分/次，与美育观众合计上限 30 分',
      kind: 'stepper',
      unit: '次',
      step: 10,
      maxCount: 3,
      cap: 30,
      activityEligible: true,
    },
    {
      key: 'aes_base_act_aud',
      module: 'aesthetic',
      section: 'base',
      group: 'aes_act',
      title: '美育类活动（观众 / 参与者）',
      hint: '5 分/次，与演员/作者/参赛者合计上限 30 分',
      kind: 'stepper',
      unit: '次',
      step: 5,
      maxCount: 6,
      cap: 30,
      activityEligible: true,
    },
    {
      key: 'aes_base_lec',
      module: 'aesthetic',
      section: 'base',
      title: '美育专题讲座 / 报告',
      hint: '含美育类课程理论教学环节，10 分/次，上限 30 分',
      kind: 'stepper',
      unit: '次',
      step: 10,
      maxCount: 3,
      cap: 30,
      activityEligible: true,
    },
    {
      key: 'aes_base_mooc',
      module: 'aesthetic',
      section: 'base',
      title: '慕课等网络艺术类课程学习',
      hint: '音乐/美术/书法/舞蹈/戏剧等网课，5 分/学时，上限 30 分',
      kind: 'stepper',
      unit: '学时',
      step: 5,
      maxCount: 6,
      cap: 30,
    },
    {
      key: 'aes_ext_award',
      module: 'aesthetic',
      section: 'ext',
      title: '美育类比赛获奖',
      hint: '按学生手册120页（1-3一等/4-6二等/7-10三等，特等按一等），集体半数，上限 20 分',
      kind: 'award',
      cap: 20,
      collectiveHalf: true,
      activityEligible: true,
      options: [
        { label: '无', score: 0 },
        { label: '优秀奖', score: 2 },
        { label: '校级三等', score: 5 },
        { label: '校级二等', score: 8 },
        { label: '校级一等', score: 10 },
        { label: '省市三等', score: 12 },
        { label: '省市二等', score: 15 },
        { label: '省市一/国奖', score: 20 },
      ],
    },
    {
      key: 'aes_ext_solo',
      module: 'aesthetic',
      section: 'ext',
      title: '个人艺术作品展览 / 个人公演',
      hint: '面向校内外举办并经相关部门认定计 20 分',
      kind: 'chips',
      cap: 20,
      options: [
        { label: '无', score: 0 },
        { label: '已认定', score: 20 },
      ],
    },
    {
      key: 'aes_ext_visit',
      module: 'aesthetic',
      section: 'ext',
      title: '美育场馆 / 基地参观实践',
      hint: '美术馆、博物馆等美育场馆参观或实践，4 分/次，上限 20 分',
      kind: 'stepper',
      unit: '次',
      step: 4,
      maxCount: 5,
      cap: 20,
      activityEligible: true,
    },
    {
      key: 'aes_ext_pub',
      module: 'aesthetic',
      section: 'ext',
      title: '发表美育类文章或作品',
      hint: '公开刊物、校级及以上媒体平台发表计 10 分',
      kind: 'chips',
      cap: 10,
      options: [
        { label: '未发表', score: 0 },
        { label: '已发表', score: 10 },
      ],
    },

    /* ==================== 5. 劳动与社会实践（100 = 基础80 + 拓展20） ==================== */
    {
      key: 'labor_base_work',
      module: 'labor',
      section: 'base',
      title: '劳动实践时长达标',
      hint: '含劳育课程实践环节，每学期满 10 小时计 20 分，不足不计分',
      kind: 'chips',
      cap: 20,
      activityEligible: true,
      options: [
        { label: '未满10h', score: 0 },
        { label: '已满10h', score: 20 },
      ],
    },
    {
      key: 'labor_base_vol',
      module: 'labor',
      section: 'base',
      title: '志愿服务时长达标',
      hint: '每学期志愿服务满 10 小时计 20 分，不足 10 小时不计分',
      kind: 'chips',
      cap: 20,
      activityEligible: true,
      options: [
        { label: '未满10h', score: 0 },
        { label: '已满10h', score: 20 },
      ],
    },
    {
      key: 'labor_base_prac',
      module: 'labor',
      section: 'base',
      title: '寒暑假 / 学期社会实践任务',
      hint: '如“我的北化我代言”、个人社会实践并撰写实践报告计 15 分',
      kind: 'chips',
      cap: 15,
      activityEligible: true,
      options: [
        { label: '未完成', score: 0 },
        { label: '已完成任务', score: 15 },
      ],
    },
    {
      key: 'labor_base_lec',
      module: 'labor',
      section: 'base',
      title: '劳动实践专题讲座 / 报告',
      hint: '含劳育类课程理论教学环节，5 分/次，上限 15 分',
      kind: 'stepper',
      unit: '次',
      step: 5,
      maxCount: 3,
      cap: 15,
      activityEligible: true,
    },
    {
      key: 'labor_base_dorm',
      module: 'labor',
      section: 'base',
      title: '宿舍卫生评定成绩',
      hint: '优(90+):20 / 良(80-90):16 / 中(70-80):12 / 合格(60-70):10 / 不合格:0',
      kind: 'chips',
      cap: 20,
      activityEligible: true,
      options: [
        { label: '未评/不合格', score: 0 },
        { label: '合格', score: 10 },
        { label: '中', score: 12 },
        { label: '良', score: 16 },
        { label: '优', score: 20 },
      ],
    },
    {
      key: 'labor_ext_vol_honor',
      module: 'labor',
      section: 'ext',
      title: '志愿服务 / 劳动实践个人荣誉',
      hint: '只按最高项加分：院2 / 校4 / 地市6 / 省部8 / 国家10',
      kind: 'chips',
      cap: 10,
      options: [
        { label: '无', score: 0 },
        { label: '院级', score: 2 },
        { label: '校级', score: 4 },
        { label: '地市级', score: 6 },
        { label: '省部级', score: 8 },
        { label: '国家级', score: 10 },
      ],
    },
    {
      key: 'labor_ext_prac_honor',
      module: 'labor',
      section: 'ext',
      title: '社会实践荣誉（个人 / 集体团队）',
      hint: '集体获奖团队每人计同分，只按最高项：院2 / 校4 / 地市6 / 省部8 / 国家10',
      kind: 'chips',
      cap: 10,
      options: [
        { label: '无', score: 0 },
        { label: '院级', score: 2 },
        { label: '校级', score: 4 },
        { label: '地市级', score: 6 },
        { label: '省部级', score: 8 },
        { label: '国家级', score: 10 },
      ],
    },
    {
      key: 'labor_ext_dorm_honor',
      module: 'labor',
      section: 'ext',
      title: '宿舍荣誉称号',
      hint: '“十佳宿舍”“温馨之家”等，每人计分：院2 / 校3 / 市级及以上5',
      kind: 'chips',
      cap: 5,
      options: [
        { label: '无', score: 0 },
        { label: '院级', score: 2 },
        { label: '校级', score: 3 },
        { label: '市级及以上', score: 5 },
      ],
    },
    {
      key: 'labor_ext_vol_extra',
      module: 'labor',
      section: 'ext',
      title: '志愿服务超额时长（超 10h 部分）',
      hint: '计算：(总时长-10h)×0.5 分，上限 5 分（即超 10h 封顶）',
      kind: 'stepper',
      unit: 'h',
      step: 0.5,
      maxCount: 10,
      cap: 5,
    },
    {
      key: 'labor_ext_work_extra',
      module: 'labor',
      section: 'ext',
      title: '劳动实践超额时长（超 10h 部分）',
      hint: '计算：(总时长-10h)×0.5 分，上限 5 分（即超 10h 封顶）',
      kind: 'stepper',
      unit: 'h',
      step: 0.5,
      maxCount: 10,
      cap: 5,
    },
    {
      key: 'labor_ext_pub',
      module: 'labor',
      section: 'ext',
      title: '发表劳动实践类文章或作品',
      hint: '公开刊物、校级及以上媒体平台发表计 10 分',
      kind: 'chips',
      cap: 10,
      options: [
        { label: '未发表', score: 0 },
        { label: '已发表', score: 10 },
      ],
    },
  ];

  const BUCT_RUBRIC_MAP = Object.fromEntries(BUCT_RUBRIC_ITEMS.map((it) => [it.key, it]));

  // 一键填入常规基础项（不会覆盖同学已经修改过的项）
  const BUCT_BASELINE_PRESETS = [
    { rubricKey: 'moral_base_qndxx', score: 35, title: '青年大学习 · 全勤', note: '基础评定 · 常规一键填入' },
    { rubricKey: 'moral_base_conduct', score: 40, title: '学生行为准则 · 良好无违规', note: '基础评定 · 常规一键填入' },
    { rubricKey: 'acad_base_study', score: 30, title: '刻苦学习与自主学习 · 全勤满分', note: '基础评定 · 常规一键填入' },
    { rubricKey: 'sports_base_test', score: 20, title: '国家大学生体质测试 · 合格/免测', note: '基础评定 · 常规一键填入' },
  ];

  function round1(n) {
    return Math.round((Number(n) || 0) * 10) / 10;
  }

  function getRubricItemsForModule(moduleKey, section = '') {
    return BUCT_RUBRIC_ITEMS.filter(
      (it) => it.module === moduleKey && (!section || it.section === section)
    );
  }

  function inferModuleKeyFromItem(item) {
    const tagStr = (item?.tags || []).map((t) => t.name).join(' ');
    const combined = `${tagStr} ${item?.credit_hint || ''} ${item?.title || ''}`;
    // Prioritize explicit tag name match first
    for (const mod of BUCT_MODULES) {
      if (tagStr && mod.match.test(tagStr)) return mod.key;
    }
    for (const mod of BUCT_MODULES) {
      if (mod.match.test(combined)) return mod.key;
    }
    return 'moral';
  }

  function inferRubricForActivity(item, overrideModuleKey = '') {
    const modKey = BUCT_MODULE_MAP[overrideModuleKey] ? overrideModuleKey : inferModuleKeyFromItem(item);
    const text = `${item?.title || ''} ${item?.credit_hint || ''} ${(item?.tags || []).map((t) => t.name).join(' ')}`;

    if (modKey === 'moral') {
      if (/青年大学习/.test(text)) return { moduleKey: 'moral', rubricKey: 'moral_base_qndxx', defaultScore: 35 };
      if (/献血|好人好事|见义勇为|救灾/.test(text)) return { moduleKey: 'moral', rubricKey: 'moral_ext_deed', defaultScore: 20 };
      if (/宣讲团|荣誉|榜样/.test(text)) return { moduleKey: 'moral', rubricKey: 'moral_ext_honor', defaultScore: 16 };
      if (/文章|征文|投稿|发表/.test(text)) return { moduleKey: 'moral', rubricKey: 'moral_ext_pub', defaultScore: 10 };
      return { moduleKey: 'moral', rubricKey: 'moral_base_act', defaultScore: 10 };
    }

    if (modKey === 'academic') {
      if (/讲座|讲坛|报告|沙龙|伴我行|教我学|面对面|宣讲/.test(text)) {
        return { moduleKey: 'academic', rubricKey: 'acad_base_lec', defaultScore: 6 };
      }
      if (/萌芽杯|大创|挑战杯|互联网\+|创业实训|创新创业.*大赛|编程设计|竞赛/.test(text)) {
        return { moduleKey: 'academic', rubricKey: 'acad_base_comp', defaultScore: 25 };
      }
      if (/论文|专利/.test(text)) {
        return { moduleKey: 'academic', rubricKey: 'acad_ext_paper', defaultScore: 20 };
      }
      return { moduleKey: 'academic', rubricKey: 'acad_base_act', defaultScore: 15 };
    }

    if (modKey === 'sports') {
      if (/奔跑在北化|跑步打卡/.test(text)) return { moduleKey: 'sports', rubricKey: 'sports_base_run', defaultScore: 30 };
      if (/体测|体质测试/.test(text)) return { moduleKey: 'sports', rubricKey: 'sports_base_test', defaultScore: 20 };
      if (/赛|杯|挑战赛|运动会|平板支撑|球/.test(text)) {
        return { moduleKey: 'sports', rubricKey: 'sports_base_comp_player', defaultScore: 10 };
      }
      return { moduleKey: 'sports', rubricKey: 'sports_base_act', defaultScore: 10 };
    }

    if (modKey === 'aesthetic') {
      if (/讲座|讲坛|报告/.test(text)) return { moduleKey: 'aesthetic', rubricKey: 'aes_base_lec', defaultScore: 10 };
      if (/展览|美术馆|博物馆|参观|基地/.test(text)) return { moduleKey: 'aesthetic', rubricKey: 'aes_ext_visit', defaultScore: 4 };
      if (/慕课|网课/.test(text)) return { moduleKey: 'aesthetic', rubricKey: 'aes_base_mooc', defaultScore: 5 };
      if (/比赛|大赛|征集|征文|短视频|摄影/.test(text)) {
        return { moduleKey: 'aesthetic', rubricKey: 'aes_base_act_actor', defaultScore: 10 };
      }
      return { moduleKey: 'aesthetic', rubricKey: 'aes_base_act_aud', defaultScore: 5 };
    }

    if (modKey === 'labor') {
      if (/志愿/.test(text)) return { moduleKey: 'labor', rubricKey: 'labor_base_vol', defaultScore: 20 };
      if (/社会实践|北化我代言/.test(text)) return { moduleKey: 'labor', rubricKey: 'labor_base_prac', defaultScore: 15 };
      if (/宿舍/.test(text)) return { moduleKey: 'labor', rubricKey: 'labor_base_dorm', defaultScore: 20 };
      if (/讲座|报告/.test(text)) return { moduleKey: 'labor', rubricKey: 'labor_base_lec', defaultScore: 5 };
      return { moduleKey: 'labor', rubricKey: 'labor_base_work', defaultScore: 20 };
    }

    return { moduleKey: 'moral', rubricKey: 'moral_base_act', defaultScore: 10 };
  }

  function getRubricOptionPresets(rubricKey) {
    const item = BUCT_RUBRIC_MAP[rubricKey];
    if (!item) return [];
    if (item.kind === 'chips' || item.kind === 'award') {
      return item.options.map((o) => ({ label: o.label, score: o.score, noHalf: Boolean(o.noHalf) }));
    }
    if (item.kind === 'miss_stepper') {
      const list = [{ label: '未填', score: 0 }, { label: '全勤', score: item.fullScore }];
      for (let m = 1; m <= 5; m++) {
        list.push({ label: `缺${m}次`, score: Math.max(0, item.fullScore - m * item.deductPerMiss) });
      }
      return list;
    }
    if (item.kind === 'stepper') {
      const list = [];
      for (let c = 1; c <= Math.min(item.maxCount, 6); c++) {
        const sc = round1(Math.min(item.cap, c * item.step));
        list.push({ label: `${c}${item.unit}`, score: sc });
      }
      return list;
    }
    return [];
  }

  /**
   * 精准计算北化 600 分二课成绩：
   * 1. 每项细则按单上限封顶（含体育竞赛、美育活动共享小组上限）
   * 2. 每模块分「基础评定」与「拓展评定」分别封顶（基础最低封底 0 分处理处分扣分）
   * 3. 兼容活动卡片「我已参加」记录 + 纯点选细则记录 + 历史无 rubric_key 手动记录
   */
  function computeDetailedCreditSummary(records = [], allItems = [], parseIsoMsFn) {
    const rubricDirect = {}; // rubricKey -> record (activity_id == null)
    const rubricActs = {}; // rubricKey -> array of attended activity records
    const legacyByMod = {}; // moduleKey -> array of attended records without valid rubric_key

    let attendedCount = 0;
    let registeredCount = 0;

    for (const r of records) {
      if (r.status === 'registered') {
        registeredCount += 1;
        continue;
      }
      if (r.status !== 'attended') continue;
      attendedCount += 1;

      const rk = r.rubric_key && BUCT_RUBRIC_MAP[r.rubric_key] ? r.rubric_key : '';
      if (rk) {
        if (r.activity_id != null) {
          if (!rubricActs[rk]) rubricActs[rk] = [];
          rubricActs[rk].push(r);
        } else {
          // If somehow multiple manual records share the same rubric_key, sum them cleanly
          if (!rubricDirect[rk]) {
            rubricDirect[rk] = { ...r, score: Number(r.score) || 0, _count: 1 };
          } else {
            rubricDirect[rk].score = round1(rubricDirect[rk].score + (Number(r.score) || 0));
            rubricDirect[rk]._count += 1;
          }
        }
      } else {
        const mk = BUCT_MODULE_MAP[r.module_key] ? r.module_key : 'moral';
        if (!legacyByMod[mk]) legacyByMod[mk] = [];
        legacyByMod[mk].push(r);
      }
    }

    // Per-rubric-item evaluation
    const itemStats = {};
    for (const it of BUCT_RUBRIC_ITEMS) {
      const directRec = rubricDirect[it.key] || null;
      const directScore = directRec ? round1(directRec.score) : 0;
      const acts = rubricActs[it.key] || [];
      const actScore = round1(acts.reduce((s, r) => s + (Number(r.score) || 0), 0));
      const raw = round1(directScore + actScore);
      let effective;
      if (it.deductOnly) {
        effective = Math.min(0, Math.max(-it.cap, raw));
      } else {
        effective = Math.min(it.cap, Math.max(0, raw));
      }
      const isCollective = Boolean(directRec && /集体/.test(directRec.note || ''));
      const directCount =
        it.kind === 'stepper' && it.step > 0 ? Math.min(it.maxCount, Math.max(0, Math.round(directScore / it.step))) : 0;
      const actCount = acts.length;
      itemStats[it.key] = {
        key: it.key,
        directRec,
        directScore,
        directCount,
        actScore,
        actCount,
        raw,
        effective,
        capped: !it.deductOnly && raw >= it.cap && it.cap > 0,
        isCollective,
      };
    }

    // Shared group caps (sports_comp: 20, aes_act: 30)
    const groupTotals = {};
    for (const [gk, g] of Object.entries(BUCT_RUBRIC_GROUPS)) {
      const members = BUCT_RUBRIC_ITEMS.filter((it) => it.group === gk);
      const rawSum = round1(members.reduce((s, it) => s + itemStats[it.key].effective, 0));
      groupTotals[gk] = {
        raw: rawSum,
        capped: Math.min(g.cap, rawSum),
        cap: g.cap,
        full: rawSum >= g.cap,
      };
    }

    // Module aggregation
    const byMod = {};
    let totalValid = 0;
    let totalRaw = 0;

    for (const m of BUCT_MODULES) {
      const modItems = BUCT_RUBRIC_ITEMS.filter((it) => it.module === m.key);
      let baseRaw = 0;
      let extRaw = 0;
      const countedGroups = new Set();

      for (const it of modItems) {
        let contrib = 0;
        if (it.group) {
          if (countedGroups.has(it.group)) continue;
          countedGroups.add(it.group);
          contrib = groupTotals[it.group].capped;
        } else {
          contrib = itemStats[it.key].effective;
        }
        if (it.section === 'base') baseRaw = round1(baseRaw + contrib);
        else extRaw = round1(extRaw + contrib);
      }

      // Include legacy / unmapped custom records cleanly into baseRaw
      const legacyList = legacyByMod[m.key] || [];
      const legacySum = round1(legacyList.reduce((s, r) => s + (Number(r.score) || 0), 0));
      baseRaw = round1(baseRaw + legacySum);

      const baseCapped = Math.max(0, Math.min(m.baseMax, baseRaw));
      const extCapped = Math.max(0, Math.min(m.extMax, extRaw));
      const capped = Math.min(m.max, round1(baseCapped + extCapped));
      const raw = round1(Math.max(0, baseRaw) + Math.max(0, extRaw));
      const gap = Math.max(0, round1(m.max - capped));
      const baseGap = Math.max(0, round1(m.baseMax - baseCapped));
      const extGap = Math.max(0, round1(m.extMax - extCapped));
      const filledItemsCount = modItems.filter((it) => itemStats[it.key].raw !== 0).length + legacyList.length;

      byMod[m.key] = {
        ...m,
        baseRaw,
        baseCapped,
        baseGap,
        extRaw,
        extCapped,
        extGap,
        raw,
        capped,
        gap,
        full: capped >= m.max,
        filledItemsCount,
        legacyCount: legacyList.length,
        legacySum,
      };
      totalValid = round1(totalValid + capped);
      totalRaw = round1(totalRaw + raw);
    }

    // Pending settlement check
    const now = Date.now();
    const parseMs =
      typeof parseIsoMsFn === 'function'
        ? parseIsoMsFn
        : (iso) => {
            if (!iso) return null;
            const t = new Date(iso).getTime();
            return Number.isFinite(t) ? t : null;
          };

    const pendingSettle = records.filter((r) => {
      if (r.status !== 'registered') return false;
      const act = allItems.find((a) => Number(a.id) === Number(r.activity_id));
      if (!act) return true;
      const evEnd = parseMs(act.event_end_at);
      const regEnd = parseMs(act.reg_end_at);
      const regStart = parseMs(act.reg_start_at);
      if (evEnd && now > evEnd) return true;
      if (regEnd && now > regEnd) return true;
      if (regStart && now > regStart + 2 * 3600 * 1000) return true;
      return false;
    });

    const level = Math.min(10, Math.floor(totalValid / 60) + 1);
    const rankNames = ['见习新生', '校园游侠', '二课猎手', '进阶学者', '满绩勇者', '北化传奇'];
    const rankTitle = rankNames[Math.min(level - 1, rankNames.length - 1)];

    return {
      byMod,
      itemStats,
      groupTotals,
      totalValid,
      totalRaw,
      attendedCount,
      registeredCount,
      pendingSettle,
      level,
      rankTitle,
    };
  }

  global.BuctRubric = {
    BUCT_MODULES,
    BUCT_MODULE_MAP,
    BUCT_TOTAL_CAP,
    BUCT_RUBRIC_GROUPS,
    BUCT_RUBRIC_ITEMS,
    BUCT_RUBRIC_MAP,
    BUCT_BASELINE_PRESETS,
    getRubricItemsForModule,
    inferModuleKeyFromItem,
    inferRubricForActivity,
    getRubricOptionPresets,
    computeDetailedCreditSummary,
  };
})(window);
