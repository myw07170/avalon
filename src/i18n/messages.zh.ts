/**
 * 中文文案目录。**zh 是母版**：`Messages` 类型从它推导，en 必须结构相同。
 *
 * 【为什么是 .ts 而不是 .json】两个理由，都不是风格问题：
 * 1. `vitest.config.mts` 的 include 只收 `.ts` 后缀的测试 —— JSON 目录
 *    落在测试体系之外，而这个项目每一条约束都是靠测试钉住的。
 * 2. 带参数的文案写成函数，参数个数与类型由 `tsc` 检查；写成
 *    `"第 {n} 轮"` 这种 ICU 字符串则没人检查，插值写错要到运行期才知道。
 *
 * 【不要加 as const】加了之后 `Messages` 的每个字段都会变成字面量类型，
 * en 那份就永远也满足不了它。
 *
 * 【组织方式：一个 view-model 一个命名空间】`track` 对 mission-track-model、
 * `table` 对 seat-table-model，以此类推。`seat` / `team` / `common` 是跨文件共用的那几条。
 * 按组件分而不是按"按钮 / 标题 / 提示"分，是因为改一处 UI 时要改的文案恰好聚在一起。
 */
import type { AiErrorCode } from "@/lib/ai/errors";
import type {
  ActionProblem,
  AiDecisionKind,
  ConfigIssueCode,
  ConfigIssueParams,
  EngineErrorCode,
  Phase,
  Role,
  Team,
  WinReason,
} from "@/lib/game/types";

/**
 * 每个 code 一个函数，形参是它自己那一支。
 *
 * 【分配条件类型不是炫技】写成 `(p: ActionProblem) => string` 的话，每个函数都得
 * 先自己收窄一次；写成这样，`TEAM_SIZE` 那条直接就有 `p.need`，而在
 * `NOT_YOUR_SEAT` 里访问 `p.need` 是编译错误。
 */
type ActionProblemMessages = {
  [K in ActionProblem["code"]]: (p: Extract<ActionProblem, { code: K }>) => string;
};
import { ROLE_TEXT } from "./roles";

const R = ROLE_TEXT.zh;

/** ConfigIssue.params.role 在类型上可选，取不到时不该整句崩掉 */
const roleLabel = (role: Role | undefined): string => (role ? R[role].label : "？");

/** 阶段名。seat-table 与 speech-feed 都要用，所以提到外面 */
const PHASE: Record<Phase, string> = {
  SETUP: "准备",
  ROLE_REVEAL: "查看身份",
  TEAM_BUILDING: "组队",
  PROPOSAL_DISCUSSION: "组队讨论",
  TEAM_VOTE: "组队投票",
  MISSION_EXECUTION: "执行任务",
  MISSION_RESULT: "任务结算",
  REVIEW_DISCUSSION: "复盘讨论",
  ASSASSINATION: "刺杀",
  GAME_OVER: "对局结束",
};

/** 在两种表单里出现的同一个词，提出来免得两处分叉 */
const SKIP_LABEL = "不说了";
const SILENT = "（没有开口）";

export const zh = {
  app: {
    title: "阿瓦隆",
    tagline: "一个人，一桌会说话的 AI。",
    /** 语言切换按钮上的字。指向的是**切过去之后**的语言 */
    localeShort: "中",
    /** 切换按钮的 aria-label。同样指向切过去之后的语言 */
    switchTo: "切换到中文",
  },

  /**
   * 角色文案在 roles.ts，这里只是转出去，省得每个 .tsx 再 import 一次。
   * 真正的定义只有一份。
   */
  roles: R,

  /**
   * 座位怎么称呼。
   *
   * 【一律按号，名字只是补充】座位号是全场唯一稳定的指代 —— AI 的发言里
   * 说的也是座位号（见 prompt.ts 的 seat()）。名字放括号里，两边口径才对得上。
   */
  seat: {
    short: (id: number) => `${id} 号`,
    named: (id: number, name: string) => `${id} 号（${name}）`,
    /** 给已经拼好的座位串加上「（你）」 */
    withYou: (base: string) => `${base}（你）`,
    you: "你",
    leader: "队长",
  },

  team: {
    label: { GOOD: "好人阵营", EVIL: "坏人阵营" } as Record<Team, string>,
  },

  common: {
    round: (n: number) => `第 ${n} 轮`,
  },

  /** GameShell.tsx */
  shell: {
    restart: "重开",
  },

  /** ThinkingIndicator.tsx。等模型时全屏唯一会动的东西 */
  thinking: {
    kind: {
      TEAM_PROPOSAL: "在挑人",
      SPEECH: "在想说什么",
      VOTE: "在决定投票",
      MISSION_CARD: "在决定这一票",
      ASSASSIN_OPINION: "在想推测",
      ASSASSINATION: "在决定刺谁",
    } as Record<AiDecisionKind, string>,
    seconds: (n: number) => `（${n} 秒）`,
  },

  /** mission-track-model.ts */
  track: {
    fail: (failCount: number) => `失败 · ${failCount} 败`,
    successWithFails: (failCount: number) => `成功 · ${failCount} 败`,
    success: "成功",
    inProgress: "进行中",
    attempt: (n: number) => `第 ${n} 次提议`,
    rejectWarning: "再被否决一次，坏人直接获胜。",

    // 以下是 MissionTrack.tsx 的
    title: "任务",
    score: (good: number, evil: number, toWin: number) =>
      `好人 ${good} · 坏人 ${evil} · ${toWin} 胜制`,
    good: (n: number) => `好人 ${n}`,
    evil: (n: number) => `坏人 ${n}`,
    toWin: (n: number) => `${n} 胜制`,
    notStarted: "未开始",
    /** 一个任务节点读屏念的整句 */
    nodeAria: (label: string, teamSize: number, doubleFail: boolean, detail: string) =>
      `${label}，${teamSize} 人出任务${doubleFail ? "，需 2 张失败票才算失败" : ""}，${detail}`,
    rejects: "本轮否决",
    rejectsAria: (count: number, max: number) =>
      `本轮已连续否决 ${count} 次，上限 ${max} 次`,
  },

  /** seat-table-model.ts */
  table: {
    phase: PHASE,
    /** 每个阶段在等人做什么。用于拼「等 3 号出名单」这类句子 */
    verb: {
      ROLE_REVEAL: "确认身份",
      TEAM_BUILDING: "出名单",
      PROPOSAL_DISCUSSION: "发言",
      REVIEW_DISCUSSION: "发言",
      TEAM_VOTE: "投票",
      MISSION_EXECUTION: "出任务票",
      ASSASSINATION: "决定",
    } as Partial<Record<Phase, string>>,
    /** 进度条的量词。没有的阶段不显示计数 */
    counter: {
      ROLE_REVEAL: "已确认",
      PROPOSAL_DISCUSSION: "已发言",
      REVIEW_DISCUSSION: "已发言",
      TEAM_VOTE: "已投",
      MISSION_EXECUTION: "已出票",
    } as Partial<Record<Phase, string>>,
    gameOver: "对局已结束。",
    settling: "结算中⋯",
    yourTurn: (verb: string) => `轮到你${verb}。`,
    waitingOne: (who: string, verb: string) => `等 ${who}${verb}。`,
    waitingMany: (count: number, verb: string, includesYou: boolean) =>
      `等 ${count} 人${verb}${includesYou ? "，其中包括你" : ""}。`,
    progress: (counter: string, submitted: number, required: number) =>
      `${counter} ${submitted} / ${required}`,
    roundLabel: (round: number, rejectCount: number, maxRejects: number) =>
      `第 ${round} 轮 · 否决 ${rejectCount} / ${maxRejects}`,

    // 以下是 SeatTable.tsx 的：座位读屏那一句 + 图例
    onTeam: "在队伍里",
    acting: "正在行动",
    done: "已提交",
  },

  /** role-card-model.ts */
  role: {
    /**
     * 座位标记 → 一句人话。
     *
     * 【unsure 那两个座位共用同一句】派西维尔看到的那一对是引擎刻意抹平过的
     * （Knowledge.playerIds 升序存放），文案上给其中一个多一点分量就把答案泄回去了。
     */
    toneLabel: {
      plain: "你不知道他的身份",
      self: "你",
      evil: "你知道他是坏人",
      unsure: `${R.MERLIN.label}与${R.MORGANA.label}二者之一`,
      // 对局中走不到这一档：good 只在终局复盘里用
      good: "好人阵营",
    },
    noKnowledge: "你没有任何额外的身份信息，只能靠推理。",
    isEvilLine: (who: string) => `${who}是坏人。`,
    /** 【两个座位必须完全同等对待】谁在前谁在后是引擎抹平过的，不能加权 */
    merlinOrMorganaLine: (a: string, b: string) =>
      `${a}和${b}中，一个是${R.MERLIN.label}、一个是${R.MORGANA.label}，但你分不清谁是谁。`,
    mordredPresent: (total: number, seen: number) =>
      `本局有 ${total} 个坏人，你只看到 ${seen} 个——${R.MORDRED.label}在场。`,
    mordredAbsent: (total: number) =>
      `本局的 ${total} 个坏人你全看到了，没有${R.MORDRED.label}。`,

    // 以下是 RoleCard.tsx 的
    noSeat: "这一局没有你的座位，观战界面要等阶段 6。",
    seatLine: (count: number, id: number) => `${count} 人局 · 你坐 ${id} 号`,
    start: "记住了，开始",
    tapToReveal: "点击查看身份",
    flipToFront: "翻开查看身份",
    flipToBack: "盖回身份牌",
    knowledgeTitle: "你知道的",
  },

  /** speech-feed-model.ts */
  feed: {
    groupProposal: (round: number, attempt: number) =>
      `第 ${round} 轮 · 第 ${attempt} 次组队`,
    groupReview: (round: number) => `第 ${round} 轮 · 复盘`,
    groupAssassination: PHASE.ASSASSINATION,

    // 以下是 SpeechFeed.tsx 的
    title: "发言",
    empty: "还没有人开口。",
    silent: SILENT,
    /** 三种发言在流里要分得开。普通发言不加标 */
    kind: { proposal: "选人说明", opinion: "刺杀讨论" },
    speaker: (id: number, name: string) => `${id} 号 · ${name}`,
  },

  /** action-panel-model.ts */
  turn: {
    /** 读屏那一句：把座位号、名字、队长、身份认知按同一个顺序说出来 */
    joinSeatParts: (parts: readonly string[]) => parts.join("，"),
    /** 「这一轮要 2 张失败票才算失败。」两处表单共用 */
    failsNote: (failsRequired: number) =>
      `这一轮要 ${failsRequired} 张失败票才算失败。`,

    // 以下是 ActionPanel.tsx 的
    heading: "轮到你",
    /** describeTurn 认不出这一手时的兜底。渲染期不抛，见 action-panel-model 文件头 */
    unsupported: (kind: string) => `这一步（${kind}）面板还画不出来。`,
    picked: (n: number, total: number, full: boolean) =>
      `已选 ${n} / ${total}${full ? "，要换人先取消一个" : ""}`,
    statementLabel: "选人说明",
    speechLabel: "发言",
    submitTeam: "交名单",
    needMore: (n: number) => `还差 ${n} 个人`,
    teamPreview: "本次名单",

    team: {
      title: "你是本轮队长",
      hint: (teamSize: number, round: number) =>
        `挑 ${teamSize} 个人去执行第 ${round} 轮任务，可以选自己。`,
      statementHint:
        "这段话就是你在本轮组队讨论里的发言——交了名单，讨论阶段不会再轮到你。",
      placeholder: "为什么是这几个人？",
    },

    opinion: {
      title: "刺杀前的推测",
      // assassination.ts 把这段话记进公开的 speeches，不是坏人内部的暗票
      hint: `说说你觉得谁是${R.MERLIN.label}。这是公开发言，全场都听得到。`,
      placeholder: `${R.MERLIN.label}最可能是谁？为什么？`,
      skipLabel: SKIP_LABEL,
    },

    speech: {
      title: "轮到你发言",
      hintReview: "任务结果出来了，说说你怎么看这一轮。",
      hintProposal: "对这支队伍表个态：该不该上，为什么。",
      placeholderReview: "这一轮说明了什么？",
      placeholderProposal: "你怎么看这份名单？",
      skipLabel: SKIP_LABEL,
    },

    vote: {
      title: "表决这支队伍",
      hint: "全场同时投，你看不到别人先投了什么。结果一起公开。",
      approve: "赞成",
      approveDetail: "让这支队伍去执行任务",
      reject: "反对",
      rejectDetail: "否决名单，队长顺延给下一位",
      warning: (rejectCount: number) =>
        `本轮已经否决 ${rejectCount} 次。再否一次就撞上上限，坏人直接获胜。`,
    },

    mission: {
      title: (round: number) => `你在第 ${round} 轮任务里`,
      hint: "你的票是匿名的，公开出去的只有成功和失败各几张。",
      success: "任务成功",
      successDetail: "投一张成功票",
      fail: "任务失败",
      failDetail: "投一张失败票",
      // 一颗孤零零的按钮看起来像界面把另一个选项藏了，得说清楚它压根不存在
      onlySuccessNote:
        "你是好人，只能投成功。这是引擎层面的硬约束，不是界面把选项藏起来了。",
    },

    assassination: {
      title: `指认${R.MERLIN.label}`,
      // rules.md §4.5 允许指自己和队友，就是为了不出现"没有合法目标"的死局
      hint:
        `好人已经拿下三轮。指对${R.MERLIN.label}，坏人当场翻盘；指错，好人获胜。` +
        `队友和你自己也在名单里。`,
    },
  },

  /** assassination-model.ts */
  strike: {
    riskSelf: `你不可能是${R.MERLIN.label}。刺中自己，好人直接获胜。`,
    riskAlly: "他是你的队友。刺中队友，好人直接获胜。",
    allKnown: (total: number) =>
      `本局 ${total} 个坏人你全认得，名单上其余的人都是好人。`,
    someHidden: (total: number, known: number, unknown: number) =>
      `本局有 ${total} 个坏人：你、你认得的 ${known} 个队友，` +
      `还有 ${unknown} 个你也认不出来的——${R.OBERON.label}在场，他同样不可能是${R.MERLIN.label}。`,
    pickSomeone: "先选一个人",
    confirm: (id: number, name: string) => `就是他：${id} 号（${name}）`,
    yourself: "你自己",

    // 以下是 AssassinationModal.tsx 的
    openPanel: "打开刺杀面板",
    reopenNote: "关掉面板可以回去重读发言，随时能再打开；选好的目标会留着。",
    lastStep: "最后一步",
    pickOne: "选一个人",
    thinkAgain: "再想想",
    opinionsTitle: "刚才的推测",
    allSilent: (n: number) => `${n} 个队友都没有开口，这一刀只能靠你自己。`,
    silent: SILENT,
  },

  /** game-over-model.ts */
  gameOver: {
    winner: (teamLabel: string) => `${teamLabel}获胜`,
    /** 四种终局各一句。WinReason 是闭合联合，加一种会在这里变成编译错误 */
    reason: {
      THREE_MISSIONS: "坏人破坏了三次任务",
      REJECT_LIMIT: "同一轮里连续否决撞上了上限，视为坏人获胜",
      ASSASSINATION_HIT: `好人做完了三次任务，但${R.ASSASSIN.label}认出了${R.MERLIN.label}`,
      ASSASSINATION_MISS: `好人做完了三次任务，${R.ASSASSIN.label}没能认出${R.MERLIN.label}`,
    } as Record<WinReason, string>,
    kind: {
      TEAM_PROPOSAL: "组队",
      SPEECH: "发言",
      VOTE: "投票",
      MISSION_CARD: "任务票",
      ASSASSIN_OPINION: "刺杀推测",
      ASSASSINATION: "刺杀",
    } as Record<AiDecisionKind, string>,
    hit: `刺中了${R.MERLIN.label}`,
    miss: "刺空了",
    unknownRole: "身份不明",
    noMerlin: `本局没有${R.MERLIN.label}`,
    merlinIs: (who: string) => `${R.MERLIN.label}是 ${who}`,
    silent: SILENT,
    missionSuccess: "成功",
    missionSuccessWithFails: (failCount: number) => `成功 · ${failCount} 张失败票`,
    missionFail: (failCount: number) => `失败 · ${failCount} 张失败票`,
    flagSchema: "schema 兜底",
    flagRescued: "合法性兜底",
    flagAuto: "未调用模型",

    // 以下是 GameOverPanel.tsx 的
    title: "对局结束",
    again: "再来一局",
    noSeat: "这一局没有你的座位，所以没有可复盘的视角。",
    youAre: (roleLabel: string) => `你是${roleLabel}，`,
    youWon: "你赢了",
    youLost: "你输了",
    strikeTitle: "刺杀",
    /** 「3 号（孙娜）指认了 5 号（李明），那一座是」——后面接角色名，再接命中与否 */
    strikeLine: (assassin: string, target: string) => `${assassin} 指认了 ${target}，那一座是`,
    /** 上一句的句号。中英文的标点不一样，所以也要走目录 */
    period: "。",
    allRoles: "全部身份",
    seatRole: (seat: string, role: string) => `${seat}：${role}`,
    opinionLine: (who: string, content: string) => `${who}：${content}`,
    failSourceTitle: "任务票来源",
    onTeam: (labels: readonly string[]) => `上车：${labels.join("、")}`,
    failedBy: (labels: readonly string[]) => `投了失败票：${labels.join("、")}`,
    timingTitle: "AI 思考耗时",
    timingRow: (count: number, avg: string, max: string) =>
      `${count} 次 · 平均 ${avg} · 最慢 ${max}`,
    timingSummary: (asked: number, total: string, auto: number) =>
      `共调用模型 ${asked} 次，合计 ${total}；另有 ${auto} 次只有一个合法动作，没有调用模型。`,
    replayTitle: "AI 心证回放",
    replayCount: (n: number) => `${n} 次决策 · 点开`,
  },

  /**
   * 误点时弹的那句话。每一条对 store 里 validateHumanAction 的一个判定分支。
   *
   * 【类型上按 code 收窄】每个函数只吃自己那一支的形状，
   * 参数写错是 tsc 错误而不是运行期的 undefined。
   */
  actionProblem: {
    WRONG_ACTION: (p) => `现在不能做 ${p.got}，可做的是 ${p.allowed.join(" / ")}`,
    SYSTEM_ACTION: (p) => `${p.got} 不该由界面提交`,
    NOT_YOUR_SEAT: (p) => `不能替座位 ${p.seat} 行动`,
    TEAM_SIZE: (p) => `本轮任务需要 ${p.need} 人，当前选了 ${p.got} 人`,
    TEAM_DUPLICATE: () => "队伍里有重复座位",
    SEAT_MISSING: (p) => `座位 ${p.seat} 不存在`,
    VOTE_NOT_OFFERED: () => "这张票不在可选项里",
    GOOD_CANNOT_FAIL: () => "你的阵营不能打失败票",
    BAD_TARGET: (p) => `座位 ${p.seat} 不是合法的刺杀目标`,
    NO_GAME: () => "没有可运行的对局",
  } satisfies ActionProblemMessages as ActionProblemMessages,

  /**
   * 引擎异常按 code 给的一句人话。
   *
   * 【不翻 EngineError.message】那是拿引擎内部状态拼出来的诊断
   * （"跑了 5000 步还没结束，停在 TEAM_VOTE"），任何语言的玩家都读不懂，
   * 也不该读到。原文只进 console.error，玩家看到的是这一句 + code。
   */
  engineError: {
    ILLEGAL_PHASE: "这一步在当前阶段做不了",
    NOT_YOUR_TURN: "还没轮到这个座位",
    INVALID_TEAM: "这支队伍不合法",
    DUPLICATE_SUBMISSION: "这一步已经提交过了",
    GOOD_CANNOT_FAIL: "好人不能打失败票",
    INVALID_TARGET: "这个刺杀目标不合法",
    CONFIG_INVALID: "这份对局配置不合法，改完再开局",
    INTERNAL: "引擎出了意料之外的问题，这一局跑不下去了",
  } as Record<EngineErrorCode, string>,

  /**
   * 模型层出问题时给玩家的一句话。
   *
   * 【说的是"你能做什么"，不是"发生了什么"】AiError.message 里是环境变量名和
   * HTTP 状态码，那些进 console 给排查的人看。玩家需要知道的只有下一步该干什么：
   * 是去改 .env.local，还是等一会儿再试。
   */
  aiError: {
    CONFIG_MISSING: "服务端还没配好真实模型，先在 .env.local 里配 provider 和 key，或改用 mock",
    PROVIDER_REJECTED: "模型服务拒绝了这次调用，多半是 key、模型名或余额的问题",
    PROVIDER_UNAVAILABLE: "连不上模型服务，或者它暂时不可用。过一会儿再试",
    BAD_REQUEST: "这次请求模型服务没法处理，详情在浏览器控制台",
  } as Record<AiErrorCode, string>,

  /**
   * checkConfig 产出的每一条问题。
   *
   * 【引擎只给 code + params，句子在这里拼】那些消息会被 SetupScreen 逐字渲染给玩家，
   * 也就是玩家文案，得跟着语言走。引擎不产出人类语言。
   */
  configIssue: {
    PLAYER_COUNT_UNSUPPORTED: (p: ConfigIssueParams) =>
      `人数必须是 ${p.min}-${p.max} 之间的整数，当前为 ${p.playerCount}`,
    ROLE_COUNT_MISMATCH: (p: ConfigIssueParams) =>
      `角色数量 ${p.roleCount} 与人数 ${p.playerCount} 不符`,
    TEAM_SPLIT_MISMATCH: (p: ConfigIssueParams) =>
      `${p.playerCount} 人局应为好人 ${p.expectedGood} 坏人 ${p.expectedEvil}，` +
      `当前为好人 ${p.good} 坏人 ${p.evil}`,
    ROLE_BOUND_VIOLATION: (p: ConfigIssueParams) =>
      p.min === p.max
        ? `${roleLabel(p.role)}必须恰好 ${p.min} 个，当前 ${p.n} 个`
        : `${roleLabel(p.role)}数量须在 ${p.min}-${p.max} 之间，当前 ${p.n} 个`,
    MISSION_TABLE_MISMATCH: (p: ConfigIssueParams) =>
      `任务配置与 ${p.playerCount} 人局的规则表不符`,
    BELOW_RECOMMENDED_COUNT: (p: ConfigIssueParams) =>
      `${roleLabel(p.role)}建议 ${p.recommended} 人以上使用，当前 ${p.playerCount} 人`,
  } as Record<ConfigIssueCode, (p: ConfigIssueParams) => string>,

  /** SetupScreen.tsx。唯一一屏没有对应 view-model 的（setup-model 里全是逻辑） */
  setup: {
    playerCount: "人数",
    freeEvilSlots: (n: number) => `坏人自由位 ${n} 个`,
    freeEvilAria: "坏人自由位",
    fixedEvil: `该人数配置固定，坏人恒为${R.MORGANA.label}与${R.ASSASSIN.label}。`,
    rolesField: "本局角色",
    missionsField: "任务",
    modelField: "模型",
    modelNote:
      "mock 不发网络请求，也不花钱。remote 走 /api/ai，需要先在 .env.local 配好 provider 和 key。",
    /** checkConfig 的 warning。阶段 3 会把 issue.message 也换成结构化的 */
    balanceNote: (message: string) => `${message}。这是平衡性建议，不阻止开局。`,
    pickSeatFirst: "先选一个座位。全 AI 观战局引擎已经支持，但观战界面要等阶段 6。",
    busy: "正在生成人设…",
    submit: "入座",
    seatAriaSelf: (id: number) => `你的座位，${id} 号`,
    seatAria: (id: number) => `${id} 号座位`,
    goodCount: (n: number) => `好人 ${n}`,
    evilCount: (n: number) => `坏人 ${n}`,
    seatHintIdle: "点击落座",
    seatHintSeated: (id: number) => `点击落座 · 你坐 ${id} 号 · 再点一次起身`,
    missionsNote: "数字是该轮出任务的人数。",
    doubleFailNote: "带 ✳ 的那轮要 2 张失败票才算失败。",
  },
};

/**
 * 目录的形状。en 声明成 `Messages` 后，漏一个键、多一个键、参数个数写错
 * 都是 `tsc` 错误，不是运行期的静默回退。
 */
export type Messages = typeof zh;
