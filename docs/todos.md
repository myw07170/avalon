# 实现计划

本文档是开发路线图。每个阶段都有明确的**完成标准**，达不到就不要进入下一阶段。

配套文档：[rules.md](./rules.md) 规则依据 · [state-machine.md](./state-machine.md) 引擎设计 · [architecture.md](./architecture.md) 分层边界（含「为什么没有数据库」）。

参考项目：[oil-oil/wolfcha](https://github.com/oil-oil/wolfcha)（AI 狼人杀，Next.js 16 + TS + Tailwind 4 + Jotai + Radix UI + Framer Motion）。技术栈直接沿用，但**架构不照抄**：wolfcha 用的是 `PhaseManager` 命令式阶段机，本项目用纯函数 reducer（见 [state-machine.md](./state-machine.md)），因为阿瓦隆的信息隔离要求必须做到"引擎可单测、可跑 1000 局模拟"。

对着它盘点过两次，分工不同：阶段 4 的「[对着 wolfcha 补的四块发言质量短板](#对着-wolfcha-补的四块发言质量短板)」盘的是 **prompt 怎么写**，
阶段 5 之后的「[第二次盘点：功能面](#第二次盘点功能面)」盘的是**还缺哪些功能**。两次都记了"不借"的条目和理由。

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
      - `makePlaceholderPersonas(n)`：占位人设，供测试和阶段 3 的随机模拟用。
        **阶段 4 加了真人设之后它仍然保留**——真人设要发网络，而这个函数是全部引擎测试与
        1000 局模拟的确定性来源，也是人设生成失败时的回退

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
- [x] 补完四块发言质量短板后换 gpt-5-mini 复跑验收（seed 52848，116 次调用，好人胜）：
      两种兜底与自曝都是 0，**发言提到失败记录 0/35 → 53/60**；
      同时读出第五、第六个缺陷（**刺客刺杀自己的队友，两局刺杀两局都是**、
      踩雷指标口径不一），见下方
- [x] 第五个缺陷已修复：推测发言同时落成公开 `Speech`（主因，引擎侧）
      ＋ prompt 标出阵营与已知队友＋【全场发言】标出自己。
      **单测证明不了模型真的不再刺队友**，那要等下一次真实对局

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

> **已有结论**：换 gpt-5-mini 之后发言提及数从 0/35 变成 53/60，模型确实开始推理了，
> L1/L2 之间不用再加东西。见下面「换 gpt-5-mini 的验收局」。

#### 对着 wolfcha 补的四块发言质量短板

参考项目 [oil-oil/wolfcha](https://github.com/oil-oil/wolfcha) 的 prompt 全在
`src/i18n/messages/zh.json` 里，代码在 `src/lib/prompt-utils.ts`。逐条读完之后对出四块短板，
它们共同解释了首两局那个现象：**五个 AI 说着几乎一样的空话**。

| 补的东西 | 为什么有效 |
| --- | --- |
| 底线规则三条 | 禁场外话术直接掐掉"里程碑/分工/时间线"那套周会黑话——模型不知道自己在牌桌上就会退回最熟的语域；禁编造治"引用一句没人说过的话"；立场连贯让整局推理能累积 |
| 发言位次感 | 不给位次，第一个发言的人会凭空引用"前面几位提到"，最后一个会说"再看看 X 号怎么说"，而 X 号已经说完了 |
| 事实类视角提示 | 差异不是靠"请说得有个性"要来的，是靠**每个人处境本来就不同**：被点名的人急着自辩，刚上过失败车的人先撇清 |
| 真人设（LLM 生成） | 形容词改变不了模型关注什么，"最先看票型"和"最先看谁说话急"才会；人设里还要有**缺陷**，完美的人不像真人 |

**wolfcha 有一条注释值得原样引在这里** —— 他们踩过和我们上一轮完全相同的坑：

> 立场类提示（警长支持/质疑）已移除：与对局事实无关的方向性暗示会推动同一玩家前后立场漂移。
> 只保留基于真实对局状态的事实类提示。

所以 `ai/perspective.ts` 的红线和 `ai/deduction.ts` 是同一条：**只给事实，不给立场和结论**。
那个文件有一组反向断言（查不到"可疑/必然/应该投/至少有"这类词），在 40 局真实对局的每个中间状态、
每个座位上各验一遍——它钉住的是设计决定本身。

几个实现上的点：

- **视角提示轮换取，不是永远取前两条**：否则"被点名"一旦触发就永久占住名额，
  后面几条角度一辈子不会出现，五个人又说回一样的话。用 `(selfId + missionIndex)` 做下标，
  同 seed 仍可复现。
- **位次感直接用 `view.progress` + `view.speakingOrder`，一行引擎代码都没改。**
  提议讨论的游标本来就从 1 起步（队长的选人说明占了 `speakingOrder[0]`），照实渲染就对了——
  有一条用例专门钉住"第一个讨论发言者显示第 2 个、已发言名单含队长"，
  防止后人"修正"成第 1 个而与【全场发言】里已有队长那条自相矛盾。
- **人设一次调用出齐全部**，不是每人一次：一次出齐才谈得上互相错开，分人生成必然撞名撞风格，
  还贵 n 倍。`makePlaceholderPersonas` 原样保留——它是全部引擎测试与 1000 局模拟的确定性来源，
  不能引入网络依赖。
- 人设生成**只做了 Node 侧**（`real-game.test.ts` 本来就跑在 Node 里）。
  浏览器要用的 `/api/personas` 留到阶段 5，理由与 remote.ts 同源：key 不进浏览器。

**变异测试自查**（三条各改一次，确认都被抓住后还原）：

| 变异 | 被抓 |
| --- | --- |
| 视角提示里塞一条立场类（"座位 1 很可疑，你应该投反对"） | 2 条炸（含 40 局那条） |
| 把队长从提议讨论的位次里减掉 | 4 条炸（含快照） |
| 去掉"禁场外话术"那条 | 3 条炸（含 2 份快照） |

> 第 2 条的第一版变异是**无效的**：把 `progress.submitted + 1` 改成 `spoken.length + 1`，
> 而 `spoken` 本来就是 `slice(0, submitted)`，两者恒等，测试当然全绿。
> 换成"把队长过滤掉"才真的模拟了后人会做的那个"修正"。**变异测试也会写错，写错时它什么都证明不了。**

**已验证**（2026-08-25）：`pnpm typecheck` / `pnpm lint` 无输出，
`pnpm test` 23 个文件 / 508 个用例全绿 + 1 个跳过。

**这次的验收只能靠真实对局**：跑一局，读发言看三件事——"里程碑/分工"这类词是否消失、
五个座位的发言是否终于长得不一样、`=== 推理踩雷 ===` 与发言提及数有没有变好。

#### 换 gpt-5-mini 的验收局：方法论生效了，但读出第五个缺陷

**已验证**（2026-08-25，seed 52848，`transcripts/real-game-52848.txt`）：
`openai / gpt-5-mini`，**除模型外其余配置一律没动**（仍是 `reasoning_effort: minimal`），
5 人局，116 次调用，7 分 39 秒，好人获胜（`ASSASSINATION_MISS`）。

三件要看的事，两件明确变好：

| 指标 | 前三局（gpt-5-nano） | 这一局（gpt-5-mini） |
| --- | --- | --- |
| **发言提到失败记录** | 84804 局是 **0/35** | **53/60** |
| 场外话术（里程碑/分工/时间线） | 几乎每条都有 | 基本消失 |
| 自曝身份 | 2 → 1 → 0 | **0**（60 条发言） |
| schema 兜底 / 合法性兜底 | 0% / 0% | **0% / 0%** |
| 人设 | 占位（AI-1…AI-5） | 一次调用出齐：陈川、李珂、孙娜、赵明、周晴，**没走回退** |

**L2 那条线是对的。** prompt 里只给了方法（"失败票只可能来自坏人"及其反向），
没给任何本局结论，模型自己把结论说了出来——派西维尔在第 2 轮复盘里说
"我上过那车，而且我不会投失败票，所以那张失败票必然来自座0或座2"。
这正是当初撤掉 L3 时赌的那件事：**把推理留给模型，讨论才有内容**。

##### 第五个缺陷：刺客会刺杀自己的队友（两局刺杀，两局都是）——**已修复**

到目前为止只有两局走到了刺杀（另外两局坏人靠三次任务直接赢了），**这两局的刺客都刺了自己人**：

| 局 | 刺客公开说的推测 | 实际刺了 | 结果 |
| --- | --- | --- | --- |
| 94938 | "我怀疑梅林在座位3" ← **座位 3 真的是梅林** | 座位 1 = **莫甘娜**（队友） | 落空，好人胜 |
| 52848 | "我现在认为座0最可疑" | 座位 0 = **莫甘娜**（队友） | 落空，好人胜 |

94938 那局尤其刺眼：**刺客在 `ASSASSIN_OPINION` 里推对了**，转头在 `ASSASSINATE` 里
换了个人，而且换成了自己的队友。两局都因此把坏人已经到手的胜局送掉。

**不是泄漏，也不是引擎算错身份，方向恰好相反**——是模型没用上它本来就有的信息。
`visibility.test.ts` 钉着"莫甘娜与刺客互相可见"，`prompt.test.ts` 钉着
"【你知道的】与 `view.knowledge` 逐条相等"，两条都绿。

###### 主因（引擎）：推测发言写进 `pending`，进不了任何视角

`phases/assassination.ts` 把 `ASSASSIN_OPINION` 的 `content` 只存进
`state.pending.assassinOpinions`，而 `view.ts` 只映射 `state.speeches`——
`pending` 按设计一个字都不进视角（只折算成 `progress` 两个数字）。

于是**整个推测环节是只写不读的**：内容要等到 `GAME_OVER` 之后才经
`AssassinationRecord.opinions` 出现在对局记录里给人看。刺客动手那一刻，
上下文里**一条推测都没有，包括他自己一分钟前刚说的那条**。94938 局"推对了又改口"
就是这么来的——他不是改主意，他是根本不记得。

**这是 `PROPOSE_TEAM.statement` 那个坑的第二次复发**（见上面「第三个缺陷」）。
两次的形状完全一样：rules.md 说这段话是公开的，代码却把它存到了没有任何视角读得到的地方。
`teamBuilding.ts` 的文件头注释记着上一次的症状，这次就照它的做法修。

修法：`ASSASSIN_OPINION` 在追加 `pending.assassinOpinions` 的**同时**追加一条
`phase: "ASSASSINATION"` 的 `Speech`，并补一条 `SPEECH` 日志。
**两份数据都要留**——`pending` 那份管调度与结算（`view` 的 `progress`/`selfSubmitted`、
`legal` 的轮次、`AssassinationRecord.opinions` 三处都靠它），`speeches` 那份管"说出口的话"，
关系与 `proposedTeam` + 选人说明完全相同。

###### 一条测试把这个 bug 藏了很久：`view.leak.test.ts` 归错了类

原来那条「刺杀阶段坏人的推测内容不进任何人的视角」把当前行为**锁成了"故意的"**。
它和 `votes` / 任务票 / `acknowledged` 放在一组，可那一组保护的是**同时提交的秘密**
——结算之前不许看见别人交了什么。而刺杀推测**不是同时提交**：`legal.ts` 让坏人
按座位升序**逐个**发言，形状与讨论阶段一模一样，rules.md §4.5 的原话也是
"各**发表**一次推测意见"。

内容只是因为暂存在 `pending` 里，就连坐继承了 `pending` 的"什么都不漏"规则。
**测试写对了字面，写错了归类，于是它守住的是一个 bug。**

这条改**窄**而不是删掉，拆成两条：`pending` 的形状仍然不进视角；
没轮到、没说出口的推测不会提前出现。注释里写明了放宽的理由，
否则后人只会看到"有人把泄漏测试改松了"。

###### 附带的三处 prompt 修补

主因修完，模型仍然缺"所以队友不可能是梅林"这一步，所以 prompt 也补了
（都是**只标注不删减**，`legalActions` 仍是合法性的唯一权威）：

| 补的东西 | 为什么 |
| --- | --- |
| 【本局配置】的角色能力表标阵营（`- 梅林（好人）：…`） | 原先通篇没有一句话说梅林是好人。`ROLE_META.team` 是现成的，只是没渲染 |
| 【本次决策】的可选目标逐行列出并就地标注队友与自己，外加"梅林是好人阵营的角色" | 知识在【你知道的】段，决策在几百字之外，中间隔着几十条发言 |
| 【输出格式】再钉一次 `targetId 不要填 座位 …` | 与好人失败票那次同源：**约束要出现在模型最后读到的地方** |

**排除名单只能由 `view.knowledge` 推出，不能用"本局坏人是谁"去算。**
刺客不认识奥伯伦，所以奥伯伦**照样出现在可考虑的目标里**——那是正确的游戏后果，
不是 bug。写反了就是一次货真价实的信息泄漏，有专门一条用例钉着。

【输出格式】那句话里**不能出现"梅林"**：它属于「不在干净段里泄漏身份」那条断言
覆盖的干净段，第一版写"不可能是梅林"当场炸了 8 条。
**那条断言钝得有道理，不该为一句措辞让路**，改成不提角色名一样说得清楚。

##### 顺带：模型也会忘记自己是几号——**已修复**

52848 那局的莫甘娜（0 号）从第 2 轮起就在用第三人称追问自己：
"座0这轮是新上场并且话很多……座0，你刚才说愿意来收信息，但请现在一句更具体的承诺"，
到刺杀阶段更是直接说"我现在最怀疑的是座0"——她就是座 0。全场跟着一起怀疑座 0，
刺客的刀也就递了过去。

`speechLine` 一行就能看出为什么：【你的身份】只在开头说过一次"你是座位 0"，
而【全场发言】里几十行清一色 `座位 N：`，**没有任何一行标出哪个 N 是你自己**。

修法是把自己那几条渲染成 `座位 0（你）`。**没有改 `PlayerView`**——
这是纯渲染问题，`view.selfId` 已经在手里了。顺带让刺杀阶段的发言不再渲染"第 N 轮"
（任务都打完了，"第 3 轮 刺杀"只会让模型分神）。

##### 这一轮的变异测试（五条各改一次，确认都被抓住后还原）

| 变异 | 被抓 |
| --- | --- |
| `ASSASSIN_OPINION` 只写 `pending`、不写 `speeches`（退回原 bug） | 2 条炸（含"刺客读得到自己那条"） |
| 排除名单改用"本局全部坏人"而不是 `view.knowledge` | 4 条炸（含奥伯伦那条与快照） |
| 把已知队友从可选目标里直接删掉 | 3 条炸（含"与 `legalActions` 完全一致"） |
| `speechLine` 给所有人都标"（你）" | 2 条炸 |
| `renderTranscript` 不过滤刺杀发言（推测印两遍） | **最初没抓住**，见下 |

> 第 5 条最初是**抓不住**的：往返用例的 fixture 只填了 `assassination.opinions`，
> 没有对应的 `ASSASSINATION` 发言，而真实对局里两者一定同时存在。
> 补上一条"推测只出现一次"的用例才炸。
> **变异测试证伪的不是实现，是测试**——这已经是本项目第三次靠它发现测试写空了。

##### 仍然没被证明的事

单测只能证明"推测进了视角、队友被标注出来了、奥伯伦没被误标"，
**证明不了模型真的不再刺队友**——那要等下一次真实对局，
而刺杀阶段还得好人先集齐 3 分才会触发（四局里只触发过两次）。
这一条不要含糊过去。

##### 第六个：`提名踩雷 x/y` 的分子分母不同口径

记录里印的是 `提名踩雷 7/8 次（其中好人队长 4 次）`，读起来像"8 次提议里踩了 7 次"，
**实际只有 4 次提议踩雷**（好人队长 2 次）。原因是 `findDeductionMisses` 按
**提议 × 证据**产出条目：第 5 轮那几次提议同时踩中第 2 轮和第 4 轮两条证据，各算了两遍，
而分母 `proposalHistory.length` 是提议数。

这不影响任何判定，但它是个**会让人读错的指标**——而这一段的全部用途就是给人读。
修法是分子按提议去重（`new Set(misses.map(m => m.proposalIndex))`），或者把分母也换成条目数。

##### 仍然没解决的

- **发言长度**依然远超【发言长度】要求的 2–5 句，多数在 6–10 句。换了强模型也没改善，
  说明不是模型弱，是 prompt 里那句要求压不住"把话说全"的倾向。
- **同质化换了个壳**：周会黑话是没了，但全场五个人从第 1 轮起就一起念叨
  "每人一句话：同意/反对+为什么""把表态留作可对照的记录"，到第 5 轮还在念。
  `perspective.ts` 的视角提示给了不同角度，但压不过模型互相抄发言的倾向。
- 一处中英混杂："能 tell us（告知我们）更多"。

**当时定的优先级已经走完**：第五个缺陷（刺客刺队友）与"忘记自己是几号"都已修复并复跑验证。
剩下的三条（发言长度、同质化、中英混杂）连同第六个缺陷一起挪到了
[阶段 6.1 对局质量](#61-对局质量)，那里还多出一条对它们的结构性解释。
**每改一次都要真跑一局复验**——前五个缺陷都是这么关掉的。


**读记录用 `pnpm transcripts`**：它把 `transcripts/*.txt` 解析成结构、渲染成
`transcripts/index.html`——三局可切换、按轮次分组、自曝的句子逐字高亮。
格式的真源是 `renderTranscript`，`parseTranscript` 与它靠 `transcript.test.ts` 的往返用例锁死：
改了分隔符而解析没跟上，当场就炸。落盘目录**不带点**是刻意的：`.transcripts/` 在
资源管理器里默认隐藏，又因为 gitignore 在源代码管理里也不显示，等于双重隐身（真的没被找到过）。

`real-game.test.ts` 现在会把这两件事直接算出来：`=== 被拦下的非法动作 ===` 打印模型原本
想做什么 vs 实际提交了什么；自曝检测分两档——命中"作为/我是/身为{自己的角色名}"才算
**自曝**，其余只算"提到"（梅林在发言里谈论"梅林"是正常推理，甚至是好牌，不能一律算泄漏）。

> **这一段写于换模型之前，结论已被证伪，留着是为了记住这次判断错在哪。**
> 当时把"发言超长 + 满嘴里程碑/时间线/分工"归给 gpt-5-nano 太弱，打算换模型再看。
> 后来换 gpt-5-mini 复跑（见上面那一节）：场外话术确实基本消失了，**但发言长度一点没变**，
> 仍是 6-10 句。所以那两个症状根本不是同一个原因——一个是语域问题（prompt 能治），
> 一个不是。**"换个强模型再看"是个很省事的结论，也正因为省事，值得多问一句它到底解释了哪几个症状。**
> 剩下的问题连同它们的新解释都在 [阶段 6.1](#61-对局质量)。

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

- [x] `store/game.ts`：Jotai atoms + 驱动层
      - `gameStateAtom`（全知，**只在客户端引擎里用**）
      - `myViewAtom = atom(get => toPlayerView(get(gameStateAtom), get(mySeatAtom)))`，两个来源任一为空给 `null`
      - **所有组件只读 `myViewAtom`**，读 `gameStateAtom` 的组件一律视为 bug（`GAME_OVER` 复盘面板除外，它读 `view.reveal`）
      - 组件入口：`humanTurnAtom` / `isMyTurnAtom` / `teamConstraintAtom` / `revealAtom` / `reviewDecisionsAtom` / `runStatusAtom` / `errorAtom`
      - 写入口：`createGameAtom` / `runGameAtom` / `submitActionAtom` / `resetGameAtom`；设置 `aiModeAtom`（mock 开关）/ `paceMsAtom`
      - **开局分两步**：`createGameAtom` 停在 `SETUP`（`runStatus === "ready"`），玩家看完身份再 `runGameAtom` 起跑。
        必须这样，因为 orchestrator 对 `ACKNOWLEDGE` 不走 `onHumanAction`（`decisionKindOf` 返回 `null` 时直接落地），
        循环一起跑 `ROLE_REVEAL` 就被瞬间跳过，`RoleCard` 的翻牌动效没有停留时间
      - `decisionsAtom` / `pendingTurnAtom` / `abortAtom` **不导出**：第一个是 AI 心证（对局中读到即开天眼），
        第二个带着 promise 的 `resolve`（拿到就能绕过校验），第三个是中止句柄
- [x] 组件：
      - [x] 视觉基座（第一块 UI 顺带立起来的，后面 7 个组件都站在上面）
        - `globals.css`：8 个色 token + 3 个字体角色。**只做深色**，`color-scheme: dark` 固定，
          不做 `prefers-color-scheme` 切换——对局界面就是夜里的一张圆桌，浅色版本没有意义
        - 强调色天生有两个（`loyal` 冷钢蓝 / `mordred` 干血红），因为游戏本身是二元的；
          `brass` 只承担交互态（选中 / 焦点 / 主按钮）
        - `--font-display` 是 CJK 衬线栈：Geist 一个汉字都没有，不定 CJK 栈就会各挑各的
        - `.tabular` 等宽 + `tabular-nums`，所有数字走它——整屏本质是配置表，数字要对齐
        - `src/lib/utils.ts` 的 `cn()`（clsx + tailwind-merge）
      - [x] `GameShell` 按 `runStatusAtom` 分四支的骨架，后面每一步往里填
      - [x] `SetupScreen` 人数、人类座位、角色配置、mock 开关
        - 推导全在 `setup-model.ts`（纯函数，`.ts` 测试覆盖，不引入 jsdom），组件只负责画
        - 选座器就是圆桌：`seat-ring.ts` 给圆周百分比坐标，`SeatTable` 下一步直接复用；
          改人数时座位沿圆周滑动（CSS `transition-[left,top]`，Framer Motion 留给 `RoleCard`）
        - 角色配置区按 `getFreeEvilSlots(n)` 决定形态：为 0（5、6 人局）时显示
          "该人数配置固定"并列出角色，**不要渲染一个点了没反应的编辑器**
        - 有自由位时用 `getEvilOptions(n)` 渲染选项，选中后走 `composeRoles` 得到完整 roles
        - **10 人局选的是一个"组合"不是三个独立开关**：`getEvilOptions(10)` 给 4 组成对选项，
          做成三个 checkbox 会让玩家配出 `TEAM_SPLIT_MISMATCH`
        - 用 `checkConfig` 的返回实时提示：有 error 时禁用开始按钮，warning 只显示不拦
          （莫德雷德用在 7/8 人局就是这种情况）
        - **种子在点击「入座」时才取** `Date.now() >>> 0`：`createConfig` 缺省 seed 是 `0` 而 `0` 是个真种子，
          不传的话每局发一样的牌；放进 `useState` 初值又会让 SSR 与 hydration 对不上
        - 换人数必须重置座位与自由位下标（旧值在新人数下可能非法），由 `withPlayerCount` 负责
      - [x] `RoleCard` 翻牌动效展示身份与 knowledge（Framer Motion）
        - 演在 `runStatus === "ready"` 这一档，点确认后调 `runGameAtom`
        - **翻牌要玩家自己点**，再点一次能盖回去——旁边有人时身份得收得回来
        - 推导在 `role-card-model.ts`（`describeRole(view)`），文案对齐 `ai/prompt.ts` 的口径，
          区别只是 UI 版把座位号配上名字
        - 「你知道的」用 `SeatRing` 画：已知坏人标红，派西维尔那一对标黄铜虚线。
          忠臣和奥伯伦 `hasKnownSeats` 为 false，不画环，只给「只能靠推理」那句
        - **派西维尔那两个座位必须完全同等对待**：同一个 tone、同一条描述、不按下标区分。
          `playerIds` 升序是引擎刻意抹平信息的结果，UI 上任何不对称都会把答案泄回去
        - 梅林多给一行：`countEvil(roleComposition)` 是公开信息，与 `knowledge.length`
          之差恒等于莫德雷德数量，所以「本局有 4 个坏人，你只看到 3 个——莫德雷德在场」是确定结论
        - **framer-motion 13 的坑**：CSS `perspective` 必须放在外层普通 `<div>` 上。
          在 `motion.*` 的 `style` 里它被当成 transform 值（`MotionCSS` 把它从 `CSSProperties` 删了），
          写在那儿卡片会翻得是平的。`import { motion } from "framer-motion"` 在 v13 仍有效，
          README 建议的 `motion/react` 解析不了——`motion` 这个包没装
        - `useReducedMotion()` 是必须的：globals.css 那条 `prefers-reduced-motion` 只管 CSS 过渡，
          管不到 JS 驱动的动画
      - [x] `SeatRing` 共用圆桌：`SetupScreen` 的选座器、`RoleCard` 的已知座位、
        以及下一步的 `SeatTable` 用同一份。给了 `onSelect` 才渲染成按钮，
        tone → 配色的映射集中在这一处
      - [x] `SeatTable` 圆桌座位，标记队长、队员、已投票/已发言状态
        - 推导在 `seat-table-model.ts`（`describeTable(view)`），测试用 `runGame` 跑真实一局，
          把沿途每一步每个座位的视角都过一遍
        - **一个座位同时压着四层信息**，各占一条视觉通道（见 `SeatRing` 文件头）：
          节点配色 = 身份认知（一整局不变）· 外圈光环 = 在队伍里 · 上方徽标 = 队长 · 右下角 ✓ = 已提交
        - **同时行动和依次行动要分开算 done**：投票／任务票／确认身份是同时的，
          "没在等他"就等于"他交了"；讨论是依次的，发言序里排在游标后面的人既没说过也不在等——
          用"参与者减去 awaiting"会把整队人都标成已发言
        - **刺杀阶段不标参与者**：那个阶段只有坏人行动，标出来等于把坏人名单画出来
        - 身份认知在对局中一直显示：梅林不该每轮重新回忆一遍座位号。
          画出来的只有 `view.knowledge` 明确给他的那些座位，不构成泄漏
        - 状态行只等一个人时点名，等一批人时只报数——"谁还没交"是公开的，"谁先交的"不是
      - [x] `MissionTrack` 5 个任务节点 + 否决计数器
        - 推导在 `mission-track-model.ts`（`describeTrack(view)`），测试跑 7 局真实对局，
          凑齐「成功」「失败」「进行中」「否决撞线」这些不是每局都出现的状态
        - **已结算优先于「是当前轮」**：`MISSION_RESULT` 阶段记录已经进了 `missionHistory`，
          而 `missionIndex` 要等 `NEXT` 才递增，两者会同时指向同一轮
        - **复盘讨论时没有任何一轮是「进行中」**：`enterNextMission` 在 `REVIEW_DISCUSSION`
          结束后才递增 `missionIndex`，所以那段时间 `missionIndex` 指的是刚打完的那一轮。
          不标当前轮是如实反映，别为了好看去猜下一轮
        - **否决计数器是每轮独立的**：提议通过或进入下一轮都会归零，显示的是
          「本轮连续否决了几次」，不是整局流水。撞满 = 坏人直接获胜（`REJECT_LIMIT`），
          所以它是危险指示条，不是计数器
        - 警告只在最后一次机会时出现。每轮都喊狼来了，真该紧张时就没人看了
        - ⚠️ `forcePassOnLastAttempt` 变体下那句警告会不准，但**该开关不在 `PlayerView` 里**，
          UI 看不到它，`SetupScreen` 也从不开启。真要支持得先把它投影进 `PlayerView`
      - [x] `SpeechFeed` 发言流，AI 逐字打字机效果
        - 推导在 `speech-feed-model.ts`（`describeFeed(view)`），测试跑 7 局真实对局
        - **四个阶段都会往 `speeches` 里写**：队长的选人说明（`TEAM_BUILDING`）、组队讨论、
          复盘讨论、**以及刺杀阶段的逐个推测**。最后一个容易漏——`assassination.ts` 明确
          把它当"说出口的话"记进 `speeches`，不是暗票
        - 选人说明与紧随其后的组队讨论归同一组，拆开的话"他怎么解释这份名单"和
          "大家怎么回应"会隔着一条分隔线
        - **只给最新一条打字**，更早的都是完整文本。所以"上一条没打完下一条就到了"
          不用额外处理——那条不再是最后一条，自然整条显示
        - **打字总时长必须短于发言间隔**：`paceMsAtom` 默认 800ms 且停顿在发言出现【之前】，
          打字比这慢就会一直被打断。所以按长度反推每字耗时（目标 700ms，每字夹在 12–45ms）
        - **空发言是合法状态**：`legal.ts` 只校验"轮没轮到你"，不管文本本身。
          渲染成空气泡会让玩家以为界面坏了，如实显示「（没有开口）」
        - 打字机的归零放在**渲染期**而不是 effect 里：放 effect 会先用上一条的文本渲染一帧，
          看起来像闪了一下别人的话（也正好绕开 `react-hooks/set-state-in-effect`）
        - 自己敲的那条、以及 `prefers-reduced-motion` 下，直接给全文不演动画
      - [x] `ActionPanel` 按 `humanTurnAtom.legalActions` 渲染当前可做的操作，提交走 `submitActionAtom`
        - 推导在 `action-panel-model.ts`（`describeTurn(turn)`）。测试跑 7 局全 AI 对局，
          把沿途每一步、每个待行动的人都收成一手棋，再用真正的 `assertLegal` 验面板拼出来的动作——
          这比断言表单长什么样有力得多。另有一局由"只会点面板的玩家"完整跑通
        - **不要直接调 `getLegalActions`**，它要 `GameState`
        - **能选的东西一律来自 `legalActions`，面板不自己拼**：投票、任务票、刺杀目标都是
          原样取用引擎给的那几个动作对象。按 phase 或 `view.selfTeam` 自己判断该给几个按钮，
          等于把引擎规则在 UI 里再实现一遍，而不一致的那一次就是一张本不该存在的失败票
        - 两个例外是模板动作（`PROPOSE_TEAM` / `SPEAK` / `ASSASSIN_OPINION`）：要填内容，
          但 `type` 和 `playerId` 仍然 `{ ...template, ... }` 沿用模板，不在 UI 里手写。
          `SPEAK` 与 `ASSASSIN_OPINION` 因此走同一条代码路径
        - **组队按座位号升序提交，不保留点击顺序**：`proposedTeam` 原样进每个人的 `PlayerView`，
          `prompt.ts` 里 `seatList(view.proposedTeam)` 直接念给所有 AI 听——
          保留点击顺序等于把"你先想到谁"一起广播出去
        - **好人只有一个任务票选项时必须解释**（`note`）。一颗孤零零的按钮看起来像界面把
          另一个选项藏了，得说清楚它压根不存在
        - 空发言是合法的，所以给一个明写的「不说了」出口，而不是让玩家交空文本框去试
        - **草稿按 `turnKey` 分家**：提交时 store 先清 `pendingTurn` 再 resolve，理论上组件会卸载一次；
          但把"上一轮打了一半的发言不会漏进下一轮"寄托在 React 的调度顺序上不划算。
          `turnKey` 只看公开形状（不含种子），**只在一局之内唯一**——面板一次只活在一局里，够用
        - 选中用光环（`ring-brass`），跟圆桌上"在队伍里"是同一条视觉通道；节点配色仍归身份认知。
          两处共用 `SeatRing` 导出的 `SEAT_TONE_CLASS`，圆桌上的红圈和面板里的红块永远是同一个红
        - 刺杀要点两次：选目标只是"指着"，开刀是第二次点击。这一刀不可撤销且决定整局胜负
        - `describeTurn` **不抛**，认不出的形状返回 `null` 由面板兜一句话——渲染期抛就是白屏
      - [x] `AssassinationModal` 刺杀选择（Radix Dialog）
        - 推导在 `assassination-model.ts`（`describeStrike(form, view)`），复用 `ActionPanel`
          已经算好的 `AssassinationForm`——目标仍然原样取自 `legalActions`
        - **为什么单独抢屏**：整局唯一不可撤销、且当场决定胜负的动作。与别的操作并排放在
          页面底部，误触的代价是整局作废。但**必须能关掉**——刺客决定前十有八九要回去重读发言流，
          关掉后面板留一个重开入口，选中的目标也留着
        - **奥伯伦标不出来，这是对的不是漏了**：`risk` 只认自己和 `view.knowledge` 里的队友。
          界面替刺客认出奥伯伦就是开天眼。所以 `risk === null` 的含义是"你不知道"，不是"安全"
        - 与其假装名单干净，不如直说「本局有 4 个坏人：你、你认得的 2 个队友，还有 1 个你也
          认不出来的」——`countEvil(roleComposition)` 是公开信息，差额恒等于奥伯伦数量。
          这是 `role-card-model` 里梅林那条提示的镜像，同一道算术
        - 队友的推测搬进面板（`describeFeed(view).filter(kind === "opinion")`），省得回去翻发言流。
          它们本来就是公开发言，不构成泄漏
        - **全员空推测时改说一句话**，不列四条「（没有开口）」。mock 客户端是会说话的，
          这个分支只能手工造 view 来测
        - **Tailwind v4 的 `translate-*` 走独立的 `translate` 属性**，不再合进 `transform`。
          所以入场关键帧里只写位移增量，照 v3 老经验把 `-50%` 再写一遍会把卡片多推半屏
        - ⚠️ Radix 的 `aria-labelledby` / `aria-describedby` 由 `Title` / `Description` 的
          **effect** 打开（`titlePresent`），SSR 的 HTML 里没有，水合后才出现。
          `Portal` 同理在服务端返回 `null`——所以 curl 验不到这个面板，只能靠水合后的浏览器
      - [x] `GameOverPanel` 全身份公开 + 每轮任务票来源 + AI reasoning 回放
        - 身份与任务票读 `revealAtom`，AI 心证读 `reviewDecisionsAtom`（终局前恒为空数组）
        - 推导在 `game-over-model.ts`（`describeGameOver(view, decisions)`），
          测试跑 40 局真实对局凑齐四种 `winReason`——`ASSASSINATION_HIT` 很稀少，
          **写死一个 seed 会在任何一次引擎改动后失效**，所以扫种子
        - **刺杀那一块是这个面板的第一理由**：在它做出来之前，刺客点完那一刀直接进占位屏，
          连自己刺中没刺中都看不到。落空时"被刺的其实是谁"和命中时一样显眼——
          那正是玩家在找的一行
        - **终局按阵营染色，不再标 `self`**：`SeatTone` 新增一档 `good`（冷钢蓝），
          `self` 那一档是黄铜，会把你自己的阵营盖掉，而复盘要看的恰恰是谁跟谁一伙。
          是不是你，由标签里的「你」说明。`good` **只准在终局用**——对局中没有任何
          一个座位配得上"确定是好人"，用在别处就是开天眼
        - **任务票来源是全项目唯一显示得出这件事的地方**：`PublicMissionRecord` 刻意
          丢掉了 `cards`，所以对局中任何人都只知道"几张失败票"，不知道是谁投的
        - 顺带把每类决策的耗时也印在这里（`DecisionRecord.latencyMs`），
          它是调 `LLM_EXTRA_BODY` / `LLM_MAX_TOKENS` 时唯一的依据
        - `describeGameOver` **不抛**：还没到终局、以及观战局（没有视角）都返回 null，
          由面板兜一句话。渲染期抛就是白屏，与 `describeTurn` 同一条约定
        - `reveal.assassination` 为 null（`THREE_MISSIONS` / `REJECT_LIMIT`）是正常的
          终局形态，不是缺数据，整块不渲染
      - [x] `ThinkingIndicator` 「3 号在想…（12 秒）」
        - 读新增的 `thinkingAtom`（只有座位号与决策种类，**没有任何 payload**——
          把"他在想什么"显示出来就是开天眼）
        - AI 等模型时界面本来一动不动，于是"15 秒"和"3 分钟"长得一模一样。
          这是对局中唯一能当场发现某次调用卡住的手段
        - 秒数等满 3 秒才出现：mock 模式下每次都是 0 秒，闪一下反而像坏了
        - 换人时的归零放在**渲染期**，与 `SpeechFeed` 打字机同一个做法
          （放 effect 会先用上一位的秒数渲染一帧，也过不了 `react-hooks/set-state-in-effect`）
- [x] 阶段推进的节奏控制：`paceMsAtom` 基准 800ms，挂在 `hooks.onDecision` 上
      - 按决策种类缩放（`PACE_WEIGHT`）：发言/组队/刺杀停满，投票与任务票只停 0.15 倍——
        那两个是并发阶段，orchestrator 逐个 await，10 人局一律 800ms 就是 8 秒空白
      - 停顿发生在这条发言出现**之前**（顺序是 `onDecision` → `reduce` → `onState`），观感是"AI 在想"
      - 设 0 全速跑，测试与将来的「快进」都靠它
      - **要减掉模型真正花掉的时间**（`record.latencyMs`）：那段停顿的用意是"AI 在想"
        的观感，模型已经真想了 15 秒，再停 800ms 就是纯浪费。mock 下 latency 近似为 0，
        停顿照旧，所以观感和以前完全一样——变的只有真实模型那条路

### 削减 AI 思考时间

真人跑完一局后报的问题：AI 决策十几秒到几分钟，慢得不可预期。四层原因叠加，
分别对应下面四条。**它们的效果只能靠真实对局证明**，判据是 `real-game.test.ts`
新印的那张 `=== 单次调用耗时 ===`（p50 / p90 / 最慢一次，按 kind 分）。

| 改动 | 为什么 |
| --- | --- |
| **只有一个合法动作时不问模型**（`orchestrator.ts` 的 `autoRecord`） | 好人在车上时 `legal.ts` 根本不给 `success: false`，prompt 的【输出格式】还要专门钉一句"没有第二个选择"。拿一个只有一个答案的问题去问模型，是纯粹的等待 |
| **`LLM_MAX_TOKENS`**（新增，留空则整个字段不发） | prompt 要求发言 2-5 句，实测普遍 6-10 句。切太狠的症状是 JSON 被截断 → 重试，**fallback 率会立刻反映** |
| **`reasoning` 加长度要求**（`prompt.ts` 的 `REASONING_LENGTH`） | 它是每个 kind 都要的字段却一直没有任何约束，一局 60-116 次调用全都在为一段没人读的长篇内心分析付时间。**用句子数不用字数**，与【发言长度】同源 |
| **`LLM_EXTRA_BODY` 的 provider 差异写进 `.env.local.example`** | 关思考模式的键每家都不一样：openai 是 `reasoning_effort`，qwen（DashScope）是 `enable_thinking`，deepseek 关不掉。**填错等于没填，而且不会有任何报错**——本项目自己就踩了这一条，`.env.local` 里给 qwen 配着 `reasoning_effort` |

`ENUMERATED_KINDS` 那张表是自动决策的安全前提，**不要往里加东西**：另外三种是模板动作
（`legal.ts` 不穷举 C(10,5)、也不猜你要说什么），它们的 `legalActions` 长度**恒为 1**，
加进去等于整局不再问模型任何问题。`orchestrator.test.ts` 有四条钉着这件事，
其中一条专门验模板动作照样每次都问。

**人类玩家不走这条捷径**：面板要把"为什么只有一个按钮"解释给他看
（`components/README.md`），静默替他交票是另一回事。

`DecisionRecord` 因此多了两个字段：`auto`（没问过模型）与 `latencyMs`
（`client.decide` 那一段的墙钟耗时）。三个消费者：自适应节奏、复盘面板的耗时表、
`real-game.test.ts` 的打点。

- [x] **「重开」要真的掐断在途请求**：`createRemoteAiClient({ signal })`
      - 原来 `remote.ts` 的 fetch 没有 signal，而 orchestrator 只在每步开头检查它。
        所以点了重开之后，在途的那次请求仍在跑，服务端也仍在向 provider 要结果——
        玩家以为停了，钱还在烧
      - **不动 `AiClient.decide` 的签名**：那是 mock 与真实实现的共同契约，
        不该为一方的实现细节变形。挂在 client 的构造参数上

### 开局的真人设：`/api/personas`

`personas.ts` 的文件头、`store/game.ts` 的 `CreateGameInput`、以及上面阶段 4 那句
「浏览器要用的 `/api/personas` 留到阶段 5」三处都指着这件事，但一直没做。
后果是**浏览器里跑的永远是占位人设**（AI-1…AI-5）——`generatePersonas` 至今只被
`real-game.test.ts` 调用过，而 [rules.md §6](./rules.md) 说这正是「五个 AI 说话千人一面」的主因。

- [x] `src/app/api/personas/route.ts`：逐条照抄 `api/ai/route.ts` 的写法
      - `maxDuration = 30` 而不是 60：那边留 60 是因为一次请求内可能跑 3 次模型调用
        （校验失败要带反馈重问），人设只有一次。**这个差别写在注释里**，
        否则下一个人会顺手抄成 60
      - **必须自己先调 `readProviderConfig()`**：`generatePersonas` 把配置错误也吞成了
        占位回退（那是它相对 `client.ts` 的刻意差别——人设是锦上添花，不是前置条件），
        503 那一支只能在 route 里判，否则「没配 key」会伪装成「模型不听话」
      - **没有 502 分支**：上游挂了照样 200，回退占位人设，原因写在 `notes` 里。
        对调用方来说「拿到了一桌能用的人设」永远成立
      - `notes` 就是 [rules.md §6](./rules.md)「回退必须打点说明」的落点，
        一路传到 `RoleCard` 上显示给玩家
- [x] `personaRequestSchema`（`ai/schema.ts`）：`count` 的上下界从 `config.ts` 的常量派生。
      下界是 `MIN_PLAYERS - 1`——count 是**AI 座位数**，有人类玩家时比总人数少 1。
      夹这一下的理由与 `maxRetries` 同源：请求来自浏览器，`count: 9999` 会让模型编一万份人设
- [x] `ai/personas.ts`：这一次调用**不发 `max_tokens`**，全项目唯一的例外
      - 上一轮加的 `LLM_MAX_TOKENS` 是按对局中的单次决策定的（一个布尔值加一句 reasoning）。
        人设一次出齐全桌，10 份 × 每份 4 个 `mind` 字段，700 token 必然截断 →
        JSON 解析失败 → **回退占位人设**，而那恰恰是这个模块要修的症状。
        **让一个提速开关把它悄悄退回去，是最难查的一类坑**，有一条用例专门钉着
- [x] `ai/remote.ts` 的 `fetchPersonas`：放这个文件是刻意的，
      `remote.test.ts` 那条源码断言（查不到 `./client` / `apiKey` / `process.env`）
      会连它一起罩住。**这个函数不抛**，与 `decide` 正好相反
- [x] `SetupScreen` 的「入座」变异步：`busy` 状态 + 按钮文案，只在 remote 模式下发这一趟
      （mock 模式根本不碰 LLM，发了就是白等）
      - 种子仍在**点击时**取，而且要在 `await` 之前取好——await 之后 `draft` 可能已经变了
      - **绝不因为人设失败而不开局**
- [x] `personaNotesAtom` + `RoleCard` 上的那一行：落在身份卡而不是设置页，
      因为设置页点完就卸载了，而这句话必须让玩家看见

### 移动端：圆桌在窄屏降级为列表

- [x] 新增 `SeatList`，吃的是**和圆桌完全一样的 `SeatRingMark[]`**，
      `SeatRing` 按断点二选一（`sm:hidden` / `hidden sm:block`）
      - 降级放在 `SeatRing` 这一层，**四处调用方一行都不用改**
        （选座 / 身份卡 / 对局中 / 结算），「圆桌只有一份」这条约定继续成立
      - **用 CSS 断点而不是 `matchMedia`**：`display:none` 的那一半自动退出可访问性树，
        任何宽度下都恰好有一份在树里，不必手工维护 `aria-hidden`；
        而且 SSR 与水合的输出完全一致（服务端读不到视口宽度）。
        项目至今没有一个 `useMediaQuery`，不为这件事开先例
      - 为什么必须降级而不只是缩小：容器是 `clamp(15rem,78vw,24rem)` 而节点固定 44px，
        360px 上跑 10 人局每个圆只离邻居 16px，队长徽标和光环还都往节点外面伸
      - `SEAT_TONE_LABEL` 从 `RoleCard.tsx` 挪进 `role-card-model.ts`：两处要用同一份，
        而 vitest 只收 `.ts` 后缀的测试
- [x] 顺带修掉审计查出的其余移动端缺陷——criterion 那句话是「移动端**可用**」，
      不只是圆桌那一条

| 位置 | 问题 |
| --- | --- |
| `MissionTrack` 的 detail 行 | `h-3` 是硬 12px，而 360px 屏上每格只有约 59px，「失败 · 2 败」折行后**画到下面的兄弟节点上**（没有 `overflow-hidden`）。改 `min-h-3` 并补 `px-1` |
| `SpeechFeed` | `45vh` 是全 app 仅剩的一个 `vh`，手机上按最大视口算 → 换 `dvh` |
| 7 个次级按钮 + 1 个 `<summary>` | 40px / 36px，都补到 `min-h-11`（抄 `SeatGrid` 的写法） |
| `GameOverPanel` 的两处 LLM 自由文本 | 缺 `break-words`，一串长 URL 会撑破 `max-w-md` |
| `AssassinationModal` 的 sticky 操作条 | 压在 iOS home indicator 下面 → 补 `env(safe-area-inset-bottom)` |
| `layout.tsx` | 没有 `export const viewport`。补上（含 `viewport-fit: "cover"`，上一条要靠它），并给 body 加 `overflow-x-hidden` 兜底 |

### 两条验收标准怎么变成断言的

**人类以梅林身份完整玩完一局**（`store/game.test.ts`）：

- 先用纯函数扫种子找「0 号是梅林」的局（发牌是纯的，这一步不跑对局，很便宜），
  跑完再筛 `winReason` 是不是刺杀结局——好人要先集齐 3 分才触发刺杀，不是每局都到得了
- **出牌一律经由 `describeTurn` 拼出的表单**，不是 `firstLegal`。
  这才证明「只会点面板的玩家」能以梅林身份打完，而不只是「能给引擎喂合法动作」
- 这是全项目唯一一条把 store → orchestrator → 引擎 → 操作面板 → 复盘面板串起来跑的链路

**props 不含他人 role**（`components/leak.test.ts`）：

- **换成源码断言，不再靠「打开 DevTools 看一眼」**：后者只能证明「我看的那一刻没漏」，
  而泄漏是结构问题——只要有一个组件够得着全知状态，它迟早会在某个分支上漏出来。
  查的是**能不能够得着**
- 三条：没有组件 import `gameStateAtom`、没有组件认识 `GameState` 这个类型、
  `store/game.ts` 的三个私有 atom 没被导出
- **扫源码前先剥注释**：这些文件的注释里到处写着「不读 gameStateAtom」，
  不剥的话，把规矩写在注释里反而会让断言炸，于是下一个人的修法会是删注释。
  **断言不该逼人删掉解释**
- ⚠️ 刻意**不查裸的 `.role`**：`SetupScreen` 渲染的是本局角色构成
  （开局公开信息，只有数量没有座位），为它开白名单只会把断言变成噪音；
  而 `GameState` 这一条既精确又堵死同一扇门
- 变异测试自查：往 `MissionTrack` 里 import 一次 `gameStateAtom` → 当场炸

**完成标准**：
- [x] 人类以梅林身份完整玩完一局，含刺杀阶段
- [x] 任何组件的 props 里都不含其他玩家的 `role`
- [x] 移动端可用（圆桌布局在窄屏下降级为列表）

---

## 第二次盘点：功能面

阶段 4 那次盘点（「[对着 wolfcha 补的四块发言质量短板](#对着-wolfcha-补的四块发言质量短板)」）
盘的是 **prompt 怎么写**，只读了 `src/i18n/messages/zh.json` 与 `src/lib/prompt-utils.ts` 两个文件。
这次盘的是**还缺哪些功能**——把整个仓库的结构过了一遍：21 个 API 路由、
13 个 `components/analysis/`、35 个 `components/game/`，另有 19 个 SEO 落地页。

**盘点不是照抄清单**，下表第三列才是这一节的产出。"不借"和"借"同样要写理由——
`PhaseManager`（见本文开头）和 L3 推理线索（见阶段 4）都是这么记下来的。

| wolfcha 有的 | 本项目的状态 | 判定 |
| --- | --- | --- |
| 跨轮记忆（README：「记住谁说过什么、谁投了谁、怀疑链如何演变」） | **没有**，每次决策都是失忆的 | **借** → 6.1，本轮最高价值的一条 |
| `analysis/` 赛后分析套件（TimelineReview / IdentityDashboard / PlayerReviews / SharePoster） | 只有 `GameOverPanel` | 借 → 6.2，但用 seed+actions 而不是数据库 |
| `TutorialModal` / `TutorialOverlay` / `how-to-play` | 无 | 借 → 6.3 |
| `SettingsModal`（对局中改设置） | `paceMsAtom` 只能在开局设 | 借 → 6.3 |
| `EventLog` | `state.log` 有事件，UI 一条不展示 | 借 → 6.3（**含引擎改动**） |
| `Avatar` / 角色立绘 / `TalkingAvatar` 口型同步 | 深色极简圆桌 | **只借最轻的一层**（seed 派生头像）→ 6.3 |
| `/api/tts` `/api/stt` `VoiceRecorder` | 无 | TTS 可选 → 6.3；**STT 不借** |
| `DevTools/DevConsole` | 无 | 借 → 6.4，但**必须放在 `components/` 之外** |
| `Dockerfile` / `CHANGELOG` / `CONTRIBUTING` / `SECURITY` / `README.en` | 只有一份 1.4KB 的 README | 借 → 6.4 |
| `/api/vote-batch`（把并发的多次调用批成一次） | 并发阶段是 n 次独立 fetch | 可选优化 → 6.4，收益有限 |
| `/api/ai-log` | 只有 Node 侧的 `transcripts/` | 借 → 并进 6.2 的对局导出，不单开一条 |
| `/api/validate-key` `/api/check-config` `/api/demo-config`（自带 key） | 无 | **借 → 7.0**，它能让阶段 7 的大部分不必做 |
| `guest/migrate` / `credits/*` / `stripe/*` / `auth/watcha` | 已在阶段 7 计划里 | 借做法 → 排在 7.0 之后 |
| prompt 放在 `src/i18n/messages/zh.json` | prompt 在 `prompt.ts`，有三份快照 | **不借**，理由见 6.3 的 i18n 那条 |
| 19 个 SEO `guides/` 落地页 + `sitemap.ts` + `JsonLd` | 无 | **不借进主线**，理由见阶段 7 |
| `PhaseManager` 命令式阶段机 | 纯函数 reducer | 早就不借（见本文开头） |

**盘点顺手核出来的一件事**，得单独说，因为它是本项目自己的老毛病复发：

> `suspicions` 是只写不读的。`grep -rn suspicions src` 只命中 `types.ts` / `schema.ts` /
> `prompt.ts` / `mock.ts` 及其测试——每次决策都要模型填，落进 `DecisionRecord.result.payload`，
> 然后**没有任何消费者**：`GameOverPanel` 只读 `reasoning`，`transcript.ts` 一个字都不印。
>
> 这是 `PROPOSE_TEAM.statement`（第三个缺陷）与 `ASSASSIN_OPINION`（第五个缺陷）那个形状的
> **第三次复发**：一段内容被认真地生成、认真地存下来，然后存在了没有任何人读得到的地方。
> 前两次的代价分别是"整场讨论退化成干猜"和"刺客两局刺了两次队友"，这一次的代价小得多
> （只是白付 token），但**形状一模一样**：
> **新增一个字段时，第一件事是指出它的消费者是谁；指不出来就先别加。**

---

## 阶段 6：打磨

原来这一节是 7 行 checkbox。上面那次盘点之后拆成四组，组的顺序就是建议的实施顺序。
**6.1 排在最前不是因为它最好做**，恰恰相反——它是唯一一组做完之后**对局本身**会变好的改动，
其余三组都是围着对局转的。

### 6.1 对局质量

阶段 4 结束时列的三条"仍未解决"，加上第六个缺陷，全部集中到这里。
**前两条其实是同一个结构性问题的两面**，先说那个问题：

> 五个 AI 读的是同一份公开 `PlayerView`、同一份 prompt 模板，区分他们的只有人设那一段文字
> 和 `perspective.ts` 那一条视角提示。而且**模型每次决策都不记得自己上一次想过什么**——
> `PlayerView` 里有全场发言，却没有他自己的推理、他上一轮怀疑谁、他为什么改了主意。
>
> 所以"同质化换了个壳"不是措辞问题。措辞层面能做的（人设、视角提示、底线规则）
> 上一轮已经做完，效果也确实兑现了（场外话术消失）。剩下的那部分要靠结构。

- [ ] **AI 私有笔记本：把该玩家自己上一次的 `reasoning` / `suspicions` 回喂给他自己**
      - wolfcha 的 README 把这件事写在最显眼的位置（"记住谁说过什么、谁投了谁、怀疑链如何演变"），
        它是那个项目里 AI 之所以像人的主要来源之一
      - **红线：只能回喂他自己的历史输出，一个字都不能是别人的。** 别人的 `reasoning`
        是内心分析（prompt 里明写"其他玩家看不到"），漏一条就是本项目最严重的那类 bug
      - 挂载点是现成的：数据在 `orchestrator.ts` 的 `DecisionRecord`（它带 `playerId`），
        经 `buildPrompt` 的**新参数**传入。**不进 `PlayerView`、不进 `GameState`、不进引擎**——
        位置的理由与 `deduction.ts` 从 `game/` 挪到 `ai/` 完全相同：这是 AI 层的记忆，
        不是游戏状态
      - 必须有的一条断言：**喂进去的每条记录的 `playerId` 都等于当前决策者**。
        没有这条，这个功能就是一个信息泄漏后门，而且正是"AI 推理准得反常但不报错"那一类
      - 陷阱：全量回喂会让 prompt 随调用次数线性膨胀（一局 60–116 次）。只喂最近 k 条，
        k 写成常量。阶段 4 那条"不做历史截断"的约定**不适用于这里**——
        那条说的是公开信息不许截（截了模型就看不见证据），私有笔记本截的是自己的旧念头
      - **判据只能是真实对局**：单测只能证明"喂进去的都是自己的"，证明不了发言变得不一样了。
        看两个东西——`=== 推理踩雷 ===` 里好人队长的次数，以及人工读一遍五个座位的发言
- [ ] **`suspicions` 三选一**：做成热力图（6.2 那条）、回喂给他自己（上面那条）、
      或从 `schema.ts` 里删掉。**维持现状是三个选项里最差的一个**——
      每次调用都在为一个没人读的字段生成 token、付 token，还要过一遍 zod
- [ ] **发言长度**：仍普遍 6–10 句，而【发言长度】要的是 2–5 句。换 gpt-5-mini 毫无改善
      （见阶段 4 那一节），所以**下一步试的不是措辞**——措辞层面这句话已经写过一次了。
      试**分 kind 的 `LLM_MAX_TOKENS`**：它现在是一个全局值，而发言和投票需要的长度差一个量级。
      切太狠的症状是 JSON 被截断 → 重试，**fallback 率会立刻反映**，所以这是个可测的旋钮
      - 另一个可选项：wolfcha 的普通局发言 prompt **完全不限长度**（见 [rules.md §6](./rules.md)）。
        "干脆不限"也是一种答案，前提是接受更长的发言
- [ ] **中英混杂**（52848 局的"能 tell us（告知我们）更多"）：一条 prompt 规则 +
      transcript 里加个粗略检测。检测照搬自曝检测的两档做法——专有名词和模型名不算，
      句子中间嵌英文短语才算
- [ ] **`提名踩雷 x/y` 的分子分母不同口径**（阶段 4 的第六个缺陷，写了修法一直没做）
      - `transcript.ts:268` 现在是 `misses.length / final.proposalHistory.length`：分子按
        **提议 × 证据**产出条目（一次提议同时踩中两条证据就算两遍），分母是提议数
      - 记录里因此印出过 `提名踩雷 7/8 次`，读起来像"8 次提议踩了 7 次"，实际只有 4 次提议踩雷
      - 修法：分子按提议去重。**不用新增字段**——`DeductionMiss`（`deduction.ts:113`）
        已经有 `missionIndex` + `attempt`，这一对就唯一确定一次提议，
        `new Set(misses.map(m => m.missionIndex + "-" + m.attempt)).size` 即可
      - 或者反过来把**分母**换成条目数。两种都行，**但要在那一行里说清楚数的是哪个**——
        这个指标唯一的失败模式就是读的人以为它数的是另一样东西
      - 它不影响任何判定，但这一段的全部用途就是给人读，而**会让人读错的指标比没有更糟**

### 6.2 复盘与分享

wolfcha 的 `components/analysis/` 有 13 个文件，是它投入第二大的一块（仅次于对局本身）。
我们的 `GameOverPanel` 已经覆盖了最要紧的部分（全身份、任务票来源、AI 心证、耗时），
差的是**时间轴**和**带得走**。

- [ ] 复盘面板：逐轮回放，显示每次任务的失败票来自谁、每个 AI 当时的 `reasoning` 和 `suspicions`
      （对应 `TimelineReview`。数据全在 `revealAtom` + `reviewDecisionsAtom` 里，不用新增任何采集）
- [ ] `suspicions` 可视化成怀疑度热力图（对应 `IdentityDashboard`）。
      **横轴是轮次不是座位**——一张静态的怀疑矩阵只能看出"谁被怀疑"，
      而这个字段唯一有意思的地方是**怀疑链怎么演变的**
- [ ] 观战模式：全 AI 对局，人类只看
      - 引擎侧已经支持（`humanSeat` 可以不给，`orchestrator` 不传 `onHumanAction` 就是全 AI 局），
        缺的是 UI 入口和"观战时给谁的视角"这个决定
      - **先定死是上帝视角还是某个座位的视角，再动手。** 两者都合理，混着来会让
        `describeGameOver(view, ...)` 拿到 null（它已经处理了这种情况，但那是兜底不是设计）
- [ ] **对局导出（seed + action 序列 JSON），导入可完整重放**
      - 底气在 [architecture.md §2](./architecture.md)：引擎确定性 ⇒ 一整局就是几百字节
      - **顺带把 wolfcha `/api/ai-log` 那件事一起办了**：现在只有 Node 侧的 `real-game.test.ts`
        会落盘 transcript，**浏览器里跑的对局一份记录都留不下来**。导出就是浏览器侧的落盘
- [ ] **把 `seed + actions` 编进 URL 分享**——上一条几乎免费的延伸，也是与 wolfcha 分道扬镳的一处：
      它用 `/[slug]/analysis` + Supabase 存对局，而我们几百字节的一局**塞得进 URL fragment**，
      不需要数据库，也不需要后端
      - 陷阱：`actions` 里含人类玩家的自由文本发言，长度不可控。要么压缩，
        要么给长度上限并降级成"只导出文件"
- [ ] **战绩海报**（对应 `SharePoster` / `ShareModal`）：纯客户端生成，无后端。
      复用 `SeatRing` 的圆桌与 `globals.css` 的色 token，别为它另起一套视觉
- [ ] **AI 赛后点评人类**（对应 `PlayerReviews`）：终局后一次额外调用，
      让每个 AI 以已公开的身份回头点评你打得怎么样。**成本只有 1 次调用，是这一组里性价比最高的**
      - **必须单独一个 prompt 构建函数，`buildPrompt` 的签名一个字不改。**
        这是全项目唯一一次可以给模型全知信息的调用（终局身份本来就已公开），而
        `buildPrompt<K>(req: AiDecisionRequest<K>)` 只吃 `PlayerView` 是**类型层面的防泄漏**
        （阶段 4 原话）。为一个装饰性功能把 `GameState` 引进那个文件，等于拆掉主防线
      - 同理它有自己的 schema、自己的调用点，**不进 `orchestrator` 的循环**——
        那个循环的不变量是"每一步都基于 `PlayerView`"

### 6.3 体验

- [ ] **新手教程**（对应 `TutorialModal` / `TutorialOverlay` / `how-to-play`）
      - 阿瓦隆比狼人杀更需要它：狼人杀的角色能力是"我晚上能做什么"，一句话说得清；
        阿瓦隆的是**谁能看见谁**——派西维尔看到两个人但分不清、莫德雷德对梅林隐身、
        奥伯伦双向盲区。这些光看角色列表学不会
      - **内容不要重写**：`role-card-model.ts` 的 `describeRole(view)` 已经把每个角色
        "你知道什么"讲清楚了，`SeatRing` 已经能把可见关系画出来。教程是这两样东西的
        无对局版本，不是第三份文案
- [ ] **对局内设置面板**（对应 `SettingsModal`）：`paceMsAtom` / `aiModeAtom` 现在只能在
      `SetupScreen` 设，跑起来就改不了。至少要有：节奏（含"快进"，即 `paceMs = 0`）、
      动画开关、中止本局
      - **中止已经有实现**（`abortAtom`，故意不导出）。这一条要做的是给它一个受控的出口，
        **不是把那个 atom 导出去**
- [ ] **系统事件流**（对应 `EventLog`）：`state.log` 里有 `GAME_STARTED` / `SPEECH` 等事件，
      **UI 里一条都没展示**。`SpeechFeed` 只画发言，所以"第 3 轮任务失败了"这件事
      玩家只能从 `MissionTrack` 的图形反推。做成可折叠的时间线，与发言流分开
      - 它读的仍然只能是 `myViewAtom`——`state.log` 在 `GameState` 上，要先想清楚
        哪些事件是公开的、怎么投影进 `PlayerView`。**这一条有引擎改动，不是纯 UI**
- [ ] **座位头像**：wolfcha 有立绘、`TalkingAvatar` 口型同步、`GameBackground`，
      那是另一个量级的美术投入，我们的深色极简圆桌也不需要。**只借最轻的一层**：
      从 seed 派生的 identicon，让十个座位一眼分得开，不引入任何美术资源
- [ ] 音效与转场
- [ ] **TTS 朗读发言**（可选）：属**表现层**，[architecture.md §4](./architecture.md)
      已经把 wolfcha 的 `MINIMAX_TTS_MODEL` 归过类。要新增一个 provider、一条 `/api/tts`
      和一套音频缓存。**做之前先算清楚**：一局 60 条发言，延迟和费用都要叠加到
      已经不快的对局上
      - **`/api/stt` 与 `VoiceRecorder` 不借**：本项目的自由文本输入只有"发言"一处，
        键盘完全够用，语音输入换来的是一整条录音权限 + 上传 + 识别的链路
- [x] **i18n**：UI 文案照 wolfcha 的 `src/i18n` 做
      - **但 prompt 不进 i18n，这是一条明确的不照抄。** wolfcha 把 prompt 全放在
        `messages/zh.json` 里，我们不这么做，两个理由：
        1. `prompt.test.ts` 的三份完整快照，价值在于**逼改的人读一遍 diff**（阶段 4 原话）。
           挪进一个几千行的 JSON，就再也没人读那个 diff 了
        2. prompt 里的措辞是**实验结论**不是文案——"别用「作为梅林……」这种开头"、
           "失败票只可能来自坏人"及其反向、【输出格式】里钉了三遍的那句约束，
           每一句背后都有一局真实对局。翻成另一种语言要**重新做实验**，不是找个译者的事
      - 落地口径：UI 文案走 i18n；prompt 若要多语言，走 `prompt.ts` 里独立的一套 +
        独立的快照，且新语言的 fallback 率与自曝率各验一遍

      **已落地（zh / en）：**
      - `src/i18n/`：手写的类型化目录，不用 next-intl。`en: Messages` 让**漏译是
        `tsc` 错误**而不是运行期回退成键名；`.ts` 而不是 `.json`，因为
        `vitest.config.mts` 的 include 只收 `.ts`
      - **纯客户端切换**：localStorage + 一个 Jotai atom + 右上角按钮。不做 middleware、
        不做 `/en` 前缀——本项目只有 `/` 一个路由、是单机对局、没有 SEO 需求，
        wolfcha 那套 `middleware + rewrites + x-pathname header` 在这里买不到任何东西
      - 默认 zh、不做浏览器探测：SSR 与客户端首帧永远一致。代价是 en 用户刷新后
        闪一帧中文，这是上面那个决定的直接后果，写在 `locale-atom.ts` 的注释里
      - `ROLE_META` 拆开：`label` / `ability` 去 `src/i18n/roles.ts`（UI 与 prompt 共用
        同一份角色名），引擎只留 `{ team, optional }`
      - **引擎不产出人类语言**：`ConfigIssue` 改成 code + params，`validateHumanAction`
        改成 `ActionProblem` 判别联合，`errorAtom` 变成派生 atom（项目里没有 Jotai Provider，
        所以 store 能直接 `get(localeAtom)`，组件层零改动）。`EngineError` / `AiError`
        的 message 不翻——那是诊断，只进 `console.error`，玩家看到的是按 code 写的一句人话
      - prompt 语料：`prompt-copy.{zh,en}.ts` 两份平行语料 + `prompt.ts` 零字面量。
        `locale` 是 `AiDecisionRequest` 的**必填**字段（可选 + `?? "zh"` 就是静默回退），
        `aiDecisionRequestSchema` 里那个 `z.object` 会静默剥掉未声明的键，
        `route.test.ts` 有四条专门盯着这条链路
      - 快照：中文三份**逐字未动**（`git diff` 上是 238 行新增、0 行删除），
        英文另加三份独立的 `it`——不用 `describe.each`，那会把中文三个快照键全改名，
        diff 变成删 239 加 480，正好摧毁快照存在的理由

- [ ] **英文语料的验收门槛还没过**（上面那条的最后半句）
      - `LLM_REAL_GAME_LOCALE=en pnpm vitest run src/lib/ai/real-game.test.ts` 各跑一局，
        比对两份记录末尾的 **fallback 率（应 < 5%）** 与 **自曝统计（blatant 应≈0）**
      - 检测器本身已经双语了（`transcript.ts` 的 `SELF_LABEL_PREFIX`，
        en 支认 `As Merlin` / `I'm the Assassin` / `speaking as Mordred`），
        `transcript.test.ts` 有三条钉着它——**检测器坏了，英文局会安静地报出 0 条自曝，
        那个漂亮的假数字比没有数字更糟**
      - 真跑之前，`prompt-copy.en.ts` 只能算"结构对、约束一条不少"，
        不能算"在英文里复现了中文那边的每一条实验结论"。直译不保证这一点

### 6.4 工程与开源卫生

- [ ] **Dev 控制台**（对应 `DevTools/DevConsole`）：对局中直接看引擎状态、跳阶段、手搓动作
      - **必须放在 `components/` 之外**（建议 `src/app/dev/`），且只在
        `process.env.NODE_ENV !== "production"` 挂载
      - 理由不是洁癖：它天然要读全知状态，放进 `components/` 会**直接炸
        `components/leak.test.ts` 的三条源码断言**（没有组件 import `gameStateAtom`、
        没有组件认识 `GameState`、三个私有 atom 没被导出）。而正确的修法**不是给它开白名单**——
        那三条断言的价值就在于它们钝（阶段 5 原话）。换个目录，断言一个字不用改
- [ ] **多模型对战**：不同座位配不同 provider，统计各模型胜率。
      现在 `resolveAiClient` 给的是全局单例，要改成按座位取 client。
      **统计跑完即看，不落库**（[architecture.md §5](./architecture.md) 明写了这一条）
- [ ] **开源卫生四件套**：`CHANGELOG.md` / `CONTRIBUTING.md` / `SECURITY.md` / `README.en.md`
      （wolfcha 四份都有）。现在的 `README.md` 只有 1.4KB，讲不清这个项目最值钱的两样东西——
      **引擎的确定性**和**信息隔离的测试体系**。`docs/` 里三份文档已经写透了，README 缺的是入口
- [ ] **`Dockerfile`**：本项目没有数据库、没有后台任务，一个标准的 Next standalone 镜像就够
- [ ] （可选，收益有限）**批量调用**：wolfcha 的 `/api/vote-batch` 把多个投票请求合成一次。
      我们的并发阶段（投票 / 任务票 / 确认身份）现在是 n 次独立 fetch，10 人局就是 10 趟。
      **但服务端本来就并发处理，省的只是 HTTP 往返**，而瓶颈是模型延迟不是往返。
      真要做，注意别破坏"并发的那一批全部基于同一个 state 快照"这条语义

---

## 阶段 7：账号与运营（部署前）

**只在要公开部署时才做，不阻塞前六个阶段。** 前六个阶段做完就是一个完整可玩的单机游戏。

**目标**：公开部署后，`/api/ai` 不会被陌生人刷爆你的 LLM 预算。

**但达成这个目标有两条路，先走便宜的那条。**
原来这一节直接从「认证」开始写，隐含假设是"公开部署 ⇒ 要有账号体系"。
盘 wolfcha 的时候发现它其实有两套并存：`auth/watcha` + `credits/*` + `stripe/*` 是一套，
`validate-key` / `check-config` / `demo-config` 是另一套——**后者让玩家用自己的 key**，
不需要账号、不需要数据库、不需要支付。7.0 就是这条路，7.1 起才是原来那套。

### 7.0 自带 key（BYOK）：让阶段 7 的大部分不必做

- [ ] `SettingsModal`（见 6.3）里加一个 key 输入框，key 存 `localStorage`，
      每次请求经 header 传给 `/api/ai`；服务端没配 key 时才要求它
- [ ] `/api/validate-key`：填完当场验一次（发一个最小的 chat 请求）。
      **不验的话，玩家要等到第一次决策失败才知道填错了**，而那时已经开局
- [ ] `/api/check-config`：告诉前端服务端有没有配 key，决定要不要弹那个输入框
- [ ] demo 额度（对应 `demo-config`）：不填 key 也能试一局，用**你自己的** key + 一个很小的上限。
      **这一步才需要计数，但 IP + 内存计数器就够**——重启清零是可接受的，
      它挡的是随手点进来的人，不是决心刷你的人。仍然不需要数据库

**安全边界（这条路唯一的风险都在这里）**：

| 要求 | 现状 |
| --- | --- |
| key 只走请求头，不进 URL、不进 body 的日志字段 | 要新写 |
| 服务端**不落盘、不打日志**，`console` 一个字都不许印 | 要新写 |
| 抛出的错误里不含 key | **已经有了**——`client.test.ts` 那条「抛出的错误里不含 apiKey，也不含上游原始响应体」正好罩住，扩到 route 层即可 |
| 对局导出（6.2）里不含 key | 要在导出前查一次 |

**判定：先做 7.0，再看要不要做 7.1。** 下面那一整套（OAuth + 额度 + Stripe + 数据库）
是给"做一个商业产品"准备的，和"想让朋友玩一局"是两件事，成本差两个数量级。

### 7.1 账号与计费（只在真的要运营时才做）

这是**唯一需要数据库的一层**。为什么前面都不需要，见 [architecture.md](./architecture.md)。

- [ ] 认证：邮箱注册 + Google OAuth
- [ ] **游客模式 + 迁移**（对应 wolfcha 的 `guest/migrate`）：先玩后注册。
      **这条要和认证一起设计，不能后补**——等到有了账号体系再想"那些没登录就玩过的人怎么办"，
      就得为迁移单独造一套临时身份
- [ ] 额度：每账号 1 局免费，可付费购买
- [ ] 数据表：`users` / `credits` / `transactions`——**不存对局数据**
- [ ] `/api/ai` 加鉴权与扣费
- [ ] 支付接入（Stripe 等）
- [ ] 拉新三件套（对应 `credits/daily-bonus` / `referral` / `redeem`）：
      **只在真的运营时才有意义**，做早了就是给自己加维护面
- [ ] `.env.local.example` 把占位块里的变量取消注释并补齐

### 明确不做：SEO 落地页矩阵

wolfcha 有 19 个 `guides/` 页 + `roles/[role]` + `models/[model]` + `landing/` + `sitemap.ts`
+ `JsonLd`，是一整套获客投入。**不借进主线**，两个理由：

1. 本项目的定位是"一个完整可玩的单机游戏"，不是一个要买流量的产品。
   没有获客目标时，19 个落地页只是 19 个会过期的文件
2. 真要做，也该是**独立的静态站**，不要把 marketing 页混进 `src/app/`——
   wolfcha 的 `src/app/` 里对局路由和落地页是平级的，找起来很费劲

### 两个容易做错的设计点

**1. 额度按「局」算，不是按「调用」算。**

一局有 60–80 次 LLM 调用（见阶段 4 的成本估算）。每次调用都扣的话，1 局免费额度撑不过第一轮组队。正确做法是引入一个「对局会话」：

```
开局  -> 校验余额 -> 扣 1 额度 -> 签发 session token
对局中 -> /api/ai 凭 token 放行，不再扣费
```

**2. session token 必须有调用次数上限。**

只在开局扣费、后续不设限的话，拿到一个 token 就能无限调用 `/api/ai`——等于没扣费。token 要记录已用调用数，超过上限即失效。上限取一个比正常对局峰值宽裕的数（10 人局的峰值约 150 次，取 250 比较安全）。

> **这个设计不是我们凭空想的，wolfcha 也是这么做的**：它有一条 `/api/game-sessions`，
> 而 `credits/consume` 与对局中的调用是分开的两条路由。两个项目独立走到同一处，
> 说明这确实是这类游戏的必经之路，不是过度设计。

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
| **AI 笔记本变成泄漏后门**（阶段 6.1） | 回喂的历史里混进别人的 `reasoning`——那是 prompt 里明写"其他玩家看不到"的内心分析 | 只按 `playerId` 取自己那些；一条断言钉住"喂进去的每条记录的 `playerId` 都等于当前决策者" |
| **赛后点评复用 `buildPrompt`**（阶段 6.2） | 为一个终局功能把 `GameState` 引进 `prompt.ts`，主防线从此失效，且不会有任何报错 | 单独的构建函数 + 单独的调用点；`buildPrompt` 的签名一个字不改 |
| **玩家自带的 key 泄漏**（阶段 7.0） | 别人的 key 出现在服务端日志、错误消息或对局导出里 | 服务端不落盘不打日志；`client.test.ts` 的"错误里不含 apiKey"扩到 route；导出前查一次 |
| **新字段又是只写不读**（第四次复发） | 认真生成、认真存下，然后没有任何消费者——`suspicions` 已经这样白填了整个阶段 4 和 5 | 加字段时先指出消费者是谁；指不出来就先别加 |

---

## 依赖顺序

```
阶段 0 脚手架
   └─ 阶段 1 配置与发牌
         ├─ 阶段 2 可见性 ──┐
         └─ 阶段 3 状态机 ──┴─ 阶段 4 AI 层 ─ 阶段 5 UI ─ 阶段 6 打磨

阶段 7.0 自带 key   ← 想让别人也能玩，走这条就够了
阶段 7.1 账号与运营 ← 不在主线上，只在要做成商业产品时才做
```

阶段 2 和阶段 3 可以并行，但两者都完成且测试全绿之前不要碰阶段 4。

阶段 6 的四组之间没有依赖，可以任选顺序；**但 6.1 是唯一一组做完之后对局本身会变好的**，
其余三组都是围着对局转的。

阶段 7 刻意画在主线之外：前六个阶段做完就是一个完整可玩的单机游戏，阶段 7 解决的是"公开给陌生人玩"带来的运营问题，与游戏本身无关。**7.0 和 7.1 是两条独立的路，不是两个步骤**——自带 key 那条不需要数据库、不需要支付，做完就能把链接发给朋友；7.1 解决的是另一个问题（你替陌生人付钱），只有真要做产品时才值得。
