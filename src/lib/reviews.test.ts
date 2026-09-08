import { describe, expect, it } from "vitest";
import { describeGameOver } from "@/components/game-over-model";
import { zh } from "@/i18n/messages.zh";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame, type DecisionRecord } from "@/lib/ai/orchestrator";
import { createConfig, createGame, createRng, makePlaceholderPersonas, toPlayerView } from "@/lib/game";
import { createSavedReviewSnapshot } from "./reviews";

describe("SavedReviewSnapshot", () => {
  it("保存的是数据快照，之后可以重新生成复盘 brief", async () => {
    const seed = 7;
    const rng = createRng(seed);
    const state = createGame({
      config: createConfig(5, { seed }),
      humanSeat: 0,
      personas: makePlaceholderPersonas(4),
      rng,
    });
    const decisions: DecisionRecord[] = [];
    const final = await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      onHumanAction: async (turn) => turn.legalActions[0]!,
      hooks: { onDecision: (record) => void decisions.push(record) },
    });
    const view = toPlayerView(final, 0);

    const snapshot = createSavedReviewSnapshot({
      view,
      decisions,
      avatarSeed: 123,
      savedAt: "2026-09-08T00:00:00.000Z",
    });

    expect(snapshot).not.toBeNull();
    const liveBrief = describeGameOver(view, decisions, zh);
    const savedBrief = describeGameOver(snapshot!.view, snapshot!.decisions, zh);
    expect(savedBrief?.winner).toBe(liveBrief?.winner);
    expect(savedBrief?.reasonLabel).toBe(liveBrief?.reasonLabel);
    expect(savedBrief?.review).toHaveLength(liveBrief?.review.length ?? 0);
  });

  it("未到终局时不生成快照", () => {
    const rng = createRng(1);
    const state = createGame({
      config: createConfig(5, { seed: 1 }),
      humanSeat: 0,
      personas: makePlaceholderPersonas(4),
      rng,
    });

    expect(
      createSavedReviewSnapshot({
        view: toPlayerView(state, 0),
        decisions: [],
        avatarSeed: 123,
      }),
    ).toBeNull();
  });
});
