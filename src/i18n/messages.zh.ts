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
import { toDisplaySeatNumber } from "@/lib/seat-number";

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
    /**
     * 主题切换按钮的 aria-label。
     *
     * 【这一条刻意不指向目标主题】写"切换到浅色"就要先知道现在是深色，
     * 而那是纯客户端状态，SSR 首帧读不到（见 theme/ThemeSwitcher.tsx）。
     * 方向由按钮上的日月字形说明。
     */
    toggleTheme: "切换主题",
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
    short: (id: number) => `${toDisplaySeatNumber(id)} 号`,
    named: (id: number, name: string) => `${toDisplaySeatNumber(id)} 号（${name}）`,
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

  auth: {
    title: "登录后开局",
    description: "公开部署使用远程模型。每个邮箱账号默认有 1 局免费额度，确认邮箱后即可开始。",
    loading: "正在确认登录状态…",
    modeLabel: "登录或注册",
    signInTab: "登录",
    signUpTab: "注册",
    email: "邮箱",
    password: "密码",
    signInSubmit: "登录",
    signUpSubmit: "注册",
    submitting: "提交中…",
    googleSignIn: "使用 Google 登录",
    googleSubmitting: "正在跳转 Google…",
    passwordDivider: "或使用邮箱",
    confirmEmail: "确认邮件已经发出。请打开邮箱完成确认，然后回到这里登录。",
    signedIn: "已登录。",
    accountInfo: "账户信息",
    accountDialogDescription: "查看当前账号与对局额度，也可以修改密码或登出。",
    accountCloseAria: "关闭账户信息",
    localMode: "本地模式",
    localModeNote: "未启用账号",
    signOut: "登出",
    signingOut: "登出中…",
    changePassword: "修改密码",
    sendingPasswordReset: "正在发送邮件…",
    passwordResetSent: "修改密码邮件已经发出，请打开邮箱继续。",
    updatePasswordTitle: "修改密码",
    updatePasswordDescription: "从邮箱里的重置链接进入后，在这里设置新密码。",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    updatePasswordSubmit: "保存新密码",
    updatingPassword: "保存中…",
    passwordMismatch: "两次输入的密码不一致",
    passwordUpdated: "密码已更新。下次登录请使用新密码。",
    unknownEmail: "已登录账号",
    creditsLoading: "正在读取额度…",
    creditsTotal: (n: number) => `剩余额度：${n} 局`,
    creditsBreakdown: (free: number, purchased: number) =>
      `免费 ${free} · 购买 ${purchased}`,
    creditsUnavailable: "额度暂时不可用",
    errorPrefix: (message: string) => `认证失败：${message}`,
    userLlm: {
      title: "自带 LLM",
      description:
        "启用后，本次会话的 remote 对局使用你提供的 OpenAI-compatible 配置，不消耗站内对局额度。",
      enabled: "已启用",
      off: "未启用",
      provider: "Provider",
      providerLabel: {
        deepseek: "DeepSeek",
        qwen: "通义千问",
        openai: "OpenAI",
        custom: "自定义兼容接口",
      },
      apiKey: "API Key",
      model: "模型",
      modelPlaceholder: "例如 deepseek-chat / gpt-5-nano",
      baseUrl: "Base URL",
      baseUrlPlaceholder: "留空使用 provider 默认地址",
      temperature: "Temperature",
      temperaturePlaceholder: "0-2，default 表示不发送",
      maxTokens: "Max tokens",
      maxTokensPlaceholder: "留空使用 provider 默认值",
      extraBody: "Extra body JSON",
      extraBodyPlaceholder: '{ "reasoning_effort": "minimal" }',
      sessionOnly: "API Key 只保存在当前页面内存中；刷新页面或关闭标签页后需要重新填写。",
      save: "保存并启用",
      disable: "停用",
      clear: "清空",
      saved: "自带 LLM 已启用。本次会话的新 remote 对局会使用这份配置。",
      disabled: "自带 LLM 已停用。新 remote 对局会改回平台模型。",
      cleared: "自带 LLM 配置已清空。",
      error: {
        API_KEY_REQUIRED: "请填写 API Key",
        MODEL_REQUIRED: "请填写模型名",
        BASE_URL_REQUIRED: "自定义兼容接口必须填写 Base URL",
        BASE_URL_INVALID: "Base URL 必须是 http 或 https 地址",
        TEMPERATURE_INVALID: "Temperature 必须是 0-2 之间的数字，或 default",
        MAX_TOKENS_INVALID: "Max tokens 必须是正整数",
        EXTRA_BODY_INVALID: "Extra body 不是合法 JSON",
        EXTRA_BODY_OBJECT: "Extra body 必须是一个 JSON 对象",
        EXTRA_BODY_RESERVED: "Extra body 不能覆盖 model 或 messages",
      },
    },
  },

  history: {
    title: "历史复盘",
    collapseSidebar: "收起侧栏",
    expandSidebar: "展开侧栏",
    expandHistory: "展开历史复盘",
    loading: "正在读取历史…",
    loadingReview: "正在读取复盘…",
    empty: "remote 对局结束后会自动保存到这里。",
    localModeEmpty: "启用账号登录后，remote 对局复盘会显示在这里。",
    unavailable: "历史复盘暂时不可用",
    saveFailed: "对局已结束，但复盘保存失败",
    delete: "删除复盘",
    deleteTitle: "删除这条复盘？",
    deleteDescription: (title: string) =>
      title ? `将从历史记录中移除「${title}」。这不会恢复已消耗的额度。` : "将从历史记录中移除这条复盘。",
    deleteCancel: "取消",
    deleteConfirm: "删除",
    deleting: "删除中…",
    deleteFailed: "删除复盘失败，请稍后再试",
    deleteAria: (title: string) => `删除复盘：${title}`,
    backHome: "回到首页",
    itemTitle: (endedAt: string, winner: string) => `${endedAt} · ${winner}获胜`,
    score: (good: number, evil: number) => `好人 ${good} / 坏人 ${evil}`,
    calls: (count: number) => `模型调用 ${count} 次`,
    spectated: (playerCount: number) => `${playerCount} 人 · 观战`,
    seated: (playerCount: number, humanSeat: number) =>
      `${playerCount} 人 · 坐 ${toDisplaySeatNumber(humanSeat)} 号`,
    itemAria: (endedAt: string, winner: string, score: string, playerLine: string) =>
      `${endedAt} 的复盘，${winner}获胜，${score}，${playerLine}`,
  },

  /** TutorialModal.tsx。角色逐条说明仍然只来自 roles / describeRole */
  tutorial: {
    trigger: "玩法",
    triggerAria: "打开新手教程",
    title: "阿瓦隆入门",
    description: "四步看懂一局如何推进，以及每个身份究竟能看见谁。",
    stepsLabel: "教程步骤",
    closeAria: "关闭教程",
    previous: "上一步",
    next: "下一步",
    finish: "看完了",
    progress: (current: number, total: number) => `${current} / ${total}`,
    stepAria: (step: number, total: number, title: string) =>
      `第 ${step} 步，共 ${total} 步：${title}`,

    steps: {
      goal: {
        tab: "胜负",
        eyebrow: "先认清终点",
        title: "2个阵营的获胜条件",
        intro: "两边争的不只是任务比分。梅林能否藏到最后，决定好人拿到的三分算不算数。",
        goodTitle: "好人阵营",
        goodBody: "3次任务成功，并且梅林没有被刺客找出。",
        evilTitle: "坏人阵营",
        evilBody: "3次任务失败；或者让同一轮的组队否决达到上限；或者刺客正确找出梅林，任一条都能获胜。",
        note: "“组队”和“任务”的概念请看2和3。所以好人率先拿到 3 分时，对局不会立刻结束——桌上还剩最后一刀。",
      },

      proposal: {
        tab: "组队",
        eyebrow: "一轮任务的前半程",
        title: "名单先过全桌这一关",
        intro: "每轮先决定谁去执行任务。队长能提名单，但不能一个人把名单送上路。",
        leaderTitle: "队长组队",
        leaderBody: "队长按本轮人数挑选队员，可以选自己，也可以不选。",
        discussTitle: "全桌讨论",
        discussBody: "队长说明为什么这样选，其他人依次表态、质疑或辩护。",
        voteTitle: "公开表决",
        voteBody: "所有人同时投同意或反对；同意票必须严格过半，平票也是否决。",
        note:
          "无论提议通过与否，队长都会顺位轮转。否决后本轮重新组队；同一轮达到否决上限时坏人直接获胜。",
      },

      mission: {
        tab: "任务",
        eyebrow: "名单通过之后",
        title: "任务票只公布数量，不公布是谁",
        intro: "只有上队的人交任务票。结算会公开几张成功、几张失败，但不会公开每张票来自谁。",
        goodTitle: "好人只能成功",
        goodBody: "好人的合法选项只有成功；界面不是藏起了另一颗按钮，而是规则根本不允许失败票。",
        evilTitle: "坏人可以伪装",
        evilBody: "坏人可以投失败破坏任务，也可以故意投成功隐藏自己。任务成功不等于队伍里没有坏人。",
        threshold:
          "通常 1 张失败票就会让任务失败；7 人及以上的第 4 轮需要 2 张。即使只有 1 张而任务成功，那张失败票仍证明车上有坏人。",
        assassinationTitle: "三次成功之后：刺杀",
        assassinationBody:
          "第三次成功后不再发言，直接由刺客指定一人。命中梅林，坏人翻盘；刺错，好人才真正获胜。",
      },

      roles: {
        tab: "角色牌与视野",
        eyebrow: "角色视野实验台",
        title: "换一个身份，整张桌子就变了",
        intro:"蓝色为好人阵营的角色，红色为坏人阵营的角色。下面直接展示他开局时拿到的真实受限视角。角色能力与逐条说明和正式对局完全共用。",
        pickerLabel: "选择要查看的角色",
        sampleNote: "这是独立的十人示例桌，不会读取或改变正在进行的对局。",
      },
    },
  },

  /** ThinkingIndicator.tsx。等模型时全屏唯一会动的东西 */
  thinking: {
    title: "AI 正在行动",
    single: (kind: AiDecisionKind, who: string) => `${who}${zh.thinking.kind[kind]}`,
    multiple: (kind: AiDecisionKind, count: number) =>
      `${count} 位 AI ${zh.thinking.kind[kind]}`,
    kind: {
      TEAM_PROPOSAL: "正在选任务名单",
      SPEECH: "正在准备发言",
      VOTE: "正在投票",
      MISSION_CARD: "正在出任务票",
      ASSASSINATION: "正在选择刺杀目标",
    } as Record<AiDecisionKind, string>,
    detail: {
      TEAM_PROPOSAL: "等待队长给出名单和公开说明。",
      SPEECH: "等待当前发言人表态。",
      VOTE: "等待所有人同时完成组队表决，结果会一起公开。",
      MISSION_CARD: "等待上队玩家匿名提交任务票。",
      ASSASSINATION: "等待刺客指定最后的目标。",
    } as Record<AiDecisionKind, string>,
    seconds: (n: number) => `已等待 ${n} 秒`,
  },

  /**
   * 观战模式。SpectatorIntro / SpectatorTable / SpectatorBar / IdentityDeck / MindPanel。
   *
   * 【牌背文案要说清"可以翻"】默认全扣着是刻意的，但一屏扣着的牌如果看不出能点，
   * 观战者只会以为界面没做完。
   */
  spectator: {
    introTitle: "这一桌全是 AI",
    introNote:
      "身份已经发完，但默认全部扣着。想看谁就翻谁——随时可以，翻了也能盖回去。",
    start: "开始观战",
    badge: "观战中",
    exit: "退出观战",

    deckTitle: "身份牌",
    faceDown: "未翻开",
    faceDownHint: "点一下看身份",
    flipAria: (id: number) => `翻开 ${toDisplaySeatNumber(id)} 号的身份`,
    hideAria: (id: number) => `盖上 ${toDisplaySeatNumber(id)} 号的身份`,
    revealAll: "全部翻开",
    hideAll: "全部盖上",
    revealedCount: (n: number, total: number) => `已翻开 ${n} / ${total}`,

    pauseField: "节奏",
    pause: "暂停",
    resume: "继续",
    paused: "已暂停",
    pace: {
      slow: "慢",
      normal: "正常",
      fast: "快",
      instant: "瞬间",
    },

    mindsTitle: "AI 心证",
    mindsExpand: "展开",
    mindsCollapse: "收起",
    /** 【必须明写】翻开 3 号的心证，很可能顺带读到"我知道 5 号是坏人" */
    mindsSpoilerNote: "这里是模型的内心分析，会剧透——包括它对别人身份的判断。",
    mindsEmpty: "先翻开一张身份牌，那一座的心证才会出现在这里。",
    mindsWaiting: "还没有可显示的心证。",
    mindsAuto: "未调用模型",
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
    rejects: "本轮组队失败",
    rejectsAria: (count: number, max: number) =>
      `本轮组队已连续失败 ${count} 次，上限 ${max} 次`,
  },

  /** seat-table-model.ts */
  table: {
    phase: PHASE,
    /** 每个阶段在等人做什么。用于拼「等 3 号出名单」这类句子 */
    verb: {
      ROLE_REVEAL: "确认身份",
      TEAM_BUILDING: "出名单",
      PROPOSAL_DISCUSSION: "发言",
      TEAM_VOTE: "投票",
      MISSION_EXECUTION: "出任务票",
      ASSASSINATION: "决定",
    } as Partial<Record<Phase, string>>,
    /** 进度条的量词。没有的阶段不显示计数 */
    counter: {
      ROLE_REVEAL: "已确认",
      PROPOSAL_DISCUSSION: "已发言",
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
    seatLine: (count: number, id: number) =>
      `${count} 人局 · 你坐 ${toDisplaySeatNumber(id)} 号`,
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

    // 以下是 SpeechFeed.tsx 的
    title: "发言",
    empty: "还没有人开口。",
    silent: SILENT,
    /** 队长的选人说明需要与普通发言分开标记 */
    kind: { proposal: "选人说明" },
    speaker: (id: number, name: string) => `${toDisplaySeatNumber(id)} 号 · ${name}`,
  },

  /**
   * vote-model.ts —— 组队投票的逐人票。
   *
   * 【与 feed 分开一个命名空间】投票卡确实画在发言流里，但同一批文案还要给
   * 票型总表和终局复盘用。塞进 feed 会让"改发言流"和"改票型表"永远撞在一起。
   */
  vote: {
    title: "组队投票",
    approved: "通过",
    rejected: "否决",
    /** 变体强制通过那一次没有人投过票，不能渲染成「0 赞成 / 0 反对却通过了」 */
    forcedNote: "最后一次机会，未投票",
    tally: (approve: number, reject: number) => `${approve} 赞成 / ${reject} 反对`,
    approveLabel: "赞成",
    rejectLabel: "反对",
    /** 某一侧一个人都没有 */
    nobody: "无",
    /** 投票卡读屏的整句 */
    cardAria: (outcome: string, detail: string, approve: string, reject: string) =>
      `组队投票${outcome}，${detail}。赞成：${approve}。反对：${reject}。`,

    // 以下是票型总表 VoteMatrix.tsx 的
    matrixTitle: "票型",
    /** 结果那一列的表头 */
    resultCol: "结果",
    matrixHint: "带底色的格子表示他当时在队伍里，◆ 是那一次的队长。",
    matrixEmpty: "还没有结算过的组队投票。",
    /** 「1-2」= 第 1 轮第 2 次提议。表格里要窄，所以不写成整句 */
    rowLabel: (round: number, attempt: number) => `${round}-${attempt}`,
    rowAria: (label: string, outcome: string, detail: string) =>
      `第 ${label} 次提议，${outcome}，${detail}`,
    cellAria: (seat: string, vote: string, onTeam: boolean) =>
      `${seat} ${vote}${onTeam ? "，当时在队伍里" : ""}`,
    /** 那一行没有人投过票 */
    cellNone: "没有投票",
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
    pickOnTable: "点击左侧圆桌头像选人，再在这里确认名单。",

    team: {
      title: "你是本轮队长",
      hint: (teamSize: number, round: number) =>
        `挑 ${teamSize} 个人去执行第 ${round} 轮任务，可以选自己。`,
      statementHint:
        "这段话就是你在本轮组队讨论里的发言——交了名单，讨论阶段不会再轮到你。",
      placeholder: "为什么是这几个人？",
    },

    speech: {
      title: "轮到你发言",
      hintProposal: "对这支队伍表个态：该不该上，为什么。",
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
    confirm: (id: number, name: string) =>
      `就是他：${toDisplaySeatNumber(id)} 号（${name}）`,
    yourself: "你自己",

    pickOne: "选一个人",
    pickOnTable: "点击左侧圆桌头像选定刺杀目标，再在这里确认。",
    targetPreview: "刺杀目标",
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
      ASSASSINATION: "刺杀",
    } as Record<AiDecisionKind, string>,
    hit: `刺中了${R.MERLIN.label}`,
    miss: "刺空了",
    unknownRole: "身份不明",
    noMerlin: `本局没有${R.MERLIN.label}`,
    merlinIs: (who: string) => `${R.MERLIN.label}是 ${who}`,
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
    /** 观战局没有"你"，上面那两句整块换成这一句 */
    spectated: "这一局你只是看着。",
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
    /**
     * 复盘时间轴。
     *
     * 【原来叫 replayTitle，只讲心证】那一块现在同时装着完整对话，
     * 名字跟着改，免得下一个人以为这里只有 AI 的内心分析。
     */
    reviewTitle: "对局回放",
    reviewNote: "每句话底下是他说这句话时的内心分析。对局进行中，任何人都看不到这些。",
    /** 发言底下那一行心证的前缀 */
    mindLabel: "心证",
    /** 不产生发言的那些决策，按轮次收在末尾 */
    tailTitle: "本轮其余心证（投票 / 任务票 / 刺杀）",
    tailCount: (n: number) => `${n} 次决策 · 点开`,
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
    NOT_YOUR_SEAT: (p) => `不能替座位 ${toDisplaySeatNumber(p.seat)} 行动`,
    TEAM_SIZE: (p) => `本轮任务需要 ${p.need} 人，当前选了 ${p.got} 人`,
    TEAM_DUPLICATE: () => "队伍里有重复座位",
    SEAT_MISSING: (p) => `座位 ${toDisplaySeatNumber(p.seat)} 不存在`,
    VOTE_NOT_OFFERED: () => "这张票不在可选项里",
    GOOD_CANNOT_FAIL: () => "你的阵营不能打失败票",
    BAD_TARGET: (p) => `座位 ${toDisplaySeatNumber(p.seat)} 不是合法的刺杀目标`,
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
    AUTH_REQUIRED: "请先登录，再开始远程模型局",
    GAME_SESSION_REQUIRED: "这局远程模型 session 已失效，请回到开局页重新开始",
    QUOTA_EXHAUSTED: "当前账号没有可用对局额度",
    AI_CALL_LIMIT: "本局模型调用次数已达上限，请重新开局",
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
    modelField: "是否调用模型",
    modelNote:
      "mock 不发网络请求，也不花钱。remote 走 /api/ai，需要先在 .env.local 配好 provider 和 key。",
    modelCallsField: "是否调用模型",
    modelCallsAria: "切换是否调用模型",
    modelCallsOn: "remote · 调用模型",
    modelCallsOff: "mock · 不调用模型",
    /** checkConfig 的 warning。阶段 3 会把 issue.message 也换成结构化的 */
    balanceNote: (message: string) => `${message}。这是平衡性建议，不阻止开局。`,
    /** 不落座时给的一句说明。**不是错误**，所以不拦开局 */
    spectateHint: "不落座就是全 AI 对局，你只看。身份默认全部扣着，随时可以自己翻。",
    /** remote + 观战：全程无人干预，是本项目唯一会自己一路烧到终局的路径 */
    spectateCostNote:
      "观战局的每一手都要调模型，一局大约 60–116 次，中途没有人类回合可以喘口气。remote 模式下请留意花费。",
    standUp: "起身观战",
    sitDown: "坐回桌上",
    personaField: "AI 人设",
    personaNote: "可逐座指定；留作“随机”的座位会在开局时从剩余人设中补齐。",
    personaCount: (selected: number, total: number) => `已指定 ${selected}/${total}`,
    personaClearAll: "全部随机",
    personaSeat: (id: number) => `${toDisplaySeatNumber(id)} 号 AI`,
    personaRandom: "随机指派",
    personaRandomNote: "开局时从尚未使用的人设中抽取，不会与其他座位重复。",
    personaChooseAria: (id: number, name: string) =>
      `${toDisplaySeatNumber(id)} 号 AI，当前人设：${name}`,
    personaDialogTitle: (id: number) =>
      `为 ${toDisplaySeatNumber(id)} 号 AI 挑选人设`,
    personaDialogDescription: "这本名册只决定 AI 的名字、语气与思考习惯，不会透露或改变他的身份牌。",
    personaCloseAria: "关闭人设库",
    personaSearchAria: "搜索人设",
    personaSearchPlaceholder: "搜索姓名、性格、说话风格或推理倾向…",
    personaEmpty: "没有符合条件的人设。",
    personaUsedBy: (id: number) => `${toDisplaySeatNumber(id)} 号已选`,
    personaReasoning: "先看什么：",
    rolePreferenceField: "角色偏好",
    rolePreferenceRandom: "随机角色",
    rolePreferenceChooseAria: (current: string) => `选择角色偏好，当前为${current}`,
    rolePreferenceMissing: (role: string) => `${role}本局没有，开局按随机`,
    submit: "入座",
    spectate: "开始观战",
    starting: "开局中…",
    startRemoteFailed: "无法创建远程模型对局",
    seatAriaSelf: (id: number) => `你的座位，${toDisplaySeatNumber(id)} 号`,
    seatAria: (id: number) => `${toDisplaySeatNumber(id)} 号座位`,
    goodCount: (n: number) => `好人 ${n}`,
    evilCount: (n: number) => `坏人 ${n}`,
    seatHintIdle: "点击任意座位落座，或者直接开始观战",
    seatHintSeated: (id: number) =>
      `点击落座 · 你坐 ${toDisplaySeatNumber(id)} 号 · 再点一次起身`,
    missionsNote: "数字是该轮出任务的人数。",
    doubleFailNote: "带 ✳ 的那轮要 2 张失败票才算失败。",
  },
};

/**
 * 目录的形状。en 声明成 `Messages` 后，漏一个键、多一个键、参数个数写错
 * 都是 `tsc` 错误，不是运行期的静默回退。
 */
export type Messages = typeof zh;
