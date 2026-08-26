/**
 * 从 transcripts/*.txt 生成 transcripts/index.html。
 *
 * 【为什么是 test 而不是 scripts/*.ts】项目没有 tsx / ts-node；Node 24 虽然默认剥类型，
 * 但本仓库的 import 都不带扩展名，Node 的 ESM 解析器认不出来，独立脚本跑不起来。
 * vitest 本来就解析 TS，用它当运行器零新增依赖。先例：real-game.test.ts 也在写文件。
 *
 * 【断言不是摆设】"每份 txt 都解析得动"这条，在 renderTranscript 改了格式而
 * parseTranscript 没跟上时会连同 transcript.test.ts 一起炸，属于第二道保险。
 *
 *   pnpm transcripts
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcript";
import { renderTranscriptPage, type PageGame } from "./transcript-page";

const DIR = "transcripts";
const OUT = `${DIR}/index.html`;

/**
 * 按文件修改时间排——也就是这几局真正跑的先后。
 *
 * 【不能按文件名排】文件名里的 seed 是 `Date.now() % 100000`，跟时间没有单调关系：
 * 实跑顺序是 94938 → 319 → 84804，按名字排会变成 319 → 84804 → 94938，
 * 整页"自曝 2 → 1 → 0"的叙事直接反过来。
 */
function transcriptFiles(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => ({ path: `${DIR}/${entry.name}`, at: statSync(`${DIR}/${entry.name}`).mtimeMs }))
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.path);
}

const files = transcriptFiles();

/** 没有记录是正常情况（CI、新克隆、还没跑过真实对局），跳过而不是失败 */
describe.skipIf(files.length === 0)("对局记录页", () => {
  it("每份 txt 都解析得动，并写出 index.html", () => {
    const games: PageGame[] = files.map((file, index) => ({
      index: index + 1,
      transcript: parseTranscript(readFileSync(file, "utf8")),
    }));

    for (const game of games) {
      expect(game.transcript.speeches.length, `${files[game.index - 1]} 的发言`).toBeGreaterThan(0);
      expect(game.transcript.seats.length, `${files[game.index - 1]} 的座位`).toBeGreaterThan(0);
      // 发言里的座位必须都在座位表里，否则页面会渲染出没有身份的说话人
      const seated = new Set(game.transcript.seats.map((seat) => seat.playerId));
      for (const speech of game.transcript.speeches) {
        expect(seated.has(speech.playerId), `座位 ${speech.playerId}`).toBe(true);
      }
    }

    // 顺序必须是跑的先后，页面的"自曝 2 → 1 → 0"整条叙事都靠它。
    // 按文件名排会得到 319 → 84804 → 94938，正好把这条线反过来
    const times = files.map((file) => statSync(file).mtimeMs);
    expect(times, "对局顺序应按落盘时间递增").toEqual([...times].sort((a, b) => a - b));

    const html = renderTranscriptPage(games);

    // 自包含：除了 Google Fonts（CSP 唯一放行的外部主机）不能有别的外部请求
    const externals = [...html.matchAll(/https?:\/\/[^"' )]+/g)].map((m) => m[0]);
    for (const url of externals) {
      expect(url, "外部链接").toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com/);
    }
    // Artifact 发布时会自己套骨架，这里必须是片段
    expect(html).not.toMatch(/<!doctype|<html|<head>|<body>/i);

    writeFileSync(OUT, html, "utf8");
    process.stdout.write(`\n对局记录页已写入 ${OUT}（${games.length} 局）\n`);
  });
});
