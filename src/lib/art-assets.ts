import type { Role } from "./game";

/** Row-major tile coordinates. Artwork carries no game state. */
export const ROLE_ART_TILES = {
  MERLIN: [0, 0], PERCIVAL: [1, 0], LOYAL_SERVANT: [2, 0], MORGANA: [3, 0],
  ASSASSIN: [0, 1], MORDRED: [1, 1], OBERON: [2, 1], MINION: [3, 1],
} as const satisfies Record<Role, readonly [number, number]>;

export const ART_ASSETS = {
  seats: { path: "/art/seat-portraits.png", width: 1983, height: 793, columns: 5, rows: 2 },
  roles: { path: "/art/role-portraits.png", width: 1536, height: 1024, columns: 4, rows: 2 },
  table: { path: "/art/round-table.png", width: 1254, height: 1254 },
  castle: { path: "/art/castle-sidebar.png", width: 1024, height: 1536 },
} as const;
