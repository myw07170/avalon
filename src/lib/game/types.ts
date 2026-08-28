/**
 * 阿瓦隆核心类型定义
 *
 * 本文件的核心是 GameState 与 PlayerView 的分离：
 * - GameState 是引擎的全知视角，包含所有身份和匿名票的真实来源
 * - PlayerView 是单个玩家的受限视角，是构建 AI prompt 的唯一合法输入
 *
 * 任何把 GameState 传给 LLM 的代码都是 bug，即使它"看起来能跑"。
 *
 * 三条贯穿全文件的约定：
 * 1. 只有「已结算」的信息才可以进入 PlayerView。未结算的中间态（pending）一律留在 GameState。
 * 2. 任何"顺序"都可能泄漏身份。派西维尔看到的两人、任务的匿名票，都必须按 id 升序排列，
 *    不能保留"梅林在前 / 提交先后"的原始顺序。
 * 3. 引擎不做容错。非法输入抛 EngineError，不静默修正。
 */

export type PlayerId = number;

export type Team = "GOOD" | "EVIL";

export type Role =
  | "MERLIN"
  | "PERCIVAL"
  | "LOYAL_SERVANT"
  | "MORGANA"
  | "ASSASSIN"
  | "MORDRED"
  | "OBERON"
  | "MINION";

export const ROLE_TEAM: Record<Role, Team> = {
  MERLIN: "GOOD",
  PERCIVAL: "GOOD",
  LOYAL_SERVANT: "GOOD",
  MORGANA: "EVIL",
  ASSASSIN: "EVIL",
  MORDRED: "EVIL",
  OBERON: "EVIL",
  MINION: "EVIL",
};

/**
 * 角色的引擎侧元数据。
 *
 * 【label 与 ability 不在这里，在 `src/i18n/roles.ts`】那两个字段是纯展示：
 * 引擎的任何判定都不该读它们，而且它们要分语言 —— 整张表 locale 化会逼着
 * `optional` 跟着复制两份，还会把语言这一维拖进 config.ts 的构成函数，
 * 那些函数和语言毫无关系。
 *
 * 留在这里的两个字段都有判定用途：`team` 供阵营判定，`optional` 供 getEvilOptions。
 */
export interface RoleMeta {
  team: Team;
  /** 是否为可选角色（忠臣/爪牙是填充位，莫德雷德/奥伯伦按人数启用） */
  optional: boolean;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  MERLIN: { team: "GOOD", optional: false },
  PERCIVAL: { team: "GOOD", optional: false },
  LOYAL_SERVANT: { team: "GOOD", optional: true },
  MORGANA: { team: "EVIL", optional: false },
  ASSASSIN: { team: "EVIL", optional: false },
  MORDRED: { team: "EVIL", optional: true },
  OBERON: { team: "EVIL", optional: true },
  MINION: { team: "EVIL", optional: true },
};

export type Phase =
  | "SETUP"
  | "ROLE_REVEAL"
  | "TEAM_BUILDING"
  | "PROPOSAL_DISCUSSION"
  | "TEAM_VOTE"
  | "MISSION_EXECUTION"
  | "MISSION_RESULT"
  | "REVIEW_DISCUSSION"
  | "ASSASSINATION"
  | "GAME_OVER";

/** 需要按座位顺序逐人发言的阶段，发言调度逻辑对这两个阶段完全共用 */
export type DiscussionPhase = "PROPOSAL_DISCUSSION" | "REVIEW_DISCUSSION";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

/** 每轮任务的规模与失败门槛，由人数配置表查出 */
export interface MissionConfig {
  teamSize: number;
  /** 判定失败所需的失败票数，默认 1，7 人以上第 4 轮为 2 */
  failsRequired: number;
}

export interface GameConfig {
  playerCount: number;
  /**
   * 本局使用的角色池，长度必须等于 playerCount。
   * 这是「配置」不是「分配」——谁拿到哪个角色由 SETUP 阶段用注入的 rng 洗牌决定。
   */
  roles: Role[];
  /** 长度恒为 5 */
  missions: MissionConfig[];
  /** 同一轮内允许的最大否决次数，达到则坏人获胜。默认 5 */
  maxRejects: number;
  /** 变体：最后一次提议强制通过、不投票。默认 false */
  forcePassOnLastAttempt: boolean;
  /**
   * 复现用随机种子。引擎自身不持有 rng，但把种子记进状态，
   * 使「同一种子 + 同一动作序列 == 同一局」成立，回放测试依赖这条。
   */
  seed: number;
}

// --- 配置的自定义与校验 -----------------------------------------------------
//
// rules.md §3.2 的推荐配置是「默认值」，不是唯一合法值。
// 锁定项：好人/坏人名额按 §2；梅林、派西维尔、莫甘娜、刺客各恰好 1。
// 可调项：莫德雷德 0-1、奥伯伦 0-1、爪牙 0 至填满。
// 忠臣数量由好人名额减去梅林和派西维尔算出，不由用户指定。

/** 数量可由用户调整的角色。其余角色的数量被规则或名额算死 */
export type AdjustableRole = "MORDRED" | "OBERON" | "MINION" | "LOYAL_SERVANT";

/** 各角色的数量上下界，min === max 表示锁定 */
export interface RoleBound {
  min: number;
  max: number;
}

/** 角色数量表。缺席的角色计 0 而不是 undefined，countsToRoles 依赖这条 */
export type RoleCounts = Record<Role, number>;

export type ConfigIssueCode =
  /** playerCount 不在 5-10 */
  | "PLAYER_COUNT_UNSUPPORTED"
  /** roles.length !== playerCount */
  | "ROLE_COUNT_MISMATCH"
  /** 好坏人数与 §2 表格不符 */
  | "TEAM_SPLIT_MISMATCH"
  /** 某角色数量越出 ROLE_BOUNDS */
  | "ROLE_BOUND_VIOLATION"
  /** missions 与 §2 表格不符 */
  | "MISSION_TABLE_MISMATCH"
  /** 仅 warning：莫德雷德用在 7/8 人局，rules.md §3.1 建议 9 人以上 */
  | "BELOW_RECOMMENDED_COUNT";

/**
 * 配置的单条问题。
 * severity "error" 阻止开局；"warning" 只提示，不拦。
 */
/**
 * 渲染一条 ConfigIssue 要用到的数字与角色。
 *
 * 【为什么不是一句拼好的话】这条 issue 会被 SetupScreen 逐字渲染给玩家，
 * 也就是说它是**玩家文案**，得跟着语言走。而引擎不该产出人类语言：
 * 它给出 code + 参数，句子在 `src/i18n` 里拼。
 */
export interface ConfigIssueParams {
  playerCount?: number;
  roleCount?: number;
  min?: number;
  max?: number;
  n?: number;
  good?: number;
  evil?: number;
  expectedGood?: number;
  expectedEvil?: number;
  recommended?: number;
  role?: Role;
}

export interface ConfigIssue {
  severity: "error" | "warning";
  code: ConfigIssueCode;
  params: ConfigIssueParams;
  /** 相关角色，UI 高亮用 */
  roles?: Role[];
}

/**
 * 玩家点了一个不合法的东西，被界面拦下来的原因。
 *
 * 【为什么和 ConfigIssue、EngineErrorCode 放在一起】三者是同一类东西：
 * "某件事为什么不允许"的**结构化答案**。引擎与 store 都不产出人类语言，
 * 句子一律在 `src/i18n` 里拼——那是唯一知道当前语言的地方。
 *
 * 【判定逻辑不在这里】`validateHumanAction` 在 store/game.ts：它要读 HumanTurn，
 * 那是驱动层的概念。这里只有形状。
 */
export type ActionProblem =
  | { code: "WRONG_ACTION"; got: GameAction["type"]; allowed: GameAction["type"][] }
  | { code: "SYSTEM_ACTION"; got: GameAction["type"] }
  | { code: "NOT_YOUR_SEAT"; seat: PlayerId }
  | { code: "TEAM_SIZE"; need: number; got: number }
  | { code: "TEAM_DUPLICATE" }
  | { code: "SEAT_MISSING"; seat: PlayerId }
  | { code: "VOTE_NOT_OFFERED" }
  | { code: "GOOD_CANNOT_FAIL" }
  | { code: "BAD_TARGET"; seat: PlayerId }
  | { code: "NO_GAME" };

export type ActionProblemCode = ActionProblem["code"];

/** 随机源。引擎所有随机行为都必须走它，方便测试注入固定序列 */
export type RngFn = () => number;

/**
 * 人设的隐藏画像：这个人**打牌**时是什么样，而不是他长什么样。
 *
 * 字段取自参考项目 wolfcha 的 persona/playerMind——它那 14 个字段真正在起作用的就是这几类：
 * 先注意什么、话多话少、被逼时怎么反应、会在哪儿犯错。
 * 五个 AI 说一样的话，一半原因是它们拿到的人设只有"谨慎保守"这种形容词，
 * 而形容词不改变模型关注什么。
 *
 * 【全部写自然语言，不写标签】不要 high/low/aggressive，也**不要写字数区间**
 * （rules.md §6：中文模型对字数的感知很差，卡字数只会推高 fallback 率）。
 *
 * 不进 PlayerView——它由 orchestrator 单独交给 AI 层，所以加字段不影响信息隔离。
 */
export interface PersonaMind {
  /** 最先注意什么：票型、发言口气、上车次数、位置关系…… */
  reasoningStyle: string;
  /** 平时、被追问、被指认时的长短变化 */
  speechLengthHabit: string;
  /** 被点名或被怀疑时怎么反应 */
  pressureStyle: string;
  /** 常见误判点——刻意给缺陷，真人本来就会犯错 */
  mistakePattern: string;
}

export interface Persona {
  name: string;
  /** 性格标签，如 "谨慎保守" "咄咄逼人" */
  traits: string[];
  /** 说话风格，注入 prompt */
  speechStyle: string;
  /** 头像标识，UI 用 */
  avatar?: string;
  /** 打牌时的隐藏画像。占位人设没有，真实对局由 ai/personas.ts 生成 */
  mind?: PersonaMind;
}

export interface Player {
  id: PlayerId;
  name: string;
  role: Role;
  isHuman: boolean;
  /** AI 玩家的人设，人类玩家为 null */
  persona: Persona | null;
}

// ---------------------------------------------------------------------------
// 引擎全知状态
// ---------------------------------------------------------------------------

export interface MissionCard {
  playerId: PlayerId;
  success: boolean;
}

export interface MissionRecord {
  missionIndex: number;
  /** 该轮第几次提议最终通过，从 0 开始。复盘时能看出"这队是第几次才过的" */
  attempt: number;
  leaderId: PlayerId;
  team: PlayerId[];
  /**
   * 引擎内部保留投票来源，用于终局复盘；绝不进入 PlayerView。
   * 存储时按 playerId 升序，不保留提交先后顺序。
   */
  cards: MissionCard[];
  failCount: number;
  succeeded: boolean;
}

export interface ProposalRecord {
  missionIndex: number;
  /** 该轮中的第几次提议，从 0 开始 */
  attempt: number;
  leaderId: PlayerId;
  team: PlayerId[];
  /** 组队投票是公开的，结算后可以进入 PlayerView */
  votes: Record<PlayerId, boolean>;
  approved: boolean;
  /** 变体 forcePassOnLastAttempt 触发的强制通过，此时 votes 为空 */
  forced: boolean;
}

export interface Speech {
  /** 全局递增序号，UI 排序与 React key 用 */
  seq: number;
  playerId: PlayerId;
  phase: Phase;
  missionIndex: number;
  /** 提议讨论对应当次提议；复盘讨论记该轮最后一次提议的 attempt */
  attempt: number;
  content: string;
}

export interface AssassinationRecord {
  /** 刺杀前坏人各自的一次公开推测，按发言顺序 */
  opinions: Array<{ playerId: PlayerId; content: string }>;
  assassinId: PlayerId;
  targetId: PlayerId;
  hit: boolean;
}

export type WinReason =
  /** 好人完成 3 次任务且刺杀落空 —— 只与 winner=GOOD 同时出现 */
  | "ASSASSINATION_MISS"
  /** 坏人破坏 3 次任务 */
  | "THREE_MISSIONS"
  /** 刺客命中梅林 */
  | "ASSASSINATION_HIT"
  /** 同一轮否决次数达到上限 */
  | "REJECT_LIMIT";

/**
 * 各阶段的未结算中间态。
 *
 * 单独收进一个对象，是为了让「进入新阶段必须清空 pending」这件事在代码里一眼可见，
 * 也让信息隔离测试变得简单：断言 PlayerView 序列化后不含 pending 的任何内容即可。
 */
export interface PendingState {
  /** ROLE_REVEAL：已确认查看身份的玩家 */
  acknowledged: PlayerId[];
  /**
   * TEAM_VOTE：已投但未公开的票。
   * 组队投票虽然"公开"，但必须同时公开——先投的人的选择不能被后投的人看到，
   * 否则 AI 会退化成跟票。全员投完后一次性写入 proposalHistory。
   */
  votes: Record<PlayerId, boolean>;
  /** MISSION_EXECUTION：已提交但未结算的任务票 */
  cards: MissionCard[];
  /** 讨论阶段的发言顺序（座位序，从当前队长开始），进入阶段时一次性算好 */
  speakingOrder: PlayerId[];
  /** speakingOrder 的游标，等于其长度表示本阶段发言完毕 */
  speakerIndex: number;
  /** ASSASSINATION：坏人已发表的推测意见 */
  assassinOpinions: Array<{ playerId: PlayerId; content: string }>;
}

/**
 * 每次都返回新对象。不要导出一个共享常量——
 * 那样多处 `pending: EMPTY_PENDING` 会共用同一个 votes 对象，
 * 在引擎某处不小心原地改动时会串局，而且极难查。
 */
export function createPending(): PendingState {
  return {
    acknowledged: [],
    votes: {},
    cards: [],
    speakingOrder: [],
    speakerIndex: 0,
    assassinOpinions: [],
  };
}

export interface GameState {
  config: GameConfig;
  players: Player[];
  phase: Phase;

  /** 当前是第几轮任务，0-4 */
  missionIndex: number;
  currentLeaderId: PlayerId;
  /** 当前轮已被否决的次数。提议通过时归零，新一轮开始时也归零 */
  rejectCount: number;

  /** 当前待表决的队伍，TEAM_BUILDING 阶段为 null */
  proposedTeam: PlayerId[] | null;

  /** 各阶段未结算数据，进入新阶段时重置相关字段 */
  pending: PendingState;

  proposalHistory: ProposalRecord[];
  missionHistory: MissionRecord[];
  speeches: Speech[];

  goodScore: number;
  evilScore: number;

  assassination: AssassinationRecord | null;
  winner: Team | null;
  winReason: WinReason | null;

  /** 供 UI 时间线渲染的结构化事件流。引擎判定逻辑不读它，只追加 */
  log: GameEvent[];
}

// ---------------------------------------------------------------------------
// 事件流（UI 时间线 / 回放）
// ---------------------------------------------------------------------------

export type GameEvent =
  | { kind: "GAME_STARTED"; playerCount: number }
  | { kind: "LEADER_CHANGED"; leaderId: PlayerId; missionIndex: number }
  | { kind: "TEAM_PROPOSED"; leaderId: PlayerId; team: PlayerId[]; attempt: number }
  | { kind: "SPEECH"; seq: number; playerId: PlayerId }
  | {
      kind: "VOTE_RESOLVED";
      approved: boolean;
      votes: Record<PlayerId, boolean>;
      rejectCount: number;
    }
  | {
      kind: "MISSION_RESOLVED";
      missionIndex: number;
      succeeded: boolean;
      failCount: number;
    }
  | { kind: "ASSASSINATION"; assassinId: PlayerId; targetId: PlayerId; hit: boolean }
  | { kind: "GAME_OVER"; winner: Team; reason: WinReason };

// ---------------------------------------------------------------------------
// 玩家受限视角 —— AI prompt 的唯一合法输入
// ---------------------------------------------------------------------------

/**
 * 某玩家对另一玩家身份的已知信息。
 *
 * MERLIN_OR_MORGANA 的 playerIds 必须按 id 升序存放。
 * 若按 [梅林, 莫甘娜] 的顺序生成，派西维尔的 prompt 就直接泄漏了答案——
 * 这是本项目最隐蔽的信息泄漏点，务必在可见性测试里单独断言。
 */
export type Knowledge =
  | { kind: "IS_EVIL"; playerId: PlayerId }
  | { kind: "MERLIN_OR_MORGANA"; playerIds: [PlayerId, PlayerId] };

/** 公开的任务记录：只有失败票数量，没有投票者 */
export interface PublicMissionRecord {
  missionIndex: number;
  attempt: number;
  team: PlayerId[];
  leaderId: PlayerId;
  failCount: number;
  succeeded: boolean;
}

/** 公开的提议记录。已结算的提议，投票内容完全公开 */
export interface PublicProposalRecord {
  missionIndex: number;
  attempt: number;
  leaderId: PlayerId;
  team: PlayerId[];
  votes: Record<PlayerId, boolean>;
  approved: boolean;
  forced: boolean;
}

export interface PlayerView {
  selfId: PlayerId;
  selfRole: Role;
  selfTeam: Team;
  /** 由 getKnownIdentities 计算，不同角色内容不同 */
  knowledge: Knowledge[];

  phase: Phase;
  missionIndex: number;
  currentLeaderId: PlayerId;
  rejectCount: number;
  maxRejects: number;

  players: Array<{ id: PlayerId; name: string; isHuman: boolean }>;
  /**
   * 本局角色构成。开局公开信息（rules.md §3.2），**只有数量、没有座位**。
   *
   * 少了它 AI 会明显变笨：7 人局梅林只看到 2 个坏人、而本局坏人有 3 个时，
   * 他本该立刻推出"有莫德雷德"。这个推理需要知道构成才做得出来。
   *
   * 形状上就带不了座位，所以它不构成泄漏——view.leak.test.ts 里有一条
   * "每个座位拿到的 roleComposition 完全相同"专门钉住这一点。
   */
  roleComposition: RoleCounts;
  missionConfigs: MissionConfig[];
  /** 等于 missionConfigs[missionIndex]，冗余出来方便写 prompt */
  currentMission: MissionConfig;

  proposedTeam: PlayerId[] | null;
  proposalHistory: PublicProposalRecord[];
  missionHistory: PublicMissionRecord[];
  speeches: Speech[];

  goodScore: number;
  evilScore: number;

  /**
   * 当前阶段轮到谁行动。空数组表示等待系统推进（NEXT）。
   * 同时行动的阶段（投票、任务票）返回所有尚未提交的人。
   */
  awaitingPlayerIds: PlayerId[];
  /** 讨论阶段的发言顺序，其他阶段为空数组 */
  speakingOrder: PlayerId[];
  /**
   * 已提交 / 应提交的数量。只有数量，没有内容和身份。
   * 让 AI 知道"还剩 2 人没投"，但不知道别人投了什么。
   */
  progress: { submitted: number; required: number };
  /** 自己在本阶段是否已提交（投票 / 任务票 / 发言） */
  selfSubmitted: boolean;

  /** 仅 GAME_OVER 阶段有值，公开全部身份用于复盘 */
  reveal: {
    roles: Record<PlayerId, Role>;
    missions: MissionRecord[];
    assassination: AssassinationRecord | null;
    winner: Team;
    winReason: WinReason;
  } | null;
}

// ---------------------------------------------------------------------------
// 动作
// ---------------------------------------------------------------------------

export type GameAction =
  | { type: "START_GAME" }
  | { type: "ACKNOWLEDGE"; playerId: PlayerId }
  /**
   * 组队提议。`statement` 是队长的公开选人说明——它**就是**队长在本次提议讨论里
   * 的那一次发言（rules.md §4.4「队长先发言解释选人理由」），由 reduce 记进 speeches，
   * 队长因此不会在 PROPOSAL_DISCUSSION 里再轮到一次。
   *
   * 与 `SPEAK.content` 同类：引擎不校验文本内容，那是策略问题不是合法性问题。
   */
  | { type: "PROPOSE_TEAM"; playerId: PlayerId; team: PlayerId[]; statement: string }
  | { type: "SPEAK"; playerId: PlayerId; content: string }
  | { type: "CAST_VOTE"; playerId: PlayerId; approve: boolean }
  | { type: "CAST_MISSION_CARD"; playerId: PlayerId; success: boolean }
  /** 刺杀阶段坏人的公开推测。刺客也要先说一次，再执行 ASSASSINATE */
  | { type: "ASSASSIN_OPINION"; playerId: PlayerId; content: string }
  | { type: "ASSASSINATE"; playerId: PlayerId; targetId: PlayerId }
  /** 系统推进，无行动人。仅用于 MISSION_RESULT 这类纯展示阶段 */
  | { type: "NEXT" };

export type ActionType = GameAction["type"];

/**
 * 引擎错误的分类。
 *
 * 【提成具名类型是为了能按它建表】`src/i18n` 里有一张 `Record<EngineErrorCode, string>`：
 * EngineError 的 message 是拿引擎内部状态拼出来的诊断，玩家读不懂也不该读到，
 * 所以界面上显示的是按 code 写的一句人话。写成内联联合的话那张表就没法要求完整。
 */
export type EngineErrorCode =
  | "ILLEGAL_PHASE"
  | "NOT_YOUR_TURN"
  | "INVALID_TEAM"
  | "DUPLICATE_SUBMISSION"
  | "GOOD_CANNOT_FAIL"
  | "INVALID_TARGET"
  | "CONFIG_INVALID"
  /** 引擎内部不变量被打破。正常输入下不该出现，出现即为引擎 bug */
  | "INTERNAL";

/** 引擎抛出的唯一错误类型。非法动作一律走这里，不返回 null、不静默忽略 */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: EngineErrorCode,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

// ---------------------------------------------------------------------------
// AI 层契约
// ---------------------------------------------------------------------------

/**
 * LLM 的输出必须是这些形状之一，且必须经 zod 校验。
 * reasoning 字段是给模型自己想的，不展示给其他玩家，但保留用于调试和终局复盘。
 */

export interface AiTeamProposal {
  reasoning: string;
  team: PlayerId[];
  /** 队长解释选人理由的公开发言 */
  statement: string;
}

export interface AiSpeech {
  reasoning: string;
  content: string;
  /** 可选：模型当前怀疑谁，用于可视化"AI 心证"，不公开 */
  suspicions?: Array<{ playerId: PlayerId; score: number }>;
}

export interface AiVote {
  reasoning: string;
  approve: boolean;
}

export interface AiMissionCard {
  reasoning: string;
  /** 好人调用此接口时该字段被引擎忽略，恒为 true */
  success: boolean;
}

export interface AiAssassination {
  reasoning: string;
  targetId: PlayerId;
}

/** AI 需要做的决策种类，与上面的输出类型一一对应 */
export type AiDecisionKind =
  | "TEAM_PROPOSAL"
  | "SPEECH"
  | "VOTE"
  | "MISSION_CARD"
  | "ASSASSIN_OPINION"
  | "ASSASSINATION";

export interface AiDecisionPayload {
  TEAM_PROPOSAL: AiTeamProposal;
  SPEECH: AiSpeech;
  VOTE: AiVote;
  MISSION_CARD: AiMissionCard;
  ASSASSIN_OPINION: AiSpeech;
  ASSASSINATION: AiAssassination;
}

/**
 * 所有 AI 调用的统一签名。
 *
 * legalActions 由 getLegalActions 产出，模型只能在其中选择；
 * 校验失败重试 maxRetries 次，仍失败则由引擎在 legalActions 里随机兜底。
 * view 是唯一的上下文来源——不要在这里塞任何来自 GameState 的字段。
 */
export interface AiDecisionRequest<K extends AiDecisionKind> {
  kind: K;
  view: PlayerView;
  persona: Persona;
  legalActions: GameAction[];
  maxRetries: number;
  /**
   * 用哪一份 prompt 语料。
   *
   * 【必填，不是可选】可选字段配一个 `?? "zh"` 就是静默回退：英文界面配一桌
   * 说中文的 AI，而没有任何东西会报错。必填的成本是十几个构造点各改一个 token，
   * 而 `tsc` 会把它们全找出来。
   *
   * 【类型是 string 不是 Locale】`@/lib/game` 是引擎，不该认识 `src/i18n`。
   * 取值由 buildPrompt 那一侧的 `Record<Locale, ...>` 索引来约束——
   * 传了别的值那里会当场报错。
   */
  locale: "zh" | "en";
}

export interface AiDecisionResult<K extends AiDecisionKind> {
  payload: AiDecisionPayload[K];
  /** true 表示模型连续失败后由引擎随机兜底，用于统计模型可靠性 */
  fallback: boolean;
  /** 调试用：实际发出的 prompt 与原始返回，mock 模式下也要填 */
  debug?: { prompt: string; raw: string; attempts: number };
}

/** LLM provider 的最小抽象。mock 实现与真实实现都满足它 */
export interface AiClient {
  decide<K extends AiDecisionKind>(
    req: AiDecisionRequest<K>,
  ): Promise<AiDecisionResult<K>>;
}
