/**
 * 观战屏的全部推导。SpectatorIntro / IdentityDeck / SpectatorBar / MindPanel 共用。
 *
 * 【唯一的数据源是 SpectatorView + 已翻开的座位集合】前者由引擎的 toSpectatorView
 * 给出（它恒带全场身份），后者是观战者自己的翻牌状态。**两者的交集才是能画的东西**——
 * 交集在 store 的 revealedRolesAtom 那一层已经取过一次，这里再取一次是因为
 * 心证要按座位筛，而那个 atom 只给身份表。两处的判据必须是同一个 revealedSeatsAtom。
 *
 * 【翻牌闸不是信息隔离边界】真正的边界是 liveDecisionsAtom：有人坐在桌上时它恒为空。
 * 这里做的是剧透控制——翻开 3 号的心证，很可能顺带读到"我知道 5 号是坏人"，
 * 面板上那句 mindsSpoilerNote 就是为这件事写的。
 *
 * 【不抛】认不出的形状返回空数组或 null，与 describeTurn / describeGameOver 同一条约定。
 */
import type { Messages } from "@/i18n/messages";
import { ROLE_TEAM, type PlayerId, type Role, type SpectatorView, type Team } from "@/lib/game";
import type { DecisionRecord } from "@/lib/ai/orchestrator";
import type { SeatTone } from "./role-card-model";

// ---------------------------------------------------------------------------
// 身份牌
// ---------------------------------------------------------------------------

export interface CastSeat {
  id: PlayerId;
  /** 「3 号（孙娜）」 */
  label: string;
  revealed: boolean;
  /** 未翻开时 null——牌背文案由组件画，模型这边不替它编一句 */
  roleLabel: string | null;
  role: Role | null;
  team: Team | null;
  /** 未翻开恒为 plain：观战的圆桌默认与落座局长得一样 */
  tone: SeatTone;
}

export function describeCast(
  view: SpectatorView,
  revealed: ReadonlySet<PlayerId>,
  msg: Messages,
): CastSeat[] {
  return view.players.map((player) => {
    const isUp = revealed.has(player.id);
    const role = view.roles[player.id];

    // role 取不到只可能是有人手搓了一个 view——toSpectatorView 覆盖全部座位。
    // 不编造身份，当作没翻开处理
    if (!isUp || !role) {
      return {
        id: player.id,
        label: msg.seat.named(player.id, player.name),
        revealed: false,
        roleLabel: null,
        role: null,
        team: null,
        tone: "plain",
      };
    }

    const team = ROLE_TEAM[role];
    return {
      id: player.id,
      label: msg.seat.named(player.id, player.name),
      revealed: true,
      roleLabel: msg.roles[role].label,
      role,
      team,
      tone: team === "EVIL" ? "evil" : "good",
    };
  });
}

// ---------------------------------------------------------------------------
// 实时心证
// ---------------------------------------------------------------------------

/**
 * 面板最多显示多少条。
 *
 * 【要有上限】一局 60–116 次决策，全铺出来的话观战屏会被一条几百行的列表占满，
 * 而这个面板要回答的是"它刚才为什么这么打"，不是"这一局的全部心路"。
 * 完整回放在终局的 GameOverPanel 里，那里本来就该长。
 */
export const MIND_LIMIT = 12;

export interface MindEntry {
  /** React key。decisions 是只追加的，下标就是稳定标识 */
  key: string;
  playerId: PlayerId;
  seatLabel: string;
  /** 已翻开才有值——能进这张表就说明翻开了，所以恒有值 */
  roleLabel: string;
  team: Team;
  kindLabel: string;
  reasoning: string;
  /** 「schema 兜底」「合法性兜底」「未调用模型」 */
  flags: string[];
  /** 「12.4s」。未调用模型时为 null */
  latencyLabel: string | null;
}

/**
 * 最近若干条心证，**新的在前**。
 *
 * 【字段口径抄 game-over-model 的 replayOf】同一份 DecisionRecord 在两个地方
 * 显示成两个样子，读的人会以为看到的不是一回事。差别只有两处：
 * 这里按翻牌过滤、按时间倒序，因为它是边打边看的。
 */
export function describeMinds(
  view: SpectatorView,
  decisions: readonly DecisionRecord[],
  revealed: ReadonlySet<PlayerId>,
  msg: Messages,
): MindEntry[] {
  const entries: MindEntry[] = [];

  // 从后往前扫，凑够 MIND_LIMIT 就停——不必为了取最后 12 条先过滤全部 116 条
  for (let i = decisions.length - 1; i >= 0 && entries.length < MIND_LIMIT; i -= 1) {
    const record = decisions[i]!;
    if (!revealed.has(record.playerId)) continue;

    const role = view.roles[record.playerId];
    if (!role) continue;

    const player = view.players.find((p) => p.id === record.playerId);
    entries.push({
      key: String(i),
      playerId: record.playerId,
      seatLabel: player
        ? msg.seat.named(record.playerId, player.name)
        : msg.seat.short(record.playerId),
      roleLabel: msg.roles[role].label,
      team: ROLE_TEAM[role],
      kindLabel: msg.gameOver.kind[record.kind],
      reasoning: record.result.payload.reasoning,
      flags: [
        record.result.fallback ? msg.gameOver.flagSchema : null,
        record.rescued ? msg.gameOver.flagRescued : null,
        record.auto ? msg.gameOver.flagAuto : null,
      ].filter((flag): flag is string => flag !== null),
      latencyLabel: record.auto ? null : `${(record.latencyMs / 1000).toFixed(1)}s`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 节奏
// ---------------------------------------------------------------------------

export type PaceKey = "slow" | "normal" | "fast" | "instant";

/**
 * 四档速度。ms 是 paceMsAtom 的基准值，实际停顿还要乘 PACE_WEIGHT 再减掉模型耗时
 * （见 store 的 paceOf）。
 *
 * 【为什么观战才需要这个】落座时每一轮都会停在你的操作面板上，节奏由你自己定；
 * 观战没有任何一处会等人，一局要么太慢看不完、要么太快跟不上。
 */
export const PACE_OPTIONS: ReadonlyArray<{ key: PaceKey; ms: number }> = [
  { key: "slow", ms: 1600 },
  { key: "normal", ms: 800 },
  { key: "fast", ms: 250 },
  { key: "instant", ms: 0 },
];

/** 当前 paceMs 落在哪一档。不精确匹配任何一档时给 null，UI 不高亮任何一个 */
export function paceKeyOf(paceMs: number): PaceKey | null {
  return PACE_OPTIONS.find((option) => option.ms === paceMs)?.key ?? null;
}
