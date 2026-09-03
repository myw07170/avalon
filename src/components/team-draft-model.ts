import type { PlayerId } from "@/lib/game";

/**
 * 组队草稿只属于当前这一手。turnKey 换了以后，旧名单仍可留在内存里，
 * 但读取结果必须立刻变成空，避免上一轮的人选闪进新一轮。
 */
export interface TeamDraftState {
  turnKey: string | null;
  selected: readonly PlayerId[];
}

export const EMPTY_TEAM_DRAFT: TeamDraftState = { turnKey: null, selected: [] };

const NO_SELECTION: readonly PlayerId[] = [];

export function selectedTeamForTurn(
  state: TeamDraftState,
  turnKey: string | null,
): readonly PlayerId[] {
  return turnKey !== null && state.turnKey === turnKey ? state.selected : NO_SELECTION;
}

/** 选满以后不挤掉旧人；只能先取消，再补进新座位。 */
export function toggleTeamSelection(
  state: TeamDraftState,
  turnKey: string,
  playerId: PlayerId,
  limit: number,
): TeamDraftState {
  const selected = selectedTeamForTurn(state, turnKey);

  if (selected.includes(playerId)) {
    return { turnKey, selected: selected.filter((id) => id !== playerId) };
  }
  if (limit <= 0 || selected.length >= limit) {
    return state.turnKey === turnKey ? state : { turnKey, selected };
  }
  return { turnKey, selected: [...selected, playerId] };
}
