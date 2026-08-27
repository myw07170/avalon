/**
 * 五轮任务的进度，加上否决计数器。
 *
 * 【否决计数器是每轮独立的】rejectCount 在提议通过时归零，进入下一轮任务时也归零
 * （见 phases/transitions.ts）。所以它不是"整局否决了几次"，而是"本轮连续否决了几次"。
 * 撞到 maxRejects 坏人直接获胜（WinReason "REJECT_LIMIT"），所以它是一根危险指示条，
 * 不是流水计数。
 */
import { MISSIONS_TO_WIN, type PlayerView } from "@/lib/game";

export type MissionOutcome = "success" | "fail" | "current" | "upcoming";

export interface MissionNode {
  index: number;
  label: string;
  teamSize: number;
  /** 大于 1 表示这一轮要两张失败票才算失败 */
  failsRequired: number;
  outcome: MissionOutcome;
  /** 已结算才有 */
  failCount: number | null;
  /** 节点下方那行小字。未开始的轮次为 null */
  detail: string | null;
}

export interface TrackState {
  nodes: MissionNode[];
  goodScore: number;
  evilScore: number;
  missionsToWin: number;
  rejectCount: number;
  maxRejects: number;
  /** 只在最后一次机会时出现 */
  rejectWarning: string | null;
  /** 「第 3 次提议」。本轮还没被否决过时为 null */
  attemptLabel: string | null;
}

function detailOf(succeeded: boolean, failCount: number): string {
  if (!succeeded) return `失败 · ${failCount} 败`;
  // 第四轮要两张失败票，所以"成功"也可能带着一张失败票——那张票是有信息的
  return failCount > 0 ? `成功 · ${failCount} 败` : "成功";
}

export function describeTrack(view: PlayerView): TrackState {
  const settled = new Map(view.missionHistory.map((m) => [m.missionIndex, m]));

  const nodes: MissionNode[] = view.missionConfigs.map((config, index) => {
    const record = settled.get(index);

    // 已结算优先于"是当前轮"：MISSION_RESULT 阶段记录已经进了 history，
    // 而 missionIndex 要等 NEXT 才递增，两者会同时指向同一轮
    if (record) {
      return {
        index,
        label: `第 ${index + 1} 轮`,
        teamSize: config.teamSize,
        failsRequired: config.failsRequired,
        outcome: record.succeeded ? "success" : "fail",
        failCount: record.failCount,
        detail: detailOf(record.succeeded, record.failCount),
      };
    }

    const isCurrent = index === view.missionIndex && view.phase !== "GAME_OVER";
    return {
      index,
      label: `第 ${index + 1} 轮`,
      teamSize: config.teamSize,
      failsRequired: config.failsRequired,
      outcome: isCurrent ? "current" : "upcoming",
      failCount: null,
      detail: isCurrent ? "进行中" : null,
    };
  });

  return {
    nodes,
    goodScore: view.goodScore,
    evilScore: view.evilScore,
    missionsToWin: MISSIONS_TO_WIN,
    rejectCount: view.rejectCount,
    maxRejects: view.maxRejects,
    rejectWarning: rejectWarningOf(view),
    attemptLabel: view.rejectCount > 0 ? `第 ${view.rejectCount + 1} 次提议` : null,
  };
}

/**
 * 只在最后一次机会时说话。每一轮都喊狼来了，到真该紧张的时候就没人看了。
 *
 * 【这句话在变体下会不准】config.forcePassOnLastAttempt 为 true 时最后一次提议
 * 不投票直接通过，坏人不会因否决获胜。但那个开关不在 PlayerView 里，UI 看不到它，
 * 而 SetupScreen 也从不开启它（createConfig 的缺省是 false）。真要支持这个变体，
 * 得先把它投影进 PlayerView，而不是在这里猜。
 */
function rejectWarningOf(view: PlayerView): string | null {
  if (view.phase === "GAME_OVER") return null;
  if (view.rejectCount !== view.maxRejects - 1) return null;
  return "再被否决一次，坏人直接获胜。";
}
