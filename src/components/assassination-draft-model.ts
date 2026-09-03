import type { PlayerId } from "@/lib/game";

/**
 * 刺杀草稿只属于当前这一手。turnKey 换了以后，旧选择仍可留在内存里，
 * 但读取结果必须立刻变成空，避免上一手的刺杀目标闪进新的一手。
 *
 * 与 team-draft-model 平行，但选人逻辑不同：单选，点新目标直接替换旧的，
 * 不像组队那样要先取消再补进。
 */
export interface AssassinationDraftState {
  turnKey: string | null;
  selected: readonly PlayerId[];
}

export const EMPTY_ASSASSINATION_DRAFT: AssassinationDraftState = {
  turnKey: null,
  selected: [],
};

const NO_SELECTION: readonly PlayerId[] = [];

export function selectedTargetForTurn(
  state: AssassinationDraftState,
  turnKey: string | null,
): readonly PlayerId[] {
  return turnKey !== null && state.turnKey === turnKey ? state.selected : NO_SELECTION;
}

/**
 * 单选切换。点同一个目标取消，点新目标直接替换旧目标——
 * 刺杀只选一个人，没有组队那种"选满后要先取消再补进"的顾虑。
 */
export function toggleAssassinationTarget(
  state: AssassinationDraftState,
  turnKey: string,
  playerId: PlayerId,
): AssassinationDraftState {
  const selected = selectedTargetForTurn(state, turnKey);

  if (selected.includes(playerId)) {
    return { turnKey, selected: [] };
  }
  return { turnKey, selected: [playerId] };
}
