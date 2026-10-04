import { describe, expect, it } from "vitest";
import { resolveBrowserLocale } from "./locale";

describe("browser language preferences", () => {
  it.each([
    { languages: ["zh-CN"], expected: "zh" },
    { languages: ["zh-TW", "en-US"], expected: "zh" },
    { languages: ["en-GB", "zh-CN"], expected: "en" },
    { languages: [" ZH-hant-TW "], expected: "zh" },
    { languages: ["EN-us"], expected: "en" },
    { languages: ["fr-FR", "zh-HK", "en"], expected: "zh" },
    { languages: ["ja-JP", "en-US", "zh"], expected: "en" },
    { languages: ["zh", "en"], expected: "zh" },
    { languages: ["english", "zhongwen", ""], expected: "en" },
    { languages: ["ja-JP", "fr-FR"], expected: "en" },
    { languages: [], expected: "en" },
  ])("$languages resolves to $expected", ({ languages, expected }) => {
    expect(resolveBrowserLocale(languages)).toBe(expected);
  });
});
