/**
 * GameState -> PlayerView 的唯一转换点。
 *
 * 这个文件是信息隔离的最后一道防线。改动它的任何一行都必须跑 view.leak.test.ts。
 *
 * 两条贯穿全文件的写法约定，都不是风格问题：
 *
 * 1. **逐字段抄写，绝不 `...record`。** 展开一个 MissionRecord 会把 `cards`
 *    （谁投的失败票）一起带出去；更糟的是将来给 MissionRecord 加字段时，
 *    展开写法不会有任何提示，新字段会自己漏进 AI 的 prompt。
 * 2. **一律返回新的数组和对象。** PlayerView 会被交给 AI 层和 UI，
 *    共享引用等于给了它们一条改引擎状态的后门。
 */
import { rolesToCounts } from "./config";
import { getAwaitingPlayerIds, getCurrentMission, requireProposedTeam } from "./legal";
import {
  EngineError,
  ROLE_TEAM,
  type AssassinationRecord,
  type GameState,
  type MissionRecord,
  type PlayerId,
  type PlayerView,
  type ProposalRecord,
  type PublicMissionRecord,
  type PublicProposalRecord,
  type Role,
  type SpectatorView,
} from "./types";
import { getKnownIdentities } from "./visibility";

/**
 * 任务记录的公开版本：只有失败票【数量】，没有投票者。
 * rules.md §4.3 的最后一条——引擎内部记录来源用于复盘，任何玩家视图都必须抹掉。
 */
function toPublicMission(record: MissionRecord): PublicMissionRecord {
  return {
    missionIndex: record.missionIndex,
    attempt: record.attempt,
    team: [...record.team],
    leaderId: record.leaderId,
    failCount: record.failCount,
    succeeded: record.succeeded,
  };
}

/**
 * 提议记录的公开版本。
 * 组队投票是公开的，但只有【已结算】的才在这里——proposalHistory 本身就只装已结算的，
 * 未结算的票在 state.pending.votes 里，永远走不到这个函数。
 */
function toPublicProposal(record: ProposalRecord): PublicProposalRecord {
  return {
    missionIndex: record.missionIndex,
    attempt: record.attempt,
    leaderId: record.leaderId,
    team: [...record.team],
    votes: { ...record.votes },
    approved: record.approved,
    forced: record.forced,
  };
}

interface Submission {
  progress: { submitted: number; required: number };
  selfSubmitted: boolean;
}

/**
 * pending 的唯一出口：折算成两个数字 + 自己交没交。
 *
 * 数量和"自己交没交"在同一个 switch 里算出来，是为了让它们没法各自演化——
 * 分成两个函数，早晚出现一个阶段更新了进度、另一个忘了改 selfSubmitted 的情况。
 *
 * 让 AI 知道"还剩 2 人没投"，但不知道任何一票的内容和归属。
 *
 * 【selfId 可以是 null】观战没有"自己"，selfSubmitted 恒 false，但 progress 照算——
 * 它是公开信息。**仍然只有这一个 switch**：为观战另写一个 progressOf，
 * 就正好制造了上面那句话说的那种漂移。
 */
function submissionOf(state: GameState, selfId: PlayerId | null): Submission {
  const { pending } = state;
  const playerCount = state.players.length;

  switch (state.phase) {
    case "ROLE_REVEAL":
      return {
        progress: { submitted: pending.acknowledged.length, required: playerCount },
        selfSubmitted: selfId !== null && pending.acknowledged.includes(selfId),
      };

    case "TEAM_BUILDING":
      // 只等队长一个人出名单
      return { progress: { submitted: 0, required: 1 }, selfSubmitted: false };

    case "PROPOSAL_DISCUSSION":
    case "REVIEW_DISCUSSION": {
      // selfId 为 null 时 indexOf 给 -1，下面那条判断本来就要求 index >= 0
      const index = selfId === null ? -1 : pending.speakingOrder.indexOf(selfId);
      return {
        progress: {
          submitted: pending.speakerIndex,
          required: pending.speakingOrder.length,
        },
        selfSubmitted: selfId !== null && index >= 0 && index < pending.speakerIndex,
      };
    }

    case "TEAM_VOTE":
      return {
        progress: {
          submitted: Object.keys(pending.votes).length,
          required: playerCount,
        },
        selfSubmitted: selfId !== null && selfId in pending.votes,
      };

    case "MISSION_EXECUTION": {
      const team = requireProposedTeam(state);
      return {
        progress: { submitted: pending.cards.length, required: team.length },
        selfSubmitted: selfId !== null && pending.cards.some((c) => c.playerId === selfId),
      };
    }

    case "ASSASSINATION": {
      // 坏人数量由人数表决定（rules.md §2），是公开信息，不构成泄漏
      const evilCount = state.players.filter((p) => ROLE_TEAM[p.role] === "EVIL").length;
      return {
        progress: { submitted: pending.assassinOpinions.length, required: evilCount },
        selfSubmitted:
          selfId !== null && pending.assassinOpinions.some((o) => o.playerId === selfId),
      };
    }

    // 等系统推进的阶段，没有任何人需要提交
    case "SETUP":
    case "MISSION_RESULT":
    case "GAME_OVER":
      return { progress: { submitted: 0, required: 0 }, selfSubmitted: false };
  }
}

/**
 * 座位 -> 真实身份的全表。
 *
 * 【只有两个调用方，而且都是"已经允许知道"的场合】终局复盘（revealOf）
 * 与观战视角（toSpectatorView）。**不要给它加第三个调用方**——
 * 这个函数是全文件唯一能把 Player.role 铺开的地方。
 */
function rolesOf(state: GameState): Record<PlayerId, Role> {
  const roles: Record<PlayerId, Role> = {};
  for (const player of state.players) roles[player.id] = player.role;
  return roles;
}

/** 终局复盘：这是整个 PlayerView 里唯一允许出现他人身份和任务票来源的地方 */
function revealOf(state: GameState): PlayerView["reveal"] {
  if (state.phase !== "GAME_OVER") return null;

  const { winner, winReason } = state;
  if (!winner || !winReason) {
    // endGame 是进入 GAME_OVER 的唯一入口，它一定同时写了这两个字段
    throw new EngineError("终局状态没有胜负结果", "INTERNAL", {
      winner,
      winReason,
    });
  }

  return {
    roles: rolesOf(state),
    missions: state.missionHistory.map(
      (m): MissionRecord => ({
        missionIndex: m.missionIndex,
        attempt: m.attempt,
        leaderId: m.leaderId,
        team: [...m.team],
        cards: m.cards.map((c) => ({ ...c })),
        failCount: m.failCount,
        succeeded: m.succeeded,
      }),
    ),
    assassination: state.assassination
      ? ({
          opinions: state.assassination.opinions.map((o) => ({ ...o })),
          assassinId: state.assassination.assassinId,
          targetId: state.assassination.targetId,
          hit: state.assassination.hit,
        } satisfies AssassinationRecord)
      : null,
    winner,
    winReason,
  };
}

/**
 * 三条不能破的规则：
 * - missionHistory 映射成 PublicMissionRecord，丢弃 cards（任务票来源永不公开）
 * - state.pending 的任何内容都不进去，只折算成 progress 的两个数字和 selfSubmitted
 * - reveal 仅在 GAME_OVER 时填充
 */
export function toPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) {
    throw new EngineError(`座位 ${playerId} 不存在，无法构建视角`, "INTERNAL", {
      playerId,
      playerCount: state.players.length,
    });
  }

  const { progress, selfSubmitted } = submissionOf(state, playerId);
  const isDiscussion =
    state.phase === "PROPOSAL_DISCUSSION" || state.phase === "REVIEW_DISCUSSION";

  return {
    selfId: self.id,
    selfRole: self.role,
    selfTeam: ROLE_TEAM[self.role],
    // 可见性矩阵只有 visibility.ts 一份实现，这里只负责调用
    knowledge: getKnownIdentities(playerId, state.players),

    phase: state.phase,
    missionIndex: state.missionIndex,
    currentLeaderId: state.currentLeaderId,
    rejectCount: state.rejectCount,
    maxRejects: state.config.maxRejects,

    // 名字和是不是人类是公开的；角色和人设不是
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHuman: p.isHuman,
    })),
    // 角色构成开局公开（rules.md §3.2）。取自 config.roles 而不是 players——
    // 后者带着座位，一不小心就把"谁是什么"算进来了
    roleComposition: rolesToCounts(state.config.roles),
    missionConfigs: state.config.missions.map((m) => ({ ...m })),
    currentMission: { ...getCurrentMission(state) },

    proposedTeam: state.proposedTeam ? [...state.proposedTeam] : null,
    proposalHistory: state.proposalHistory.map(toPublicProposal),
    missionHistory: state.missionHistory.map(toPublicMission),
    speeches: state.speeches.map((s) => ({ ...s })),

    goodScore: state.goodScore,
    evilScore: state.evilScore,

    awaitingPlayerIds: getAwaitingPlayerIds(state),
    // 发言顺序是座位序推出来的，本身不含信息；非讨论阶段一律给空数组
    speakingOrder: isDiscussion ? [...state.pending.speakingOrder] : [],
    progress,
    selfSubmitted,

    reveal: revealOf(state),
  };
}

/**
 * GameState -> SpectatorView。全 AI 局的观战投影。
 *
 * 与 toPlayerView 的差别只有两处：没有"自己"，多一份全场身份。
 *
 * 【为什么是逐字段抄一遍，而不是 `...toPlayerView(state, 0)` 再改几个字段】
 * 借 0 号座位的视角当底子，等于让观战的公开面依赖"0 号看得见什么"——
 * 那正好是本文件全部工作的反面。而且展开写法在给 PlayerView 加自我字段时
 * 不会有任何提示，selfRole 会自己漏进观战视角。
 *
 * 【两份字面量会不会漂移】会，所以 spectator-view.test.ts 有一条等价性断言：
 * 同一个 state 下，本函数与 toPlayerView 的每个公开字段必须深相等。
 * 防漂移靠那条测试，不靠共享代码。
 *
 * 【roles 恒给全量】观战没有对手，"开天眼"这个概念不成立——信息隔离保护的是
 * **坐在桌上的人**。界面默认把牌全扣着（store 的 revealedSeatsAtom），
 * 但那是观战者给自己设的剧透闸，不是这里的事。
 */
export function toSpectatorView(state: GameState): SpectatorView {
  const { progress } = submissionOf(state, null);
  const isDiscussion =
    state.phase === "PROPOSAL_DISCUSSION" || state.phase === "REVIEW_DISCUSSION";

  return {
    selfId: null,
    selfRole: null,
    selfTeam: null,
    knowledge: [],
    selfSubmitted: false,

    roles: rolesOf(state),

    phase: state.phase,
    missionIndex: state.missionIndex,
    currentLeaderId: state.currentLeaderId,
    rejectCount: state.rejectCount,
    maxRejects: state.config.maxRejects,

    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHuman: p.isHuman,
    })),
    roleComposition: rolesToCounts(state.config.roles),
    missionConfigs: state.config.missions.map((m) => ({ ...m })),
    currentMission: { ...getCurrentMission(state) },

    proposedTeam: state.proposedTeam ? [...state.proposedTeam] : null,
    proposalHistory: state.proposalHistory.map(toPublicProposal),
    // 【观战也拿不到 cards】"谁投的失败票"归 MissionTrack 的时间轴，不在本次范围内。
    // 走同一个 toPublicMission，就不会有人在这条路上把它悄悄放宽
    missionHistory: state.missionHistory.map(toPublicMission),
    speeches: state.speeches.map((s) => ({ ...s })),

    goodScore: state.goodScore,
    evilScore: state.evilScore,

    awaitingPlayerIds: getAwaitingPlayerIds(state),
    speakingOrder: isDiscussion ? [...state.pending.speakingOrder] : [],
    progress,

    reveal: revealOf(state),
  };
}
