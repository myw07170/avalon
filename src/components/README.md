# components/

阶段 5 建立。规划中的组件见 docs/todos.md 阶段 5。

**唯一的硬规则**：组件的数据来源只有 `store/game.ts` 导出的那些 atom。
任何组件的 props 里出现其他玩家的 `role`，都是信息泄漏，直接算 bug。

具体说，组件可以读：

| atom | 给的是什么 |
| --- | --- |
| `viewAtom` | `AnyView`，绝大多数组件只需要它。落座给 `PlayerView`，观战给 `SpectatorView` |
| `humanTurnAtom` / `isMyTurnAtom` | 轮到你时的 `view` + `legalActions` |
| `teamConstraintAtom` | 组队的 `{ teamSize, candidateIds }` |
| `revealAtom` | 终局公开面，非 `GAME_OVER` 恒为 `null` |
| `reviewDecisionsAtom` | AI 心证回放，终局前恒为空数组 |
| `thinkingAtom` | 现在是谁在等模型。只有座位号与决策种类，**没有 payload** |
| `personaNotesAtom` | 人设生成的打点。回退到占位时必须让玩家看见 |
| `runStatusAtom` / `errorAtom` | 页面壳的状态与报错 |
| `isSpectatingAtom` | 这一局有没有人坐在桌上 |
| `revealedSeatsAtom` / `toggleSeatAtom` / `revealAllSeatsAtom` / `hideAllSeatsAtom` | 观战的翻牌状态与三个写入口 |
| `revealedRolesAtom` | **已翻开**座位的身份。落座局恒为 `null` |
| `liveDecisionsAtom` | 观战时的实时 AI 心证。**有人落座就恒为空数组** |
| `pausedAtom` / `togglePauseAtom` | 观战的暂停闸 |
| `paceMsAtom` | 节奏基准值。`SpectatorBar` 的四档就是写它 |

**`gameStateAtom` 是全知视角，组件读它一律算 bug。** 需要的东西如果只在 `GameState` 上
（比如 `getLegalActions` 和 `getTeamConstraint` 都要 `GameState`），正确做法是让 `store/game.ts`
从 `PlayerView` 里重推一份派生 atom，而不是把全知状态漏到组件层。

观战也不例外：它要的全场身份走的是引擎里另一份投影 `toSpectatorView(state)`，
**不是** `gameStateAtom`。`leak.test.ts` 的三条源码断言因此一个字都没改。

## 两条约定

**推导不写在 JSX 里。** 组件旁边放一个同名的 `.ts` 存纯函数（`SetupScreen.tsx` ↔ `setup-model.ts`），
组件只负责把它的返回值画出来。这样逻辑能用现有的 vitest（node 环境、`include` 只匹配 `.ts`）直接覆盖，
不必为一屏表单引入 jsdom 和 testing-library。

**引擎的配置函数会抛。** `getFreeEvilSlots` / `getEvilOptions` / `composeRoles` / `createConfig`
遇到 5–10 之外的人数一律抛 `EngineError`，不是返回 0 或空数组——在渲染期抛就是白屏。
先过 `isSupportedPlayerCount`。`checkConfig` 是唯一可以拿脏数据喂的，它纯查错、不抛。

## 视觉基座

token 定义在 `src/app/globals.css`。**两套主题**：深色是默认，浅色（暖羊皮纸）由
`<html data-theme="light">` 覆盖同一批变量——组件从头到尾只认 token 名，一行都不用改。

| token | 用途 |
| --- | --- |
| `ink` / `ink-raised` / `ink-line` | 底色 / 面板 / 描边 |
| `vellum` / `muted` | 主文字 / 次要文字 |
| `loyal` / `mordred` | 好人 / 坏人。成对出现，任何角色标签都要一眼分得开阵营 |
| `brass` | 交互态：选中、焦点、主按钮 |
| `on-brass` / `on-loyal` / `on-mordred` | **实心**强调色上面那行字 |
| `scrim` | 刺杀面板的幕布。透明度在 token 里，调用点不写 `/85` |
| `font-display` | CJK 衬线，标题与区块小标题 |
| `.tabular` | 等宽 + `tabular-nums`，**所有数字**都走它 |

**`bg-brass` 上的字用 `text-on-brass`，不用 `text-ink`。** `ink` 与 `vellum` 会随主题
翻转极性（ink 深色下近黑、浅色下近白），拿它们当"强调色上的字"必然在某一套主题下失效。
半透明填充（`bg-mordred/25` 这类）不在此列——那种底色本来就跟着页面走，配 `text-vellum` 正确。

**加颜色 token 要在两个块里各加一份**，`src/theme/theme.test.ts` 读 `globals.css`
钉住了这条（漏一个的症状是浅色下某处突然是深色，而且只在某个阶段才看得见）。
同一个测试还钉住 **`@theme` 不许写成 `@theme inline`**——加上 inline 会把字面值内联进
每一条 utility，于是整套浅色主题静默失效，页面照常渲染只是永远深色。

主题状态**没有 atom**：它不改变任何 React 渲染出来的内容，只改 `<html>` 上一个属性。
切换按钮在 `src/theme/ThemeSwitcher.tsx`，零闪烁靠 `layout.tsx` 的 `<head>` 里那段阻塞脚本。

`cn()` 在 `src/lib/utils.ts`。

## 圆桌

`seat-ring.ts` 给圆周百分比坐标（纯函数，单独测），`SeatRing.tsx` 负责画。
`SetupScreen` 的选座器、`RoleCard` 的已知座位、对局中的 `SeatTable`、以及结算的
全身份公开共用这一份——玩家从头到尾看到的是同一张桌子。给了 `onSelect` 才渲染成按钮，
不给就是只读展示环。

**窄屏（< 640px）自动降级成 `SeatList` 的竖排列表。** 圆桌容器是
`clamp(15rem, 78vw, 24rem)` 而座位节点固定 44px，所以屏幕越窄节点越挤：
360px 上跑 10 人局，每个圆只离邻居 16px 左右，队长徽标和光环还都往节点外面伸。
`SeatGrid` 的文件头说"圆桌是看的，方块是点的"，这是它的另一半——窄屏上要能**看清**。

降级放在 `SeatRing` 这一层，四处调用方一行都不用改。**用 CSS 断点而不是
`matchMedia`**：`display:none` 的那一半自动退出可访问性树（所以不需要手工维护
`aria-hidden`），而且 SSR 与水合的输出完全一致。项目至今没有一个 `useMediaQuery`，
不要为这件事开先例。

`SEAT_TONE_LABEL` 住在 `role-card-model.ts` 而不是组件里：圆桌的图例和列表两处都要用，
而 vitest 只收 `.ts` 后缀的测试。
tone → 配色的映射集中在 `SeatRing` 导出的 `SEAT_TONE_CLASS`，加新 tone 只改那一处。
它只给颜色、不给形状与尺寸，所以 `ActionPanel` 的选人方块也用它——圆桌上的红圈和面板里的红块
永远是同一个红。

**`unsure` 的两个座位必须共用一套样式。** 派西维尔看到的那一对是引擎刻意抹平过的
（`Knowledge` 的 `playerIds` 升序存放），给其中一个多一点视觉权重——图标、"可能"、
左边加重——就把答案泄回去了。所以按 tone 给色，不按位置。

**一个座位同时压着四层互相独立的信息**，各占一条视觉通道，压进一个颜色会互相盖掉：

| 通道 | 表示 | 变不变 |
| --- | --- | --- |
| 节点配色（tone） | 你的身份认知 | 一整局不变 |
| 外圈光环 | 在本次提议的队伍里 | 每次提议换 |
| 上方徽标 | 队长 | 每轮换 |
| 右下角 ✓ | 已提交 | 每个阶段换 |

## 操作面板

**面板不判断你能做什么，它只把 `humanTurnAtom.legalActions` 画出来。** 好人在
`MISSION_EXECUTION` 的候选里根本没有"投失败"这一项（`legal.ts` 那条最要紧的分支），
所以照着渲染就天然做不出非法操作。反过来，按 phase 或 `view.selfTeam` 自己判断该给
几个按钮，等于把引擎规则在 UI 里再实现一遍——两处迟早不一致，而不一致的那一次
就是一张本不该存在的失败票。

只有两个例外是**模板动作**：`PROPOSE_TEAM` 和 `SPEAK` / `ASSASSIN_OPINION`。
`legal.ts` 不穷举 C(10,5)=252 种队伍，也不猜你要说什么，给的是占位模板。这两种要填内容，
但 `type` 和 `playerId` 仍然 `{ ...template, ... }` 沿用模板——所以 `SPEAK` 与
`ASSASSIN_OPINION` 走的是同一条代码路径，不需要在 UI 里再抄一次阶段表。

**只有一个选项时要解释为什么。** 好人的任务票只有"成功"，一颗孤零零的按钮看起来像
界面把另一个选项藏了。

**空发言是合法状态**（`legal.ts` 只校验"轮没轮到你"），所以面板给一个明写的"不说了"，
而不是让玩家交空文本框去试。

## 刺杀面板

`ActionPanel` 在 `ASSASSINATION` 这一手把整块交给 `AssassinationModal`（Radix Dialog）。
它是整局唯一不可撤销、且当场决定胜负的动作，所以要抢过屏幕；但**必须能关掉**——
刺客决定前十有八九要回去重读发言流。

**奥伯伦标不出来，这是对的。** `risk` 只认自己和 `view.knowledge` 里明确给出的队友，
而刺客本来就不认识奥伯伦。界面替他认出来就是开天眼。所以 `risk === null` 的含义是
"你不知道"，不是"安全"——文案上用「还有 1 个你也认不出来的」把这件事直说，
那是从公开的 `roleComposition` 里推得出来的确定结论。

**两个 SSR 陷阱**（下次做别的 Dialog 会再撞上）：

- `@radix-ui/react-portal` 在服务端返回 `null`（`mounted` 由 `useLayoutEffect` 打开），
  所以 **curl 验不到任何 Dialog 内容**，只能靠水合后的浏览器。
- `aria-labelledby` / `aria-describedby` 由 `Title` / `Description` 的 effect 打开
  （`context.titlePresent`），SSR 的 HTML 里同样没有。`Title` 上的 `id` 在就说明接得上。

## 终局复盘

`GameOverPanel` 是 `runStatus === "finished"` 那一支的全部内容，推导在 `game-over-model.ts`。

**刺杀那一块是它存在的第一理由。** 在它做出来之前，刺客点完那一刀直接进占位屏，
连自己刺中没刺中都看不到。所以落空时「被刺的其实是谁」和命中时一样显眼——
那正是玩家在找的一行。

**终局按阵营染色，不再标 `self`。** `SeatTone` 为此新增一档 `good`（冷钢蓝）。
`self` 那一档是黄铜，会把你自己的阵营盖掉，而复盘要看的恰恰是谁跟谁一伙；
是不是你，由标签里的「你」说明。

**`good` 只有两处能用：终局，和观战中被观战者主动翻开的那一座。**
落座的对局中没有任何一个座位配得上"确定是好人"，用在别处就是开天眼。

**任务票来源是全项目唯一显示得出这件事的地方。** `PublicMissionRecord` 刻意丢掉了
`cards`，所以对局中任何人（包括你）都只知道"几张失败票"，不知道是谁投的。
只有 `reveal.missions` 带着它。

### 对局回放：说了什么 + 当时在想什么

复盘里最长的一块，占满整屏宽度（`<main>` 在这一屏是 `max-w-5xl`，比对局中那屏宽——
那边是圆桌和表单，这边是长自由文本）。它把**完整对话**和**每句话背后的 AI 心证**
并成一条时间轴，中间按时间嵌着组队投票卡。

**配对是精确的，不是启发式**，靠三条事实凑齐：

1. `runGame` 里 `onDecision` 恒在对应的 `reduce` 之前调用，并发阶段也按座位序走——
   决策流与 `view.speeches` 是同一条时间线。
2. `DecisionRecord.action` 带着**提交上去的**原文（`PROPOSE_TEAM.statement` /
   `SPEAK.content` / `ASSASSIN_OPINION.content`），而引擎就是拿它记的 `Speech`。
   读 `action` 而不是 `result.payload`：合法性兜底过的那几手，payload 里还留着
   模型原本想做的，那正是复盘要看的差异，但它配不上已经说出口的话。
3. 人类的动作**不进** `DecisionRecord`（`takeTurn` 走 `onHumanAction` 那一支时
   `record` 为 null），所以人类的发言本来就没有心证。

**座位号和原文两个条件都要判。** 只判顺序，人类插在中间时会**错位一格**——把 A 的
心证安到 B 的发言底下，比缺一格严重得多。只判原文，两个人说了一模一样的话时会配错
（引擎不校验发言内容，那是合法状态）。`game-over-model.test.ts` 里有一条专门造出
"人类那句与下一位一字不差"来钉住座位号那个条件。

**心证不折叠，末尾那摞折叠。** 挂在发言下面的心证是这一块存在的理由，藏起来等于没做；
投票 / 任务票 / 刺杀没有可挂靠的气泡，只能按轮次收在末尾，摊开会把时间轴冲散。

**`describeGameOver` 不抛。** 还没到终局返回 null，由面板兜一句话——与 `describeTurn`
同一条约定。`reveal.assassination` 为 null（坏人靠三次任务赢、或否决撞线）
是正常的终局形态，不是缺数据。

**观战局不再返回 null。** 它有自己的视角，终局照样出复盘；差的只是"你"——
`youWon` / `yourRoleLabel` 为 null，`Banner` 那一行换成一句中立的说明。
这推翻了 `GameOverBrief` 上原来那句"观战局走不到这里，所以恒有值"。

## 时间轴的零件

`TimelineItems.tsx` 里是分组分隔线、发言气泡、组队投票卡三个**纯展示**组件：只吃 props、
不读任何 atom、不认识 `GameState`。两处在用：

| 用处 | 组件 | 差别 |
| --- | --- | --- |
| 对局中（直播） | `SpeechFeed` | 最新一条走打字机，容器自动滚到底 |
| 终局（复盘） | `GameOverPanel` 的回放段 | 一进来就是全文，每条发言底下多挂一段心证 |

**`SpeechBubble` 的 `content` 与 `entry.content` 分开传**，就是为了让调用方决定显示到
第几个字——打字机因此留在 `SpeechFeed` 里，没有渗进共用零件。抄一份而不是共用的话，
下次改投票卡配色只会改到其中一处，而"两边长得不一样"没有任何测试会报。

## 组队投票的逐人票

组队投票规则上就是**公开**投票，所以 `PublicProposalRecord.votes` 原样进每个视角
（`view.ts` 的 `toPublicProposal`）。在这之前只有 AI 用得上它——`ai/prompt.ts` 一直把
「同意：1、3、5；反对：0、2、4」渲染进 prompt，而人类玩家一个字都看不到。

**「全员投完才公开」不靠 UI 自觉。** 未结算的票待在 `state.pending.votes` 里，
那个对象进不了任何视角（只折算成 `progress` 的两个数字）。所以组件根本**拿不到**
半场的票——投票阶段圆桌上只有「已投 3 / 10」。这一条有 `view.leak.test.ts` 钉着。

推导只有一份，在 `vote-model.ts`，三处消费：

| 面 | 组件 | 形态 |
| --- | --- | --- |
| 按时间读 | `SpeechFeed` 的投票卡 | 每个「第 X 轮 · 第 N 次组队」分组末尾一张：通过/否决 + 两份名单 |
| 按人读 | `VoteMatrix` | 行 = 提议，列 = 座位，格子 ✓/✗。默认收起 |
| 复盘 | `GameOverPanel` 里的同一个 `VoteMatrix` | `defaultOpen`，对着真实身份看票型 |

**`forced` 那一支必须单独处理。** 变体 `forcePassOnLastAttempt` 触发的强制通过
`votes` 为 `{}`，渲染成「0 赞成 / 0 反对却通过了」是 bug。三处共用一份推导，
正是因为这个分支写三遍必然漏一遍。

**它与终局的「任务票来源」是两个信息级别，别合并。** 组队票全程公开；任务票
（谁投的失败票）只有 `reveal.missions[].cards` 才有，也就是只有终局才公开。

`VoteMatrix` 引入了圆桌四条通道之外的第五种标记，但它**不在圆桌上**——票型是一张表，
不是座位上的又一层。圆桌那四条通道一条都没动。

## 观战

`GameShell` 的分岔是二维的：先按 `runStatusAtom` 取生命周期，再在 `ready` / `running`
两档里按 `isSpectatingAtom` 二选一（`finished` 两种形态共用 `GameOverPanel`）。
**观战没有加进 `RunStatus`**——那是生命周期，而观战是与它正交的形态，观战局同样要
经历 ready / running / finished。

三层各管一件事，别在下游重复上游做过的事：

| 层 | 做什么 |
| --- | --- |
| 引擎 `toSpectatorView` | 恒给全场 `roles`。观战没有对手，信息隔离保护的是坐在桌上的人 |
| store `revealedRolesAtom` | 按 `revealedSeatsAtom` 过滤。**过滤只发生在这一处** |
| 组件 | 只见过滤后的那一份，取不到 role 的座位自然是 `plain` |

**默认一张牌都不翻。** 引擎给全量、界面扣着，这个分工是刻意的：一上来铺开全部身份，
"谁在撒谎"就没有悬念了，而那恰好是观战唯一好看的地方。

**翻牌闸不是信息隔离边界。** 它可以随时撤销，而且不密封——翻开 3 号的心证，
很可能顺带读到"我知道 5 号是坏人"，`MindPanel` 上那句提示就是为这件事写的。
真正的边界是 `liveDecisionsAtom`：**只要有人坐在桌上就恒为空数组**。
两件事的注释要分清楚，不然下一个人会以为这里漏了。

`SpectatorBar` 给的是节奏（四档 + 暂停），**中止仍然只走 `resetGameAtom`**——
`abortAtom` 一个字都没导出。暂停闸挂在 `onDecision` 里（节奏本来就落在那一处），
所以引擎与 orchestrator 一行都没改。

翻牌动作复用 `FlipCard`：那套 3D 翻牌 `RoleCard` 上已经有了，尺寸和牌面由调用方给。
玩家在这个项目里见到的"翻身份"始终是同一个动作。

## 等待要看得见

`ThinkingIndicator` 读 `thinkingAtom`，画「3 号在想…（12 秒）」。

AI 等模型时界面本来一动不动，于是"15 秒"和"3 分钟"长得一模一样，玩家分不清
是慢还是卡死。这是对局中唯一能当场发现某次调用出问题的手段。

**它只拿得到座位号与决策种类。** 把"他在想什么"显示出来就是开天眼——
AI 心证的闸在 `reviewDecisionsAtom` 上，终局之前恒为空数组。

## 开局的真人设

`SetupScreen` 的「入座」在 remote 模式下是**异步**的：先 `fetchPersonas` 取一桌真人设，
再 `createGameAtom` 建局。mock 模式不发这一趟——那边根本不碰 LLM，发了就是白等。

**人设失败绝不拦着开局。** `fetchPersonas` 不抛，拿不到就用占位继续。人设是锦上添花，
不是开局的必要条件（`ai/personas.ts` 文件头）。

**但回退绝不静默**（`rules.md` §6）：原因走 `personaNotes` → `personaNotesAtom` →
`RoleCard` 上的一行字。悄悄换成占位人设，会让你对着一桌说话雷同的 AI 去改 prompt，
而毛病其实在 `.env.local` 里。这一行落在身份卡而不是设置页，因为设置页点完就卸载了。

## 信息隔离怎么验

`leak.test.ts` 用**源码断言**代替"打开 DevTools 看一眼 props"——后者只能证明
"我看的那一刻没漏"，而泄漏是结构问题。它查三件事：没有组件 import `gameStateAtom`、
没有组件认识 `GameState` 这个类型、`store/game.ts` 的三个私有 atom 没被导出。

扫源码前会**先剥注释**：这些文件的注释里到处写着"不读 gameStateAtom"，
不剥的话，把规矩写在注释里反而会让断言炸，于是下一个人的修法会是删注释。
