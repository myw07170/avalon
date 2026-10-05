import type { PlayerId } from "@/lib/game";
import { seatPortraitIndex } from "@/lib/seat-avatar";
import { cn } from "@/lib/utils";

export interface SeatAvatarProps {
  seed: number;
  id: PlayerId;
  className?: string;
}

/** Decorative public face. No role, faction or private state is accepted. */
export function SeatAvatar({ seed, id, className }: SeatAvatarProps) {
  const index = seatPortraitIndex(seed, id);
  return <span aria-hidden="true" data-portrait-index={index}
    className={cn("art-portrait seat-portrait rounded-full", className)}
    style={{ backgroundPosition: `${(index % 5) * 25}% ${Math.floor(index / 5) * 100}%` }} />;
}
