/** Public portraits use an independent UI seed, never the role-dealing seed. */
import type { PlayerId } from "./game";

export const PREVIEW_AVATAR_SEED = 0xa11ce;
export const SEAT_PORTRAIT_COUNT = 10;

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/** Shuffle the atlas so every seat has a unique, restoration-stable face. */
export function seatPortraitIndex(seed: number, id: PlayerId): number {
  const portraits = Array.from({ length: SEAT_PORTRAIT_COUNT }, (_, index) => index);
  let random = seed >>> 0;
  for (let index = portraits.length - 1; index > 0; index -= 1) {
    random = mix32(random + 0x9e3779b9);
    const target = random % (index + 1);
    [portraits[index], portraits[target]] = [portraits[target]!, portraits[index]!];
  }
  return portraits[((id % SEAT_PORTRAIT_COUNT) + SEAT_PORTRAIT_COUNT) % SEAT_PORTRAIT_COUNT]!;
}

/** Sample randomness only when opening a game, never during rendering. */
export function createSeatAvatarSeed(): number {
  const words = new Uint32Array(1);
  globalThis.crypto.getRandomValues(words);
  return words[0]!;
}
