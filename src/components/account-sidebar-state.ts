export const ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY = "avalon.accountSidebarCollapsed";

type SidebarStorage = Pick<Storage, "getItem" | "setItem">;

export function readSavedAccountSidebarCollapsed(storage: SidebarStorage): boolean {
  try {
    return storage.getItem(ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveAccountSidebarCollapsed(
  storage: SidebarStorage,
  collapsed: boolean,
): void {
  try {
    storage.setItem(ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // 存不上时只影响下次进入首页的默认状态，不该拦住这次交互。
  }
}
