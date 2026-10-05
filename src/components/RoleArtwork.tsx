import type { Role } from "@/lib/game";
import { ROLE_ART_TILES } from "@/lib/art-assets";
import { cn } from "@/lib/utils";

/** Pass only a Role approved by the current player/reveal display model. */
export function RoleArtwork({ role, className }: { role: Role; className?: string }) {
  const [column, row] = ROLE_ART_TILES[role];
  return <span aria-hidden="true" data-role-art={role} className={cn("role-art-frame", className)}>
    <span className="art-portrait role-portrait" style={{ backgroundPosition: `${column * 100 / 3}% ${row * 100}%` }} />
  </span>;
}
