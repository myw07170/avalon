/**
 * 刺杀。整局唯一一个不可撤销、且当场决定胜负的动作。
 *
 * 【标得出来的"别刺他"只有你真的知道的那几个】刺客认识除奥伯伦外的队友，
 * 所以队友和自己可以标成"这一刀等于认输"。**奥伯伦标不出来**——刺客本来就不认识他
 * （visibility.ts 的既定规则），界面替他认出来就是开天眼。
 *
 * 所以 `risk` 为 null 的含义是"你不知道"，不是"安全"。差别写进了文案：
 * 与其假装名单干净，不如把"还有一个队友你也认不出来"这件事直说——
 * 那是从公开的 roleComposition 里推得出来的确定结论，不构成泄漏。
 */
import type { Messages } from "@/i18n/messages";
import { countEvil, type PlayerView } from "@/lib/game";
import type { AssassinationForm, TargetChoice } from "./action-panel-model";
import { describeFeed, type FeedEntry } from "./speech-feed-model";

export interface StrikeTarget extends TargetChoice {
  /**
   * 非 null 表示这一刀必输，文案说明为什么。
   *
   * **null 不代表安全，只代表你不知道。** 奥伯伦在这里恒为 null，
   * 那正是引擎刻意留给刺客的盲区。
   */
  risk: string | null;
}

export interface StrikeBrief {
  targets: StrikeTarget[];
  /**
   * 刚才所有坏人当众说的推测。
   *
   * assassination.ts 把它们记进公开的 speeches，不是坏人内部的暗票——
   * 好人也听得到。搬进这个面板只是省得玩家回去翻发言流。
   */
  opinions: FeedEntry[];
  /**
   * 一条有内容的推测都没有。
   *
   * 引擎允许空发言（见 speech-feed-model 的 isSilent），真会整场都没人开口。
   * 那时列出四条「（没有开口）」纯属噪音，改用一句话说完。
   */
  allSilent: boolean;
  /** 「还有一个队友你也认不出来」。没有奥伯伦时说的是另一句 */
  hiddenAllyHint: string;
}

/**
 * 这一刀是不是白给。
 *
 * 只认自己和 view.knowledge 明确给出的队友。奥伯伦不在 knowledge 里，
 * 于是恒返回 null——这是对的，不是漏了。
 */
function riskOf(target: TargetChoice, msg: Messages): string | null {
  if (target.isSelf) return msg.strike.riskSelf;
  if (target.tone === "evil") return msg.strike.riskAlly;
  return null;
}

/**
 * 名单里还藏着几个自己人。
 *
 * 【与梅林那条提示同源】坏人总数在 roleComposition 里是公开的（rules.md §3.2），
 * 减去自己、再减去 knowledge 里认得的队友，差额恒等于奥伯伦的数量（0 或 1）。
 * 所以这是确定结论而非猜测——见 role-card-model 的 hiddenEvilHintOf，
 * 那是梅林方向的同一道算术。
 */
function hiddenAllyHintOf(view: PlayerView, msg: Messages): string {
  const total = countEvil(view.roleComposition);
  const known = view.knowledge.filter((k) => k.kind === "IS_EVIL").length;
  const unknown = total - known - 1;

  return unknown <= 0
    ? msg.strike.allKnown(total)
    : msg.strike.someHidden(total, known, unknown);
}

export function describeStrike(
  form: AssassinationForm,
  view: PlayerView,
  msg: Messages,
): StrikeBrief {
  const opinions = describeFeed(view, msg).filter((entry) => entry.kind === "opinion");

  return {
    targets: form.targets.map((target) => ({ ...target, risk: riskOf(target, msg) })),
    opinions,
    allSilent: opinions.length > 0 && opinions.every((entry) => entry.isSilent),
    hiddenAllyHint: hiddenAllyHintOf(view, msg),
  };
}

/** 确认按钮上的字。指名道姓，别让人点完才发现指错了人 */
export function strikeLabel(target: StrikeTarget | null, msg: Messages): string {
  if (!target) return msg.strike.pickSomeone;
  return msg.strike.confirm(target.id, target.isSelf ? msg.strike.yourself : target.name);
}
