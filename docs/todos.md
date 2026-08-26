# 实现计划

本文档是开发路线图。每个阶段都有明确的**完成标准**，达不到就不要进入下一阶段。

配套文档：[rules.md](./rules.md) 规则依据 · [state-machine.md](./state-machine.md) 引擎设计 · [architecture.md](./architecture.md) 分层边界（含「为什么没有数据库」）。

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
      coverage 的 `include` 要限定到 `**/*.ts`——glob 到 `phases/README.md` 会让 v8 provider 报 `PARSE_ERROR`
- [x] `tsconfig.json` 打开 `"strict": true`、`"noUncheckedIndexedAccess": true`
      （后者很烦，但正是它会逼你处理 `players[id]` 可能为 undefined 的情况）
      顺带打开 `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`，
      最后一条对 `reduce` 里按 phase 分派的大 switch 很有用；`target` 提到 `ES2022`
- [x] eslint 配 `no-unused-vars` 的 `argsIgnorePattern: "^_"`，与 tsconfig 的下划线约定对齐
- [x] `.env.local.example`：`LLM_PROVIDER` / `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_MAX_RETRIES`
      / `LLM_TEMPERATURE` / `LLM_TIMEOUT_MS` / `LLM_EXTRA_BODY` / `LLM_REAL_GAME`
      （`.gitignore` 的 `.env*` 会连样板一起忽略，已加 `!.env.local.example` 例外）
- [x] 建立目录骨架（各模块已建桩，签名和注释就位，函数体统一 `throw new Error("TODO 阶段 N")`）：

```
src/
  app/                    Next.js 路由
    api/ai/route.ts       ✅ 已完成（+ route.test.ts 14 个用例）
  components/             UI 组件（阶段 5）
  lib/
    game/                 引擎（纯函数，禁止 import React / fetch / Date.now）
      types.ts            ✅ 已完成
      types.test.ts       ✅ 冒烟测试：钉住 ROLE_TEAM 与 ROLE_META 不分叉
      index.ts            ✅ 公开出口，引擎外部只从这里 import
      config.ts           ✅ 人数/角色配置表、自定义与校验
      config.test.ts      ✅ 33 个用例
      rng.ts              ✅ mulberry32、shuffle、pick
      rng.test.ts         ✅ 14 个用例
      setup.ts            ✅ 创建初始状态、洗牌发牌
      setup.test.ts       ✅ 23 个用例
      visibility.ts       getKnownIdentities            阶段 2
      legal.ts            getLegalActions               阶段 3
      view.ts             toPlayerView                  阶段 3
      reduce.ts           reduce 主入口                 阶段 3
      phases/             各阶段的 reducer 分支         阶段 3
    ai/                   LLM 层（唯一允许发网络请求的地方）
      schema.ts           ✅ 已完成
      schema.test.ts      ✅ 30 个用例
      prompt.ts           ✅ 已完成
      prompt.test.ts      ✅ 26 个用例（含 3 份完整 prompt 快照）
      mock.ts             ✅ 已完成
      mock.test.ts        ✅ 21 个用例（含 100 局 mock 对局）
      client.ts           ✅ 已完成
      client.test.ts      ✅ 29 个用例
      errors.ts           ✅ AiError
      remote.ts           ✅ 浏览器侧的 AiClient
      remote.test.ts      ✅ 7 个用例
      orchestrator.ts     ✅ 驱动循环
      orchestrator.test.ts ✅ 22 个用例
      real-game.test.ts   ✅ 真实模型试跑（要 LLM_REAL_GAME=1 才跑）
      transcript.ts       ✅ 对局记录的渲染与回读（往返测试锁死格式）
      transcript-page.ts  ✅ 三局记录渲染成一页（pnpm transcripts）
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

## 阶段 1：静态配置与角色分配 ✅ 已完成

**目标**：给定人数，能产出一个合法的初始 `GameState`。

- [x] `config.ts` ✅ 已完成：[rules.md §2](./rules.md)、§3.1、§3.2、§3.2.1 的代码化。
      §3.2 的推荐配置定位为**默认值**，用户可自定义角色构成（见 §3.2.1）
      - `TEAM_SPLIT` / `MISSION_TABLE` / `ROLE_BOUNDS` / `ROLE_PRESETS` / `ROLE_ORDER`
      - 注意 7 人及以上第 4 轮 `failsRequired: 2`
      - `ROLE_PRESETS` 由 `composeRoles` 推导，不手抄第二遍
      - `getFreeEvilSlots(n)` / `getEvilOptions(n)`：坏人自由位的数量与全部合法组合，UI 直接用
      - `composeRoles(n, freeEvilSlots)`：用户只挑自由位，锁定角色和忠臣填充全部推导，
        让非法状态在常规路径上表示不出来
      - `checkConfig(config): ConfigIssue[]` 纯查错不抛，UI 边编辑边调用；
        `validateConfig` 是它的抛错版本。两者共用同一套判断，避免"UI 提示"和"引擎校验"分叉
      - `rolesToCounts` / `countsToRoles`：数量表互转，后者按 `ROLE_ORDER` 输出保证结果稳定
- [x] `rng.ts` ✅ 已完成：mulberry32 可播种 PRNG
      - `createRng(seed)` / `randomInt(rng, max)` / `shuffle(arr, rng)`（Fisher-Yates，返回新数组） / `pick(arr, rng)`
      - 不 import 其他引擎模块，保持在依赖链最底层
      - 刻意不用 `Math.random`：不可播种就没法复现"跑 1000 局偶发崩一次"这类问题
- [x] `setup.ts` ✅ 已完成：`createGame({ config, humanSeat, personas, rng }): GameState`
      （用 options 对象而不是位置参数，这样能直接接收自定义过的 `config`）
      - 用 `shuffle` 打乱 `config.roles` 后依座位分配（注意是 `config.roles`，不是 `ROLE_PRESETS`——
        用户可能自定义过）
      - 首任队长用 `randomInt` 随机
      - **`phase: "SETUP"`**，`pending` 用 `createPending()` 初始化
        - 按 [state-machine.md §2](./state-machine.md)，SETUP 负责"分配角色、确定首任队长"，
          再由 `START_GAME` 转入 `ROLE_REVEAL`。这里若直接给 `ROLE_REVEAL`，
          SETUP 阶段和 `START_GAME` 动作就成了死代码
      - `makePlaceholderPersonas(n)`：占位人设，供测试和阶段 3 的随机模拟用，阶段 4 换成真人设库后删掉

**完成标准**

配置层（`config.test.ts`，已全绿）：
- [x] 6 套 `ROLE_PRESETS` 无 error，且与 §3.2 表格逐字一致
- [x] 各人数的自由位数量为 `0,0,1,1,1,2`，合法组合数为 `1,1,3,3,3,4`
- [x] 每个人数的每一种自由位组合都通过 `validateConfig`
- [x] `composeRoles` 的好人侧恒为 梅林 + 派西维尔 + 忠臣×(好人名额−2)
- [x] 10 人局允许双爪牙，但不允许双莫德雷德或双奥伯伦
- [x] 逐条命中错误码：2 个梅林、0 个派西维尔、2 个莫德雷德、坏人数不符、`roles.length` 不符、人数越界、任务表被改
- [x] 莫德雷德在 7 人局有 warning 无 error 且不拦开局；9 人局无提示
- [x] `TEAM_SPLIT` / `MISSION_TABLE` / `ROLE_PRESETS` 覆盖同一组人数（几张手写表不许悄悄分叉）

随机源（`rng.test.ts`，已全绿）：
- [x] 同一种子产出同一序列，不同种子产出不同序列
- [x] 取值落在 [0, 1)，10000 次分 10 桶每桶都在 800-1200 之间
- [x] `shuffle` 不改传入数组、元素不增不减、同种子同结果
- [x] `shuffle` 确实在洗：500 次里每个元素都出现在过每个位置
- [x] 空数组/单元素不出错；`randomInt` 上界非正整数、`pick` 空数组均抛 `EngineError`

发牌层（`setup.test.ts`，已全绿）：
- [x] 6 种人数各建 100 局，断言角色数量分布、任务配置、坏人数量全部正确
- [x] 自定义配置也能正常建局，不只是推荐配置（每个人数的每一种自由位组合都验过）
- [x] 梅林不会每局都在 0 号位；每个角色都能出现在每个座位上；首任队长不固定
- [x] 初始状态停在 `SETUP`，计分/轮次/历史全部归零，`pending` 是全新空对象
- [x] 人类座位标记正确且无人设；AI 人设不复用；`humanSeat` 越界、人设数量不足均抛 `EngineError`
- [x] 同一种子建出完全相同的一局

**易错点**：不要把角色数组直接按下标发给玩家而忘了洗牌——测试会通过（数量对），但每局梅林都在 0 号位。

> 这条已用变异测试验证过：把 `shuffle` 去掉改成按下标发牌，"角色分布"那条**照样全绿**，
> 是"梅林不会每局都在 0 号位"等 4 条分布断言把它抓出来的。

---

## 阶段 2：可见性 ✅ 已完成

**目标**：`getKnownIdentities` 完全正确。这是整个项目最容易写错、错了又最难发现的一块。

- [x] `visibility.ts` ✅ 已完成：
```typescript
export function getKnownIdentities(viewerId: PlayerId, players: readonly Player[]): Knowledge[];
```
- [x] 实现 [rules.md §3.3](./rules.md) 的矩阵，逐条对照：
      - 梅林 → 所有坏人**除莫德雷德外**的 `IS_EVIL`
      - 派西维尔 → 一条 `MERLIN_OR_MORGANA`，`playerIds` **必须按 id 升序**
      - 莫甘娜/刺客/莫德雷德/爪牙 → 互相 `IS_EVIL`，**不含奥伯伦**，也不含自己
      - 奥伯伦、忠臣 → 空数组
- [x] 返回的数组按 `playerId` 排序，消除任何顺序信息
      - 排序只在唯一出口做一次，不在各分支各排一遍
      - `EVIL_CONSPIRACY`（不含奥伯伦）**同时**充当"谁能看"和"谁被看到"两侧的判据，
        双向盲区因此在结构上就没法只实现一半
      - `EVIL_VISIBLE_TO_MERLIN` 从 `ROLE_TEAM` 派生（全部坏人减莫德雷德），不手抄第二遍
      - 奥伯伦与忠臣写成显式 `case` 而不是落进 default，让"这是刻意的空"在代码里看得见
      - viewerId 不存在、本局缺梅林或莫甘娜，都抛 `EngineError("INTERNAL")`——
        本函数只被引擎内部调用，这两种输入只可能是引擎自己的 bug

**完成标准**（`visibility.test.ts`，25 个用例，已全绿）：

- [x] 梅林的 knowledge 不含莫德雷德的座位号，且**含**奥伯伦
- [x] 奥伯伦的 knowledge 为空
- [x] 其他坏人的 knowledge 不含奥伯伦
- [x] 派西维尔恰好拿到一条 `MERLIN_OR_MORGANA`，且在梅林座位号 > 莫甘娜座位号的局里，`playerIds[0]` 是莫甘娜（证明确实排序了）
- [x] 忠臣的 knowledge 为空
- [x] 坏人的 knowledge 不含自己；好人（梅林除外）看不到任何 `IS_EVIL`
- [x] 6 种人数 × 每种自由位组合 × 10 seed 的性质测试：条数、座位号合法性、升序全部逐座位断言
      （期望条数在测试里按 `ROLE_TEAM` 独立算一遍，不复用实现里的集合常量）
- [x] 纯函数：不改传入的 `players`、同输入同结果、打乱座位数组顺序不影响任何人的结果
- [x] 越界/非整数 viewerId 抛 `EngineError`

**已验证**（2026-08-24）：`pnpm typecheck` / `pnpm lint` 无输出，`pnpm test` 5 个文件 / 101 个用例全绿。

**变异测试自查**（四条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| `EVIL_CONSPIRACY` 加上 `OBERON` | 3 条断言炸（双向各一条 + 互认那条） |
| 派西维尔那条写成 `[merlinId, morganaId]` | 2 条炸 |
| 梅林能看到莫德雷德 | 2 条炸 |
| 出口不排序 | 1 条炸（打乱座位顺序那条） |

**易错点**：奥伯伦是**双向**盲区。只实现"别人看不到他"、忘了"他看不到别人"，或者反过来，是最常见的错。写两个方向的独立断言。

派西维尔那条尤其阴险：如果代码是 `[merlinId, morganaId]`，所有测试都会过（内容正确、两人都在），但 prompt 一渲染，AI 每次都能秒选第一个。必须专门测排序。

---

## 阶段 3：状态机 ✅ 已完成

**目标**：不接 LLM、不写 UI，用随机策略能跑完整局。

按阶段逐个实现，每实现一个就补对应测试，不要一次写完再测。

- [x] `legal.ts` ✅ 已完成：`getLegalActions(state, playerId): GameAction[]`
      - 这是防作弊第一道闸。`MISSION_EXECUTION` 阶段好人拿到的列表里**根本没有** `success: false` 的选项
      - `TEAM_BUILDING` 阶段只有队长有动作；返回的 `PROPOSE_TEAM` 不必穷举所有组合（C(10,5) 太多），返回一个"模板"动作 + 由调用方填 team，或只对 AI 层暴露 `teamSize` 约束
      - 不该行动的玩家返回 `[]`
      - 实现时定下的几条约定，后面的 phases/* 必须跟着走：
        - **不变量：`getLegalActions` 的每一项都能通过 `assertLegal`**。所以 `PROPOSE_TEAM`
          模板给的是一支**合法**队伍（队长 + 最小的若干座位，升序），而不是空数组——
          调用方照着候选项提交反而被抛错，是最难查的一类坑。选人用 `getTeamConstraint`
        - 自由文本动作（`SPEAK` / `ASSASSIN_OPINION`）给 `content: ""` 的模板，
          引擎不校验文本内容，那是策略问题不是合法性问题
        - 阶段与动作类型的对应写成 `PHASE_ACTIONS` 一张表，不散成各分支的 if，
          否则迟早出现"`getLegalActions` 给了但 `reduce` 不收"的分叉
        - `getAwaitingPlayerIds` 一律按座位号升序返回：**"谁还没交"是公开信息，
          "谁先交的"不是**，返回顺序不能把后者漏出去
        - 刺杀阶段坏人按**座位号升序**逐个 `ASSASSIN_OPINION`（含奥伯伦），
          全部说完才轮到刺客 `ASSASSINATE`；`phases/assassination.ts` 必须按同一次序结算
        - 校验顺序决定调用方看到哪个错误码：阶段 → 座位存在 → 重复提交 → 轮没轮到 → 载荷。
          重复投票报 `DUPLICATE_SUBMISSION` 而不是 `NOT_YOUR_TURN`
        - 多了两个导出：`getSystemActions`（`SETUP` 给 `START_GAME`、`MISSION_RESULT` 给 `NEXT`，
          省得每个调用方各硬编码一遍）与 `getCurrentMission`（phases/* 都要用）
      - 越界座位号：`getLegalActions` 抛 `INTERNAL`（调用方是引擎自己），
        `assertLegal` 抛 `NOT_YOUR_TURN`（输入来自 AI / UI，是外部输入错误）

**已验证**（2026-08-24，`legal.test.ts` 73 个用例）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 6 个文件 / 174 个用例全绿。

**变异测试自查**（五条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 好人也拿到 `success: false` | 4 条炸 |
| 刺客可在推测未完时直接 `ASSASSINATE` | 1 条炸 |
| `TEAM_VOTE` 不判重复提交 | 1 条炸 |
| `getAwaitingPlayerIds` 不按座位升序 | 2 条炸 |
| 刺杀目标不校验座位号 | 1 条炸 |

- [x] `reduce.ts` ✅ 已完成：主入口，`assertLegal` 后按 phase 分派
      - 全文件只做这两件事，一条规则判断都不在里面；`rng` 目前没有阶段用得上，
        参数保留是 [state-machine.md §3](./state-machine.md) 的回放契约
      - 新增 `phases/transitions.ts` 装各分支共用的转移工具（发言顺序、队长顺延、
        提议结算、终局）。放 `reduce.ts` 会形成 `reduce → phases → reduce` 的循环 import
- [x] `phases/setup.ts`：`START_GAME` 从 `SETUP` 转入 `ROLE_REVEAL`，追加 `GAME_STARTED` 事件
      （`createGame` 已经把角色和首任队长定好了，这一步只做阶段转移和日志）
- [x] `phases/roleReveal.ts`：累积 `pending.acknowledged`，齐了转 `TEAM_BUILDING`
      - **与本条原文的偏差**：发言顺序改到【进入讨论阶段时】才算，不在这里初始化。
        `legal.ts` 只在讨论阶段读 `pending.speakingOrder`，提前算会让一份过期的顺序
        在 `TEAM_BUILDING` / `TEAM_VOTE` 期间躺在 `pending` 里，与
        「进入新阶段必须清空 pending」直接冲突
- [x] `phases/teamBuilding.ts`：校验队伍人数 === `currentMission.teamSize`、无重复、id 合法
- [x] `phases/discussion.ts`：`PROPOSAL_DISCUSSION` 与 `REVIEW_DISCUSSION` 共用。按 `pending.speakingOrder` 逐人推进 `speakerIndex`，非当前发言人提交 `SPEAK` 抛 `NOT_YOUR_TURN`
      - 发言顺序 = 座位序，从当前队长开始，绕一圈
- [x] `phases/teamVote.ts`：
      - 累积 `pending.votes`，重复投票抛 `DUPLICATE_SUBMISSION`
      - 齐了才结算：`approveCount * 2 > playerCount` 为通过（**严格大于半数，平票算否决**）
      - 通过 → `rejectCount = 0`，转 `MISSION_EXECUTION`
      - 否决 → `rejectCount + 1`；达到 `maxRejects` 则坏人胜（`REJECT_LIMIT`），否则队长顺延回 `TEAM_BUILDING`
      - `forcePassOnLastAttempt` 变体：进入阶段时若已是最后一次机会，直接以 `forced: true` 通过
- [x] `phases/mission.ts`：
      - 非队员提交抛 `NOT_YOUR_TURN`
      - 好人提交 `success: false` 抛 `GOOD_CANNOT_FAIL`（引擎级硬约束，不是提示）
      - 齐了结算：`failCount >= currentMission.failsRequired` 判失败
      - 写入 `missionHistory` 时 `cards` **按 playerId 升序**存
- [x] `phases/missionResult.ts`：`NEXT` 推进
      - 好人 3 分 → `ASSASSINATION`（**不是 GAME_OVER**）
      - 坏人 3 分 → `GAME_OVER`（`THREE_MISSIONS`）
      - 都没到 → `REVIEW_DISCUSSION`
- [x] `phases/assassination.ts`：坏人逐个 `ASSASSIN_OPINION`（奥伯伦也参与，他也是坏人），全部说完后刺客 `ASSASSINATE`
      - 目标必须是合法座位号，否则抛 `INVALID_TARGET`
      - 命中梅林 → 坏人胜（`ASSASSINATION_HIT`）；否则好人胜（`ASSASSINATION_MISS`）
- [x] `view.ts` ✅ 已完成：`toPlayerView(state, playerId): PlayerView`
      - `missionHistory` 映射成 `PublicMissionRecord`，**丢弃 `cards`**
      - `proposalHistory` 只含已结算的（`proposalHistory` 本身就只装已结算的，
        未结算的票在 `pending.votes` 里，走不到映射函数）
      - `pending` 的任何内容都不进去，只折算成 `progress` 的两个数字和 `selfSubmitted`
      - `reveal` 仅在 `GAME_OVER` 时填充
      - 两条写法约定，都不是风格问题：
        - **逐字段抄写，绝不 `...record`**。展开会把 `cards` 一起带出去；更糟的是
          将来给 `MissionRecord` 加字段时不会有任何提示，新字段会自己漏进 prompt
        - **一律返回新数组新对象**。PlayerView 要交给 AI 层和 UI，
          共享引用等于给了它们一条改引擎状态的后门
      - `progress` 与 `selfSubmitted` 在同一个 switch 里算出来，防止某个阶段
        更新了进度却忘了改 `selfSubmitted`
      - 刺杀阶段 `progress.required` 是坏人数量——那是人数表定死的公开信息，不构成泄漏
      - 阶段 4 补加了 `roleComposition`（本局角色构成，只有数量没有座位）。
        它是开局公开信息，加它的理由和 `view.leak.test.ts` 的对应改法见阶段 4

**完成标准**（对应 [state-machine.md §4](./state-machine.md)）：

单元测试：
- [x] 投票平票判否决（6 人局 3:3）
- [x] `rejectCount` 在提议通过时归零
- [x] `rejectCount` 在新一轮开始时归零（从 REVIEW_DISCUSSION 进 TEAM_BUILDING）
- [x] 连续 5 次否决 → `GAME_OVER` / `REJECT_LIMIT`
- [x] 7 人局第 4 轮：1 张失败票**不算**失败，2 张才算
- [x] 5 人局第 4 轮：1 张失败票就算失败
- [x] 好人的 `getLegalActions` 里不含失败票（`legal.test.ts`，好人只有 `success: true` 一项；奥伯伦作为坏人两项都有）
- [x] 好人 3 分后 `phase === "ASSASSINATION"`，`winner` 仍为 null
- [x] 队长每次提议后顺延一位并循环

`reduce.test.ts` 另外还钉住了这些（都属于「不写测试就一定会踩」的那类）：

- 每走一步都断言 `pending` 只含当前阶段该有的字段——上一阶段的投票漏进下一阶段是本状态机最容易出的事故
- `forcePassOnLastAttempt` 变体：`TEAM_VOTE` 被整个跳过，记录里 `forced: true` 且 `votes` 为空
- `missionHistory.cards` 按 `playerId` 升序存（乱序提交构造）
- 好人即使策略要求投失败也投不出去——合法动作里根本没有那一项
- `reduce` 不改传入的 state、同输入同输出、同一初始状态跑两遍整局结果完全一致

**已验证**（2026-08-24，`reduce.test.ts` 33 个用例）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 7 个文件 / 207 个用例全绿。

**变异测试自查**（六条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 平票判通过（`>=` 半数） | 1 条炸 |
| 提议通过后不清零 `rejectCount` | 4 条炸 |
| 新一轮不推进 `missionIndex` | 2 条炸 |
| 好人 3 分直接终局，不进刺杀 | 4 条炸 |
| 换队长重提时不清空 `pending` | 3 条炸 |
| `cards` 按提交顺序存 | 4 条炸 |

信息隔离测试（**单独一个文件 `view.leak.test.ts`**）：
- [x] 对每个角色调用 `toPlayerView`，序列化结果里不出现自己以外的任何角色名
      （比对时连引号一起找：裸着找 `ASSASSIN` 会被阶段名 `ASSASSINATION` 命中，
      找 `MERLIN` 会被派西维尔那条 `kind: MERLIN_OR_MORGANA` 命中——后者恰恰是"分不清谁是谁"）
- [x] `knowledge` 与可见性矩阵逐条相等；梅林看不到莫德雷德、坏人看不到奥伯伦在视角层依然成立
- [x] `PlayerView` 里任何一条任务记录都没有 `cards` / `playerId` 字段（逐条比对 key 集合）
- [x] `TEAM_VOTE` 未结算时，`PlayerView` 中查不到任何人的投票内容
      （历史为空时整个视角不含 `votes` 字段；有历史时 `votes` 恰好出现 1 次）
- [x] 未结算的任务票、刺杀推测、确认名单同样查不到，只剩 `progress` 的两个数字
- [x] 视角里出现的字段名全在白名单内——给 `PlayerView` 加字段会立刻炸，逼你想清楚它会不会泄漏
- [x] 写成快照测试，任何人改 `toPlayerView` 都会立刻炸（梅林 / 忠臣 / 奥伯伦三个代表性视角）

**已验证**（2026-08-24，`view.test.ts` 19 个 + `view.leak.test.ts` 15 个用例）：
`pnpm typecheck` / `pnpm lint` 无输出，`pnpm test` 9 个文件 / 241 个用例全绿。

**变异测试自查**（六条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 公开任务记录改成 `...record`（带出 `cards`） | 10 条炸 |
| `selfSubmitted` 变成"有人交过就 true" | 2 条炸 |
| `reveal` 不判阶段 | 29 条炸 |
| `knowledge` 绕过 `visibility.ts` 直接给全体坏人 | 8 条炸 |
| `speeches` 不拷贝，直接给引用 | 1 条炸 |
| 任务票进度的分母用总人数而非队伍人数 | 2 条炸 |

模拟对局（`src/lib/sim/random.ts`）：
- [x] 全随机合法策略跑 1000 局（6 种人数轮着来），断言：无异常、每局到达 `GAME_OVER`、
      双方都赢过、四种 `winReason` 都出现过、任务轮数 ≤ 5、比分与任务记录对得上
- [x] 同一 seed 跑两次，结果完全一致；不同 seed 产出不同对局
- [x] **把规则独立算一遍再和引擎的记录对**：提议的通过与否用票数重算、任务成败用失败票数与门槛重算、
      任务票按座位升序存
- [x] 好人从没投出过失败票——引擎级硬约束在一千局里都成立
- [x] `simulateGame` 的 `onStep` 钩子：在真实对局产出的每一个中间状态上验一遍视角，
      不泄漏他人身份与任务票来源（30 局，覆盖全部 9 个中间阶段）

`sim/random.ts` 不做任何规则判断，只会问引擎"轮到谁"、"他能做什么"，再随机挑一个交回去。
规则判断一旦泄漏到这里，模拟就不再是对引擎的独立检验了。

**一千局的分布**（seed 0-999，与实现无关的健康度参考）：

| 项目 | 结果 |
| --- | --- |
| 胜负 | 好人 351 / 坏人 649 |
| 胜利原因 | `THREE_MISSIONS` 351、`ASSASSINATION_MISS` 351、`REJECT_LIMIT` 239、`ASSASSINATION_HIT` 59 |
| 平均任务轮数 | 3.49 |

随机刺客只有 1/n 的命中率（59/410 ≈ 14%），随机投票让"连续 5 次否决"变得很常见（24%）——
这两个数字偏离真实对局是正常的，它们只用来确认没有哪条路径永远走不到。

**已验证**（2026-08-24，`random.test.ts` 12 个用例）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 10 个文件 / 253 个用例全绿，整套 3.8 秒。

**变异测试自查**——这次改的是**引擎**，只跑模拟对局这一个文件，用来验证它作为验收工具的成色：

| 引擎变异 | 只跑 `random.test.ts` 的结果 |
| --- | --- |
| 平票判通过（`>=` 半数） | 1 条炸 |
| 失败门槛用 `<=` | 2 条炸 |
| 好人 3 分直接终局，不进刺杀 | 5 条炸 |
| 否决不计数 | 5 条炸 |

> 前两条最初是**抓不住**的：结构完好的一千局照样跑得通。补上"把规则独立算一遍"那组断言之后才炸。
> 这正是模拟对局最容易给人错觉的地方——跑得完不等于跑得对。

> **这一组全绿之前，不要开始接 LLM。** 引擎有 bug 时接上 LLM，你会花三天时间怀疑是 prompt 写得不好。

---

## 阶段 4：AI 层（先 mock，后真实）

**目标**：AI 能替代随机策略，且**永远不会输出非法动作**。

- [x] `ai/schema.ts` ✅ 已完成：为 `AiTeamProposal` / `AiSpeech` / `AiVote` / `AiMissionCard` / `AiAssassination` 各写一个 zod schema
      - **schema 只管形状，不管合法性**。队伍人数、好人能不能投失败、刺杀目标座位号，
        一条都不在这里判——那些归 `assertLegal`。同一条规则写两遍必然分叉，
        而分叉的那份一定是 schema 这份（它离 rules.md 最远）。
        `schema.test.ts` 里专门有一组**反向**断言（人数明显不对的队伍、重复座位、
        好人的失败票、越界的刺杀目标全都"应该通过"），拦住后人顺手往 schema 里补规则
      - 未知字段走 `z.object` 的默认剥离，**不用 `z.strictObject`**：模型爱顺手多返回一个
        `confidence`，为此判整次输出失败再重试是纯浪费
      - 每个 schema 挂 `satisfies z.ZodType<AiVote>` 之类，与 `types.ts` 的接口绑死。
        AI 层的类型漂移没有运行时症状，只能靠编译期抓
      - `AI_SCHEMAS`（kind → schema）写成一张表而不是 switch，理由与 `legal.ts` 的
        `PHASE_ACTIONS` 同源。类型标注让漏写一个 kind 变成编译错误
      - `parseAiPayload` / `safeParseAiPayload`：后者返回**字符串**错误而不是 `ZodError`，
        因为 `client.ts` 的重试循环要把它塞回下一轮 prompt 告诉模型哪里不合格
      - `suspicions[].score` 刻意不卡 0-1：它只喂阶段 6 的热力图，
        为一个装饰性字段触发整次重试不划算，0-1 的约定写在 prompt 里、由 UI 归一化
- [x] `ai/mock.ts` ✅ 已完成：实现 `AiClient`，随机合法动作 + 模板发言。**先做这个**，它让你能在零 token 成本下调完整个调度链路
      - **动作一律从 `req.legalActions` 里挑，不自由发挥。** 这让 mock 与 `sim/random.ts` 同源，
        "好人投不出失败票"在 AI 链路上照样成立——好人的候选列表里根本没有 `success: false`
      - 唯一的例外是组队（`legal.ts` 刻意不穷举 C(10,5)），mock 自己选人。
        选人取材于 **`view`** 而不是 `GameState`：mock 拿到的信息必须和真实 LLM 一模一样，
        否则调通了也不算调通
      - `kind` 与 `legalActions` 对不上直接抛 `EngineError("INTERNAL")`。这只可能是调用方
        （将来的 orchestrator）算错了阶段，静默兜底会让它以"AI 在错误的时机发言"的形式流到线上
      - 输出自己也过一遍 `AI_SCHEMAS`。除了保证 mock 与真实 client 交出同一形状的东西，
        它顺手把泛型接了回来（`req.kind` 是 `K`，`AI_SCHEMAS[req.kind].parse()` 直接返回
        `AiDecisionPayload[K]`），**整个文件没有一处类型断言**——别在改动时把这个性质写没了
      - `decide` 写成 `async` 但体内没有 `await`：抛错变成 rejection，与真实 client 的失败形态一致；
        函数体仍同步执行，所以并发阶段（投票、任务票）的 rng 消耗顺序等于调用顺序，确定性不被打乱
      - `debug.prompt` 用一行 stub，**刻意不调用 `buildPrompt`**（它还是 `throw`）。
        prompt.ts 落地后可以换成真的，那时 mock 顺带成为 prompt 构建的冒烟测试
- [x] `ai/prompt.ts` ✅ 已完成：`buildPrompt(req: AiDecisionRequest<K>): string`
      - **函数签名只接受 `AiDecisionRequest`，不接受 `GameState`。** 这是类型层面的防泄漏。
        依赖方向上也够不到：本文件只 import `types.ts` 的类型与 `ROLE_META`、`config.ts` 的两张公开表
      - 结构：游戏规则 → 本局配置 → 你的身份 → 你知道的 → 人设 → 当前局势 → 历史 → 全场发言
        → 本次决策 + 合法选项 → 输出格式
      - **分节不是排版。** 测试按 `【】` 把 prompt 切成段，断言
        【当前局势】【历史】【你的人设】【输出格式】四段里不出现任何角色名——
        泄漏一旦发生几乎必然落在【历史】里（把任务票的投票人渲染出来是最典型的一种）。
        其余几段可以合法出现角色名：【游戏】【本局配置】是公开规则与公开构成，
        【你的身份】【你知道的】是本人该知道的，【全场发言】是别人说的自由文本
        （"我觉得 3 号是梅林"不是泄漏，是玩游戏）
      - **发言长度用句子数，不用字数**（"通常 2–5 句，被追问或只想表个态时一句话也可以"）。
        改动理由见 [rules.md §6](./rules.md)：中文模型对字数感知很差，卡字数只会推高 fallback 率，
        把"fallback 超过 5%"这条判据污染掉。有一条测试专门钉住"整个 prompt 里不出现任何字数区间"
      - **合法选项一律从 `legalActions` 渲染，不自己推。** 好人的任务票决策段里
        **根本不出现"失败"这个选项**——提了等于教模型去试一个必然被引擎拒绝的动作
      - **输出格式给手写紧凑示例，不用 `z.toJSONSchema`**（JSON Schema 又长又费 token，
        对模型可读性反而更差）。防分叉靠测试：把示例从 prompt 里抠出来用 `AI_SCHEMAS[kind]` parse 一遍
      - 角色专属策略提醒（含梅林"别把坏人名单说太明"）写成 `ROLE_HINTS` 一张表，
        **全部只在 prompt 里，不写进引擎**——那是策略失误不是非法操作
      - **不做历史截断。** 120 局实测最长 prompt 13001 字符，撑不爆上下文；
        真爆了应该看得见，而不是被一个 `.slice(-20)` 悄悄藏住。测试有一条 16000 字符的上界盯着
      - 配套改了引擎：`PlayerView` 加 `roleComposition`（见下）
- [x] `ai/client.ts` ✅ 已完成：真实实现（另含 `errors.ts` / `remote.ts` / `src/app/api/ai/route.ts`）
      - 走 Next.js Route Handler（`src/app/api/ai/route.ts`），**API key 绝不进浏览器**
      - JSON 模式 / structured output，zod 校验
      - 校验失败重试 `maxRetries` 次（默认 2），仍失败则在 `legalActions` 里随机兜底，`fallback: true`
      - 每次调用记 `debug`，供复盘面板展示
      - **职责切分**：`client.ts` 整个跑在服务端（它的签名带 `apiKey`，本来就只能在那儿），
        浏览器侧是 `remote.ts` 的 `createRemoteAiClient`——只认识一个 URL，不认识任何 key。
        **重试也在服务端**：一次 HTTP 请求内跑完 N 次模型调用，而不是让浏览器来回 N 趟
      - **只做 OpenAI 兼容协议**（`/chat/completions` + `Bearer` + `response_format: json_object`）。
        deepseek / qwen / openai / 任何兼容网关都说这一套；别的协议走网关，
        不要在 `client.ts` 里长出第二套请求分支。`.env.local.example` 的 provider 列表
        已同步去掉 `anthropic`——留着一个跑不通的选项比不写更糟
      - **错误边界（最要紧的一条）**：只有"模型说了胡话"才兜底
        | 情况 | 处理 |
        | --- | --- |
        | 401 / 403 / 404 / 缺 key / provider 不认识 | 立即抛，一次都不重试 |
        | 429 / 5xx / 网络不通 / 超时 | 重试；用尽仍失败则抛 |
        | 抠不出 JSON、或不合 zod schema | 重试（把错误文本塞回下一轮）；用尽 → 随机兜底 |

        理由与发言长度那次同源：**`fallback` 率是判断 prompt 好不好的唯一指标**
        （下面完成标准里的"超过 5%"），把 401 也算进去这条判据就废了。更要命的是
        key 配错时会静默跑出整局随机 AI，而你完全看不出来
      - **兜底直接借 `createMockAiClient(rng).decide(req)` 的 payload**，只改 `fallback` 与 `debug`。
        mock 已经保证"只从 `legalActions` 里选"，所以**好人的兜底票永远不会是失败票**——
        这条引擎级硬约束不需要在 client 里再实现一遍
      - **重试是带着反馈重问**：把上一次的原文和 `safeParseAiPayload` 给出的错误文本
        追加成 `assistant` / `user` 两条消息。那个函数当初返回字符串而不是 `ZodError`，
        就是为这一步准备的。网络类失败则原样重发，不往 messages 里塞东西
      - `extractJson`：剥推理标签 → 剥 markdown 围栏 → 取第一个 `{` 到最后一个 `}` → 去尾随逗号。
        **剥 `<think>` 是必要的而不是锦上添花**：模型常在推理块里把 JSON 先草拟一遍，
        那时"取第一个 `{`"会把废话一起圈进来（这一条是变异测试逼出来的，见下表）。
        刻意不引入 `ai-json-fixer` 那类激进修复依赖——清洗不动就走重试
      - `AiError` 单独一个类型，**不复用 `EngineError`**：`mock.ts` / `prompt.ts` 抛
        `EngineError("INTERNAL")` 是对的（那确实是引擎不变量被打破），但"对面 429 了"不是引擎的 bug，
        混成一个类型调用方就分不清该改代码还是该改配置
      - Route Handler 按 Next 16.3.2 的写法：用 **Web 标准 `Request` / `Response`**
        （于是 vitest 里 `new Request(...)` 直接调，不需要起 Next）、
        **不写 `export const runtime`**（Edge runtime 这一版已废弃，`'nodejs'` 是默认值）、
        `export const maxDuration = 60`（一次请求内可能跑 3 次模型调用）
      - `maxRetries` 取 `min(请求里的值, LLM_MAX_RETRIES)`：请求来自浏览器，是不可信输入，
        不夹一下的话一个 `maxRetries: 999` 就能烧光预算
      - `schema.ts` 里的 `aiDecisionRequestSchema` **刻意是浅的**（kind 枚举、`legalActions` 非空、
        view / persona 是对象）。给 `PlayerView` 手抄一份全量 zod schema 必然与 `types.ts` 分叉；
        view 畸形的唯一后果是 prompt 变难看，真正的闸门是阶段 7 的鉴权与扣费。
        注意那里用的是 `z.custom` 而不是 `z.object({})`——**后者会把 view 的字段全剥光**，
        是个很安静的坑，有一条测试专门钉住它
- [x] `ai/orchestrator.ts` ✅ 已完成：驱动循环 `runGame({ state, client, rng, ... })`
      - **循环只有一条路径，不按阶段分叉**：
```
awaiting = getAwaitingPlayerIds(state)
  为空 → 走系统动作（START_GAME / NEXT）
  非空 → 每个人并发决策，再按座位序逐个 reduce
```
        引擎已经把「同时行动」编码在 `awaiting` 的长度里（讨论/组队/刺杀恒为 1，
        投票/任务票/查看身份才会 >1），所以**这里不需要再抄一张阶段表**——
        理由与 `legal.ts` 的 `PHASE_ACTIONS` 只写一处同源。
        并发的那一批**全部基于同一个 state 快照**，这正是"同时投票、看不到别人投了什么"
        的语义；有一条测试断言投票请求里 `progress.submitted` 恒为 0 来钉住它
      - **最后一道合法性闸（todos 原本漏了的一条）**：LLM 可能返回**形状合法但规则非法**
        的动作——`team: [0, 0, 1]` 座位重复、人数不对、刺杀一个不存在的座位。
        zod 只管形状；`assertLegal` 能拦，但它要 `GameState`，而 `client.ts` 只有
        `PlayerView`，**它验不了**。orchestrator 是第一个同时拿到状态和 AI 答案的地方，
        所以这道闸只能在这里补——不补的话真实模型跑到一半会直接抛 `EngineError` 把整局打死。
        换掉的动作标 `rescued: true`，而 `result.payload` 里**仍保留模型原本想做的**，
        复盘时要看的就是这个差异
      - 兜底动作借 `createMockAiClient(rng)`，与 `client.ts` 的 fallback 同源：
        mock 只从 `legalActions` 里挑，好人的兜底票天然不会是失败票
      - **人机接口用回调**：轮到人类时 `await onHumanAction({ kind, view, legalActions })`。
        全 AI 局不传这个回调；有人类座位却不传 → 抛 `EngineError`，**不替他做决定**。
        人类的动作不进 `DecisionRecord`——那份记录是给复盘面板看 AI 心证的
      - **节奏控制是调用方的事**：`onDecision` 返回 promise 会被 await，
        阶段 5 的"AI 发言之间停 800ms"在那里实现，orchestrator 不管。
        并发阶段也按座位序逐个回调，UI 拿到的始终是一条有序的事件流
      - `AbortSignal` 每轮开头检查一次。玩家关掉页面后循环还在烧 token，是真会花钱的
      - `decisionKindOf` / `toGameAction` 这两张映射由本文件导出，
        `mock.test.ts` 与 `prompt.test.ts` 里那两份临时副本**已经删掉**（当时就写着要删）
      - `resolveAiClient(rng)` 按 `NEXT_PUBLIC_AI_MODE`（`mock` | `remote`）选 client。
        **默认 mock 是刻意的**：不会因为忘了配开关就悄悄开始花钱。
        注意必须写成字面量 `process.env.NEXT_PUBLIC_AI_MODE`——Next 只在构建时替换这种写法，
        先解构 `process.env` 或用变量做下标**都不会被内联**
      - 本文件跑在浏览器，**不 import `client.ts`**，也不读任何 `LLM_*` 变量，用源码断言钉住

**完成标准**：
- [x] mock 模式跑 100 局全部正常结束
- [x] 跑真实 LLM 的入口已就绪：`src/lib/ai/real-game.test.ts`
- [x] 用真实 LLM 跑 1 局 5 人全 AI 局（gpt-5-nano，seed 94938，53 次调用，好人胜）
- [x] `fallback` 比例统计出来：**schema 兜底 0%**，合法性兜底 7.5%（4/53）
- [x] 人工读一遍全部发言——读出两个 prompt 缺陷，已修复并复跑验证，见下方

做法（要显式开开关才会跑，日常 `pnpm test` 与 CI 不受影响）：

```bash
# 1. 在项目根目录建 .env.local（已被 gitignore）
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-5-nano
LLM_EXTRA_BODY={"reasoning_effort":"minimal"}   # 推理模型不加会慢十倍
LLM_TIMEOUT_MS=120000
LLM_REAL_GAME=1                                 # ← 这一行才是开关

# 2. 跑一局。约 50-80 次调用，两分钟上下
pnpm vitest run src/lib/ai/real-game.test.ts
```

它会**边跑边打点**（每次决策一行，带耗时与兜底标记），结束后把全部发言、每个座位的
真实身份、两种兜底率打印出来，并落盘到 `transcripts/real-game-<seed>.txt`（已 gitignore）。
**全 AI 局不需要 UI，也不需要起 Next 服务器**——`/api/ai` 存在的意义是别让 key 进浏览器，
而这个测试本来就跑在 Node 里，直接用 `createAiClient`。

刻意**不断言 `fallback` 阈值**：那个数字是给人看的判断依据，
写成断言只会让这个本来就依赖外部服务的测试更脆。

#### 第一次真跑，四个坑全是配置层的，值得记下来

| 症状 | 真因 | 处理 |
| --- | --- | --- |
| `HTTP 401`，key 明明是对的 | 用户级环境变量里有个旧 `LLM_API_KEY`，**盖住了 `.env.local`** | 保留"真实环境变量优先"（与 `@next/env` 一致，已实测），但**被盖住就报出来**，只报变量名 |
| `HTTP 400` | `gpt-5` 系列只接受默认温度，显式发 `temperature: 0.8` 就被顶回来 | 新增 `LLM_TEMPERATURE`，写 `default` 表示**这个字段不发**（`null` ≠ 0） |
| 每次调用超时，一局跑不完 | 推理模型吐 JSON 前先烧 1600+ reasoning token，默认 30s 不够 | 新增 `LLM_TIMEOUT_MS`；再加 `LLM_EXTRA_BODY={"reasoning_effort":"minimal"}`，实测 12.2s → 1.5s |
| 跑完了，但**一个字都没打出来** | vitest 4 默认 reporter 把 `console.log` 整个吞掉（`--reporter=verbose` 才可见） | 改用 `process.stdout.write`，两种 reporter 都实测过；并落盘一份 |

**`LLM_EXTRA_BODY` 是唯一一个 provider 专属参数的出口。** 理由与"别的协议请走兼容网关"
同源：与其为每家模型长一个 `if`，不如开一个通用口子。它排在请求体最后，
所以不支持 `json_object` 的模型也能从这里换掉 `response_format`；
`model` / `messages` 明确不许覆盖——改了等于换个问题去问模型，而 `debug.prompt` 里记的
还是原来那份，能查一天。

**`LLM_REAL_GAME` 这个开关和"配没配 key"是两件事。** 一开始只按配置判断，
结果 `.env.local` 一填好，往后每次 `pnpm test` 都真跑一局：两分钟加真金白银，而你根本没想跑。
另外那个"被环境变量盖住"的检查**不能在模块顶层抛**——那会把整个文件炸掉，连跳过都做不到，
于是配了 key 的机器上 `pnpm test` 直接变红。它属于"测试真要跑的那一刻"，放在 `it()` 第一行。

#### 人工读发言读出来的两个 prompt 缺陷（已修）

**信息隔离没有被突破**（引擎侧一切正常），但 **prompt 有两个真缺陷**，
都是自动化测不出来、只有人工读发言才会发现的：

| 缺陷 | 现象 | 修法 | 复跑结果 |
| --- | --- | --- | --- |
| **公开发言里自报身份** | 刺客说"作为刺客，我会观察……"，梅林说"作为梅林……" | 新增 `PUBLIC_SPEECH_RULES`，`SPEECH` 与 `TEAM_PROPOSAL` 共用；身份段标注"只有你自己知道" | 2 条 → 1 条 → **0 条** |
| **好人试图打失败票** | 合法性兜底 7.5%（4/53），全是 `MISSION_CARD` | 在【你的身份】【本次决策】【输出格式】**各钉一次** | 7.5% → **0%** |

三件值得记住的事：

1. **抽象规则对弱模型不够用，要给反例。** 只写"不要说出自己的真实角色"之后，
   第二局仍然出现"作为梅林，我更关注……"；补上"别用「作为梅林……」这种开头给自己贴标签"
   才降到 0。
2. **禁的是"给自己贴标签"，不是"撒谎"。** 莫甘娜冒充梅林去骗派西维尔是核心玩法，
   规则若写成"不许撒谎"会当场毁掉整条对局线。两者只差一个字，有专门一条用例钉着。
3. **光"不提失败这个选项"是不够的。** `legal.ts` 不给、`reduce` 里还有 `GOOD_CANNOT_FAIL`
   兜底，模型照样去试。约束要出现在模型**最后读到**的【输出格式】里，
   且那句话的值取自 `legalActions` 而不是写死 `true`——规则仍然只由 `legal.ts` 说了算。
   （这条的用例第一版是假的：好人的合法值本来就是 `true`，拿真实局面断言"只能填 true"
   验不出写死。改成手搓一个"唯一合法值是 false"的假请求才真的能证伪。）

那 4 次非法动作全被 orchestrator 的 `assertLegal` 复检拦下换成合法动作，整局没崩——
**这道 todos 里原本没写的闸，价值当场兑现了。**

#### 第三个缺陷：队长的选人说明生成了却被丢掉（已修）

前两个缺陷靠人工读发言发现，这一个靠**对着 rules.md 逐条核流程**才发现——它没有任何报错，
也不影响胜负判定，自动化测试全绿。

`AiTeamProposal.statement` 被 schema 卡成非空、prompt 也明确索要，但 `toGameAction` 翻译成
引擎动作时只取了 `team`：那段公开的选人说明进不了 `state.speeches`，也就进不了任何人的
`PlayerView`。症状在 `transcripts/real-game-94938.txt` 里看得很清楚——第 1 轮队长（4 号）
的首条发言一个字都没提"我为什么带 1 号和 3 号"，其余四人只能对着 `proposedTeam` 干猜，
整场讨论退化成"请座位 1 和座位 3 说明你们的计划"。

修法是让说明**成为**队长的那一次发言（[rules.md §4.4](./rules.md) 的原话就是"队长先发言
解释选人理由"）：

- `PROPOSE_TEAM` 动作加 `statement` 字段，与 `SPEAK.content` 同类——引擎不校验文本内容
- `phases/teamBuilding.ts` 把它记成一条 `phase: "TEAM_BUILDING"` 的 `Speech`
- `enterProposalDiscussion` 的发言游标从 **1** 起步（`speakingOrder` 仍是从队长起的整圈）。
  **不要改成把队长从 `speakingOrder` 里删掉**：保留整圈，`progress` 自然是"1/n"、
  队长的 `selfSubmitted` 自然为 true，`view.ts` 一行不用动
- 顺带的收益：队长每次提议少一次模型调用。5 人局跑完一局 50 条发言只用 43 次 `SPEECH`
  调用（7 次提议各省一次）

**顺带修的两处历史可读性**（不影响规则，但直接影响 AI 推理质量和人读记录）：

| 问题 | 现象 | 修法 |
| --- | --- | --- |
| 发言分不清是第几次提议 | 一轮被否决两次就有三批发言糊在【全场发言】里，模型不知道哪句冲着哪个队伍说 | `speechLine` 渲染 `Speech.attempt`，**只标组队与提议讨论**——复盘的 attempt 是"该轮最后一次提议"，标出来会误导 |
| transcript 分不清提议讨论 / 复盘讨论 | `real-game-94938.txt` 第 1 轮那 10 条黏成一片，人读着极易误判 | 发言行加 `[第 1 轮 第 2 次提议 提议讨论]`；`SPEECH_RE` 的新增两段写成**可选**捕获组，三份不可再生的旧记录照旧解析得动（有专门用例钉住） |

#### 第四个缺陷：任务结果没有被当成线索用（已修，但先走错了一次）

同样是对着 rules.md 核流程才发现的，同样不报错、测试全绿。两份真实记录里证据确凿：

| 局 | 已知 | 下一轮却带了谁 |
| --- | --- | --- |
| `real-game-84804` | 第 2 轮 `{0,1,4}` 出 **2 张**失败票 → 这 3 人里至少 2 个坏人 | 第 3 轮直接带 `0、1` → 又失败 |
| `real-game-319` | 第 2 轮 `{1,3,4}` 出 **2 张**失败票 | 第 3 轮带 `3、4`、第 4 轮带 `0、3、4` → 全失败 |

最刺眼的一个数字：**84804 那局 35 条发言里，"失败"两个字一次都没出现过**——到第 3 轮已经挂了
两次任务，没有一个 AI 提过任何一次任务结果。

**数据一直都在**（`missionHistory` 全量进【历史】段，发言也不截断），缺的是从事实到结论那一步。

##### 走错的那一版：把结论算好塞进 prompt

第一版新增 `game/deduction.ts`，算出三类硬结论（至少 k 个坏人 / 整队皆坏 / 名额占满则其余人清白），
渲染成一段【推理线索】，**每个玩家每次决策都无条件拿到同一份**，还在组队/投票/发言三处点名要求对照它。
实现完全正确（soundness 用真实身份在 120 局里逐条验过），方向完全错误：

> 现实桌游里，任务板上的**事实**（谁上过车、几张失败票）是明摆着的，
> 但"所以这三人里至少两个坏人"这句**推论是玩家自己说出来的**——说出来才成为公共认知，
> 说错了会被反驳，说对了是功劳。人手一份算好的答案，讨论就退化成装饰。

这是整个阶段 4 里最值得记住的一次返工：**自动化测试全绿、指标也会变好看，但游戏被做坏了。**
测试能证明实现是对的，证明不了方向是对的。

##### 定版：prompt 只给方法（L2），结论留给模型自己推

这条线有四级，第一版一步跨到了最右边：

| 级别 | prompt 里有什么 | 模型要自己做的事 |
| --- | --- | --- |
| L0 | 什么都没有 | 全部 |
| L1 | 「组队/投票前回顾各轮任务结果」 | 推理方法 + 具体推理 |
| **L2（定版）** | 再加一句「失败票只可能来自坏人 → 那车上至少有几个坏人」及其反向 | 具体是谁、能不能同时上车 |
| L3（撤销） | 直接给算好的结论 | 照着做 |

- **方法写进【游戏】规则段**：它和"平票算否决"同一类，是规则常识，不是本局情报。
  反向那句（"任务成功不代表车上没坏人"）必须一起给，否则模型会把成功记录当免罪符。
- **决策段只说去哪儿看**，措辞里不含任何结论。提议讨论那条是题眼：
  **"你从任务结果里看出了什么，得自己说出来——别人不会自动知道你的推理"**。
- `prompt.test.ts` 有一条**反向断言**：整份 prompt 里查不到"至少有 2 个坏人""必然都是好人"这类字样。
  它钉住的是这个设计决定本身，防止后人又顺手把答案塞回去。

##### `deduction.ts` 转成复盘指标，并迁到 `src/lib/ai/`

推导逻辑一行没改（它本来就是对的），只换了用途和位置：

- 位置从 `game/` 挪到 `ai/`，并从 `game/index.ts` 的导出里摘掉——**引擎不做推理，也不对外提供推理**。
- 入口从 `deduceFromHistory(view)` 改成 `deduceFromMissions({ missions, evilCount, seats })`：
  "只看公开信息"这条保证原本是给 prompt 链路用的，现在由输入类型本身表达；
  而复盘要按时序反复切片推，吃 view 反倒得手搓假视角。
- 新增 `findDeductionMisses(final)`：整局里有多少次提议踩了**当时**已知的雷。
  **只喂 `missionIndex` 更小的任务记录**——拿终局全量记录去判过去，等于用未来责备过去，
  数字会虚高，这是本函数最容易写错的一点，有专门用例钉时序。
  队长真实阵营一并标注：坏人踩雷很可能是故意的，和好人的失误混在一个数字里就读不出意思了。
- 对局记录多一段 `=== 推理踩雷 ===`（照搬 `rescuedActions` 的做法：render 写出、parse 原样读回、
  页面 `<pre>` 打印），附两个数字：提名踩雷 x/y 次（其中好人队长 z 次）、
  发言提到失败记录 m/n 条（粗略字符串统计，只当风向标）。
  **旧记录里没有这一段，parse 必须容得下它缺席**——那三份不可再生。

拿 84804 的局面回放，指标精确命中当初人工发现的那一次：
`第 3 轮：2 号[好] 提名 0、1 → 踩中 0、1`，且第 4 轮的 `1、2、3` 没有误报
（只碰到一个人不构成"必然含坏人"）。

**变异测试自查**（五条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 判据改成 `!succeeded` | 1 条炸（7 人局第 4 轮那条） |
| `pickSize` 少算 1 | 2 条炸（含 soundness） |
| `CLEARED` 改成"队伍里的人全是好人" | 3 条炸（含 soundness） |
| 踩雷判定不做时序切分，用终局全量记录 | 1 条炸（时序那条） |
| 把算好的结论塞回 `buildPrompt` | 4 条炸（反向断言 + 3 份快照） |

**已验证**（2026-08-25）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 21 个文件 / 474 个用例全绿 + 1 个跳过，`pnpm transcripts` 三份旧记录照旧解析。

**下一步要看的不是 prompt，是模型**：真实对局跑一局，看 `=== 推理踩雷 ===` 里好人队长的次数
（319 与 84804 各 2 次）与发言提及数（此前 0/35）。这两个数字现在是**指标**而不是输入——
它们变好才说明模型真的在推理。若换了更强的模型仍然不推，再考虑往 L1/L2 之间加东西。

**读记录用 `pnpm transcripts`**：它把 `transcripts/*.txt` 解析成结构、渲染成
`transcripts/index.html`——三局可切换、按轮次分组、自曝的句子逐字高亮。
格式的真源是 `renderTranscript`，`parseTranscript` 与它靠 `transcript.test.ts` 的往返用例锁死：
改了分隔符而解析没跟上，当场就炸。落盘目录**不带点**是刻意的：`.transcripts/` 在
资源管理器里默认隐藏，又因为 gitignore 在源代码管理里也不显示，等于双重隐身（真的没被找到过）。

`real-game.test.ts` 现在会把这两件事直接算出来：`=== 被拦下的非法动作 ===` 打印模型原本
想做什么 vs 实际提交了什么；自曝检测分两档——命中"作为/我是/身为{自己的角色名}"才算
**自曝**，其余只算"提到"（梅林在发言里谈论"梅林"是正常推理，甚至是好牌，不能一律算泄漏）。

**仍未解决、但不阻塞**：发言明显超出【发言长度】要求的 2-5 句，且几乎每个人都在说
"里程碑/时间线/分工"这类空话。这更像 gpt-5-nano + `reasoning_effort: minimal` 太弱，
换模型再看，不必先为它调 prompt。

`mock.test.ts` 另外还钉住了这些：

- 100 局（6 种人数轮着来）全部到达 `GAME_OVER`，六种 `AiDecisionKind` 都被用到过
- 好人从没投出过失败票——把坏人名单独立算一遍再和任务记录对
- 每一次决策的 payload 在驱动里**再独立过一遍 schema**（不复用 mock 内部那次自检）
- `fallback` 恒为 false、`debug` 恒有值、`attempts` 恒为 1
- 决策种类与当时的 phase 自洽；提议的队伍人数正确、无重复、座位合法、升序
- 分布断言：同意/否决都出现过、任务票成败都出现过、刺杀目标不总是同一个座位、
  同一个 view 连续组队会挑出不同队伍——**只靠结构断言抓不住"永远返回第一个候选项"**，
  它照样能跑完 100 局（与阶段 1「梅林不会每局都在 0 号位」是同一类防线）
- 同 seed 跑两次，`finalState` 与整串决策记录都完全一致
- 六种 `kind` 各构造一次"候选动作对不上"的调用，逐一断言抛 `INTERNAL`

> 那份临时驱动**已经删掉**：`mock.test.ts` 现在直接用 `runGame`，
> 决策种类用 orchestrator 导出的 `decisionKindOf`。它由 `legalActions[0].type` 反推
> 而不是由 phase 推——刺杀阶段的两个子步骤因此自动分开，调用方不必复制引擎的次序规则。

**已验证**（2026-08-25）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 12 个文件 / 304 个用例全绿，整套 3.6 秒。`schema.ts` 与 `mock.ts` 覆盖率均为满格
（`ai` 目录未覆盖的只有仍是 TODO 的 `prompt.ts` 与 `client.ts`）。

**变异测试自查**（五条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 任务票不看 `legalActions`，直接 `rng() < 0.5` | 引擎的 `GOOD_CANNOT_FAIL` 在第 1 局就抛，整个文件跑不起来 |
| 组队不 shuffle，取座位号最小的 `teamSize` 个 | 1 条炸（分布断言） |
| `decide` 跳过 `AI_SCHEMAS.parse` 且发言返回空串 | 2 条炸 |
| `AI_SCHEMAS` 少一个 kind | `pnpm typecheck` 炸（映射表的类型标注） |
| 投票永远取第一个候选项 | 1 条炸（分布断言） |

`prompt.test.ts` 钉住的（26 个用例）：

- **四个"干净段"里不出现任何角色名**，在手工局面和 20 局真实对局的每一步、每个待行动玩家上各验一遍
  （借 `sim/random.ts` 的 `onStep` 驱动，这组断言因此不依赖 AI 层的任何东西）
- 【你知道的】与 `view.knowledge` 逐条对得上，条数也要相等——多一条就是凭空多知道了一个人
- **派西维尔那两个座位号按升序渲染**（专门另建一局把梅林/莫甘娜的座位号倒过来才测得出）
- 【全场发言】原样转录 `view.speeches`，不加工也不添油加醋
- 六个 kind 的输出示例都能通过 `AI_SCHEMAS[kind]`
- 好人的任务票决策段里没有"失败"选项、坏人的两个都在；刺杀候选目标与 `legalActions` 逐一相等
- 整个 prompt 里不出现任何字数区间；三个产出自由文本的 kind 都写了句子数要求
- 纯函数：同 `req` 同结果、不改动传入的 `req`
- 快照：梅林组队 / 忠臣发言 / 刺客刺杀三份完整 prompt。**这三份的价值不在拦住改动，
  在于逼改的人读一遍 diff**——"读起来像在教模型作弊"是自动化测不出来的

**已验证**（2026-08-25）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 13 个文件 / 335 个用例全绿，`prompt.ts` 覆盖率满格（`ai` 目录未覆盖的只剩仍是 TODO 的 `client.ts`）。

**变异测试自查**（五条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 【历史】里把任务失败票的投票人渲染出来 | 3 条炸（含整局那条与快照） |
| 派西维尔那条按 `[梅林, 莫甘娜]` 顺序渲染 | 2 条炸 |
| 好人的任务票 prompt 也列出"失败"选项 | 1 条炸 |
| `VOTE` 的输出示例少一个字段 | 1 条炸（示例过 schema 那条） |
| `ROLE_HINTS` 对所有角色返回同一句 | 3 条炸 |

### 配套的引擎改动：`PlayerView.roleComposition`

`buildPrompt` 只能拿到 `PlayerView`，而本局角色构成原本不在里面——AI 会因此明显变笨：
7 人局梅林只看到 2 个坏人、本局坏人却有 3 个时，他本该立刻推出"有莫德雷德"。
角色构成是**开局公开信息**（[rules.md §3.2](./rules.md)），所以加进视角，
形状限定为 `RoleCounts`：**只有数量，没有座位**。

`view.leak.test.ts` 会因此炸 5 条，这正是那个白名单存在的意义。处理方式（不要抄错方向）：

- 给"不出现自己以外的角色名"和"字段名全在白名单内"两条**各套一层 `withoutComposition`**，
  **不要**反过来把 8 个角色名塞进 `ALLOWED_KEYS`——那会让将来某个 `Record<Role, X>` 字段
  漏进视角时再也测不出来。这两条断言的价值就在于它们钝
- 排除的正当性由新增的「角色构成是公开信息」那一组单独证明，其中
  **"每个座位拿到的 `roleComposition` 完全相同"是关键的一条**：它一旦不成立，上面的排除立刻失效
- `sim/random.test.ts` 的整局泄漏扫描里有同一个 grep，同样处理
- 三个快照更新后逐行看 diff，**只应多出一个 `roleComposition` 块**

`client.test.ts` / `route.test.ts` / `remote.test.ts` 钉住的（29 + 14 + 7 个用例，**全程不发一次网络**）：

- `fetchFn` 与 `rng` 两个注入点是整个可测性的来源。少一个，重试或兜底就只能靠真跑
- 清洗：markdown 围栏、`<think>` 推理块、**带花括号的推理块**、未闭合标签、
  JSON 前后的废话、尾随逗号，各一条
- 重试请求里带着上一次的原文与错误文本（对捕获到的 request body 断言）——
  证明是"带反馈重问"而不是原样重发；网络类失败则 messages 不变
- 401 / 404 只调一次；429 / 5xx / fetch 抛会重试到用尽后**抛而不是兜底**
- 好人的 `MISSION_CARD` 兜底永远是成功票；坏人两种都出现过，且都来自 `legalActions`
- 抛出的错误里**不含 apiKey，也不含上游的原始响应体**；route 的 502 响应体同样两样都没有
- route：400（body 非 JSON / kind 不认识 / `legalActions` 为空 / view 不是对象 /
  view 字段残缺）、503（`LLM_PROVIDER=mock`、缺 key、provider 不认识）、
  502（上游 401）、`maxRetries` 被 `LLM_MAX_RETRIES` 夹住
- **浅 schema 不会把 view 的字段剥光**（用 `z.object({})` 就会，这条专门拦它）
- `remote.ts` 的源码里查不到 `./client`、`apiKey`、`process.env` —— 浏览器侧的边界用断言钉死

**已验证**（2026-08-25）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 16 个文件 / 385 个用例全绿，`pnpm build` 通过且 `/api/ai` 正确注册为动态路由
（**route handler 的写法错了只有 `pnpm build` 能发现，单测覆盖不到这一层**）。

**变异测试自查**（五条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 401 也当可重试 | 2 条炸 |
| 重试时不带反馈，原样重发 | 2 条炸 |
| 兜底不走 mock，直接 `rng() < 0.5` | 1 条炸（好人兜底那条） |
| `extractJson` 不剥推理标签 | **最初没抓住**，见下 |
| route 不夹 `maxRetries` | 1 条炸 |

> 第 4 条最初是**抓不住**的：`<think>` 块里没有花括号时，"取第一个 `{` 到最后一个 `}`"
> 顺手就把它跳过去了，剥不剥都一样。补上「推理块里含 `{"approve": false}`」这条用例才炸——
> 而那恰恰是真实场景，模型常在推理块里把 JSON 先草拟一遍。
> **变异测试的价值就在这里：它证伪的不是实现，是测试。**

`orchestrator.test.ts` 钉住的（22 个用例）：

- **同时行动的阶段：每个请求都基于同一个状态快照**（投票请求里 `progress.submitted` 恒为 0）。
  有人先落地的话后面的人就会看到 1——这条是"看不到别人投了什么"在驱动层的体现
- **逐人发言的阶段确实串行**：后发言的人的 `view.speeches` 更长
- 人类回调只为人类座位而来、给的动作真的被应用、人类不进 `DecisionRecord`；
  有人类座位却不给回调 → 抛
- `onDecision` / `onState` 返回的 promise **确实被 await**（用记录时序的假钩子验），
  这是阶段 5 打字机效果的前提
- **rescue**：一个永远返回 `team: [0, 0, 0]` 的假 client → 整局不崩、`rescued` 为 true、
  **换出来的动作对当时的状态逐条过 `assertLegal`**、`result.payload` 里仍是模型原本的答案
- abort 之后立刻停下，不再调用 client
- `resolveAiClient`：未设置或写 `mock` 时**一次网络都不发**，写 `remote` 时请求 `/api/ai`
- 源码不含 `./client`，也不含 `process.env.LLM_`

**已验证**（2026-08-25）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 20 个文件 / 446 个用例全绿 + 1 个跳过（真实模型那条），`pnpm build` 通过。

**变异测试自查**（五条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 并发阶段改成逐个决策 + 立即落地 | 1 条炸（同一快照） |
| 去掉 `assertLegal` 复检 | 2 条炸 |
| `resolveAiClient` 默认走 remote | 2 条炸 |
| 人类座位也交给 AI 决策 | 2 条炸 |
| `onDecision` 不 await | 1 条炸（时序） |

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
      - `SetupScreen` 人数、人类座位、角色配置、mock 开关
        - 角色配置区按 `getFreeEvilSlots(n)` 决定形态：为 0（5、6 人局）时显示
          "该人数配置固定"并列出角色，**不要渲染一个点了没反应的编辑器**
        - 有自由位时用 `getEvilOptions(n)` 渲染选项，选中后走 `composeRoles` 得到完整 roles
        - 用 `checkConfig` 的返回实时提示：有 error 时禁用开始按钮，warning 只显示不拦
          （莫德雷德用在 7/8 人局就是这种情况）
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

## 阶段 7：账号与运营（部署前）

**只在要公开部署时才做，不阻塞前六个阶段。** 前六个阶段做完就是一个完整可玩的单机游戏。

这是**唯一需要数据库的一层**。为什么前面都不需要，见 [architecture.md](./architecture.md)。

**目标**：公开部署后，`/api/ai` 不会被陌生人刷爆你的 LLM 预算。

- [ ] 认证：邮箱注册 + Google OAuth
- [ ] 额度：每账号 1 局免费，可付费购买
- [ ] 数据表：`users` / `credits` / `transactions`——**不存对局数据**
- [ ] `/api/ai` 加鉴权与扣费
- [ ] 支付接入（Stripe 等）
- [ ] `.env.local.example` 把占位块里的变量取消注释并补齐

### 两个容易做错的设计点

**1. 额度按「局」算，不是按「调用」算。**

一局有 60–80 次 LLM 调用（见阶段 4 的成本估算）。每次调用都扣的话，1 局免费额度撑不过第一轮组队。正确做法是引入一个「对局会话」：

```
开局  -> 校验余额 -> 扣 1 额度 -> 签发 session token
对局中 -> /api/ai 凭 token 放行，不再扣费
```

**2. session token 必须有调用次数上限。**

只在开局扣费、后续不设限的话，拿到一个 token 就能无限调用 `/api/ai`——等于没扣费。token 要记录已用调用数，超过上限即失效。上限取一个比正常对局峰值宽裕的数（10 人局的峰值约 150 次，取 250 比较安全）。

### 硬约束

**这一层绝不能碰引擎。** 引擎依然是纯函数，不知道账号的存在：

- `GameState` / `PlayerView` 里不出现任何账号字段
- `src/lib/game/**` 不 import 任何认证或数据库模块
- 运营层只挂在 `/api/ai` 的入口处，和游戏逻辑之间只隔着一次鉴权

如果发现引擎代码里开始出现 `userId`，说明这条界限已经被破坏了，退回去重做。
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
| 公开部署后 `/api/ai` 被刷 | LLM 账单异常增长，可能几天内烧光预算 | 阶段 7 的鉴权 + 按局扣额度 + session 调用上限；**阶段 7 完成前不要公开部署** |

---

## 依赖顺序

```
阶段 0 脚手架
   └─ 阶段 1 配置与发牌
         ├─ 阶段 2 可见性 ──┐
         └─ 阶段 3 状态机 ──┴─ 阶段 4 AI 层 ─ 阶段 5 UI ─ 阶段 6 打磨

阶段 7 账号与运营   ← 不在主线上，只在要公开部署时才做
```

阶段 2 和阶段 3 可以并行，但两者都完成且测试全绿之前不要碰阶段 4。

阶段 7 刻意画在主线之外：前六个阶段做完就是一个完整可玩的单机游戏，阶段 7 解决的是"公开给陌生人玩"带来的运营问题，与游戏本身无关。
