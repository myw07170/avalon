/**
 * 中文 prompt 语料。**prompt.ts 里一条字面量都没有了，全在这里。**
 *
 * 【为什么不进 `src/i18n` 的那两份目录】docs/todos.md §6.3 写明这是一条
 * "明确的不照抄"。参考项目 wolfcha 把 prompt 全放进 `messages/zh.json`，
 * 我们不这么做，两个理由：
 *
 * 1. `prompt.test.ts` 的三份完整快照，价值在于**逼改的人读一遍 diff**。
 *    挪进一个几千行的 JSON，就再也没人读那个 diff 了。
 * 2. 这里的措辞是**实验结论**不是文案。每一句下面的注释都记着它是哪一局跑出来的：
 *    "别用「作为梅林……」这种开头"、"失败票只可能来自坏人"及其反向、
 *    【输出格式】里钉了三遍的那句约束。翻成另一种语言要**重新做实验**，
 *    不是找个译者的事。
 *
 * 所以它是一个独立的、只被 `prompt.ts` 与 `client.ts` 读的模块，
 * 有自己的 git 历史（`git log --follow` 出来全是文案），有自己的快照。
 *
 * 【改这里之前】先读 docs/rules.md §6 与本文件里的每一条注释。
 * 那些注释不是解释代码，是解释**为什么这句话必须这么说**。
 */
import type { AiDecisionKind, Phase, PlayerId, Role } from "../game/types";

// ---------------------------------------------------------------------------
// 分节
// ---------------------------------------------------------------------------

/**
 * prompt 的十一个段。
 *
 * 【段名是 key 不是字符串】原来 `section("历史", body)` 里那个"历史"同时是**结构**
 * （prompt.test.ts 按 `【】` 切段，断言四个"干净段"里不出现角色名）和**文案**。
 * 分语言之后这两件事必须分开：测试认 key，玩家和模型看语言。
 */
export type SectionKey =
  | "rules"
  | "setup"
  | "identity"
  | "knowledge"
  | "persona"
  | "situation"
  | "history"
  | "speeches"
  | "perspective"
  | "decision"
  | "output";

export const zhPrompt = {
  titles: {
    rules: "游戏",
    setup: "本局配置",
    identity: "你的身份",
    knowledge: "你知道的",
    persona: "你的人设",
    situation: "当前局势",
    history: "历史",
    speeches: "全场发言",
    perspective: "你的视角",
    decision: "本次决策",
    output: "输出格式",
  } as Record<SectionKey, string>,

  /** 段头的排版。英文里换成 markdown 标题——【】在英文段落里读起来是乱码 */
  header: (title: string) => `【${title}】`,
  /** 正文里回指另一段，比如"请严格按【输出格式】重新输出" */
  ref: (title: string) => `【${title}】`,

  // -------------------------------------------------------------------------
  // 通用称呼
  // -------------------------------------------------------------------------

  /** 座位一律用号，从不用名字——名字只在【你的人设】里出现一次 */
  seat: (id: PlayerId) => `座位 ${id}`,
  /** 「座位 0、1、2」。前缀只写一次——十个座位各带一次"座位"既啰嗦又烧 token */
  seatList: (ids: readonly PlayerId[]) =>
    ids.length === 0 ? "无" : `座位 ${ids.join("、")}`,
  nth: (missionIndex: number) => `第 ${missionIndex + 1} 轮`,
  /** 座位后面那个「（你）」。见 speechLine 的注释：不标会让模型跟着怀疑自己 */
  selfMark: (seatText: string) => `${seatText}（你）`,
  good: "好人",
  evil: "坏人",

  /** prompt 侧的阶段名。与 UI 那份**刻意不共用**：这里说给模型听，措辞更书面 */
  phase: {
    SETUP: "准备中",
    ROLE_REVEAL: "查看身份",
    TEAM_BUILDING: "队长组队",
    PROPOSAL_DISCUSSION: "提议讨论",
    TEAM_VOTE: "组队投票",
    MISSION_EXECUTION: "执行任务",
    MISSION_RESULT: "任务结算",
    REVIEW_DISCUSSION: "复盘讨论",
    ASSASSINATION: "刺杀",
    GAME_OVER: "终局",
  } as Record<Phase, string>,

  // -------------------------------------------------------------------------
  // 复用的几段
  // -------------------------------------------------------------------------

  /**
   * 角色专属的策略提醒。
   *
   * 写成一张表而不是散在各分支，理由与 legal.ts 的 PHASE_ACTIONS 同源。
   * 这些**全是策略约束，不是规则**——引擎不会阻止梅林报出坏人名单，
   * 那是策略失误不是非法操作（rules.md §6）。所以它们只能待在 prompt 里。
   */
  roleHints: {
    MERLIN:
      "你知道谁是坏人，但绝不能把名单说得太明——刺客全程在找你，你说得越准，死得越快。用暗示和引导让好人自己得出结论，必要时故意留一点模糊。",
    PERCIVAL:
      "你看到的两个人里只有一个是梅林，另一个是莫甘娜在冒充。别急着替其中一个背书，先看这两人的判断准不准。",
    LOYAL_SERVANT:
      "你的价值在于抓矛盾：谁的发言和投票对不上，谁在任务失败后急着撇清。别怕站错——沉默的好人对好人方没有任何帮助。",
    MORGANA: "派西维尔分不清你和梅林。你可以装作自己掌握着信息，去骗取他的信任。",
    ASSASSIN:
      "终局若好人集齐 3 分，你要指认梅林。全程留意谁的判断准得反常、谁在不该有把握的时候有把握，那多半就是他。",
    MORDRED: "梅林看不到你，这是你最大的优势——你可以放心地把自己表现成一个好人。",
    OBERON:
      "你不认识任何队友，队友也不认识你。你投失败票时很可能误伤同伴，而梅林看得到你，行事要更谨慎。",
    MINION: "你没有特殊能力，你的价值在于配合队友把水搅浑、把好人的判断带偏。",
  } as Record<Role, string>,

  /**
   * 发言长度要求。
   *
   * 刻意写**句子数**而不是字数：中文模型对字数的感知很差，卡"80-150 字"实际会给出 60 或 200，
   * 而这类非致命违规会把 fallback 率推高，污染"fallback 超过 5% 说明 prompt 或 schema 有问题"
   * 这条判据。schema.ts 也只卡非空、不卡长度。参考项目 wolfcha 同样不设字数，
   * 它在人设生成里甚至明令"不要写数字字数区间"。
   */
  speechLength:
    "通常 2-5 句；被追问或只想表个态时，一句话也可以。不必覆盖所有人，也不必显得完美，只说你此刻会在桌上说的话。",

  /**
   * 公开发言的共同约束。SPEECH 与 TEAM_PROPOSAL 的 statement 共用一份。
   *
   * 【为什么要显式写"不要自曝"】首次真实对局里，刺客在公开发言里说"作为刺客，我会观察……"，
   * 梅林说"作为梅林，我会密切关注……"（gpt-5-nano，seed 94938）。
   * `PlayerView` 给的信息完全正确，是 prompt 没说清楚这段话谁能看见——
   * 模型把【你的身份】当成了可以复述的上下文。这是**策略约束不是规则**，引擎不会拦
   * （rules.md §6），所以只能在这里说。
   *
   * 【但不能写成"不许撒谎"】莫甘娜冒充梅林去骗派西维尔是这个游戏的核心玩法之一。
   * 禁的是"说出自己的真实角色"，不是"编造身份"——这两条差一个字，效果差一整局。
   *
   * 【后三条抄自参考项目 wolfcha 的「底线规则」】各自解决一个我们真跑出来的毛病：
   * - 禁场外话术：首两局里几乎每条发言都是"里程碑/时间线/分工/可验证的进度"这种周会黑话。
   *   模型不知道自己在牌桌上，就会退回它最熟的那套语域。反例词直接用我们踩到的那几个。
   * - 禁编造：模型会顺口引用一句根本没人说过的话、一次没发生过的投票，而别人无从核对。
   * - 立场连贯：同一个人上一轮咬定 3 号、下一轮改口却不给理由，整局推理就没法积累。
   *   注意 wolfcha 的写法是"改变判断必须基于新出现的信息"——**不是禁止改口**，
   *   禁止改口会毁掉真实对局：拿到新信息就该改。
   */
  publicSpeechRules: [
    "这段话**所有人都看得见**，包括对面阵营的人。",
    "不要说出自己的真实角色，也不要说明你是怎么拿到这些信息的——说了这局就没得玩了。",
    // 抽象规则对弱模型不够用：第二局仍然出现了"作为梅林，我更关注……"。
    // 直接给反例比再讲一遍道理管用。谈论别人的身份是正常推理，禁的只是给自己贴标签
    "**别用「作为梅林……」「我是刺客……」这种开头给自己贴标签**；谈论别人的身份则完全没问题。",
    "暗示、试探、含糊其辞、甚至冒充别的身份都可以（这本来就是玩法），但不能自曝。",
    "只写你自己要说的那段话：不要复述规则，也不要替别的座位编台词。",
    "**严禁场外话术**：不许用职业类比、行业术语、项目管理黑话。" +
      "别说「里程碑」「分工」「时间线」「可验证的进度」这种词——这是牌桌，不是周会。",
    "**严禁编造**：只能引用本局真实发生过的发言、投票和任务结果。没发生过的事一个字都不许编。",
    "**立场要连贯**：你说的话得和自己之前的发言、投票对得上。" +
      "改主意可以，但必须是因为出现了新信息，并说清楚是哪一条。",
  ].join("\n"),

  // -------------------------------------------------------------------------
  // 各段正文
  // -------------------------------------------------------------------------

  rules: (maxRejects: number) =>
    [
      "你正在玩阿瓦隆——一局隐藏身份的推理游戏，好人与坏人各有阵营目标。",
      "- 好人方获胜：任务成功 3 次，且终局刺客没有刺中梅林。",
      "- 坏人方获胜：任务失败 3 次，或终局刺客刺中梅林，或同一轮组队被连续否决 " +
        `${maxRejects} 次。`,
      "- 每轮流程：队长提名一支队伍 → 全体公开投票 → 上队的人各交一张任务票。",
      "- 投票规则：同意票**严格多于**半数才通过，平票算否决。否决则换下一位队长重新提名。",
      "- 任务票只公开失败票的**数量**，绝不公开是谁投的。只有坏人能投失败票——" +
        "所以一支队伍交出了几张失败票，就说明那车上至少有几个坏人。这笔账全场都算得出来。",
      // 反过来不成立。少了这句，模型会把成功记录当免罪符——
      // 这同样是规则层面的事实，不是替谁算好的本局结论
      "- 但反过来不成立：任务成功**不代表**车上没有坏人，坏人可以故意投成功票来洗白自己。",
      "- 你只知道自己视角内的信息。你不是旁观解说，也不是裁判。",
    ].join("\n"),

  setup: {
    split: (playerCount: number, good: number, evil: number) =>
      `${playerCount} 人局，其中好人 ${good} 人、坏人 ${evil} 人。`,
    compositionItem: (label: string, count: number) => `${label}×${count}`,
    composition: (items: readonly string[]) => `角色构成：${items.join("、")}。`,
    abilitiesTitle: "各角色能力：",
    /** 【每行都标阵营】见 setupSection 的注释：刺客需要"梅林属于哪一边"这个硬锚点 */
    abilityLine: (label: string, team: string, ability: string) =>
      `- ${label}（${team}）：${ability}`,
    missionItem: (nth: string, teamSize: number, failsRequired: number) =>
      `${nth} ${teamSize} 人` +
      (failsRequired > 1 ? `（需 ${failsRequired} 张失败票才算失败）` : ""),
    missions: (items: readonly string[]) => `任务规模：${items.join("；")}。`,
    rejectLimit: (maxRejects: number) =>
      `同一轮最多否决 ${maxRejects} 次，达到即坏人获胜。`,
  },

  identity: {
    line: (seatText: string, name: string, roleLabel: string, team: string) =>
      `你是${seatText}「${name}」，角色是${roleLabel}，属于${team}阵营。`,
    ability: (ability: string) => `能力：${ability}`,
    // 角色名就印在上面这几行里，模型最容易顺手把它复述进公开发言，所以在源头标一次
    secret: "以上这几行只有你自己知道，别人看不到，也不要在公开发言里复述。",
    // 好人不能投失败票是引擎级硬约束（legal.ts 不给这个选项，reduce 里还有第二道保险）。
    // 只在决策那一刻说不够——首次真实对局里好人仍然试了 4 次，所以在身份处再钉一次
    goodCannotFail: "你是好人：只要你上队，任务票就只能是成功。好人交不出失败票。",
  },

  knowledge: {
    none: "你没有任何额外的身份信息，只能靠推理。",
    isEvil: (seatText: string) => `- ${seatText} 是坏人。`,
    /** 两个座位号由 visibility.ts 保证升序，这里**原样输出**，不重排也不加权 */
    merlinOrMorgana: (a: string, b: string, merlin: string, morgana: string) =>
      `- ${a} 和 ${b} 中，一个是${merlin}、一个是${morgana}，但你分不清谁是谁。`,
  },

  persona: {
    name: (name: string) => `名字：${name}`,
    traits: (traits: readonly string[]) => `性格：${traits.join("、")}`,
    speechStyle: (style: string) => `说话风格：${style}`,
    // 隐藏画像才是让五个人说出不同话的那部分：形容词不改变模型关注什么，
    // "最先看票型"和"最先看语气"会（见 types.ts 的 PersonaMind）
    reasoningStyle: (v: string) => `你看局势时最先注意：${v}`,
    speechLengthHabit: (v: string) => `你的话多话少：${v}`,
    pressureStyle: (v: string) => `被点名或被怀疑时，你会：${v}`,
    mistakePattern: (v: string) =>
      `你容易在这里犯错：${v}（不用刻意去犯，但也别假装自己不会）`,
    stayInCharacter: "始终按这个人设说话，不要跳出来解释自己在扮演谁。",
  },

  situation: {
    phase: (phaseLabel: string, nth: string, total: number) =>
      `当前阶段：${phaseLabel}，${nth}任务（共 ${total} 轮）。`,
    score: (good: number, evil: number) =>
      `比分：好人 ${good} : 坏人 ${evil}（先到 3 分）。`,
    leader: (seatText: string, rejectCount: number, maxRejects: number) =>
      `当前队长：${seatText}。本轮已否决 ${rejectCount} 次（上限 ${maxRejects}）。`,
    missionShape: (teamSize: number, failsRequired: number) =>
      `本轮任务需要 ${teamSize} 人上队，${failsRequired} 张失败票即判失败。`,
    proposedTeam: (list: string) => `当前待表决的队伍：${list}。`,
    speakingOrder: (list: string) => `本轮发言顺序：${list}。`,
  },

  history: {
    missionsEmpty: "任务结果：暂无",
    missionsTitle: "任务结果：",
    /** 只有失败票的数量，没有投票者——rules.md §4.3 的最后一条 */
    missionLine: (
      nth: string,
      leader: string,
      team: string,
      failCount: number,
      succeeded: boolean,
    ) =>
      `- ${nth}：${leader} 带队，队伍 ${team}，失败票 ${failCount} 张 → ` +
      `${succeeded ? "任务成功" : "任务失败"}`,
    proposalsEmpty: "组队与投票：暂无",
    proposalsTitle: "组队与投票：",
    proposalHead: (nth: string, attempt: number, leader: string, team: string) =>
      `- ${nth}第 ${attempt} 次提议：${leader} 提名 ${team}`,
    proposalForced: (head: string) => `${head} → 最后一次机会，强制通过（未投票）`,
    proposalResult: (head: string, approved: boolean, yes: string, no: string) =>
      `${head} → ${approved ? "通过" : "否决"}（同意：${yes}；反对：${no}）`,
  },

  speeches: {
    empty: "暂无发言。",
    /** 【只有组队与提议讨论标它】见 attemptLabel 的注释 */
    attempt: (attempt: number) => `第 ${attempt} 次提议 `,
    line: (round: string, attempt: string, phaseLabel: string, who: string, content: string) =>
      `- ${round}${attempt}${phaseLabel} ${who}：${content}`,
  },

  perspective: {
    lead: "以下都是你身上发生过的事，别人不一定会替你提：",
    item: (hint: string) => `- ${hint}`,
    // 下面五条由 perspective.ts 产出。**只给事实 + 要不要提，绝不给立场或结论**
    mentioned: (list: string) => `${list} 在本轮点了你的名，你可以考虑要不要回应。`,
    votedAgainst: (list: string) => `上一次组队投票，${list} 和你投的相反。`,
    onProposedTeam: "这支待表决的队伍把你带上了——你会被要求解释自己凭什么该上。",
    wasOnFailedMission: (nth: number, failCount: number) =>
      `你上过第 ${nth} 轮那趟车，那轮出了 ${failCount} 张失败票——别人多半会拿这件事问你。`,
    neverOnMission: "到现在为止你一次都没上过车。",
  },

  // -------------------------------------------------------------------------
  // 本次决策
  // -------------------------------------------------------------------------

  /**
   * 刺杀环节的两句"再钉一次"。
   *
   * 两局真实对局走到刺杀，两局的刺客都刺了**自己的队友**，白送掉已经到手的胜局。
   * 引擎侧的主因（推测发言进不了视角）在 phases/assassination.ts 修掉了；
   * 这两句补的是 prompt 侧：模型知道"座位 X 是坏人"，却没人告诉它
   * "所以 X 不可能是梅林"。
   */
  merlinIsGood: (merlin: string) =>
    `${merlin}是**好人阵营**的角色。你已经确认是坏人的那些人，还有你自己，都不可能是${merlin}。`,

  /** 刺杀要找的是什么人。用户的原话：不是找坏人，是在好人里找那个"有视角"的 */
  whatMerlinLooksLike:
    "回顾全场，在**好人**里找那个像是「什么都看得见」的人：" +
    "判断准得反常、在不该有把握的时候有把握、" +
    "一直悄悄把队伍从某些人身边引开却说不出过硬的理由。",

  decision: {
    team: {
      lead: (teamSize: number, nth: string) =>
        `轮到你当队长组队。请从全体玩家中选出**恰好 ${teamSize} 人**执行${nth}任务。`,
      candidates: (list: string) => `可选座位：${list}（可以选你自己，也可以不选）。`,
      noDuplicate: "队伍里不能有重复座位。",
      reviewHistory: (historyRef: string) =>
        `组队前先回顾${historyRef}里每一轮的结果，以及每支队伍上过谁——` +
        "哪些人一起上过出失败票的车，是你现在唯一的硬证据。",
      statement: (speechLength: string) =>
        `同时给出一段公开的选人说明（statement），${speechLength}`,
      statementIsSpeech:
        "**这段说明就是你在本次提议讨论里的发言**，会立刻公开给所有人；" +
        "讨论阶段不会再轮到你，所以想说的话现在一次说完。",
    },

    speech: {
      proposal:
        "现在是提议讨论，轮到你发言。队伍已经报出来了，投票还没开始——你的发言会影响别人怎么投。" +
        "**你从任务结果里看出了什么，得自己说出来**——别人不会自动知道你的推理。",
      review: "现在是复盘讨论，轮到你发言。任务结果已经公布，指认、辩解、拉票都可以。",
      requirement: (speechLength: string) => `发言要求：${speechLength}`,
      freedom: "你可以坦诚、含糊、试探、反驳、带节奏、保护别人，或者暂时保留判断。",
    },

    /**
     * 你排第几个说、谁已经说过了。
     *
     * 【为什么值得单独说一句】不给位次的话，模型不知道自己处在什么信息位置：
     * 第一个发言的人会凭空引用"前面几位提到"，最后一个会说"再看看 X 号怎么说"——
     * 而 X 号已经说完了。这两种毛病在首两局的记录里都出现过。
     */
    speakOrder: {
      position: (index: number, total: number) => `你是第 ${index}/${total} 个发言。`,
      first: "你是第一个开口的人，前面没有任何发言可以引用——别说「前面几位提到」。",
      spoken: (spoken: string, pending: string) =>
        `已发言：${spoken}；还没发言：${pending}。`,
      last: "你是最后一个，所有人都已经说完了——别说「等座位 X 发言」或「看座位 X 怎么说」。",
    },

    vote: {
      lead: (team: string) =>
        `对当前队伍 ${team} 投票。全场同时公开，你看不到别人先投了什么。`,
      reviewHistory: (historyRef: string) =>
        `投票前先回顾${historyRef}：这支队伍里有没有人上过出失败票的车？` +
        "几张失败票、同车的还有谁，都要自己算一遍。",
      approve: "同意（approve = true）",
      reject: "反对（approve = false）",
      options: (options: readonly string[]) => `可选：${options.join(" / ")}`,
      rule: "记住：同意票严格多于半数才通过，平票算否决；否决数达到上限坏人直接获胜。",
    },

    mission: {
      lead: "你在本次任务队伍里，请交一张任务票。只公开失败票的数量，不公开是谁投的。",
      success: "成功（success = true）",
      fail: "失败（success = false）",
      options: (options: readonly string[]) => `可选：${options.join(" / ")}`,
      // 好人只有一个选项。说明白"这是你唯一的选项"，比让模型自己发现要省一次无效尝试。
      // 首次真实对局里好人仍然试了 4 次失败票，所以这里连"填了会怎样"一起写死
      onlyOption: "这是你唯一的合法选项：**success 必须填 true**。",
      cannotFail: "填 false 是非法动作，引擎会直接拒绝，你并不能靠它破坏任务。",
    },

    opinion: {
      lead: "好人已经集齐 3 分，进入刺杀环节。刺客动手之前，每个坏人各公开发表一次推测。",
      ask: (merlin: string) => `说出你认为谁是${merlin}，以及你的依据。`,
      /** 推测阶段用：一句话说清哪些人不用再猜了 */
      excludedSelfOnly: (own: string, merlin: string) =>
        `所以别把票投给自己：${own} 不可能是${merlin}。`,
      excluded: (evil: string, own: string) =>
        `所以不用再猜这些人：${evil}（你已知的坏人）、${own}。`,
      ownSeat: (seatText: string) => `${seatText}（你自己）`,
    },

    assassination: {
      lead: (merlin: string) =>
        `你是刺客，这是最后一击：指认一名玩家为${merlin}。命中则坏人翻盘，落空则好人获胜。`,
      /** 目标逐行列出并就地标注，删减一个都不行——legalActions 是合法性的唯一权威 */
      targets: (rows: string) => `可选目标：\n${rows}`,
      targetSelf: (seatText: string, merlin: string) =>
        `- ${seatText}（你自己，不可能是${merlin}）`,
      targetKnownEvil: (seatText: string, merlin: string) =>
        `- ${seatText}（你已知的坏人，不可能是${merlin}）`,
      targetPlain: (seatText: string) => `- ${seatText}`,
    },
  },

  // -------------------------------------------------------------------------
  // 输出格式
  // -------------------------------------------------------------------------

  /**
   * 每个 kind 一份紧凑示例。
   *
   * 刻意不用 z.toJSONSchema：JSON Schema 又长又费 token，对模型的可读性反而更差。
   * 防止示例与 schema.ts 分叉靠测试——prompt.test.ts 会把这里的示例抠出来，
   * 用 AI_SCHEMAS[kind] parse 一遍，分叉当场炸。
   *
   * reasoning 是给模型自己想的，不会公开给其他玩家；content / statement 会公开。
   */
  outputExamples: {
    TEAM_PROPOSAL:
      '{"reasoning":"内心分析，其他玩家看不到","team":[0,2,3],"statement":"公开的选人说明"}',
    SPEECH:
      '{"reasoning":"内心分析，其他玩家看不到","content":"你要公开说出来的话","suspicions":[{"playerId":1,"score":0.8}]}',
    VOTE: '{"reasoning":"内心分析，其他玩家看不到","approve":true}',
    MISSION_CARD: '{"reasoning":"内心分析，其他玩家看不到","success":true}',
    ASSASSIN_OPINION:
      '{"reasoning":"内心分析，其他玩家看不到","content":"你要公开说出来的话","suspicions":[{"playerId":1,"score":0.8}]}',
    ASSASSINATION: '{"reasoning":"内心分析，其他玩家看不到","targetId":2}',
  } as Record<AiDecisionKind, string>,

  /**
   * reasoning 是每个 kind 都要的字段，却一直没有任何长度约束——
   * 一局 60-116 次调用，每次都在为一段没人读的长篇内心分析付时间。
   *
   * **用句子数不用字数**，与【发言长度】那条同源（rules.md §6：中文模型对字数感知很差，
   * 卡字数只会推高 fallback 率）。prompt.test.ts 有一条断言钉着"整个 prompt 不出现字数区间"。
   */
  reasoningLength: "reasoning 一句话就够——它只进复盘面板，不公开给任何人。",

  output: {
    lead: (example: string) =>
      `只输出一个 JSON 对象，不要写任何解释文字，不要用 markdown 代码块。格式：\n${example}`,
    suspicions: "\nsuspicions 可以省略；给的话 score 用 0 到 1 表示怀疑程度。",
    forcedSuccess: (value: boolean) => `\nsuccess 只能填 ${value}，没有第二个选择。`,
    // 【这句话里不能出现角色名】"不在干净段里泄漏身份"那条测试把【输出格式】划进了干净段，
    // 写"不可能是梅林"会当场炸 8 条。那条断言钝得有道理——**它不该为一句措辞让路**，
    // 而这里不提角色名一样说得清楚
    bannedTargets: (list: string) =>
      `\ntargetId 不要填 ${list}——他们是你已知的坏人，或者就是你自己。`,
  },

  // -------------------------------------------------------------------------
  // 重试（client.ts 用）
  // -------------------------------------------------------------------------

  /**
   * schema 没过时**注回模型**的那句话。它属 prompt 语料，不属 UI 文案。
   *
   * 【用 ref 回指段名而不是写死「输出格式」】段名分语言，写死就会在英文 prompt 里
   * 指向一个不存在的段。
   */
  retryFeedback: (detail: string, outputRef: string) =>
    `上一次的输出不合格：${detail}。请严格按${outputRef}重新输出一个 JSON 对象，不要任何解释文字。`,
  noJsonObject: "响应里找不到合法的 JSON 对象",

  // -------------------------------------------------------------------------
  // mock（dev 用，但会渲染进 SpeechFeed）
  // -------------------------------------------------------------------------

  mock: {
    text: (
      name: string,
      seatText: string,
      nth: string,
      topic: string,
      good: number,
      evil: number,
      rejectCount: number,
    ) =>
      `[mock] ${name}（${seatText}）${nth}${topic}：` +
      `当前好人 ${good} 比 ${evil}，本轮已否决 ${rejectCount} 次。`,
    topicProposal: "组队说明",
    topicSpeech: "发言",
    topicOpinion: "刺杀前推测",
    reasoningTeam: (playerCount: number, teamSize: number) =>
      `[mock] 从 ${playerCount} 人里随机挑 ${teamSize} 人`,
    reasoningSpeech: "[mock] 没有策略，按模板发言",
    reasoningOpinion: "[mock] 没有策略，按模板发表推测",
    reasoningVote: (approve: boolean) => `[mock] 随机${approve ? "同意" : "否决"}`,
    reasoningCard: (count: number) => `[mock] 在 ${count} 个合法选项里随机取一个`,
    reasoningStrike: "[mock] 随机指一个座位",
  },
};

export type PromptCopy = typeof zhPrompt;
