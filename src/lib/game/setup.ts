/**
 * 建局：洗牌发牌，产出初始 GameState。
 *
 * 产出的状态停在 SETUP 阶段。按 state-machine.md §2，SETUP 负责"分配角色、确定首任队长"，
 * 再由 START_GAME 动作转入 ROLE_REVEAL——所以这里不要直接给 ROLE_REVEAL，
 * 否则 SETUP 阶段和 START_GAME 动作就成了死代码。
 */
import { validateConfig } from "./config";
import { randomInt, shuffle } from "./rng";
import {
  EngineError,
  createPending,
  type GameConfig,
  type GameState,
  type Persona,
  type Player,
  type PlayerId,
  type RngFn,
} from "./types";

export interface CreateGameOptions {
  config: GameConfig;
  /** 人类玩家的座位号，null 表示全 AI 观战局 */
  humanSeat: PlayerId | null;
  /** AI 人设，数量需覆盖所有非人类座位。多余的会被忽略 */
  personas: Persona[];
  rng: RngFn;
}

/**
 * 占位人设，给引擎测试和随机模拟用。
 * 阶段 4 会换成真正有性格差异的人设库——那时这个函数就该删掉。
 */
export function makePlaceholderPersonas(count: number): Persona[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `AI-${i + 1}`,
    traits: ["占位"],
    speechStyle: "占位人设，阶段 4 替换",
  }));
}

/**
 * 产出停在 SETUP 阶段的初始状态。
 *
 * 易错点：必须先 shuffle 再按座位分配。直接按下标发牌，
 * 数量测试照样全绿，但每局梅林都固定在 0 号位。
 *
 * 洗的是 config.roles 而不是 ROLE_PRESETS——用户可能自定义过角色构成。
 */
export function createGame(options: CreateGameOptions): GameState {
  const { config, humanSeat, personas, rng } = options;

  validateConfig(config);

  const { playerCount } = config;
  if (
    humanSeat !== null &&
    (!Number.isInteger(humanSeat) || humanSeat < 0 || humanSeat >= playerCount)
  ) {
    throw new EngineError(
      `人类座位号 ${humanSeat} 越界，应在 0-${playerCount - 1} 之间`,
      "CONFIG_INVALID",
      { humanSeat, playerCount },
    );
  }

  const aiSeatCount = humanSeat === null ? playerCount : playerCount - 1;
  if (personas.length < aiSeatCount) {
    throw new EngineError(
      `需要 ${aiSeatCount} 份 AI 人设，只收到 ${personas.length} 份`,
      "CONFIG_INVALID",
      { required: aiSeatCount, received: personas.length },
    );
  }

  const dealt = shuffle(config.roles, rng);
  let personaCursor = 0;
  const players: Player[] = dealt.map((role, seat) => {
    if (seat === humanSeat) {
      return { id: seat, name: "你", role, isHuman: true, persona: null };
    }
    const persona = personas[personaCursor];
    personaCursor += 1;
    if (!persona) {
      // 上面已校验过 personas.length，走到这里就是引擎自己算错了
      throw new EngineError(
        `座位 ${seat} 取不到人设，游标 ${personaCursor - 1}`,
        "INTERNAL",
        { seat, personaCursor },
      );
    }
    return { id: seat, name: persona.name, role, isHuman: false, persona };
  });

  return {
    config,
    players,
    phase: "SETUP",

    missionIndex: 0,
    currentLeaderId: randomInt(rng, playerCount),
    rejectCount: 0,

    proposedTeam: null,
    pending: createPending(),

    proposalHistory: [],
    missionHistory: [],
    speeches: [],

    goodScore: 0,
    evilScore: 0,

    assassination: null,
    winner: null,
    winReason: null,

    log: [],
  };
}
