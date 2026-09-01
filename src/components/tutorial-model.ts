/**
 * 新手教程的八份示例视角。
 *
 * 【不是手搓 PlayerView】教程讲的正是信息隔离规则；如果这里自己拼 knowledge，
 * 它迟早会和 visibility.ts 分叉。两桌示例都走真实的 createGame + toPlayerView，
 * 因此角色规则一改，教程要么自动跟上，要么在下面的模型测试里明确失败。
 *
 * 【也不是当前对局】这些状态只存在于这个纯函数的局部变量里，不进 store、
 * 不读 gameStateAtom。组件最终只拿到引擎批准过的 PlayerView。
 *
 * 十人局一桌最多四个坏人，装不下莫甘娜、刺客、莫德雷德、奥伯伦、爪牙
 * 五种坏人身份。所以主桌使用莫德雷德 + 奥伯伦，爪牙单独取自第二桌。
 */
import {
  composeRoles,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  type PlayerView,
  type Role,
} from "@/lib/game";

export const TUTORIAL_ROLE_ORDER = [
  "MERLIN",
  "PERCIVAL",
  "LOYAL_SERVANT",
  "MORGANA",
  "ASSASSIN",
  "MORDRED",
  "OBERON",
  "MINION",
] as const satisfies readonly Role[];

const PLAYER_COUNT = 10;
const SEED = 0xa11ce;

function tutorialGame(freeEvilSlots: readonly Role[]) {
  const rng = createRng(SEED);
  return createGame({
    config: createConfig(PLAYER_COUNT, {
      seed: SEED,
      roles: composeRoles(PLAYER_COUNT, freeEvilSlots),
    }),
    humanSeat: null,
    personas: makePlaceholderPersonas(PLAYER_COUNT),
    rng,
  });
}

function viewOf(state: ReturnType<typeof tutorialGame>, role: Role): PlayerView {
  const player = state.players.find((candidate) => candidate.role === role);
  if (!player) throw new Error(`教程示例缺少角色 ${role}`);
  return toPlayerView(state, player.id);
}

/**
 * 每次返回全新的受限视角集合，调用方可以安全地把某一份交给 describeRole。
 */
export function buildTutorialRoleViews(): Record<Role, PlayerView> {
  const primary = tutorialGame(["MORDRED", "OBERON"]);
  const minionTable = tutorialGame(["OBERON", "MINION"]);

  return {
    MERLIN: viewOf(primary, "MERLIN"),
    PERCIVAL: viewOf(primary, "PERCIVAL"),
    LOYAL_SERVANT: viewOf(primary, "LOYAL_SERVANT"),
    MORGANA: viewOf(primary, "MORGANA"),
    ASSASSIN: viewOf(primary, "ASSASSIN"),
    MORDRED: viewOf(primary, "MORDRED"),
    OBERON: viewOf(primary, "OBERON"),
    MINION: viewOf(minionTable, "MINION"),
  };
}
