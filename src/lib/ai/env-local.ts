import { readFileSync } from "node:fs";

/**
 * 给 Node/Vitest 开发命令加载 .env.local。已有进程环境优先，与 next dev 一致；
 * 返回被已有环境覆盖的变量名，让付费命令可以拒绝在含糊配置下运行。
 */
export function loadEnvLocal(): string[] {
  let text: string;
  try {
    text = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
  } catch {
    return [];
  }

  const shadowed: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    const key = match?.[1];
    if (!key) continue;
    const value = (match?.[2] ?? "").replace(/^["']|["']$/g, "").trim();
    const existing = process.env[key];
    if (existing) {
      if (existing !== value) shadowed.push(key);
      continue;
    }
    process.env[key] = value;
  }
  return shadowed;
}

