import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLE_ORDER } from "./game";
import { ART_ASSETS, ROLE_ART_TILES } from "./art-assets";

describe("local fantasy artwork", () => {
  it("ships every referenced PNG at the declared dimensions", () => {
    for (const asset of Object.values(ART_ASSETS)) {
      const data = readFileSync(new URL(`../../public${asset.path}`, import.meta.url));
      expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(data.readUInt32BE(16)).toBe(asset.width);
      expect(data.readUInt32BE(20)).toBe(asset.height);
      expect(data[25]).toBe(2); // PNG RGB: no alpha channel or transparent paint.
    }
  });
  it("maps all eight roles to distinct tiles in the approved row-major order", () => {
    expect(Object.keys(ROLE_ART_TILES).sort()).toEqual([...ROLE_ORDER].sort());
    expect(Object.values(ROLE_ART_TILES)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]);
  });
});
