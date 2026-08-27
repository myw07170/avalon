/**
 * 把 PlayerView 折成 RoleCard 要画的东西。
 *
 * 【组件绝不调 getKnownIdentities】那个函数要带着真实角色的 Player[]，
 * 拿到它就等于开天眼。toPlayerView 已经算好了 view.knowledge，这里只读它。
 *
 * 【文案对齐 prompt.ts】那边的 knowledgeLine / knowledgeSection 定好了口径，
 * 这里抄措辞而不是另发明一套——同一件事在两个地方说成两个样子，
 * 玩家会以为自己看到的和 AI 看到的不是一回事。区别只有一处：
 * prompt 给模型看，只写座位号；UI 给人看，配上名字。
 */
import {
  ROLE_META,
  ROLE_TEAM,
  countEvil,
  type PlayerId,
  type PlayerView,
  type Team,
} from "@/lib/game";

/**
 * 座位在圆桌上的标记。
 *
 * good 只在终局复盘里用（game-over-model）：对局中你并不知道谁是好人，
 * 把它用在别处就是开天眼。其余三档是对局中的身份认知。
 */
export type SeatTone = "plain" | "self" | "evil" | "unsure" | "good";

export interface SeatMark {
  id: PlayerId;
  tone: SeatTone;
}

/**
 * tone → 一句人话。
 *
 * 【放在 .ts 里而不是组件里】圆桌的图例、窄屏的座位列表两处都要用同一份，
 * 而 vitest 的 include 只收 .ts 后缀的测试——留在 .tsx 里就测不着。
 *
 * 【unsure 那两个座位共用同一句】派西维尔看到的那一对是引擎刻意抹平过的
 * （Knowledge.playerIds 升序存放），文案上给其中一个多一点分量就把答案泄回去了。
 */
export const SEAT_TONE_LABEL: Record<SeatTone, string> = {
  plain: "你不知道他的身份",
  self: "你",
  evil: "你知道他是坏人",
  unsure: "梅林与莫甘娜二者之一",
  // 对局中走不到这一档：good 只在终局复盘里用（见 SeatTone 的注释）
  good: "好人阵营",
};

export interface RoleBrief {
  label: string;
  team: Team;
  teamLabel: string;
  ability: string;
  /** 「你知道的」逐条。空 knowledge 时是那句"只能靠推理" */
  lines: string[];
  /** 要在圆桌上标出来的座位。总是含自己 */
  marks: SeatMark[];
  /** false 表示没有任何已知座位，不必画环 */
  hasKnownSeats: boolean;
  /** 只有梅林非 null。见 hiddenEvilHintOf */
  hiddenEvilHint: string | null;
}

const NO_KNOWLEDGE = "你没有任何额外的身份信息，只能靠推理。";

/** 座位在对局里一律按号称呼，名字只是补充 */
function seatName(view: PlayerView, id: PlayerId): string {
  const player = view.players.find((p) => p.id === id);
  return player ? `${id} 号（${player.name}）` : `${id} 号`;
}

/**
 * 梅林能从公开信息里多推一步。
 *
 * 梅林看得到除莫德雷德外的所有坏人，而坏人总数在 roleComposition 里是公开的
 * （rules.md §3.2 开局公开角色构成）。所以两者之差恒等于莫德雷德的数量，
 * 非 0 即 1——这是确定结论，不是猜测，也不构成泄漏。
 *
 * 新手最容易漏的就是这一步，所以直接写出来。
 */
function hiddenEvilHintOf(view: PlayerView): string | null {
  if (view.selfRole !== "MERLIN") return null;

  const total = countEvil(view.roleComposition);
  const seen = view.knowledge.length;
  return total > seen
    ? `本局有 ${total} 个坏人，你只看到 ${seen} 个——莫德雷德在场。`
    : `本局的 ${total} 个坏人你全看到了，没有莫德雷德。`;
}

export function describeRole(view: PlayerView): RoleBrief {
  const meta = ROLE_META[view.selfRole];
  const lines: string[] = [];
  const known = new Map<PlayerId, SeatTone>();

  for (const item of view.knowledge) {
    if (item.kind === "IS_EVIL") {
      lines.push(`${seatName(view, item.playerId)}是坏人。`);
      known.set(item.playerId, "evil");
      continue;
    }

    // 【这两个座位必须完全同等对待】playerIds 的升序是引擎刻意抹平信息的结果，
    // 按下标区分、排序、或给其中一个多一点视觉权重，都会把那条信息泄回去。
    // 所以：同一个 tone，同一条描述，原样输出。
    const [a, b] = item.playerIds;
    lines.push(
      `${seatName(view, a)}和${seatName(view, b)}中，` +
        `一个是${ROLE_META.MERLIN.label}、一个是${ROLE_META.MORGANA.label}，` +
        `但你分不清谁是谁。`,
    );
    known.set(a, "unsure");
    known.set(b, "unsure");
  }

  const marks: SeatMark[] = view.players.map((player) => ({
    id: player.id,
    // 自己永远是 self。knowledge 里本来就不含自己（visibility.ts 三重保证），
    // 这里再取一次优先级，是为了将来加 tone 时不会有人把自己标成坏人
    tone: player.id === view.selfId ? "self" : (known.get(player.id) ?? "plain"),
  }));

  return {
    label: meta.label,
    team: ROLE_TEAM[view.selfRole],
    teamLabel: ROLE_TEAM[view.selfRole] === "GOOD" ? "好人阵营" : "坏人阵营",
    ability: meta.ability,
    lines: lines.length > 0 ? lines : [NO_KNOWLEDGE],
    marks,
    hasKnownSeats: known.size > 0,
    hiddenEvilHint: hiddenEvilHintOf(view),
  };
}
