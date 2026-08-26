/**
 * 对局记录的渲染与回读。
 *
 * 【为什么要有 parse】三份真实对局记录（transcripts/*.txt）是**不可再生**的：
 * seed 不同、模型有随机性，重跑既花钱也拿不回当初那两处自曝的原始证据。
 * 要把它们渲染成网页，就只能从已落盘的文本读回来。
 *
 * 【格式只有一个真源】render 与 parse 必须互为逆运算，靠 transcript.test.ts 里那条
 * 往返用例钉住：改了 render 的分隔符而 parse 没跟上，当场就炸，
 * 不会等到页面渲染出乱码才发现。
 */
import { ROLE_META, type GameState, type Role, type Speech } from "../game/types";
import { findDeductionMisses, type Deduction, type DeductionMiss } from "./deduction";
import type { DecisionRecord } from "./orchestrator";

// ---------------------------------------------------------------------------
// 结构
// ---------------------------------------------------------------------------

export interface TranscriptSeat {
  playerId: number;
  name: string;
  roleLabel: string;
}

export interface TranscriptSpeech extends TranscriptSeat {
  /** 从 1 开始，与文本里的"第 N 轮"一致 */
  round: number;
  /**
   * 从 1 开始的提议次数，只有组队与提议讨论有。
   * **可选**：三份早期记录（transcripts/*.txt）里没有这一段，读回来就是 undefined。
   */
  attempt?: number;
  /** "组队" / "提议讨论" / "复盘讨论"。同样可选，理由同上 */
  phaseLabel?: string;
  content: string;
}

/** 刺杀阶段的公开推测。没有轮次概念，所以不带 round */
export interface TranscriptOpinion extends TranscriptSeat {
  content: string;
}

export interface TranscriptMission {
  round: number;
  team: number[];
  failCount: number;
  succeeded: boolean;
}

export interface TranscriptAssassination {
  opinions: TranscriptOpinion[];
  target: TranscriptSeat;
  hit: boolean;
}

export interface TranscriptStats {
  winner: "GOOD" | "EVIL";
  winReason: string;
  calls: number;
  fallback: { count: number; pct: string };
  rescued: { count: number; pct: string };
  avgAttempts: number;
}

export interface Transcript {
  model: string;
  seed: number;
  seats: TranscriptSeat[];
  speeches: TranscriptSpeech[];
  missions: TranscriptMission[];
  assassination: TranscriptAssassination | null;
  /** "被拦下的非法动作"那几行，原样保留。第 1 局那份文件里没有这一段 */
  rescuedActions: string[];
  /** "推理踩雷"那几行，同样原样保留。前三局那几份文件里没有这一段 */
  deductionMisses: string[];
  stats: TranscriptStats;
}

export interface TranscriptMeta {
  /** 形如 "openai / gpt-5-nano" */
  model: string;
  seed: number;
}

// ---------------------------------------------------------------------------
// 自曝判定
// ---------------------------------------------------------------------------

/**
 * 说话人在自己的公开发言里提到了自己的角色名。
 *
 * 【必须按说话人分别判】忠臣提"梅林"是正常推理，梅林提"梅林"才可疑——
 * 对全场做一次 grep 会把整局正常发言全报成事故。
 *
 * 【分两档】真正的自曝是**给自己贴标签**（"作为梅林……"）。梅林在发言里谈论"梅林"
 * （"别急于指认梅林"）是正常推理甚至是好牌，只算 mention。
 * 第 3 局 35 条发言里有 14 条 mention、0 条 blatant，一刀切会把那 14 条全误报。
 */
export function selfExposure(
  speech: Pick<TranscriptSeat, "roleLabel"> & { content: string },
): { kind: "blatant" | "mention" } | null {
  const { roleLabel, content } = speech;
  if (!roleLabel || !content.includes(roleLabel)) return null;
  // 注意这里必须是 \s（正则里的空白类），写成 \s 会被模板字符串吃成字母 s——
  // 那样 "作为 梅林" 就漏判了，而且因为 s* 可以匹配零次，表面上还看不出错
  const blatant = new RegExp(`(作为|我是|身为|我的角色是)\\s*${escapeRegExp(roleLabel)}`).test(
    content,
  );
  return { kind: blatant ? "blatant" : "mention" };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/** 发言里真出现换行会把逐行格式撕开，渲染时折平。这是格式的前提，不是修饰 */
function flatten(content: string): string {
  return content.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * 发言行方括号里的两段附注。
 *
 * 少了它们，同一轮的提议讨论与复盘讨论在记录里长得一模一样——
 * real-game-94938.txt 第 1 轮那 10 条就是这么黏在一起的，人读着极易误判。
 *
 * 提议次数只标组队与提议讨论：复盘的 attempt 按 types.ts 的约定是"该轮最后一次提议"，
 * 标出来会让人以为复盘也分了好几次。
 */
const PHASE_TAG: Record<string, string> = {
  TEAM_BUILDING: "组队",
  PROPOSAL_DISCUSSION: "提议讨论",
  REVIEW_DISCUSSION: "复盘讨论",
};

function phaseTag(speech: Speech): string {
  const label = PHASE_TAG[speech.phase];
  return label ? ` ${label}` : "";
}

function attemptTag(speech: Speech): string {
  const numbered =
    speech.phase === "TEAM_BUILDING" || speech.phase === "PROPOSAL_DISCUSSION";
  return numbered ? ` 第 ${speech.attempt + 1} 次提议` : "";
}

/**
 * 一条硬结论的人话版本。只在复盘里出现——**它绝不进 prompt**，
 * 那是上一版的错误设计（见 deduction.ts 的文件头）。
 */
function basisText(basis: Deduction): string {
  if (basis.kind === "ALL_EVIL") {
    return `第 ${basis.missionIndex + 1} 轮队伍 ${basis.playerIds.join("、")} 全员交了失败票 → 都是坏人`;
  }
  if (basis.kind === "MIN_EVIL") {
    return (
      `第 ${basis.missionIndex + 1} 轮队伍 ${basis.team.join("、")} 出 ${basis.atLeast} 张失败票` +
      ` → 至少 ${basis.atLeast} 个坏人，任挑 ${basis.pickSize} 人必含坏人`
    );
  }
  return "坏人名额已被占满";
}

/** 一次踩雷两行：提议本身 + 当时就该知道的依据 */
function missLines(miss: DeductionMiss, nameOf: (id: number) => string): string[] {
  return [
    `  第 ${miss.missionIndex + 1} 轮第 ${miss.attempt + 1} 次提议：${nameOf(miss.leaderId)}` +
      `${miss.leaderIsEvil ? "[坏]" : "[好]"} 提名 ${miss.team.join("、")}` +
      ` → ${miss.approved ? "通过" : "否决"}`,
    `    依据：${basisText(miss.basis)}；本次提议踩中 ${miss.overlap.join("、")}`,
  ];
}

/**
 * 有多少条发言提到了任务结果。
 *
 * **刻意做得很粗**（就是找几个词），它只是个风向标：首两局真实对局里这个数字是 0/35 ——
 * 挂了两轮任务，没有一个 AI 提过任何一次结果。做成精细的语义判定既不可靠，
 * 也会让人误以为它是个准确指标。
 */
function countMentions(final: GameState): number {
  return final.speeches.filter((s) =>
    ["失败票", "失败", "翻车", "挂了"].some((word) => s.content.includes(word)),
  ).length;
}

export function renderTranscript(
  final: GameState,
  records: DecisionRecord[],
  meta: TranscriptMeta,
): string {
  const lines: string[] = [];
  const nameOf = (id: number): string => {
    const player = final.players.find((p) => p.id === id);
    return `${id} 号「${player?.name ?? "?"}」（${player ? ROLE_META[player.role].label : "?"}）`;
  };

  lines.push(`模型：${meta.model}，seed ${meta.seed}`);

  lines.push("\n=== 座位与身份 ===");
  for (const player of final.players) lines.push(`  ${nameOf(player.id)}`);

  lines.push("\n=== 全场发言 ===");
  for (const speech of final.speeches) {
    lines.push(
      `  [第 ${speech.missionIndex + 1} 轮${attemptTag(speech)}${phaseTag(speech)}] ` +
        `${nameOf(speech.playerId)}：${flatten(speech.content)}`,
    );
  }

  lines.push("\n=== 任务与提议 ===");
  for (const mission of final.missionHistory) {
    lines.push(
      `  第 ${mission.missionIndex + 1} 轮：队伍 ${mission.team.join("、")}，` +
        `失败票 ${mission.failCount} 张 → ${mission.succeeded ? "成功" : "失败"}`,
    );
  }

  if (final.assassination) {
    lines.push("\n=== 刺杀 ===");
    for (const opinion of final.assassination.opinions) {
      lines.push(`  ${nameOf(opinion.playerId)}：${flatten(opinion.content)}`);
    }
    lines.push(
      `  刺客指认 ${nameOf(final.assassination.targetId)} → ${final.assassination.hit ? "命中" : "落空"}`,
    );
  }

  /** 被 orchestrator 换掉的动作：模型原本想做什么，才是复盘要看的东西 */
  const rescuedRecords = records.filter((r) => r.rescued);
  if (rescuedRecords.length > 0) {
    lines.push("\n=== 被拦下的非法动作 ===");
    for (const record of rescuedRecords) {
      lines.push(
        `  ${nameOf(record.playerId)} ${record.kind}` +
          `：模型给的 ${JSON.stringify(record.result.payload)}` +
          ` → 实际提交 ${JSON.stringify(record.action)}`,
      );
    }
  }

  const misses = findDeductionMisses(final);
  lines.push("\n=== 推理踩雷 ===");
  for (const miss of misses) lines.push(...missLines(miss, nameOf));
  lines.push(
    `  提名踩雷 ${misses.length}/${final.proposalHistory.length} 次` +
      `（其中好人队长 ${misses.filter((m) => !m.leaderIsEvil).length} 次）`,
  );
  lines.push(
    `  发言提到失败记录 ${countMentions(final)}/${final.speeches.length} 条` +
      "（粗略字符串统计，仅供参考）",
  );

  const roleOf = (id: number): Role | undefined => final.players.find((p) => p.id === id)?.role;
  const flagged = final.speeches.flatMap((speech) => {
    const role = roleOf(speech.playerId);
    if (role === undefined) return [];
    const hit = selfExposure({ roleLabel: ROLE_META[role].label, content: speech.content });
    return hit ? [{ speech, blatant: hit.kind === "blatant" }] : [];
  });
  const blatantCount = flagged.filter((x) => x.blatant).length;

  if (flagged.length > 0) {
    lines.push("\n=== 说话人提到了自己的角色名 ===");
    for (const { speech, blatant } of [...flagged].sort((a, b) => +b.blatant - +a.blatant)) {
      lines.push(
        `  ${blatant ? "【自曝】" : "【只是提到】"} ${nameOf(speech.playerId)}：` +
          flatten(speech.content).slice(0, 100),
      );
    }
  }

  const fallbacks = records.filter((r) => r.result.fallback).length;
  const rescued = rescuedRecords.length;
  const pct = (n: number): string => `${((n / records.length) * 100).toFixed(1)}%`;

  lines.push("\n=== 结果 ===");
  lines.push(`  ${final.winner === "GOOD" ? "好人" : "坏人"}获胜（${final.winReason}）`);
  lines.push(`  LLM 调用 ${records.length} 次`);
  // 完成标准：超过 5% 说明 prompt 或 schema 有问题
  lines.push(`  schema 兜底 ${fallbacks} 次（${pct(fallbacks)}）`);
  // 形状合法但规则非法，被 orchestrator 换掉的
  lines.push(`  合法性兜底 ${rescued} 次（${pct(rescued)}）`);
  lines.push(
    `  自曝身份 ${blatantCount} 条（另有 ${flagged.length - blatantCount} 条只是提到自己的角色名），` +
      `共 ${final.speeches.length} 条发言`,
  );

  const totalAttempts = records.reduce((sum, r) => sum + (r.result.debug?.attempts ?? 0), 0);
  lines.push(`  平均每次决策调用模型 ${(totalAttempts / records.length).toFixed(2)} 次`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 回读
// ---------------------------------------------------------------------------

/** 解析失败一律抛，绝不返回半份数据——半份数据渲染出来是"看着像对的"，最难查 */
export class TranscriptParseError extends Error {
  constructor(message: string, readonly line?: string) {
    super(line === undefined ? message : `${message}：${line}`);
    this.name = "TranscriptParseError";
  }
}

const HEADER_RE = /^模型：(.+)，seed (\d+)$/;
/** 结尾那个空格是可选的：早期的记录里就没有（transcripts/real-game-319.txt） */
const SECTION_RE = /^=== (.+?) *===$/;
/** 「」（）的位置固定，正文一律取到行尾——正文里含「」（）：都不会切错 */
const SEAT_RE = /^(\d+) 号「(.*?)」（([^（）]*)）$/;
/**
 * 提议次数与讨论类型是**可选**捕获组：三份早期记录里没有这两段，
 * 而它们不可再生（见文件头注释），只能在这里兼容，不能指望回头去改文件。
 */
const SPEECH_RE =
  /^\[第 (\d+) 轮(?: 第 (\d+) 次提议)?(?: (组队|提议讨论|复盘讨论))?\] (\d+) 号「(.*?)」（([^（）]*)）：([\s\S]*)$/;
const OPINION_RE = /^(\d+) 号「(.*?)」（([^（）]*)）：([\s\S]*)$/;
const TARGET_RE = /^刺客指认 (\d+) 号「(.*?)」（([^（）]*)） → (命中|落空)$/;
const MISSION_RE = /^第 (\d+) 轮：队伍 ([\d、]+)，失败票 (\d+) 张 → (成功|失败)$/;
const WINNER_RE = /^(好人|坏人)获胜（(.+)）$/;
const CALLS_RE = /^LLM 调用 (\d+) 次$/;
const FALLBACK_RE = /^schema 兜底 (\d+) 次（(.+)）$/;
const RESCUED_RE = /^合法性兜底 (\d+) 次（(.+)）$/;
const ATTEMPTS_RE = /^平均每次决策调用模型 ([\d.]+) 次$/;

/**
 * 这一段是从 speeches 推出来的，不解析——解析它等于让同一个事实有两个来源。
 * 页面要用就现算 selfExposure()。
 *
 * 两个名字都要认：第 2 局那份记录还叫"疑似自曝身份（……）"。落盘的记录不可再生，
 * 历史标题只能在这里兼容，不能指望回头去改文件。
 */
const DERIVED_SECTIONS = [
  "说话人提到了自己的角色名",
  "疑似自曝身份（说话人在自己发言里提到了自己的角色名）",
];

function match(re: RegExp, line: string, what: string): RegExpMatchArray {
  const found = re.exec(line);
  if (!found) throw new TranscriptParseError(`${what}这一行不认识`, line);
  return found;
}

/** 捕获组一定存在（正则匹配上了），取不到只可能是正则和这里对不上 */
function group(found: RegExpMatchArray, index: number): string {
  const value = found[index];
  if (value === undefined) {
    throw new TranscriptParseError(`正则第 ${index} 组没捕获到东西`, found[0]);
  }
  return value;
}

function seatOf(found: RegExpMatchArray, offset: number): TranscriptSeat {
  return {
    playerId: Number(group(found, offset)),
    name: group(found, offset + 1),
    roleLabel: group(found, offset + 2),
  };
}

export function parseTranscript(text: string): Transcript {
  const raw = text.split("\n");
  const header = raw.find((line) => HEADER_RE.test(line.trim()));
  if (!header) throw new TranscriptParseError("找不到「模型：… seed …」那一行");
  const meta = match(HEADER_RE, header.trim(), "文件头");

  // 先按 === 标题 === 切段。正文行统一去掉两格缩进
  const sections = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of raw) {
    const trimmed = line.trim();
    if (trimmed === "" || HEADER_RE.test(trimmed)) continue;
    const title = SECTION_RE.exec(trimmed);
    if (title) {
      current = [];
      sections.set(group(title, 1), current);
      continue;
    }
    if (!current) throw new TranscriptParseError("有内容出现在第一个小节之前", line);
    current.push(trimmed);
  }

  const known = new Set([
    "座位与身份",
    "全场发言",
    "任务与提议",
    "刺杀",
    "被拦下的非法动作",
    "推理踩雷",
    "结果",
    ...DERIVED_SECTIONS,
  ]);
  for (const title of sections.keys()) {
    // render 里加了新小节而这里没跟上，要立刻发现，不能默默丢掉
    if (!known.has(title)) throw new TranscriptParseError(`不认识的小节「${title}」`);
  }

  const linesOf = (title: string): string[] => sections.get(title) ?? [];

  const seats = linesOf("座位与身份").map((line) => seatOf(match(SEAT_RE, line, "座位"), 1));

  const speeches: TranscriptSpeech[] = linesOf("全场发言").map((line) => {
    const found = match(SPEECH_RE, line, "发言");
    // 这两组可选，取不到是旧格式的正常情况，
    // **不能走 group()**——它遇到 undefined 会抛，那会把三份旧记录全读废
    const attempt = found[2];
    const phaseLabel = found[3];
    return {
      round: Number(group(found, 1)),
      ...(attempt === undefined ? {} : { attempt: Number(attempt) }),
      ...(phaseLabel === undefined ? {} : { phaseLabel }),
      ...seatOf(found, 4),
      content: group(found, 7),
    };
  });

  const missions: TranscriptMission[] = linesOf("任务与提议").map((line) => {
    const found = match(MISSION_RE, line, "任务");
    return {
      round: Number(group(found, 1)),
      team: group(found, 2).split("、").map(Number),
      failCount: Number(group(found, 3)),
      succeeded: group(found, 4) === "成功",
    };
  });

  const assassinationLines = linesOf("刺杀");
  let assassination: TranscriptAssassination | null = null;
  if (assassinationLines.length > 0) {
    const last = assassinationLines[assassinationLines.length - 1];
    if (last === undefined) throw new TranscriptParseError("刺杀小节是空的");
    const target = match(TARGET_RE, last, "刺杀结果");
    assassination = {
      opinions: assassinationLines.slice(0, -1).map((line) => {
        const found = match(OPINION_RE, line, "刺杀推测");
        return { ...seatOf(found, 1), content: group(found, 4) };
      }),
      target: seatOf(target, 1),
      hit: group(target, 4) === "命中",
    };
  }

  const result = linesOf("结果");
  const pick = (re: RegExp, what: string): RegExpMatchArray => {
    const line = result.find((candidate) => re.test(candidate));
    if (!line) throw new TranscriptParseError(`结果小节里找不到${what}`);
    return match(re, line, what);
  };
  const winner = pick(WINNER_RE, "胜负");
  const fallback = pick(FALLBACK_RE, "schema 兜底");
  const rescued = pick(RESCUED_RE, "合法性兜底");

  return {
    model: group(meta, 1),
    seed: Number(group(meta, 2)),
    seats,
    speeches,
    missions,
    assassination,
    rescuedActions: linesOf("被拦下的非法动作"),
    // 三份早期记录里没有这一段，linesOf 给空数组即可——它们不可再生，不能让 parse 抛
    deductionMisses: linesOf("推理踩雷"),
    stats: {
      winner: group(winner, 1) === "好人" ? "GOOD" : "EVIL",
      winReason: group(winner, 2),
      calls: Number(group(pick(CALLS_RE, "调用次数"), 1)),
      fallback: { count: Number(group(fallback, 1)), pct: group(fallback, 2) },
      rescued: { count: Number(group(rescued, 1)), pct: group(rescued, 2) },
      avgAttempts: Number(group(pick(ATTEMPTS_RE, "平均调用次数"), 1)),
    },
  };
}
