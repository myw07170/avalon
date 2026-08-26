/**
 * 复盘指标：从公开的任务记录里，能推出哪些**所有人都成立**的硬事实，
 * 以及模型有没有在该推出来的时候推出来。
 *
 * 【它刻意不进 prompt】这个模块曾经被渲染成一段【推理线索】喂给每个玩家，
 * 技术上没错，设计上错得离谱：现实桌游里，任务板上的**事实**（谁上过车、几张失败票）
 * 是明摆着的，但"所以这三人里至少两个坏人"这句**推论要玩家自己说出来**——
 * 说出来才成为公共认知，说错了会被反驳，说对了是功劳。人手一份算好的答案，
 * 讨论就退化成装饰了。prompt 现在只在规则段写明"失败票只可能来自坏人"这条方法，
 * 具体推理留给模型自己做、自己在发言里说。
 *
 * 所以它现在的用途只剩一个：**复盘时衡量模型**。同一套推导既能算出"当时该知道什么"，
 * 也就能算出"知道了却还是踩了雷几次"——那个数字才是模型推理能力的证据。
 * 放在 ai/ 而不是 game/ 也是这个意思：引擎不做推理，也不对外提供推理。
 *
 * 【每一条结论都必须是真的】deduction.test.ts 的 soundness 用例拿真实身份
 * 在 120 局的每个中间状态、每个座位上逐条验过。
 */
import { countEvil, rolesToCounts } from "../game/config";
import {
  ROLE_TEAM,
  type GameState,
  type PlayerId,
  type PublicMissionRecord,
} from "../game/types";

export type Deduction =
  /**
   * 这支队伍里至少有 atLeast 个坏人。
   * pickSize：从这支队伍里任取这么多人，必然至少带上 1 个坏人。
   */
  | {
      kind: "MIN_EVIL";
      missionIndex: number;
      team: PlayerId[];
      atLeast: number;
      pickSize: number;
    }
  /** 整队都交了失败票——这几个座位确定是坏人 */
  | { kind: "ALL_EVIL"; missionIndex: number; playerIds: PlayerId[] }
  /** 坏人名额已被某支队伍占满，其余座位必然都是好人 */
  | { kind: "CLEARED"; playerIds: PlayerId[] };

export interface DeductionInput {
  /** 已结算的任务记录。GameState 的 MissionRecord 结构上兼容，可以直接传 */
  missions: readonly PublicMissionRecord[];
  evilCount: number;
  seats: readonly PlayerId[];
}

const asc = (a: PlayerId, b: PlayerId): number => a - b;

/**
 * 从公开的任务记录里推出全部硬结论。推不出任何东西时返回空数组，不给占位对象。
 *
 * 结论按 missionIndex 排列，CLEARED 放最后——它是跨记录汇总出来的，不属于某一轮。
 *
 * 吃的是「公开记录」而不是某个人的 PlayerView：复盘要按时序切片反复推
 * （见 findDeductionMisses），用 view 就得手搓一份假视角。
 * 输入类型本身已经说明了它只看得见公开信息。
 */
export function deduceFromMissions(input: DeductionInput): Deduction[] {
  const perMission: Deduction[] = [];
  // 每条 CLEARED 排除的是不同的队伍，各自独立成立，所以合并时取并集
  const cleared = new Set<PlayerId>();

  for (const mission of input.missions) {
    // 【判据是 failCount 而不是 succeeded】7 人以上第 4 轮门槛为 2，
    // 1 张失败票时任务照样成功——但那张票依然证明车上有一个坏人。
    // 写成"只看失败的任务"会整类漏掉，而且漏得很安静
    if (mission.failCount < 1) continue;

    const team = [...mission.team].sort(asc);
    // 好人在引擎层面交不出失败票（rules.md §4.3），所以失败票数就是坏人数下界
    const atLeast = mission.failCount;

    if (atLeast >= team.length) {
      perMission.push({
        kind: "ALL_EVIL",
        missionIndex: mission.missionIndex,
        playerIds: team,
      });
    } else {
      perMission.push({
        kind: "MIN_EVIL",
        missionIndex: mission.missionIndex,
        team,
        atLeast,
        // 队伍里好人最多 team.length - atLeast 个，
        // 所以任取再多一个人，必然至少带上 1 个坏人
        pickSize: team.length - atLeast + 1,
      });
    }

    // 这支队伍就占满了本局全部坏人名额 → 车下的人全是好人
    if (atLeast >= input.evilCount) {
      const onTeam = new Set(team);
      for (const seat of input.seats) {
        if (!onTeam.has(seat)) cleared.add(seat);
      }
    }
  }

  if (cleared.size === 0) return perMission;
  return [...perMission, { kind: "CLEARED", playerIds: [...cleared].sort(asc) }];
}

// ---------------------------------------------------------------------------
// 踩雷：该推出来的时候有没有推出来
// ---------------------------------------------------------------------------

/** 一次提议踩中了当时已经能推出来的硬结论 */
export interface DeductionMiss {
  missionIndex: number;
  attempt: number;
  leaderId: PlayerId;
  team: PlayerId[];
  approved: boolean;
  /** 队长自己是不是坏人——坏人踩雷很可能是故意的，两者不能混在一个数字里 */
  leaderIsEvil: boolean;
  /** 踩中的那条结论 */
  basis: Deduction;
  /** 提议队伍与依据队伍的交集，即"必然含坏人"的那几个座位 */
  overlap: PlayerId[];
}

/**
 * 这条结论要求"任取 pickSize 人必含坏人"里的 pickSize。
 * ALL_EVIL 整队皆坏，碰一个就中，所以是 1。CLEARED 是清白结论，不构成雷。
 */
function pickSizeOf(item: Deduction): number | null {
  if (item.kind === "MIN_EVIL") return item.pickSize;
  if (item.kind === "ALL_EVIL") return 1;
  return null;
}

function basisTeam(item: Deduction): readonly PlayerId[] {
  return item.kind === "MIN_EVIL" ? item.team : item.kind === "ALL_EVIL" ? item.playerIds : [];
}

/**
 * 整局里有多少次提议踩了当时已知的雷。
 *
 * 【只用当时已知的结论】判第 N 轮的提议，只喂 missionIndex < N 的任务记录。
 * 拿终局的全量记录去判，等于用"未来"责备过去，数字会虚高——本函数最容易写错的就是这一点，
 * 测试里有一条专门钉住时序。
 */
export function findDeductionMisses(final: GameState): DeductionMiss[] {
  const evilCount = countEvil(rolesToCounts(final.config.roles));
  const seats = final.players.map((p) => p.id);
  const evilSeats = new Set(
    final.players.filter((p) => ROLE_TEAM[p.role] === "EVIL").map((p) => p.id),
  );
  const misses: DeductionMiss[] = [];

  for (const proposal of final.proposalHistory) {
    const known = deduceFromMissions({
      // 同一轮内不会产生新的任务结果，所以本轮自己的那条也要排除在外
      missions: final.missionHistory.filter(
        (m) => m.missionIndex < proposal.missionIndex,
      ),
      evilCount,
      seats,
    });

    for (const basis of known) {
      const pickSize = pickSizeOf(basis);
      if (pickSize === null) continue;
      const onBasis = new Set(basisTeam(basis));
      const overlap = proposal.team.filter((id) => onBasis.has(id)).sort(asc);
      if (overlap.length < pickSize) continue;

      misses.push({
        missionIndex: proposal.missionIndex,
        attempt: proposal.attempt,
        leaderId: proposal.leaderId,
        team: [...proposal.team].sort(asc),
        approved: proposal.approved,
        leaderIsEvil: evilSeats.has(proposal.leaderId),
        basis,
        overlap,
      });
    }
  }

  return misses;
}
