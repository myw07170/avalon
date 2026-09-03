"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import type { PlayerId } from "@/lib/game";
import { humanTurnAtom } from "@/store/game";
import { turnKey } from "./action-panel-model";
import {
  EMPTY_TEAM_DRAFT,
  selectedTeamForTurn,
  toggleTeamSelection,
} from "./team-draft-model";

export interface TeamDraftControls {
  active: boolean;
  selected: readonly PlayerId[];
  teamSize: number;
  full: boolean;
  toggle: (id: PlayerId) => void;
}

const TeamDraftContext = createContext<TeamDraftControls | null>(null);

/** 只包住玩家局的进行中页面；离开这一屏，整份临时草稿自然销毁。 */
export function TeamDraftProvider({ children }: { children: ReactNode }) {
  const turn = useAtomValue(humanTurnAtom);
  const active = turn?.kind === "TEAM_PROPOSAL";
  const activeKey = active ? turnKey(turn) : null;
  const teamSize = active ? turn.view.currentMission.teamSize : 0;
  const [draft, setDraft] = useState(EMPTY_TEAM_DRAFT);
  const selected = selectedTeamForTurn(draft, activeKey);

  const toggle = (id: PlayerId) => {
    if (activeKey === null) return;
    setDraft((current) => toggleTeamSelection(current, activeKey, id, teamSize));
  };

  const value: TeamDraftControls = {
    active,
    selected,
    teamSize,
    full: selected.length >= teamSize && teamSize > 0,
    toggle,
  };

  return <TeamDraftContext.Provider value={value}>{children}</TeamDraftContext.Provider>;
}

/** SeatTable 在观战局也会渲染，所以它需要一个可选读取口。 */
export function useOptionalTeamDraft(): TeamDraftControls | null {
  return useContext(TeamDraftContext);
}

/** ActionPanel 的组队表单只允许出现在 TeamDraftProvider 内。 */
export function useTeamDraft(): TeamDraftControls {
  const value = useOptionalTeamDraft();
  if (!value) throw new Error("TeamBody 必须渲染在 TeamDraftProvider 内");
  return value;
}
