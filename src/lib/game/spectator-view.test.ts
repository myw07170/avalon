/**
 * 观战投影 toSpectatorView 的测试。
 *
 * 【这个文件的第一职责是防漂移】toSpectatorView 与 toPlayerView 是两份各自
 * 逐字段抄写的字面量（view.ts 文件头解释了为什么不共享 builder）。
 * 两份字面量会漂移，唯一的保障就是下面那条**公开面等价性**断言：
 * 同一个 state 下，两者的每个公开字段必须深相等。
 * 给 PlayerView 加了公开字段却忘了给观战加，这条会当场炸。
 *
 * 【第二职责仍然是防泄漏】观战多了一份 roles，但**不该多出别的任何东西**——
 * 尤其是任务票来源（cards）和 pending 的内容。
 */
import { describe, expect, it } from "vitest";
import { createConfig } from "./config";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import { reduce } from "./reduce";
import { toPlayerView, toSpectatorView } from "./view";
import {
  ROLE_TEAM,
  type GameState,
  type PlayerId,
  type PublicView,
  type Role,
} from "./types";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const SEVEN = 7;

function fresh(playerCount = SEVEN, seed = 7): GameState {
  return createGame({
    config: createConfig(playerCount, { seed }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(seed),
  });
}

/** 推到 TEAM_BUILDING：pending 里已经攒过东西，progress 也不再是 0/0 */
function started(playerCount = SEVEN): GameState {
  let state = reduce(fresh(playerCount), { type: "START_GAME" }, createRng(1));
  for (const player of state.players) {
    state = reduce(state, { type: "ACKNOWLEDGE", playerId: player.id }, createRng(1));
  }
  return state;
}

/**
 * 两个视角共有的那一面。
 *
 * 【键从 PlayerView 上取，不是手写一张表】手写的表会和类型各自演化，
 * 而这条断言的全部意义就是"类型加了字段，这里必须跟着"。
 */
const PUBLIC_KEYS = [
  "phase",
  "missionIndex",
  "currentLeaderId",
  "rejectCount",
  "maxRejects",
  "players",
  "roleComposition",
  "missionConfigs",
  "currentMission",
  "proposedTeam",
  "proposalHistory",
  "missionHistory",
  "speeches",
  "goodScore",
  "evilScore",
  "awaitingPlayerIds",
  "speakingOrder",
  "progress",
  "reveal",
] as const satisfies ReadonlyArray<keyof PublicView>;

// ---------------------------------------------------------------------------

describe("公开面与 toPlayerView 完全一致", () => {
  it.each([fresh(), started()])("每个公开字段逐一深相等", (state) => {
    const spectator = toSpectatorView(state);

    for (const seat of state.players) {
      const player = toPlayerView(state, seat.id);
      for (const key of PUBLIC_KEYS) {
        expect(spectator[key], `座位 ${seat.id} 的 ${key} 与观战视角不一致`).toEqual(
          player[key],
        );
      }
    }
  });

  it("PUBLIC_KEYS 覆盖了 SpectatorView 上除自我面与 roles 之外的全部字段", () => {
    // 【这条守着上面那条】给 PublicView 加了字段却忘了加进 PUBLIC_KEYS，
    // 等价性断言会静默地不检查它。这里当场炸
    const own = new Set(["selfId", "selfRole", "selfTeam", "knowledge", "selfSubmitted", "roles"]);
    const actual = Object.keys(toSpectatorView(started())).filter((k) => !own.has(k));

    expect(actual.sort()).toEqual([...PUBLIC_KEYS].sort());
  });
});

describe("没有自我面", () => {
  it("selfId / selfRole / selfTeam 恒为 null，knowledge 恒空", () => {
    const view = toSpectatorView(started());

    expect(view.selfId).toBeNull();
    expect(view.selfRole).toBeNull();
    expect(view.selfTeam).toBeNull();
    expect(view.knowledge).toEqual([]);
    expect(view.selfSubmitted).toBe(false);
  });

  it("selfSubmitted 在任何阶段都是 false", () => {
    // ROLE_REVEAL 是唯一"所有人都要提交"的阶段，落座视角在那里会翻成 true
    let state = reduce(fresh(), { type: "START_GAME" }, createRng(1));
    state = reduce(state, { type: "ACKNOWLEDGE", playerId: 0 }, createRng(1));

    expect(toPlayerView(state, 0).selfSubmitted).toBe(true);
    expect(toSpectatorView(state).selfSubmitted).toBe(false);
    // 但进度是公开的，两边一样
    expect(toSpectatorView(state).progress).toEqual(toPlayerView(state, 0).progress);
  });
});

describe("roles 是全量的", () => {
  it("覆盖每一个座位，且与引擎状态一致", () => {
    const state = started();
    const view = toSpectatorView(state);

    expect(Object.keys(view.roles)).toHaveLength(state.players.length);
    for (const player of state.players) {
      expect(view.roles[player.id]).toBe(player.role);
    }
  });

  it("阵营人数对得上配置", () => {
    const state = started(SEVEN);
    const roles = Object.values(toSpectatorView(state).roles);
    const evil = roles.filter((role: Role) => ROLE_TEAM[role] === "EVIL");

    // 7 人局 4 好 3 坏（rules.md §2）
    expect(evil).toHaveLength(3);
  });
});

describe("多出来的只有 roles", () => {
  it("终局之前 reveal 仍然是 null", () => {
    expect(toSpectatorView(started()).reveal).toBeNull();
  });

  it("拿不到任务票来源，也拿不到 pending 的任何内容", () => {
    const state: GameState = {
      ...started(),
      missionHistory: [
        {
          missionIndex: 0,
          attempt: 0,
          leaderId: 0,
          team: [0, 1],
          cards: [
            { playerId: 0, success: true },
            { playerId: 1, success: false },
          ],
          failCount: 1,
          succeeded: false,
        },
      ],
    };

    const dump = JSON.stringify(toSpectatorView(state));
    // cards 是"谁投的失败票"，PublicMissionRecord 刻意丢掉了它
    expect(dump).not.toContain("cards");
    expect(dump).not.toContain("persona");
    expect(dump).not.toContain("acknowledged");
    expect(dump).not.toContain("speakerIndex");
  });

  it("不共享引用：改返回值动不了引擎状态", () => {
    const state = started();
    const view = toSpectatorView(state);
    const seats: PlayerId[] = view.players.map((p) => p.id);

    view.players.pop();
    view.roles[0] = "OBERON";

    expect(state.players.map((p) => p.id)).toEqual(seats);
    expect(toSpectatorView(state).roles[0]).toBe(state.players[0]!.role);
  });
});
