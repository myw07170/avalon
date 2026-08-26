/**
 * 真实模型试跑。阶段 4 完成标准里那条「用真实 LLM 跑 1 局 5 人全 AI 局，
 * 人工读一遍全部发言，确认没有"AI 推理得特别准"的迹象」。
 *
 * 【要显式开一个开关才会跑】日常 pnpm test 与 CI 完全不受影响。
 *
 * 只按"配没配 key"来判断是不够的：一旦 .env.local 填好，往后每次 pnpm test
 * 都会真跑一局——两分钟加真金白银，而你根本没想跑（踩过）。所以另设一个开关，
 * 把"我配了 key"和"我现在就要烧一局"分开。在 .env.local（已被 gitignore）里：
 *
 *   LLM_PROVIDER=openai
 *   LLM_API_KEY=sk-...
 *   LLM_MODEL=gpt-5-nano
 *   LLM_EXTRA_BODY={"reasoning_effort":"minimal"}   # 推理模型不加会慢十倍
 *   LLM_REAL_GAME=1                                 # ← 这一行才是开关
 *
 * 然后 pnpm vitest run src/lib/ai/real-game.test.ts
 *
 * 【全 AI 局不需要 UI，也不需要起 Next 服务器】直接用 createAiClient 调 provider——
 * /api/ai 那层存在的意义是别让 key 进浏览器，而这里本来就跑在 Node 里。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import { createAiClient, readMaxRetries, readProviderConfig } from "./client";
import { runGame, type DecisionRecord } from "./orchestrator";
import { renderTranscript } from "./transcript";

/**
 * vitest 不像 next dev 那样自动加载 .env.local，所以这里自己读一次。
 *
 * 刻意不用 vite 的 loadEnv：pnpm 的严格布局下 vite 从项目根目录解析不到
 * （`require.resolve("vite")` 会失败）。手写这十来行反而更稳，也不多一个依赖。
 *
 * 【真实的进程环境变量优先，与 next dev 一致】已核对 @next/env 的行为：
 * 它只填 process.env 里还没有的键，不覆盖已有的。这里照抄那条规则，
 * 免得同一台机器上出现"测试能跑但 next dev 不行"。
 *
 * 【但沉默地优先是个陷阱，所以要报出来】一个装在用户级环境里的旧 LLM_API_KEY
 * 会不声不响地盖掉 .env.local 里刚填的新 key，表现是一个毫无线索的 401——
 * 这坑真踩过。宁可开局就炸，也不要让人以为自己在用文件里那份配置。
 */
function loadEnvLocal(): string[] {
  let text: string;
  try {
    text = readFileSync(new URL("../../../.env.local", import.meta.url), "utf8");
  } catch {
    return []; // 没有这个文件是正常情况，下面的 skipIf 会接管
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

/**
 * 【只返回不抛】在模块顶层抛会把整个文件炸掉，连"跳过"都做不到——
 * 于是一台配了 key 的机器上 pnpm test 直接变红，而这个测试本该与日常测试无关（踩过）。
 * 真正要报的时机是测试确实要跑的那一刻，见下面 it() 的第一行。
 */
const shadowed = loadEnvLocal();

/**
 * 跳过条件要与 readProviderConfig 的要求**逐项对齐**。
 * 只查 key 是不够的：环境里单独存着一个 LLM_API_KEY 是常见情况，
 * 那样这个测试会在没配全的机器上莫名其妙地失败，而不是老老实实跳过。
 *
 * LLM_REAL_GAME 是"现在就要烧一局"的显式开关，见文件顶部。
 */
const configured =
  process.env.LLM_REAL_GAME === "1" &&
  Boolean(process.env.LLM_API_KEY) &&
  Boolean(process.env.LLM_MODEL) &&
  Boolean(process.env.LLM_PROVIDER) &&
  process.env.LLM_PROVIDER !== "mock";

const PLAYER_COUNT = 5;
const TRANSCRIPT_DIR = "transcripts";

/**
 * 【不能用 console.log】vitest 4 的默认 reporter 会把 console.log 整个吞掉，
 * 只有加 --reporter=verbose 才看得见——而这个测试存在的唯一意义就是把发言打出来给人读。
 * process.stdout.write 不经过那层拦截，任何 reporter 下都能出来（两种 reporter 都实测过）。
 */
const say = (text: string): void => void process.stdout.write(`${text}\n`);

describe.skipIf(!configured)("真实模型试跑", () => {
  it(
    `${PLAYER_COUNT} 人全 AI 局能跑完，并打印全部发言供人工检查`,
    async () => {
      if (shadowed.length > 0) {
        // 只报变量名，绝不打印任何一边的值。
        // 沉默地"环境变量优先"会让你拿着一份没在文件里写过的配置去调 provider，
        // 表现是一个毫无线索的 401——这坑真踩过
        throw new Error(
          `.env.local 里的 ${shadowed.join("、")} 被同名的进程环境变量盖住了，` +
            `实际生效的是环境变量里那一份（这与 next dev 的行为一致）。\n` +
            `删掉它再跑，PowerShell：` +
            `[Environment]::SetEnvironmentVariable('${shadowed[0]}', $null, 'User')，然后重开终端。`,
        );
      }

      const startedAt = Date.now();
      const seed = Date.now() % 100000;
      const rng = createRng(seed);
      const config = readProviderConfig();
      const client = createAiClient(config);
      const records: DecisionRecord[] = [];

      const final = await runGame({
        state: createGame({
          config: createConfig(PLAYER_COUNT, { seed }),
          humanSeat: null,
          personas: makePlaceholderPersonas(PLAYER_COUNT),
          rng,
        }),
        client,
        rng,
        maxRetries: readMaxRetries(),
        hooks: {
          onDecision: (record) => {
            records.push(record);
            // 一局要跑好几分钟，不打点的话完全看不出是在跑还是卡死了。
            // 也顺便让"发言"在生成的当下就能读到，而不是等终局那一大坨
            const speech =
              "content" in record.result.payload
                ? `：${String(record.result.payload.content).slice(0, 60)}`
                : "";
            const flags =
              (record.result.fallback ? " [schema 兜底]" : "") +
              (record.rescued ? " [合法性兜底]" : "");
            say(
              `  #${records.length} ${record.playerId} 号 ${record.kind}` +
                ` ${((Date.now() - startedAt) / 1000).toFixed(0)}s${flags}${speech}`,
            );
          },
        },
      });

      const report = renderTranscript(final, records, {
        model: `${config.provider} / ${config.model}`,
        seed,
      });
      say(`\n${report}`);

      // 也落一份盘：几十条发言在终端里翻着读很难受，而"人工读一遍"正是这个测试的全部意义
      mkdirSync(TRANSCRIPT_DIR, { recursive: true });
      const file = `${TRANSCRIPT_DIR}/real-game-${seed}.txt`;
      writeFileSync(file, report, "utf8");
      say(`\n对局记录已写入 ${file}\n`);

      expect(final.phase).toBe("GAME_OVER");
      expect(final.winner).not.toBeNull();
      expect(records.length).toBeGreaterThan(20);

      // 刻意不断言 fallback 阈值。那个数字是给人看的判断依据，
      // 写成断言只会让这个本来就依赖外部服务的测试更脆
    },
    // 一局约 60-80 次 LLM 调用。推理模型不加 LLM_EXTRA_BODY 时单次就要 10s 以上，
    // 300s 根本不够（踩过）；给足 20 分钟，反正跑不完会一路打点，看得见卡在哪
    1_200_000,
  );
});
