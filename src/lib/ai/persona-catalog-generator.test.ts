import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmProviderConfig } from "./client";
import {
  generateAndWritePersonaCatalog,
  generatePersonaCatalog,
  writePersonaCatalog,
} from "./persona-catalog-generator";

const tempDirs: string[] = [];

afterEach(() => {
  for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

function generatedPair(index: number) {
  return {
    zh: {
      name: `人物${index}`,
      traits: [`特质${index}`, `习惯${index}`],
      speechStyle: `中文说话风格 ${index}`,
      mind: {
        reasoningStyle: `中文推理倾向 ${index}`,
        speechLengthHabit: `中文表达节奏 ${index}`,
        pressureStyle: `中文压力反应 ${index}`,
        mistakePattern: `中文误判模式 ${index}`,
      },
    },
    en: {
      name: `Person ${index}`,
      traits: [`Trait ${index}`, `Habit ${index}`],
      speechStyle: `English speech style ${index}`,
      mind: {
        reasoningStyle: `English reasoning style ${index}`,
        speechLengthHabit: `English speaking rhythm ${index}`,
        pressureStyle: `English pressure response ${index}`,
        mistakePattern: `English mistake pattern ${index}`,
      },
    },
  };
}

function providerOutput(
  count = 30,
  mutate?: (personas: ReturnType<typeof generatedPair>[]) => void,
): string {
  const personas = Array.from({ length: count }, (_, index) => generatedPair(index + 1));
  mutate?.(personas);
  return JSON.stringify({ personas });
}

function fakeConfig(output: string) {
  const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: output } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  const config: LlmProviderConfig = {
    provider: "fake",
    apiKey: "test-key",
    baseUrl: "https://provider.invalid/v1",
    model: "test-model",
    maxTokens: 123,
    extraBody: { max_tokens: 456 },
    fetchFn,
  };
  return { config, fetchFn };
}

function freshOutputPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "avalon-personas-"));
  tempDirs.push(dir);
  return join(dir, "persona-catalog.json");
}

describe("generatePersonaCatalog", () => {
  it("一次 provider 调用生成恰好 30 项，并且不发送 max_tokens", async () => {
    const { config, fetchFn } = fakeConfig(providerOutput());

    const catalog = await generatePersonaCatalog(config);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("max_tokens");
    expect(catalog.personas).toHaveLength(30);
    expect(catalog.personas[0]?.id).toBe("persona-01");
    expect(catalog.personas[29]?.id).toBe("persona-30");
  });

  it.each([
    ["数量不足", providerOutput(29)],
    [
      "字段缺失",
      providerOutput(30, (personas) => {
        delete (personas[3]?.en as Partial<(typeof personas)[number]["en"]>)?.speechStyle;
      }),
    ],
    [
      "中文重名",
      providerOutput(30, (personas) => {
        if (personas[0] && personas[1]) personas[1].zh.name = personas[0].zh.name;
      }),
    ],
    [
      "英文重名",
      providerOutput(30, (personas) => {
        if (personas[0] && personas[1]) personas[1].en.name = personas[0].en.name;
      }),
    ],
    [
      "重复画像",
      providerOutput(30, (personas) => {
        if (personas[0] && personas[1]) {
          const preservedName = personas[1].zh.name;
          personas[1].zh = { ...structuredClone(personas[0].zh), name: preservedName };
        }
      }),
    ],
  ])("拒绝%s", async (_label, output) => {
    const { config, fetchFn } = fakeConfig(output);
    await expect(generatePersonaCatalog(config)).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("generateAndWritePersonaCatalog", () => {
  it("校验成功后才写入完整文件", async () => {
    const outputPath = freshOutputPath();
    const { config } = fakeConfig(providerOutput());

    await generateAndWritePersonaCatalog(config, outputPath, false);

    const written = JSON.parse(readFileSync(outputPath, "utf8")) as { personas: unknown[] };
    expect(written.personas).toHaveLength(30);
  });

  it("输出不合格时不留下文件，也不进行第二次调用", async () => {
    const outputPath = freshOutputPath();
    const { config, fetchFn } = fakeConfig(providerOutput(1));

    await expect(generateAndWritePersonaCatalog(config, outputPath, false)).rejects.toThrow();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("已有文件默认在付费调用前拒绝，--force 才允许覆盖", async () => {
    const outputPath = freshOutputPath();
    writeFileSync(outputPath, "original", "utf8");
    const { config, fetchFn } = fakeConfig(providerOutput());

    await expect(generateAndWritePersonaCatalog(config, outputPath, false)).rejects.toThrow(
      /--force/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(readFileSync(outputPath, "utf8")).toBe("original");

    await generateAndWritePersonaCatalog(config, outputPath, true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toHaveProperty("personas");
  });

  it("直接写入也拒绝无 --force 覆盖", async () => {
    const outputPath = freshOutputPath();
    writeFileSync(outputPath, "original", "utf8");
    const { config } = fakeConfig(providerOutput());
    const catalog = await generatePersonaCatalog(config);

    expect(() => writePersonaCatalog(outputPath, catalog, false)).toThrow(/--force/);
    expect(readFileSync(outputPath, "utf8")).toBe("original");
  });
});
