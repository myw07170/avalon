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

/** 角色展示元数据。引擎判定不依赖它，仅供 UI 与 prompt 文案使用 */
export interface RoleMeta {
  /** 中文名，如 "梅林" */
  label: string;
  team: Team;
  /** 一句话能力描述，可直接注入 prompt */
  ability: string;
  /** 是否为可选角色（忠臣/爪牙是填充位，莫德雷德/奥伯伦按人数启用） */
  optional: boolean;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  MERLIN: {
    label: "梅林",
    team: "GOOD",
    ability: "看到所有坏人，莫德雷德除外。被刺客命中则好人满盘皆输。",
    optional: false,
  },
  PERCIVAL: {
    label: "派西维尔",
    team: "GOOD",
    ability: "看到梅林和莫甘娜两人，但无法区分谁是谁。",
    optional: false,
  },
  LOYAL_SERVANT: {
    label: "忠臣",
    team: "GOOD",
    ability: "没有任何额外信息，只能靠推理。",
    optional: true,
  },
  MORGANA: {
    label: "莫甘娜",
    team: "EVIL",
    ability: "在派西维尔眼中与梅林混淆。认识除奥伯伦外的所有坏人。",
    optional: false,
  },
  ASSASSIN: {
    label: "刺客",
    team: "EVIL",
    ability: "好人集齐 3 分后由你指定刺杀目标，命中梅林则坏人翻盘。",
    optional: false,
  },
  MORDRED: {
    label: "莫德雷德",
    team: "EVIL",
    ability: "梅林看不到你。认识除奥伯伦外的所有坏人。",
    optional: true,
  },
  OBERON: {
    label: "奥伯伦",
    team: "EVIL",
    ability: "不认识任何队友，队友也不认识你；但梅林看得到你。",
    optional: true,
  },
  MINION: {
    label: "爪牙",
    team: "EVIL",
    ability: "普通坏人，认识除奥伯伦外的所有坏人。",
    optional: true,
  },
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

/** 随机源。引擎所有随机行为都必须走它，方便测试注入固定序列 */
export type RngFn = () => number;

export interface Persona {
  name: string;
  /** 性格标签，如 "谨慎保守" "咄咄逼人" */
  traits: string[];
  /** 说话风格，注入 prompt */
  speechStyle: string;
  /** 头像标识，UI 用 */
  avatar?: string;
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
  | { type: "PROPOSE_TEAM"; playerId: PlayerId; team: PlayerId[] }
  | { type: "SPEAK"; playerId: PlayerId; content: string }
  | { type: "CAST_VOTE"; playerId: PlayerId; approve: boolean }
  | { type: "CAST_MISSION_CARD"; playerId: PlayerId; success: boolean }
  /** 刺杀阶段坏人的公开推测。刺客也要先说一次，再执行 ASSASSINATE */
  | { type: "ASSASSIN_OPINION"; playerId: PlayerId; content: string }
  | { type: "ASSASSINATE"; playerId: PlayerId; targetId: PlayerId }
  /** 系统推进，无行动人。仅用于 MISSION_RESULT 这类纯展示阶段 */
  | { type: "NEXT" };

export type ActionType = GameAction["type"];

/** 引擎抛出的唯一错误类型。非法动作一律走这里，不返回 null、不静默忽略 */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly code:
      | "ILLEGAL_PHASE"
      | "NOT_YOUR_TURN"
      | "INVALID_TEAM"
      | "DUPLICATE_SUBMISSION"
      | "GOOD_CANNOT_FAIL"
      | "INVALID_TARGET"
      | "CONFIG_INVALID",
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
