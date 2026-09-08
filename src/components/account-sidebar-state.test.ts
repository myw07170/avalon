import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  readSavedAccountSidebarCollapsed,
  saveAccountSidebarCollapsed,
} from "./account-sidebar-state";

describe("account sidebar collapsed storage", () => {
  it("默认展开", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    };

    expect(readSavedAccountSidebarCollapsed(storage)).toBe(false);
  });

  it("读取已保存的收起状态", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue("true"),
      setItem: vi.fn(),
    };

    expect(readSavedAccountSidebarCollapsed(storage)).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith(ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY);
  });

  it("保存收起状态", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };

    saveAccountSidebarCollapsed(storage, true);
    saveAccountSidebarCollapsed(storage, false);

    expect(storage.setItem).toHaveBeenNthCalledWith(
      1,
      ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
      "true",
    );
    expect(storage.setItem).toHaveBeenNthCalledWith(
      2,
      ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
      "false",
    );
  });

  it("存储不可用时静默回退", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(readSavedAccountSidebarCollapsed(storage)).toBe(false);
    expect(() => saveAccountSidebarCollapsed(storage, true)).not.toThrow();
  });
});
