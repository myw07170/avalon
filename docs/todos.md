# 实现计划

本文档是开发路线图。每个阶段都有明确的**完成标准**，达不到就不要进入下一阶段。

参考项目：[oil-oil/wolfcha](https://github.com/oil-oil/wolfcha)（AI 狼人杀，Next.js 16 + TS + Tailwind 4 + Jotai + Radix UI + Framer Motion）。技术栈直接沿用，但**架构不照抄**：wolfcha 用的是 `PhaseManager` 命令式阶段机，本项目用纯函数 reducer（见 [state-machine.md](./state-machine.md)），因为阿瓦隆的信息隔离要求必须做到"引擎可单测、可跑 1000 局模拟"。

## 总原则

1. **引擎先行，UI 最后。** 阶段 1–3 完成前不写任何 React 组件。
2. **信息隔离是一票否决项。** 任何绕过 `toPlayerView` 拿数据的代码，无论多方便，都不合并。
3. **不写容错。** 非法状态抛 `EngineError`，不要 `?? 0`、不要 `if (!x) return state`。静默容错会把 bug 藏到线上。
4. **每个阶段结束时 `pnpm test` 全绿**，再往下走。

---

## 阶段 0：项目脚手架 ✅ 已完成

**目标**：`pnpm dev` 能起一个空页面，`pnpm test` 能跑通测试。

- [x] `pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack --yes`
      （`create-next-app` 会拒绝非空目录，且 `docs/`、`src/` 不在它的白名单里。实际做法是先把这两个目录挪到别处，建完再挪回来。`.git` 在白名单内，不用动）
- [x] 安装依赖：
      - 状态：`jotai`
      - UI：`@radix-ui/react-dialog` `@radix-ui/react-tooltip` `@radix-ui/react-popover` `framer-motion` `clsx` `tailwind-merge` `lucide-react`
      - 校验：`zod`
      - 测试：`vitest` `@vitest/coverage-v8`
- [x] 配置 `vitest.config.mts`，`test` 脚本指向 vitest
      （用 `.mts` 而不是 `.ts`：Next 的 package.json 没有 `"type": "module"`，Vite 会按 CommonJS 加载 `.ts` 配置并告警）
- [x] `tsconfig.json` 打开 `"strict": true`、`"noUncheckedIndexedAccess": true`
      （后者很烦，但正是它会逼你处理 `players[id]` 可能为 undefined 的情况）
      顺带打开 `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`，
      最后一条对 `reduce` 里按 phase 分派的大 switch 很有用；`target` 提到 `ES2022`
- [x] eslint 配 `no-unused-vars` 的 `argsIgnorePattern: "^_"`，与 tsconfig 的下划线约定对齐
- [x] `.env.local.example`：`LLM_PROVIDER` / `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_MAX_RETRIES`
      （`.gitignore` 的 `.env*` 会连样板一起忽略，已加 `!.env.local.example` 例外）
- [x] 建立目录骨架（各模块已建桩，签名和注释就位，函数体统一 `throw new Error("TODO 阶段 N")`）：

```
src/
  app/                    Next.js 路由
  components/             UI 组件（阶段 5）
  lib/
    game/                 引擎（纯函数，禁止 import React / fetch / Date.now）
      types.ts            ✅ 已完成
      types.test.ts       ✅ 冒烟测试：钉住 ROLE_TEAM 与 ROLE_META 不分叉
      index.ts            ✅ 公开出口，引擎外部只从这里 import
      config.ts           人数配置表、角色配置表        阶段 1
      rng.ts              可播种随机数                  阶段 1
      setup.ts            创建初始状态、洗牌发牌        阶段 1
      visibility.ts       getKnownIdentities            阶段 2
      legal.ts            getLegalActions               阶段 3
      view.ts             toPlayerView                  阶段 3
      reduce.ts           reduce 主入口                 阶段 3
      phases/             各阶段的 reducer 分支         阶段 3
    ai/                   LLM 层（唯一允许发网络请求的地方）
      schema.ts           ✅ zod schema 已写
      prompt.ts           PlayerView -> prompt 字符串   阶段 4
      mock.ts             AiClient 的假实现             阶段 4
      client.ts           AiClient 接口的真实实现       阶段 4
    sim/
      random.ts           随机策略模拟对局              阶段 3
  store/
    game.ts               ✅ Jotai atoms 骨架
```

**完成标准**：`pnpm dev`、`pnpm build`、`pnpm test` 三条命令都不报错。

**已验证**（2026-08-24）：

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过，无输出 |
| `pnpm lint` | 通过，0 warning |
| `pnpm test` | 1 个文件 / 6 个用例全绿 |
| `pnpm build` | 编译成功，`/` 与 `/_not-found` 静态预渲染 |
| `pnpm dev` | `:3000` 返回 200 |

实际锁定的版本：Next 16.3.2 · React 19.2.8 · Tailwind 4.3.3 · TypeScript 5.9.3 · Vitest 4.1.11 · zod 4.4.3 · jotai 2.20.2 · framer-motion 13.1.1。

> zod 是 4.x，写 schema 时注意与网上大量 3.x 的写法有出入（`z.string().min(1)` 之类不变，但错误定制 API 改了）。

---

## 阶段 1：静态配置与角色分配

**目标**：给定人数，能产出一个合法的初始 `GameState`。

- [ ] `config.ts`：把 [rules.md §2](./rules.md) 的人数配置表和 §3.2 的角色配置表写成常量。
      - `MISSION_TABLE: Record<number, MissionConfig[]>`，注意 7 人及以上第 4 轮 `failsRequired: 2`
      - `ROLE_PRESETS: Record<number, Role[]>`
      - `validateConfig(config)`：断言 `roles.length === playerCount`、坏人角色数与表格一致、梅林/派西维尔/莫甘娜/刺客各恰好 1 个。不满足抛 `EngineError("CONFIG_INVALID")`
- [ ] `rng.ts`：实现 mulberry32 或 xorshift 之类的可播种 PRNG，导出 `createRng(seed): RngFn` 和 `shuffle<T>(arr, rng): T[]`（Fisher-Yates）
- [ ] `setup.ts`：`createGame(playerCount, humanSeat, personas, seed): GameState`
      - 用 `shuffle` 打乱 `ROLE_PRESETS[playerCount]` 后依座位分配
      - 首任队长用 rng 随机
      - `phase: "ROLE_REVEAL"`，`pending` 用 `createPending()` 初始化

**完成标准**：6 种人数各建 100 局，断言角色数量分布、任务配置、坏人数量全部正确。

**易错点**：不要把角色数组直接按下标发给玩家而忘了洗牌——测试会通过（数量对），但每局梅林都在 0 号位。

---

## 阶段 2：可见性

**目标**：`getKnownIdentities` 完全正确。这是整个项目最容易写错、错了又最难发现的一块。

- [ ] `visibility.ts`：
```typescript
export function getKnownIdentities(viewerId: PlayerId, players: Player[]): Knowledge[];
```
- [ ] 实现 [rules.md §3.3](./rules.md) 的矩阵，逐条对照：
      - 梅林 → 所有坏人**除莫德雷德外**的 `IS_EVIL`
      - 派西维尔 → 一条 `MERLIN_OR_MORGANA`，`playerIds` **必须按 id 升序**
      - 莫甘娜/刺客/莫德雷德/爪牙 → 互相 `IS_EVIL`，**不含奥伯伦**，也不含自己
      - 奥伯伦、忠臣 → 空数组
- [ ] 返回的数组按 `playerId` 排序，消除任何顺序信息

**完成标准**（每条一个测试用例）：

- [ ] 梅林的 knowledge 不含莫德雷德的座位号
- [ ] 奥伯伦的 knowledge 为空
- [ ] 其他坏人的 knowledge 不含奥伯伦
- [ ] 派西维尔恰好拿到一条 `MERLIN_OR_MORGANA`，且在梅林座位号 > 莫甘娜座位号的局里，`playerIds[0]` 是莫甘娜（证明确实排序了）
- [ ] 忠臣的 knowledge 为空

**易错点**：奥伯伦是**双向**盲区。只实现"别人看不到他"、忘了"他看不到别人"，或者反过来，是最常见的错。写两个方向的独立断言。

派西维尔那条尤其阴险：如果代码是 `[merlinId, morganaId]`，所有测试都会过（内容正确、两人都在），但 prompt 一渲染，AI 每次都能秒选第一个。必须专门测排序。

---

## 阶段 3：状态机

**目标**：不接 LLM、不写 UI，用随机策略能跑完整局。

按阶段逐个实现，每实现一个就补对应测试，不要一次写完再测。

- [ ] `legal.ts`：`getLegalActions(state, playerId): GameAction[]`
      - 这是防作弊第一道闸。`MISSION_EXECUTION` 阶段好人拿到的列表里**根本没有** `success: false` 的选项
      - `TEAM_BUILDING` 阶段只有队长有动作；返回的 `PROPOSE_TEAM` 不必穷举所有组合（C(10,5) 太多），返回一个"模板"动作 + 由调用方填 team，或只对 AI 层暴露 `teamSize` 约束
      - 不该行动的玩家返回 `[]`
- [ ] `reduce.ts`：主入口，`assertLegal` 后按 phase 分派
- [ ] `phases/roleReveal.ts`：累积 `pending.acknowledged`，齐了转 `TEAM_BUILDING` 并初始化发言顺序
- [ ] `phases/teamBuilding.ts`：校验队伍人数 === `currentMission.teamSize`、无重复、id 合法
- [ ] `phases/discussion.ts`：`PROPOSAL_DISCUSSION` 与 `REVIEW_DISCUSSION` 共用。按 `pending.speakingOrder` 逐人推进 `speakerIndex`，非当前发言人提交 `SPEAK` 抛 `NOT_YOUR_TURN`
      - 发言顺序 = 座位序，从当前队长开始，绕一圈
- [ ] `phases/teamVote.ts`：
      - 累积 `pending.votes`，重复投票抛 `DUPLICATE_SUBMISSION`
      - 齐了才结算：`approveCount * 2 > playerCount` 为通过（**严格大于半数，平票算否决**）
      - 通过 → `rejectCount = 0`，转 `MISSION_EXECUTION`
      - 否决 → `rejectCount + 1`；达到 `maxRejects` 则坏人胜（`REJECT_LIMIT`），否则队长顺延回 `TEAM_BUILDING`
      - `forcePassOnLastAttempt` 变体：进入阶段时若已是最后一次机会，直接以 `forced: true` 通过
- [ ] `phases/mission.ts`：
      - 非队员提交抛 `NOT_YOUR_TURN`
      - 好人提交 `success: false` 抛 `GOOD_CANNOT_FAIL`（引擎级硬约束，不是提示）
      - 齐了结算：`failCount >= currentMission.failsRequired` 判失败
      - 写入 `missionHistory` 时 `cards` **按 playerId 升序**存
- [ ] `phases/missionResult.ts`：`NEXT` 推进
      - 好人 3 分 → `ASSASSINATION`（**不是 GAME_OVER**）
      - 坏人 3 分 → `GAME_OVER`（`THREE_MISSIONS`）
      - 都没到 → `REVIEW_DISCUSSION`
- [ ] `phases/assassination.ts`：坏人逐个 `ASSASSIN_OPINION`（奥伯伦也参与，他也是坏人），全部说完后刺客 `ASSASSINATE`
      - 目标必须是合法座位号，否则抛 `INVALID_TARGET`
      - 命中梅林 → 坏人胜（`ASSASSINATION_HIT`）；否则好人胜（`ASSASSINATION_MISS`）
- [ ] `view.ts`：`toPlayerView(state, playerId): PlayerView`
      - `missionHistory` 映射成 `PublicMissionRecord`，**丢弃 `cards`**
      - `proposalHistory` 只含已结算的
      - `pending` 的任何内容都不进去，只折算成 `progress` 的两个数字和 `selfSubmitted`
      - `reveal` 仅在 `GAME_OVER` 时填充

**完成标准**（对应 [state-machine.md §4](./state-machine.md)）：

单元测试：
- [ ] 投票平票判否决（6 人局 3:3）
- [ ] `rejectCount` 在提议通过时归零
- [ ] `rejectCount` 在新一轮开始时归零（从 REVIEW_DISCUSSION 进 TEAM_BUILDING）
- [ ] 连续 5 次否决 → `GAME_OVER` / `REJECT_LIMIT`
- [ ] 7 人局第 4 轮：1 张失败票**不算**失败，2 张才算
- [ ] 5 人局第 4 轮：1 张失败票就算失败
- [ ] 好人的 `getLegalActions` 里不含失败票
- [ ] 好人 3 分后 `phase === "ASSASSINATION"`，`winner` 仍为 null
- [ ] 队长每次提议后顺延一位并循环

信息隔离测试（**单独一个文件 `view.leak.test.ts`**）：
- [ ] 对每个角色调用 `toPlayerView`，`JSON.stringify` 结果不包含他不该知道的任何座位号
- [ ] `PlayerView` 里任何一条任务记录都没有 `cards` / `playerId` 字段
- [ ] `TEAM_VOTE` 未结算时，`PlayerView` 中查不到任何人的投票内容
- [ ] 写成快照测试，任何人改 `toPlayerView` 都会立刻炸

模拟对局（`src/lib/sim/random.ts`）：
- [ ] 全随机合法策略跑 1000 局，断言：无异常、每局到达 `GAME_OVER`、双方都赢过、任务轮数 ≤ 5
- [ ] 同一 seed 跑两次，结果完全一致

> **这一组全绿之前，不要开始接 LLM。** 引擎有 bug 时接上 LLM，你会花三天时间怀疑是 prompt 写得不好。

---

## 阶段 4：AI 层（先 mock，后真实）

**目标**：AI 能替代随机策略，且**永远不会输出非法动作**。

- [ ] `ai/schema.ts`：为 `AiTeamProposal` / `AiSpeech` / `AiVote` / `AiMissionCard` / `AiAssassination` 各写一个 zod schema
- [ ] `ai/mock.ts`：实现 `AiClient`，随机合法动作 + 模板发言。**先做这个**，它让你能在零 token 成本下调完整个调度链路
- [ ] `ai/prompt.ts`：`buildPrompt(req: AiDecisionRequest<K>): string`
      - **函数签名只接受 `AiDecisionRequest`，不接受 `GameState`。** 这是类型层面的防泄漏
      - 结构：角色与能力（取 `ROLE_META`）→ 人设 → 当前局势（比分、轮次、否决数）→ 历史（提议、投票、任务结果）→ 全场发言 → 本次要做的决策 + 合法选项 → 输出格式
      - 发言限制 80–150 字，写进 prompt
      - 梅林的行为约束（别把坏人名单说太明）写在 prompt 里，**不写进引擎**——那是策略失误不是非法操作
- [ ] `ai/client.ts`：真实实现
      - 走 Next.js Route Handler（`src/app/api/ai/route.ts`），**API key 绝不进浏览器**
      - JSON 模式 / structured output，zod 校验
      - 校验失败重试 `maxRetries` 次（默认 2），仍失败则在 `legalActions` 里随机兜底，`fallback: true`
      - 每次调用记 `debug`，供复盘面板展示
- [ ] `ai/orchestrator.ts`：驱动循环
```
while (state.phase !== "GAME_OVER") {
  const actors = getAwaitingPlayers(state);
  // 人类玩家 -> 等 UI 输入；AI 玩家 -> 调 AiClient
  // 同时行动的阶段（投票/任务票）可并发调用，逐人发言的阶段必须串行
}
```

**完成标准**：
- [ ] mock 模式跑 100 局全部正常结束
- [ ] 用真实 LLM 跑 1 局 5 人全 AI 局，人工读一遍全部发言，确认没有"AI 推理得特别准"的迹象
- [ ] `fallback` 比例统计出来，超过 5% 说明 prompt 或 schema 有问题

> **泄漏自查**：如果某局 AI 的推理准得离谱，先查泄漏再夸模型。最快的验证方法——把 `toPlayerView` 的返回值直接 dump 成 JSON 人工读一遍。

**成本控制**：5 人局约 60–80 次调用。开发期默认走 mock，环境变量 `LLM_PROVIDER=mock` 切换。

---

## 阶段 5：UI

**目标**：人类玩家能完整玩一局。

- [ ] `store/game.ts`：Jotai atoms
      - `gameStateAtom`（全知，**只在客户端引擎里用**）
      - `myViewAtom = atom(get => toPlayerView(get(gameStateAtom), get(mySeatAtom)))`
      - **所有组件只读 `myViewAtom`**，读 `gameStateAtom` 的组件一律视为 bug（`GAME_OVER` 复盘面板除外，它读 `view.reveal`）
- [ ] 组件：
      - `SetupScreen` 人数、人类座位、可选角色、mock 开关
      - `RoleCard` 翻牌动效展示身份与 knowledge（Framer Motion）
      - `SeatTable` 圆桌座位，标记队长、队员、已投票/已发言状态
      - `MissionTrack` 5 个任务节点 + 否决计数器
      - `SpeechFeed` 发言流，AI 逐字打字机效果
      - `ActionPanel` 按 `getLegalActions` 渲染当前可做的操作
      - `AssassinationModal` 刺杀选择（Radix Dialog）
      - `GameOverPanel` 全身份公开 + 每轮任务票来源 + AI reasoning 回放
- [ ] 阶段推进的节奏控制：AI 发言之间加 800ms 左右延迟，否则一屏刷完没有体感

**完成标准**：
- [ ] 人类以梅林身份完整玩完一局，含刺杀阶段
- [ ] 打开 React DevTools 检查，任何组件的 props 里都不含其他玩家的 `role`
- [ ] 移动端可用（圆桌布局在窄屏下降级为列表）

---

## 阶段 6：打磨

- [ ] 复盘面板：逐轮回放，显示每次任务的失败票来自谁、每个 AI 当时的 `reasoning` 和 `suspicions`
- [ ] `suspicions` 可视化成怀疑度热力图
- [ ] 观战模式：全 AI 对局，人类只看
- [ ] 对局导出（seed + action 序列 JSON），导入可完整重放
- [ ] 音效与转场
- [ ] i18n（参考 wolfcha 的 `src/i18n`）
- [ ] 多模型对战：不同座位配不同 provider，统计各模型胜率

---

## 关键风险清单

按"踩到的概率 × 发现的难度"排序：

| 风险 | 症状 | 防线 |
| --- | --- | --- |
| 信息泄漏 | AI 推理准得反常，但没有报错 | `view.leak.test.ts` 快照测试；prompt 函数签名只吃 `PlayerView` |
| 派西维尔顺序泄漏 | 派西维尔每局都能选对梅林 | `Knowledge.playerIds` 强制升序 + 专门的排序断言 |
| 奥伯伦单向实现 | 坏人局面异常顺，或奥伯伦异常聪明 | 双向各写一个独立断言 |
| 两条 TEAM_BUILDING 路径混淆 | `missionIndex` 不推进或 `rejectCount` 不归零，游戏卡死 | 两条路径各一个测试用例 |
| 组队票非同时公开 | AI 全场一边倒跟票 | `pending.votes` 结算前不进 view |
| 好人投失败 | 好人莫名其妙输 | `getLegalActions` 不给选项 + reducer 抛 `GOOD_CANNOT_FAIL`，双保险 |
| LLM 输出不合 schema | 运行时崩，或静默拿到错的动作 | zod 校验 + 重试 + 合法动作随机兜底 |
| token 成本失控 | 调试几天烧掉预算 | mock 模式默认开启 |

---

## 依赖顺序

```
阶段 0 脚手架
   └─ 阶段 1 配置与发牌
         ├─ 阶段 2 可见性 ──┐
         └─ 阶段 3 状态机 ──┴─ 阶段 4 AI 层 ─ 阶段 5 UI ─ 阶段 6 打磨
```

阶段 2 和阶段 3 可以并行，但两者都完成且测试全绿之前不要碰阶段 4。
