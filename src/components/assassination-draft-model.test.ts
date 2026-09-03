import { describe, expect, it } from "vitest";
import {
  EMPTY_ASSASSINATION_DRAFT,
  selectedTargetForTurn,
  toggleAssassinationTarget,
} from "./assassination-draft-model";

describe("刺杀草稿", () => {
  it("点同一个目标取消", () => {
    const picked = toggleAssassinationTarget(EMPTY_ASSASSINATION_DRAFT, "turn-1", 3);
    expect(selectedTargetForTurn(picked, "turn-1")).toEqual([3]);

    const cleared = toggleAssassinationTarget(picked, "turn-1", 3);
    expect(selectedTargetForTurn(cleared, "turn-1")).toEqual([]);
  });

  it("点新目标直接替换旧目标，不用先取消", () => {
    const first = toggleAssassinationTarget(EMPTY_ASSASSINATION_DRAFT, "turn-1", 3);
    const swapped = toggleAssassinationTarget(first, "turn-1", 6);

    expect(selectedTargetForTurn(swapped, "turn-1")).toEqual([6]);
  });

  it("turnKey 变化后旧选择不可见，第一次点击从空选择开始", () => {
    const oldTurn = toggleAssassinationTarget(EMPTY_ASSASSINATION_DRAFT, "turn-1", 3);
    expect(selectedTargetForTurn(oldTurn, "turn-2")).toEqual([]);

    const newTurn = toggleAssassinationTarget(oldTurn, "turn-2", 8);
    expect(selectedTargetForTurn(newTurn, "turn-2")).toEqual([8]);
    expect(selectedTargetForTurn(newTurn, "turn-1")).toEqual([]);
  });
});
