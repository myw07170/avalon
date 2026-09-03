/**
 * 视角提示：给每个玩家一个**不同的切入角度**。
 *
 * 【要解决的问题】首两局真实对局里，五个 AI 拿着同一份视角、同一套提示，说出来的话
 * 几乎一模一样——都在要求别人"给出可验证的里程碑"。人在牌桌上不会这样：
 * 被点名的人急着自辩，刚上过失败车的人先撇清，一直没上过车的人抱怨自己被边缘化。
 * 差异不是靠"请你说得有个性"要来的，是靠**每个人处境本来就不同**。
 *
 * 【只给事实，绝不给立场】这是本文件唯一的硬约束，也是踩过两次的教训：
 * - 我们自己踩过一次：把算好的推理结论塞进 prompt，讨论当场退化成装饰（见 deduction.ts）。
 * - wolfcha 踩过同一个坑，他们的注释是：「立场类提示（警长支持/质疑）已移除：
 *   与对局事实无关的方向性暗示会推动同一玩家前后立场漂移。只保留基于真实对局状态的事实类提示。」
 *
 * 所以这里给的每一条都是**你身上发生过的公开事实** + 一个开放问句（"要不要提"），
 * 绝不出现"谁可疑""该投谁""那车上有坏人"。perspective.test.ts 有一条反向断言钉住这件事。
 *
 * 【最多两条，且确定性选取】给满五条等于没给重点，也会把 prompt 撑长。
 * 用 (selfId + missionIndex) 做下标，保证同一 seed 重放出同一局。
 */
import type { PromptCopy } from "./prompt-copy";
import type { PlayerId, PlayerView } from "../game/types";

/** 一次最多给几条。再多就没有重点了 */
const MAX_HINTS = 2;

/**
 * 本轮（当前 missionIndex）里，谁在发言中点了你的座位号。
 *
 * 【"座位 3" 这个 token 分语言】英文里是 "Seat 3"。从语料表取，
 * 与 prompt 里渲染座位号用的是同一个函数——两边分叉的话，
 * 这条角度在英文局里会永远不触发，而且不会有任何报错。
 */
function mentionedBy(view: PlayerView, c: PromptCopy): PlayerId[] {
  const token = c.seat(view.selfId);
  const exactToken = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`, "i");
  const seats = new Set<PlayerId>();
  for (const speech of view.speeches) {
    if (speech.missionIndex !== view.missionIndex) continue;
    if (speech.playerId === view.selfId) continue;
    // 1 号不能误命中 10 号；座位号后面没有更多数字才算点到本人。
    if (exactToken.test(speech.content)) seats.add(speech.playerId);
  }
  return [...seats].sort((a, b) => a - b);
}

/** 最近一次已结算的提议里，谁和你投了相反的票 */
function votedAgainstYou(view: PlayerView): PlayerId[] {
  const last = view.proposalHistory[view.proposalHistory.length - 1];
  // forced 通过的那次没有人投过票，votes 是空的
  if (!last || last.forced) return [];
  const mine = last.votes[view.selfId];
  if (mine === undefined) return [];
  return Object.keys(last.votes)
    .map(Number)
    .filter((id) => id !== view.selfId && last.votes[id] !== mine)
    .sort((a, b) => a - b);
}

/**
 * 你上过的、出过失败票的那些车。
 *
 * **只陈述"你在车上"这个事实**，不推广成"所以那车上有坏人"——后者是模型自己该做的推理，
 * 替它做了就回到了 deduction.ts 撤销掉的那条老路上。
 */
function riskyMissions(view: PlayerView): Array<{ missionIndex: number; failCount: number }> {
  return view.missionHistory
    .filter((m) => m.failCount > 0 && m.team.includes(view.selfId))
    .map((m) => ({ missionIndex: m.missionIndex, failCount: m.failCount }));
}

/**
 * 全部候选角度。顺序固定，选取靠下面的确定性下标。
 *
 * 每一条的形状都是「事实 + 要不要提」，没有一条给出判断。
 */
function candidates(view: PlayerView, c: PromptCopy): string[] {
  const hints: string[] = [];

  const mentions = mentionedBy(view, c);
  if (mentions.length > 0) {
    hints.push(c.perspective.mentioned(c.seatList(mentions)));
  }

  const against = votedAgainstYou(view);
  if (against.length > 0) {
    hints.push(c.perspective.votedAgainst(c.seatList(against)));
  }

  if (view.proposedTeam?.includes(view.selfId)) {
    hints.push(c.perspective.onProposedTeam);
  }

  const risky = riskyMissions(view);
  for (const m of risky) {
    hints.push(c.perspective.wasOnFailedMission(m.missionIndex + 1, m.failCount));
  }

  const everOnTeam = view.missionHistory.some((m) => m.team.includes(view.selfId));
  if (!everOnTeam && view.missionHistory.length > 0) {
    hints.push(c.perspective.neverOnMission);
  }

  return hints;
}

/**
 * 取最多两条，按 (selfId + missionIndex) 轮换。
 *
 * 轮换而不是永远取前两条：否则"被点名"一旦触发就会永久占住两个名额，
 * 后面几条角度一辈子不会出现。
 */
export function buildPerspective(view: PlayerView, c: PromptCopy): string[] {
  const all = candidates(view, c);
  if (all.length <= MAX_HINTS) return all;

  const start = (view.selfId + view.missionIndex) % all.length;
  const picked: string[] = [];
  for (let i = 0; i < all.length && picked.length < MAX_HINTS; i += 1) {
    const hint = all[(start + i) % all.length];
    if (hint !== undefined && !picked.includes(hint)) picked.push(hint);
  }
  return picked;
}
