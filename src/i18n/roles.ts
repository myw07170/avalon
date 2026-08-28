/**
 * 角色的展示文案。
 *
 * 【为什么单独一个文件，而不是塞进 messages.zh.ts】角色名是 **UI 与 prompt 语料
 * 共用的词汇表**，这是它和其它任何一条文案的区别：
 * - 放进 UI 目录，`lib/ai/prompt.ts` 就得 import 整个 UI 目录，
 *   而那个文件的依赖窄到只有 types.ts 与 config.ts 是刻意的（见它的文件头）。
 * - 在 prompt-copy 里复制一份，迟早分叉成"玩家卡上写 Merlin、AI 嘴里说 Merlyn"。
 * 所以它谁都不属于，两边都 import 它。
 *
 * 【引擎不认识这个文件】`ROLE_META` 里只剩 `{ team, optional }` 这些判定要用的字段。
 * label / ability 是纯展示，引擎的任何判定都不该读它们。
 */
import type { Role } from "@/lib/game/types";
import type { Locale } from "./locale";

export interface RoleText {
  /** 角色名，如 "梅林" / "Merlin" */
  label: string;
  /** 一句话能力描述，可直接注入 prompt */
  ability: string;
}

export const ROLE_TEXT: Record<Locale, Record<Role, RoleText>> = {
  zh: {
    MERLIN: {
      label: "梅林",
      ability: "看到所有坏人，莫德雷德除外。被刺客命中则好人满盘皆输。",
    },
    PERCIVAL: {
      label: "派西维尔",
      ability: "看到梅林和莫甘娜两人，但无法区分谁是谁。",
    },
    LOYAL_SERVANT: {
      label: "忠臣",
      ability: "没有任何额外信息，只能靠推理。",
    },
    MORGANA: {
      label: "莫甘娜",
      ability: "在派西维尔眼中与梅林混淆。认识除奥伯伦外的所有坏人。",
    },
    ASSASSIN: {
      label: "刺客",
      ability: "好人集齐 3 分后由你指定刺杀目标，命中梅林则坏人翻盘。",
    },
    MORDRED: {
      label: "莫德雷德",
      ability: "梅林看不到你。认识除奥伯伦外的所有坏人。",
    },
    OBERON: {
      label: "奥伯伦",
      ability: "不认识任何队友，队友也不认识你；但梅林看得到你。",
    },
    MINION: {
      label: "爪牙",
      ability: "普通坏人，认识除奥伯伦外的所有坏人。",
    },
  },

  /*
   * 【用桌游的官方英文名，不自己造】阿瓦隆有通行的英文版，Merlin / Percival /
   * Morgana / Mordred / Oberon 是原名，Loyal Servant of Arthur 与 Minion of Mordred
   * 是官方译法的缩写。玩过实体版的人应该一眼认得出来。
   */
  en: {
    MERLIN: {
      label: "Merlin",
      ability:
        "You see every Evil player except Mordred. If the Assassin names you, Good loses everything.",
    },
    PERCIVAL: {
      label: "Percival",
      ability: "You see Merlin and Morgana, but cannot tell which is which.",
    },
    LOYAL_SERVANT: {
      label: "Loyal Servant",
      ability: "No extra information at all. You have only deduction.",
    },
    MORGANA: {
      label: "Morgana",
      ability:
        "Percival cannot tell you apart from Merlin. You know every Evil player except Oberon.",
    },
    ASSASSIN: {
      label: "Assassin",
      ability:
        "Once Good scores 3, you name one player as Merlin. A hit hands the game to Evil.",
    },
    MORDRED: {
      label: "Mordred",
      ability: "Merlin cannot see you. You know every Evil player except Oberon.",
    },
    OBERON: {
      label: "Oberon",
      ability:
        "You know no allies and they do not know you; but Merlin can see you.",
    },
    MINION: {
      label: "Minion",
      ability: "No special power. You know every Evil player except Oberon.",
    },
  },
};
