# 阿瓦隆 Avalon

[English](./README.en.md) | 简体中文

一个人，一桌会说话的 AI。

这是一个基于 Next.js 的单人阿瓦隆游戏：你可以入座和 AI 玩家对局，也可以旁观一桌全 AI 对局。项目默认使用不联网、不产生模型费用的 mock 模式；配置 OpenAI 兼容接口后，可以让不同角色用真实模型讨论、投票和推理。

项目仍在积极开发中，当前重点不是把规则塞进 prompt，而是让游戏规则、隐藏信息和 AI 决策之间的边界可验证。

## 功能

- 5–10 人阿瓦隆对局，支持推荐角色配置和合法的自定义配置
- 单人入座与全 AI 观战；观战身份默认盖住，可按座位翻牌
- 中文、英文界面以及深色、浅色主题
- mock 与 remote 两种 AI 模式，remote 支持 OpenAI 兼容的 provider
- 逐轮时间轴、终局身份与任务票复盘、AI 推理记录
- 纯函数游戏引擎、显式合法动作和专门的信息泄漏测试

## 为什么这个实现不一样

### 确定性引擎

引擎是一个纯函数状态机：

```ts
reduce(state, action, rng) -> newState
```

它不发网络请求、不调用 LLM、不读取时间，也不直接调用 `Math.random`。随机源作为参数注入，因此同一个种子和同一串动作一定产生同一局结果。一整局可以建模为 `seed + action[]`，这让复现问题、模拟测试和完整重放都有稳定基础。

规则合法性也不交给模型判断。`getLegalActions` 给出当前玩家真正能做的动作，例如好人的候选动作里根本不会出现任务失败票；非法动作会被引擎拒绝，而不是被静默修正。

详细设计见[状态机设计](./docs/state-machine.md)和[架构边界](./docs/architecture.md)。

### 信息隔离是可测试的边界

AI prompt 不能读取完整 `GameState`，只能由当前玩家的 `PlayerView` 构建。UI 同样消费经过投影的玩家视角或观战视角，而不是直接触碰全知状态。

```text
游戏引擎（GameState）
        │ 纯函数投影
        ▼
PlayerView / SpectatorView
        │
        ├── UI
        └── AI prompt
```

这条边界保护的不只是角色身份：

- 未结算的组队投票在所有人投完前不可见，避免后投的 AI 跟票。
- 任务记录只公开失败票数量，不公开投票者；来源只在终局复盘中揭示。
- 梅林看不到莫德雷德，坏人看不到奥伯伦，派西维尔看到的两人不可区分。
- 组件不能导入全知状态，prompt 构建也不能绕过 `PlayerView`。

[`view.leak.test.ts`](./src/lib/game/view.leak.test.ts) 对每种角色和视角检查序列化后的信息，[`components/leak.test.ts`](./src/components/leak.test.ts) 从源码依赖层阻止组件够到私有状态；快照、规则单元测试和随机模拟局负责守住其余状态机边界。信息泄漏往往只表现为“AI 推理得异常准确”，所以这些测试是游戏正确性的一部分，而不是附加项。

规则依据见[阿瓦隆规则规格](./docs/rules.md)。

## 本地开发

### 前置要求

- Node.js 20.9 或更高版本
- pnpm 11.2.2（版本已写入 `package.json` 的 `packageManager`）

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://localhost:3000>。默认 mock 模式无需 API key，也不会发出模型请求。

### 使用真实模型

复制环境变量模板并填写 provider 配置：

```bash
cp .env.local.example .env.local
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.local.example .env.local
```

至少检查 `LLM_PROVIDER`、`LLM_API_KEY` 和 `LLM_MODEL`；自定义 OpenAI 兼容服务时还要设置 `LLM_BASE_URL`。完整字段、默认值和 provider 差异都写在 [`.env.local.example`](./.env.local.example) 中。

`NEXT_PUBLIC_AI_MODE=remote` 只决定构建后的初始选项，界面仍允许在开局前切换 mock/remote。所有 `NEXT_PUBLIC_*` 变量都会在构建时固化；`LLM_*` 变量只在服务端运行时读取，绝不要给密钥加 `NEXT_PUBLIC_` 前缀。

> 全 AI remote 观战会连续产生大量模型调用。日常开发请保持 mock，仅在明确接受时间与费用后运行真实模型测试。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 创建生产构建 |
| `pnpm lint` | 运行 ESLint |
| `pnpm typecheck` | 运行 TypeScript 类型检查 |
| `pnpm test` | 运行 Vitest 测试套件 |
| `pnpm test:cov` | 生成测试覆盖率 |

真实模型整局测试默认跳过，启用方式和费用注意事项见[贡献指南](./CONTRIBUTING.md)。

## Docker

默认构建为 mock 模式，不需要任何密钥：

```bash
docker build -t avalon .
docker run --rm -p 3000:3000 avalon
```

如果希望镜像默认选中 remote，在构建时传入非敏感的公开开关，并在运行时注入服务端配置：

```bash
docker build --build-arg NEXT_PUBLIC_AI_MODE=remote -t avalon:remote .
docker run --rm -p 3000:3000 --env-file .env.local avalon:remote
```

不要把 `LLM_API_KEY` 作为 build arg。镜像使用 Next.js standalone 输出，以非 root 用户运行并监听 `0.0.0.0:3000`。因为项目通过 `next/font/google` 使用 Geist，生产构建需要能够访问 Google Fonts。

## 文档

- [阿瓦隆规则规格](./docs/rules.md)：规则和边界情况的唯一依据
- [状态机设计](./docs/state-machine.md)：阶段转移、合法动作和测试策略
- [架构边界](./docs/architecture.md)：分层、依赖方向以及为什么对局不需要数据库
- [路线图](./docs/todos.md)：当前进度与后续计划
- [贡献指南](./CONTRIBUTING.md) · [安全政策](./SECURITY.md) · [变更日志](./CHANGELOG.md)

## 许可证

本项目采用 [MIT License](./LICENSE)。
