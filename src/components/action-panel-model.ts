/**
 * 轮到你时，面板该画什么。
 *
 * 【能选的东西一律来自 turn.legalActions，面板不自己拼动作】
 * 好人在 MISSION_EXECUTION 的候选里根本没有"投失败"这一项（legal.ts 那条最要紧的
 * 分支），所以面板只要照着渲染，就天然做不出非法操作。反过来，按 phase 或
 * view.selfTeam 自己判断该给几个按钮，等于把引擎规则在 UI 里再实现一遍——
 * 两处迟早不一致，而不一致的那一次就是一张本不该存在的失败票。
 *
 * 【两个例外是模板动作】PROPOSE_TEAM 和 SPEAK 的候选项是占位模板
 * （legal.ts 不穷举 C(10,5)=252 种队伍，也不猜你要说什么）。这两种要填内容，
 * 但 type 和 playerId 仍然沿用模板，不在 UI 里手写。
 *
 * 【本文件不抛】渲染期抛异常就是白屏。形状对不上时返回 null，由面板给一句话兜底。
 */
import type { Messages } from "@/i18n/messages";
import type { GameAction, PlayerId, PlayerView } from "@/lib/game";
import type { HumanTurn } from "@/lib/ai/orchestrator";
import { describeRole, type SeatTone } from "./role-card-model";

// ---------------------------------------------------------------------------
// 表单
// ---------------------------------------------------------------------------

export interface SeatChoice {
  id: PlayerId;
  name: string;
  isSelf: boolean;
  isLeader: boolean;
  /** 身份认知层，跟圆桌上的配色是同一套（见 SeatRing 文件头） */
  tone: SeatTone;
  /** 读屏念的一句话，把上面几层按同一个顺序说出来 */
  label: string;
}

export interface ActionOption {
  /** 直接取自 turn.legalActions */
  action: GameAction;
  label: string;
  detail: string;
  /** positive 走 loyal 色，negative 走 mordred 色 */
  tone: "positive" | "negative";
}

export interface TargetChoice extends SeatChoice {
  action: GameAction;
}

interface FormBase {
  title: string;
  hint: string;
}

export interface TeamForm extends FormBase {
  kind: "TEAM_PROPOSAL";
  teamSize: number;
  candidates: SeatChoice[];
  /** 选人说明那一栏的小字 */
  statementHint: string;
  placeholder: string;
  template: Extract<GameAction, { type: "PROPOSE_TEAM" }>;
}

export interface SpeechForm extends FormBase {
  kind: "SPEECH";
  placeholder: string;
  /** 空发言是合法的，所以明写一个"不说"的出口，而不是让玩家提交空文本框 */
  skipLabel: string;
  template: Extract<GameAction, { type: "SPEAK" }>;
}

export interface VoteForm extends FormBase {
  kind: "VOTE";
  /** 正在表决的这支队伍。投票前要看得见自己在投谁 */
  team: SeatChoice[];
  options: ActionOption[];
  /** 只在最后一次机会时非 null */
  warning: string | null;
}

export interface MissionCardForm extends FormBase {
  kind: "MISSION_CARD";
  options: ActionOption[];
  /** 只有一个选项时解释为什么，否则那颗孤零零的按钮看起来像界面坏了 */
  note: string | null;
}

export interface AssassinationForm extends FormBase {
  kind: "ASSASSINATION";
  targets: TargetChoice[];
}

export type TurnForm =
  | TeamForm
  | SpeechForm
  | VoteForm
  | MissionCardForm
  | AssassinationForm;

/** 发言框的上限。引擎不校验长度，这纯粹是别让人贴一篇论文进 prompt */
export const SPEECH_MAX_LENGTH = 300;

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

type ActionOf<T extends GameAction["type"]> = Extract<GameAction, { type: T }>;

function pick<T extends GameAction["type"]>(
  actions: readonly GameAction[],
  type: T,
): ActionOf<T> | null {
  return actions.find((a): a is ActionOf<T> => a.type === type) ?? null;
}

function pickAll<T extends GameAction["type"]>(
  actions: readonly GameAction[],
  type: T,
): ActionOf<T>[] {
  return actions.filter((a): a is ActionOf<T> => a.type === type);
}

/**
 * 全体座位，带上你对他们的认知。
 *
 * 复用 describeRole 的 marks，梅林在选人和开刀时看到的红圈跟他开局看到的是同一套——
 * 让他每轮重新回忆一遍座位号不是难度，是负担。
 */
function seatChoicesOf(view: PlayerView, msg: Messages): SeatChoice[] {
  const tones = new Map(describeRole(view, msg).marks.map((m) => [m.id, m.tone]));

  return view.players.map((player) => {
    const tone = tones.get(player.id) ?? "plain";
    const isSelf = player.id === view.selfId;
    const isLeader = player.id === view.currentLeaderId;

    const parts = [msg.seat.short(player.id), isSelf ? msg.seat.you : player.name];
    if (isLeader) parts.push(msg.seat.leader);
    if (tone === "evil") parts.push(msg.role.toneLabel.evil);
    if (tone === "unsure") parts.push(msg.role.toneLabel.unsure);

    return {
      id: player.id,
      name: player.name,
      isSelf,
      isLeader,
      tone,
      label: msg.turn.joinSeatParts(parts),
    };
  });
}

// ---------------------------------------------------------------------------
// 各类表单
// ---------------------------------------------------------------------------

function teamForm(turn: HumanTurn, msg: Messages): TeamForm | null {
  const template = pick(turn.legalActions, "PROPOSE_TEAM");
  if (!template) return null;

  const { view } = turn;
  const { teamSize, failsRequired } = view.currentMission;

  return {
    kind: "TEAM_PROPOSAL",
    title: msg.turn.team.title,
    hint:
      msg.turn.team.hint(teamSize, view.missionIndex + 1) +
      (failsRequired > 1 ? msg.turn.failsNote(failsRequired) : ""),
    teamSize,
    candidates: seatChoicesOf(view, msg),
    // types.ts 写得很明白：statement 就是队长在本次提议讨论里的那一次发言，
    // reduce 会把它记进 speeches，队长因此不会在 PROPOSAL_DISCUSSION 里再轮到一次
    statementHint: msg.turn.team.statementHint,
    placeholder: msg.turn.team.placeholder,
    template,
  };
}

function speechForm(turn: HumanTurn, msg: Messages): SpeechForm | null {
  const template = pick(turn.legalActions, "SPEAK");
  if (!template) return null;

  return {
    kind: "SPEECH",
    title: msg.turn.speech.title,
    hint: msg.turn.speech.hintProposal,
    placeholder: msg.turn.speech.placeholderProposal,
    skipLabel: msg.turn.speech.skipLabel,
    template,
  };
}

function voteForm(turn: HumanTurn, msg: Messages): VoteForm | null {
  const votes = pickAll(turn.legalActions, "CAST_VOTE");
  if (votes.length === 0) return null;

  const { view } = turn;
  const seats = new Map(seatChoicesOf(view, msg).map((s) => [s.id, s]));
  const team = (view.proposedTeam ?? [])
    .map((id) => seats.get(id))
    .filter((s): s is SeatChoice => s !== undefined);

  // 候选项的次序沿用引擎给的，不在这里重排
  const options: ActionOption[] = votes.map((action) =>
    action.approve
      ? {
          action,
          label: msg.turn.vote.approve,
          detail: msg.turn.vote.approveDetail,
          tone: "positive" as const,
        }
      : {
          action,
          label: msg.turn.vote.reject,
          detail: msg.turn.vote.rejectDetail,
          tone: "negative" as const,
        },
  );

  // 撞满否决上限是坏人直接获胜（REJECT_LIMIT），最后一次机会才值得喊一嗓子
  const lastChance = view.rejectCount === view.maxRejects - 1;

  return {
    kind: "VOTE",
    title: msg.turn.vote.title,
    hint: msg.turn.vote.hint,
    team,
    options,
    warning: lastChance ? msg.turn.vote.warning(view.rejectCount) : null,
  };
}

function missionCardForm(turn: HumanTurn, msg: Messages): MissionCardForm | null {
  const cards = pickAll(turn.legalActions, "CAST_MISSION_CARD");
  if (cards.length === 0) return null;

  const { view } = turn;
  const { failsRequired } = view.currentMission;

  const options: ActionOption[] = cards.map((action) =>
    action.success
      ? {
          action,
          label: msg.turn.mission.success,
          detail: msg.turn.mission.successDetail,
          tone: "positive" as const,
        }
      : {
          action,
          label: msg.turn.mission.fail,
          detail: msg.turn.mission.failDetail,
          tone: "negative" as const,
        },
  );

  return {
    kind: "MISSION_CARD",
    title: msg.turn.mission.title(view.missionIndex + 1),
    hint:
      msg.turn.mission.hint + (failsRequired > 1 ? msg.turn.failsNote(failsRequired) : ""),
    options,
    // 一颗孤零零的按钮看起来像界面把另一个选项藏了，得说清楚它压根不存在
    note: options.length === 1 ? msg.turn.mission.onlySuccessNote : null,
  };
}

function assassinationForm(turn: HumanTurn, msg: Messages): AssassinationForm | null {
  const strikes = pickAll(turn.legalActions, "ASSASSINATE");
  if (strikes.length === 0) return null;

  const seats = new Map(seatChoicesOf(turn.view, msg).map((s) => [s.id, s]));
  const targets: TargetChoice[] = [];
  for (const action of strikes) {
    const seat = seats.get(action.targetId);
    if (seat) targets.push({ ...seat, action });
  }
  if (targets.length === 0) return null;

  return {
    kind: "ASSASSINATION",
    title: msg.turn.assassination.title,
    // rules.md §4.5 允许指自己和队友，就是为了不出现"没有合法目标"的死局。
    // 玩家看到自己也在名单里会以为是 bug，所以直说
    hint: msg.turn.assassination.hint,
    targets,
  };
}

// ---------------------------------------------------------------------------
// 出口
// ---------------------------------------------------------------------------

export function describeTurn(turn: HumanTurn, msg: Messages): TurnForm | null {
  switch (turn.kind) {
    case "TEAM_PROPOSAL":
      return teamForm(turn, msg);
    case "SPEECH":
      return speechForm(turn, msg);
    case "VOTE":
      return voteForm(turn, msg);
    case "MISSION_CARD":
      return missionCardForm(turn, msg);
    case "ASSASSINATION":
      return assassinationForm(turn, msg);
  }
}

/**
 * 组队提交。
 *
 * 【按座位号升序，不按点击顺序】proposedTeam 会原样进每个人的 PlayerView，
 * prompt.ts 里 `seatList(view.proposedTeam)` 直接把它念给所有 AI 听。
 * 保留点击顺序等于把"你先想到谁"一起广播出去。
 */
export function proposeAction(
  form: TeamForm,
  team: readonly PlayerId[],
  statement: string,
): GameAction {
  return { ...form.template, team: [...team].sort((a, b) => a - b), statement };
}

/** 发言提交。type 与 playerId 都由合法动作模板带着。 */
export function speakAction(form: SpeechForm, content: string): GameAction {
  return { ...form.template, content };
}

/**
 * 这一手的指纹。面板拿它当 key，换了一手就把草稿清干净。
 *
 * 【不能靠"组件会卸载"】提交时 store 先清 pendingTurn 再 resolve，中间确实有一次
 * 空渲染；但那依赖 React 的调度顺序，而代价是上一轮打了一半的发言原封不动
 * 出现在下一轮的输入框里。显式给 key 便宜得多。
 *
 * 任意两手至少有一项不同：阶段变了、轮次变了、否决数变了，
 * 或者上一手本身产生了一条发言 / 一次提交。
 */
export function turnKey(turn: HumanTurn): string {
  const v = turn.view;
  return [
    turn.kind,
    v.selfId,
    v.phase,
    v.missionIndex,
    v.rejectCount,
    v.speeches.length,
    v.progress.submitted,
  ].join(":");
}
