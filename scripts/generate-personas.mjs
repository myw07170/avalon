import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--force");
if (unknown.length > 0) {
  process.stderr.write(`未知参数：${unknown.join("、")}\n`);
  process.exit(2);
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("找不到 pnpm CLI；请通过 pnpm personas:generate 运行本命令。");
}
const result = spawnSync(
  process.execPath,
  [
    pnpmCli,
    "exec",
    "vitest",
    "run",
    "src/lib/ai/persona-catalog.generate.test.ts",
    "--reporter=verbose",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PERSONA_CATALOG_GENERATE: "1",
      PERSONA_CATALOG_FORCE: args.includes("--force") ? "1" : "0",
    },
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
