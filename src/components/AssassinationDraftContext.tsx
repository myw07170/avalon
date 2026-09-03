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
  EMPTY_ASSASSINATION_DRAFT,
  selectedTargetForTurn,
  toggleAssassinationTarget,
} from "./assassination-draft-model";

export interface AssassinationDraftControls {
  active: boolean;
  selected: readonly PlayerId[];
  toggle: (id: PlayerId) => void;
}

const AssassinationDraftContext = createContext<AssassinationDraftControls | null>(null);

/**
 * 包住玩家局的进行中页面，管理刺杀目标的单选草稿。
 * 与 TeamDraftProvider 平行：只在 turn.kind === "ASSASSINATION" 时激活。
 * 两者不会同时激活——TEAM_PROPOSAL 与 ASSASSINATION 是互斥的阶段。
 */
export function AssassinationDraftProvider({ children }: { children: ReactNode }) {
  const turn = useAtomValue(humanTurnAtom);
  const active = turn?.kind === "ASSASSINATION";
  const activeKey = active ? turnKey(turn) : null;
  const [draft, setDraft] = useState(EMPTY_ASSASSINATION_DRAFT);
  const selected = selectedTargetForTurn(draft, activeKey);

  const toggle = (id: PlayerId) => {
    if (activeKey === null) return;
    setDraft((current) => toggleAssassinationTarget(current, activeKey, id));
  };

  const value: AssassinationDraftControls = { active, selected, toggle };

  return (
    <AssassinationDraftContext.Provider value={value}>
      {children}
    </AssassinationDraftContext.Provider>
  );
}

/** SeatTable 在观战局也会渲染，所以它需要一个可选读取口。 */
export function useOptionalAssassinationDraft(): AssassinationDraftControls | null {
  return useContext(AssassinationDraftContext);
}

/** AssassinationBody 只允许出现在 AssassinationDraftProvider 内。 */
export function useAssassinationDraft(): AssassinationDraftControls {
  const value = useOptionalAssassinationDraft();
  if (!value)
    throw new Error("AssassinationBody 必须渲染在 AssassinationDraftProvider 内");
  return value;
}
