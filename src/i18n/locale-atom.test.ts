import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { DEFAULT_LOCALE, STORAGE_KEY, type Locale } from "./locale";
import { hydrateLocaleAtom, localeAtom, setLocaleAtom } from "./locale-atom";

let store: ReturnType<typeof createStore>;
let storage: {
  getItem: Mock<(key: string) => string | null>;
  setItem: Mock<(key: string, value: string) => void>;
};
let browserLanguages: { languages: string[]; language: string };

beforeEach(() => {
  store = createStore();
  const values = new Map<string, string>();
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  browserLanguages = { languages: ["en-US"], language: "en-US" };
  vi.stubGlobal("window", { localStorage: storage, navigator: browserLanguages });
});

afterEach(() => vi.unstubAllGlobals());

describe("locale initialization", () => {
  it("keeps the SSR initial value without reading browser preferences", () => {
    vi.stubGlobal("window", undefined);
    expect(store.get(localeAtom)).toBe(DEFAULT_LOCALE);
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it.each([
    { saved: "zh" as Locale, languages: ["en-US"] },
    { saved: "en" as Locale, languages: ["zh-CN"] },
  ])("restores saved $saved before browser preferences", ({ saved, languages }) => {
    storage.setItem(STORAGE_KEY, saved);
    browserLanguages.languages = languages;
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe(saved);
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it.each([null, "fr", "zh-CN", "", "null"])(
    "detects the browser language when the saved value is %s",
    (saved) => {
      storage.getItem.mockReturnValue(saved);
      browserLanguages.languages = ["ja-JP", "en-US", "zh-CN"];
      store.set(hydrateLocaleAtom);
      expect(store.get(localeAtom)).toBe("en");
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("uses navigator.language only when the preference list is empty", () => {
    browserLanguages.languages = [];
    browserLanguages.language = "zh-TW";
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe("zh");
    browserLanguages.languages = ["en-GB"];
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe("en");
  });

  it("uses English when the browser has no supported language", () => {
    browserLanguages.languages = ["ja-JP", "de-DE"];
    browserLanguages.language = "zh-CN";
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe("en");
  });

  it("still detects browser preferences when storage reads throw", () => {
    storage.getItem.mockImplementation(() => { throw new Error("Storage blocked"); });
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe("en");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rechecks browser preferences without saving the detected value", () => {
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe("en");
    browserLanguages.languages = ["zh-CN"];
    store.set(hydrateLocaleAtom);
    expect(store.get(localeAtom)).toBe("zh");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("saves only manual choices and restores them on initialization", () => {
    store.set(hydrateLocaleAtom);
    store.set(setLocaleAtom, "zh");
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "zh");
    expect(store.get(localeAtom)).toBe("zh");
    const freshStore = createStore();
    freshStore.set(hydrateLocaleAtom);
    expect(freshStore.get(localeAtom)).toBe("zh");
  });

  it("allows manual switching even when storage writes throw", () => {
    storage.setItem.mockImplementation(() => { throw new Error("Storage blocked"); });
    store.set(setLocaleAtom, "en");
    expect(store.get(localeAtom)).toBe("en");
  });
});
