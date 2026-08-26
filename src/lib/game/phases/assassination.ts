/**
 * ASSASSINATION：坏人逐个发表推测，全部说完后刺客动手。
 *
 * 发言调度在 legal.ts（坏人按座位号升序，含奥伯伦——他也是坏人，只是不认识队友）。
 * 目标是否合法、推测是否已说完，都由 assertLegal 拦下，这里只负责记录与判定。
 *
 * 【推测同时落成一条公开 Speech】rules.md §4.5 说的是"各**发表**一次推测意见"——
 * 那是一次公开发言，不是一张暗票。它必须同时进 `speeches`，否则谁都读不到：
 * `pending` 按设计一个字都不进 `PlayerView`（view.ts 只映射 `state.speeches`），
 * 于是整个 ASSASSIN_OPINION 步骤变成只写不读，**连刺客自己都看不到他一分钟前说了什么**。
 *
 * 这个坑真跑出来过两次，两次刺客都刺了自己的队友：seed 94938 那局刺客在推测里
 * 写的是"我怀疑梅林在座位3"（座位 3 真的是梅林），轮到他动手时上下文里一个字都没有，
 * 改指了座位 1——他自己的莫甘娜。
 *
 * 与阶段 4 记过的 `PROPOSE_TEAM.statement` 是**同一个坑的第二次复发**，
 * 所以这里照 teamBuilding.ts 的做法写。
 *
 * 【两份数据都要留】`pending.assassinOpinions` 管调度与结算
 * （view 的 progress/selfSubmitted、legal 的轮次、AssassinationRecord.opinions 三处都靠它），
 * `speeches` 管"说出口的话"。关系与 `proposedTeam` + 队长选人说明完全相同，删任何一份都会连锁炸。
 */
import {
  EngineError,
  type AssassinationRecord,
  type GameAction,
  type GameState,
  type Speech,
} from "../types";
import { endGame, unexpectedAction, withLog } from "./transitions";

export function reduceAssassination(state: GameState, action: GameAction): GameState {
  if (action.type === "ASSASSIN_OPINION") {
    const speech: Speech = {
      // seq 只增不减：speeches 只被追加，长度就是下一个序号
      seq: state.speeches.length,
      playerId: action.playerId,
      phase: "ASSASSINATION",
      // 刺杀发生在任务打完之后，这两个字段没有"本轮"的含义，照当前状态取即可。
      // prompt 与对局记录都不会把它们渲染出来（刺杀阶段不报轮次）
      missionIndex: state.missionIndex,
      attempt: state.rejectCount,
      content: action.content,
    };

    return withLog(
      {
        ...state,
        speeches: [...state.speeches, speech],
        pending: {
          ...state.pending,
          // 这里的顺序就是发言顺序，AssassinationRecord.opinions 直接沿用
          assassinOpinions: [
            ...state.pending.assassinOpinions,
            { playerId: action.playerId, content: action.content },
          ],
        },
      },
      { kind: "SPEECH", seq: speech.seq, playerId: action.playerId },
    );
  }
  if (action.type !== "ASSASSINATE") throw unexpectedAction(state, action);

  const target = state.players.find((p) => p.id === action.targetId);
  if (!target) {
    // assertLegal 已按 INVALID_TARGET 校验过座位号，取不到即为引擎 bug
    throw new EngineError(`刺杀目标 ${action.targetId} 不存在`, "INTERNAL", {
      targetId: action.targetId,
    });
  }

  const hit = target.role === "MERLIN";
  const record: AssassinationRecord = {
    opinions: [...state.pending.assassinOpinions],
    assassinId: action.playerId,
    targetId: action.targetId,
    hit,
  };

  const struck = withLog(
    { ...state, assassination: record },
    {
      kind: "ASSASSINATION",
      assassinId: action.playerId,
      targetId: action.targetId,
      hit,
    },
  );

  // rules.md §4.5：命中梅林坏人翻盘，否则好人守住三次任务的胜利
  return hit
    ? endGame(struck, "EVIL", "ASSASSINATION_HIT")
    : endGame(struck, "GOOD", "ASSASSINATION_MISS");
}
