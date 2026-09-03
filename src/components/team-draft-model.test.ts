import { describe, expect, it } from "vitest";
import {
  EMPTY_TEAM_DRAFT,
  selectedTeamForTurn,
  toggleTeamSelection,
} from "./team-draft-model";

describe("组队草稿", () => {
  it("同一座位再次点击会取消", () => {
    const picked = toggleTeamSelection(EMPTY_TEAM_DRAFT, "round-1", 3, 2);
    expect(selectedTeamForTurn(picked, "round-1")).toEqual([3]);

    const cleared = toggleTeamSelection(picked, "round-1", 3, 2);
    expect(selectedTeamForTurn(cleared, "round-1")).toEqual([]);
  });

  it("选满后不会悄悄挤掉先选的人", () => {
    const one = toggleTeamSelection(EMPTY_TEAM_DRAFT, "round-1", 3, 2);
    const full = toggleTeamSelection(one, "round-1", 6, 2);
    const refused = toggleTeamSelection(full, "round-1", 8, 2);

    expect(refused).toBe(full);
    expect(selectedTeamForTurn(refused, "round-1")).toEqual([3, 6]);
  });

  it("turnKey 变化后旧名单不可见，第一次点击从空名单开始", () => {
    const oldTurn = toggleTeamSelection(EMPTY_TEAM_DRAFT, "round-1", 3, 3);
    expect(selectedTeamForTurn(oldTurn, "round-2")).toEqual([]);

    const newTurn = toggleTeamSelection(oldTurn, "round-2", 8, 3);
    expect(selectedTeamForTurn(newTurn, "round-2")).toEqual([8]);
    expect(selectedTeamForTurn(newTurn, "round-1")).toEqual([]);
  });
});
