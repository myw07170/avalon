import type { Messages } from "@/i18n/messages";
import type { PlayerId } from "@/lib/game";
import type { Thinking } from "@/store/game";

export interface ThinkingPlayer {
  id: PlayerId;
  name: string;
}

export interface ThinkingIndicatorState {
  line: string;
  startedAt: number;
}

export function describeThinking(
  entries: readonly Thinking[],
  _players: readonly ThinkingPlayer[],
  msg: Messages,
): ThinkingIndicatorState | null {
  if (entries.length === 0) return null;

  const first = earliest(entries);
  const kind = first.kind;

  return {
    line:
      entries.length === 1
        ? msg.thinking.single(kind, msg.seat.short(first.playerId))
        : msg.thinking.multiple(kind, entries.length),
    startedAt: first.startedAt,
  };
}

function earliest(entries: readonly Thinking[]): Thinking {
  let first = entries[0]!;
  for (const entry of entries) {
    if (entry.startedAt < first.startedAt) first = entry;
  }
  return first;
}
