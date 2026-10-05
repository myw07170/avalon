import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_THEME_COLOR } from "./theme";
import { renderTranscriptPage } from "../lib/ai/transcript-page";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = Object.fromEntries([...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1], match[2]])) as Record<string, string>;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("single midnight palette", () => {
  it("uses the same color for the page and browser chrome, without theme overrides", () => {
    expect(tokens.ink?.toUpperCase()).toBe(APP_THEME_COLOR);
    expect(css).toContain("color-scheme: dark");
    expect(css).not.toMatch(/data-theme|prefers-color-scheme/);
    // Locale-dependent fonts still require runtime variables.
    expect(css).not.toMatch(/@theme\s+inline/);
  });
  it("keeps readable text and accent buttons at WCAG AA contrast", () => {
    for (const background of ["ink", "ink-raised", "ink-highlight"]) {
      for (const foreground of ["vellum", "muted", "loyal", "mordred", "brass", "success"]) {
        expect(contrast(tokens[foreground]!, tokens[background]!), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const [accent, fill] of [["brass", "brass-fill"], ["brass", "brass-light"], ["loyal", "loyal-fill"], ["mordred", "mordred-fill"]] as const) {
      expect(contrast(tokens[`on-${accent}`]!, tokens[fill]!), `text on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps solid selected, hovered and disabled states readable", () => {
    for (const [foreground, background] of [["brass", "brass-soft"], ["vellum", "brass-soft"], ["loyal", "loyal-soft"], ["mordred", "mordred-soft"], ["success", "success-soft"], ["muted", "disabled"]] as const) {
      expect(contrast(tokens[foreground]!, tokens[background]!), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const hover of ["#E7C993", "#C59D5E"]) expect(contrast(tokens["on-brass"]!, hover)).toBeGreaterThanOrEqual(4.5);
    expect(css).not.toMatch(/transparent|rgba?\(|color-mix|opacity:|backdrop-filter|#[0-9a-f]{8}\b/i);
  });
  it("exports the same fixed palette to offline transcripts", () => {
    const html = renderTranscriptPage([]);
    const offline = Object.fromEntries([...html.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1], match[2]]));
    for (const [exported, app] of [
      ["paper", "ink"], ["surface", "ink-raised"], ["surface-top", "ink-highlight"],
      ["ink", "vellum"], ["ink-2", "muted"], ["line", "ink-line"], ["accent", "brass"],
      ["good", "loyal"], ["good-fill", "loyal-fill"], ["evil", "mordred"],
      ["evil-fill", "mordred-fill"], ["ok", "success"],
    ] as const) {
      expect(offline[exported], exported).toBe(tokens[app]);
    }
    expect(html).toContain("color-scheme: dark");
    expect(html).not.toMatch(/prefers-color-scheme|data-theme|transparent|color-mix|rgba?\(|#[0-9a-f]{8}\b/i);
  });
});
