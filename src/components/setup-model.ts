/**
 * SetupScreen 的全部推导逻辑。
 *
 * 【为什么单独一个文件】组件里不放计算，这些函数就能用 .ts 测试覆盖，
 * 不必为这一步引入 jsdom 和 testing-library。SetupScreen 只负责把
 * previewSetup 的返回值画出来。
 *
 * 【引擎的配置函数会抛】getFreeEvilSlots / getEvilOptions / composeRoles /
 * createConfig 遇到 5-10 之外的人数一律抛 EngineError，不是返回 0 或空数组。
 * 在渲染期抛就是白屏，所以下面每一处都先过 isSupportedPlayerCount。
 * checkConfig 是唯一可以拿脏数据喂的——它纯查错，不抛。
 */
import {
  MISSION_TABLE,
  ROLE_TEAM,
  TEAM_SPLIT,
  checkConfig,
  composeRoles,
  createConfig,
  getEvilOptions,
  getFreeEvilSlots,
  isSupportedPlayerCount,
  type ConfigIssue,
  type GameConfig,
  type MissionConfig,
  type PlayerId,
  type Role,
} from "@/lib/game";
import type { PersonaSelectionMap } from "@/lib/persona-catalog";

/** 玩家在 SetupScreen 上编辑的东西。除此之外的一切都是推导出来的 */
export interface SetupDraft {
  playerCount: number;
  /** null 表示不落座，全 AI 观战局 */
  humanSeat: PlayerId | null;
  /** getEvilOptions(playerCount) 的下标 */
  evilOptionIndex: number;
  /** 只记录用户明确指定的 AI 人设；缺席的座位在开局时随机补齐 */
  personaSelections: PersonaSelectionMap;
}

export interface SetupPreview {
  /** 0 表示该人数配置固定，UI 不要渲染编辑器 */
  freeEvilSlots: number;
  evilOptions: Role[][];
  /** 当前选中的那一组自由位。配置固定时是空数组 */
  selectedEvil: Role[];
  roles: Role[];
  split: { good: number; evil: number };
  missions: MissionConfig[];
  /** 拦开局 */
  errors: ConfigIssue[];
  /** 只提示，不拦——莫德雷德用在 7/8 人局就是这种情况 */
  warnings: ConfigIssue[];
  canStart: boolean;
}

/** 默认 7 人：第一个有自由位的人数，一上来就能看见角色配置区在做什么 */
export const DEFAULT_PLAYER_COUNT = 7;

/**
 * 该人数的推荐配置对应 getEvilOptions 的哪一项。
 *
 * ROLE_PRESETS 是 rules.md §3.2 的推荐表，但它给的是完整 roles 数组，
 * 而 UI 选的是自由位下标。这里把两者对上，对不上就退回 0。
 */
export function presetOptionIndex(playerCount: number): number {
  if (!isSupportedPlayerCount(playerCount)) return 0;

  // createConfig 而不是直接读 ROLE_PRESETS：后者是个可变的导出对象，
  // 交给调用方就等于把引擎的表暴露在外面
  const preset = createConfig(playerCount).roles;
  const index = getEvilOptions(playerCount).findIndex(
    (option) => sameRoles(composeRoles(playerCount, option), preset),
  );
  return index >= 0 ? index : 0;
}

/** 两份 roles 是否等价。composeRoles 的输出已按 ROLE_ORDER 归一，逐项比即可 */
function sameRoles(a: readonly Role[], b: readonly Role[]): boolean {
  return a.length === b.length && a.every((role, i) => role === b[i]);
}

export function defaultDraft(playerCount: number = DEFAULT_PLAYER_COUNT): SetupDraft {
  return {
    playerCount,
    humanSeat: 0,
    evilOptionIndex: presetOptionIndex(playerCount),
    personaSelections: {},
  };
}

/**
 * 换人数。
 *
 * 【必须重置另外两项】10 人局选的「爪牙+爪牙」在 9 人局非法，
 * 座位 8 在 6 人局越界。带着旧值走，玩家会撞上一条自己没做错任何事的报错。
 */
export function withPlayerCount(draft: SetupDraft, playerCount: number): SetupDraft {
  if (playerCount === draft.playerCount) return draft;
  return defaultDraft(playerCount);
}

/** 换自由位组合。越界下标当作 0，不让一次误操作把界面卡在非法态 */
export function withEvilOption(draft: SetupDraft, index: number): SetupDraft {
  const options = isSupportedPlayerCount(draft.playerCount)
    ? getEvilOptions(draft.playerCount)
    : [];
  const safe = index >= 0 && index < options.length ? index : 0;
  return { ...draft, evilOptionIndex: safe };
}

/**
 * 点座位。点已经坐着的那个 = 起身，变成全 AI 观战局。
 * 越界座位一律当作起身，而不是静默钳到边界。
 */
export function withHumanSeat(draft: SetupDraft, seat: PlayerId): SetupDraft {
  const inRange = Number.isInteger(seat) && seat >= 0 && seat < draft.playerCount;
  const next = !inRange || draft.humanSeat === seat ? null : seat;
  const changed = { ...draft, humanSeat: next };
  return { ...changed, personaSelections: normalizePersonaSelections(changed) };
}

/**
 * 起身观战 / 坐回内部 ID 0（显示为 1 号）。
 *
 * 【为什么另给一对函数，而不是让人去点自己的座位】"再点一次起身"是 withHumanSeat
 * 的既有行为，好用，但只有点过的人才知道。观战是一种对局形态，得有个说得出名字的入口。
 *
 * 坐回时固定内部 ID 0 而不是记住上一次坐哪：多存一个字段就多一处会和 playerCount
 * 对不上的地方（withPlayerCount 那条注释说的就是这类问题），而重新点一下座位是零成本的。
 */
export function withSpectator(draft: SetupDraft): SetupDraft {
  return draft.humanSeat === null ? draft : { ...draft, humanSeat: null };
}

export function withSeat(draft: SetupDraft): SetupDraft {
  return draft.humanSeat === null ? withHumanSeat(draft, 0) : draft;
}

export function aiSeatsOf(draft: Pick<SetupDraft, "playerCount" | "humanSeat">): PlayerId[] {
  return Array.from({ length: draft.playerCount }, (_, seat) => seat).filter(
    (seat) => seat !== draft.humanSeat,
  );
}

/**
 * 丢掉越界、人类座位与重复 ID，只保留每个 ID 最先出现的 AI 座位。
 * 正常 UI 操作不会造出脏值；这层用于草稿形状变更与以后可能增加的导入入口。
 */
export function normalizePersonaSelections(draft: SetupDraft): PersonaSelectionMap {
  const aiSeats = new Set(aiSeatsOf(draft));
  const usedIds = new Set<string>();
  const normalized: Partial<Record<PlayerId, string>> = {};
  for (const [rawSeat, personaId] of Object.entries(draft.personaSelections)) {
    const seat = Number(rawSeat);
    if (!aiSeats.has(seat) || !personaId || usedIds.has(personaId)) continue;
    normalized[seat] = personaId;
    usedIds.add(personaId);
  }
  return normalized;
}

export function withPersonaSelection(
  draft: SetupDraft,
  seat: PlayerId,
  personaId: string | null,
): SetupDraft {
  if (!aiSeatsOf(draft).includes(seat)) return draft;
  const personaSelections = { ...normalizePersonaSelections(draft) };
  if (personaId === null) {
    delete personaSelections[seat];
  } else {
    const usedByAnotherSeat = Object.entries(personaSelections).some(
      ([rawSeat, selected]) => Number(rawSeat) !== seat && selected === personaId,
    );
    if (usedByAnotherSeat) return draft;
    personaSelections[seat] = personaId;
  }
  return { ...draft, personaSelections };
}

export function clearPersonaSelections(draft: SetupDraft): SetupDraft {
  return Object.keys(draft.personaSelections).length === 0
    ? draft
    : { ...draft, personaSelections: {} };
}

/** 当前草稿选中的那一组自由位。配置固定或人数非法时是空数组 */
function selectedEvilOf(draft: SetupDraft, options: Role[][]): Role[] {
  const option = options[draft.evilOptionIndex] ?? options[0];
  return option ? [...option] : [];
}

/**
 * 草稿 -> 界面要显示的一切。
 *
 * 人数非法时只回一条 PLAYER_COUNT_UNSUPPORTED——这与 checkConfig 自己的行为一致：
 * 人数取不出表，后面的检查全是误导性的连锁错误。
 */
export function previewSetup(draft: SetupDraft): SetupPreview {
  const { playerCount } = draft;

  if (!isSupportedPlayerCount(playerCount)) {
    return {
      freeEvilSlots: 0,
      evilOptions: [],
      selectedEvil: [],
      roles: [],
      split: { good: 0, evil: 0 },
      missions: [],
      errors: checkConfig({
        playerCount,
        roles: [],
        missions: [],
        maxRejects: 0,
        forcePassOnLastAttempt: false,
        seed: 0,
      }),
      warnings: [],
      canStart: false,
    };
  }

  const evilOptions = getEvilOptions(playerCount);
  const selectedEvil = selectedEvilOf(draft, evilOptions);
  const roles = composeRoles(playerCount, selectedEvil);

  // seed 在这里无所谓：checkConfig 不看它。真正的种子在 finalizeConfig 才定
  const config = candidateConfig(playerCount, roles, 0);
  const issues = checkConfig(config);
  const errors = issues.filter((i) => i.severity === "error");

  return {
    freeEvilSlots: getFreeEvilSlots(playerCount),
    evilOptions,
    selectedEvil,
    roles,
    split: splitOf(playerCount),
    missions: missionsOf(playerCount),
    errors,
    warnings: issues.filter((i) => i.severity === "warning"),
    // 【warning 不拦开局】莫德雷德在 7/8 人局是平衡性建议，不是规则
    canStart: errors.length === 0,
  };
}

/**
 * 拼一个待检的 GameConfig。
 *
 * 不走 createConfig：那个函数末尾会 validateConfig 然后抛，
 * 而这里的整个目的就是把非法配置交给 checkConfig 去描述。
 */
function candidateConfig(playerCount: number, roles: Role[], seed: number): GameConfig {
  return {
    playerCount,
    roles,
    missions: missionsOf(playerCount),
    maxRejects: createConfig(playerCount).maxRejects,
    forcePassOnLastAttempt: false,
    seed,
  };
}

function splitOf(playerCount: number): { good: number; evil: number } {
  const split = TEAM_SPLIT[playerCount];
  return split ? { good: split.good, evil: split.evil } : { good: 0, evil: 0 };
}

function missionsOf(playerCount: number): MissionConfig[] {
  return (MISSION_TABLE[playerCount] ?? []).map((m) => ({ ...m }));
}

/**
 * 交给 createGameAtom 的最终配置。
 *
 * 【seed 必须由调用方给】createConfig 的缺省 seed 是 0，而 0 是个真种子——
 * 不显式传的话每一局发的牌和洗的人设完全一样。调用方在**点击时**取
 * Date.now()，不在 useState 初值里取：那会让 SSR 和 hydration 对不上。
 *
 * 只在 preview.canStart 为真时调用。createConfig 末尾会 validateConfig 抛错，
 * createGameAtom 那边也 catch 了，这里不重复兜。
 */
export function finalizeConfig(draft: SetupDraft, seed: number): GameConfig {
  const preview = previewSetup(draft);
  return createConfig(draft.playerCount, { roles: preview.roles, seed });
}

/** 角色列表折成「忠臣 ×2」这种可读形式，按 ROLE_ORDER 的顺序 */
export interface RoleTally {
  role: Role;
  count: number;
  team: "GOOD" | "EVIL";
}

export function tallyRoles(roles: readonly Role[]): RoleTally[] {
  const tally: RoleTally[] = [];
  for (const role of roles) {
    const last = tally.at(-1);
    if (last?.role === role) {
      last.count += 1;
      continue;
    }
    tally.push({ role, count: 1, team: ROLE_TEAM[role] });
  }
  return tally;
}
