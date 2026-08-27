# components/

阶段 5 建立。规划中的组件见 docs/todos.md 阶段 5。

**唯一的硬规则**：组件的数据来源只有 `store/game.ts` 导出的那些 atom。
任何组件的 props 里出现其他玩家的 `role`，都是信息泄漏，直接算 bug。

具体说，组件可以读：

| atom | 给的是什么 |
| --- | --- |
| `myViewAtom` | `PlayerView`，绝大多数组件只需要它 |
| `humanTurnAtom` / `isMyTurnAtom` | 轮到你时的 `view` + `legalActions` |
| `teamConstraintAtom` | 组队的 `{ teamSize, candidateIds }` |
| `revealAtom` | 终局公开面，非 `GAME_OVER` 恒为 `null` |
| `reviewDecisionsAtom` | AI 心证回放，终局前恒为空数组 |
| `thinkingAtom` | 现在是谁在等模型。只有座位号与决策种类，**没有 payload** |
| `personaNotesAtom` | 人设生成的打点。回退到占位时必须让玩家看见 |
| `runStatusAtom` / `errorAtom` | 页面壳的状态与报错 |

**`gameStateAtom` 是全知视角，组件读它一律算 bug。** 需要的东西如果只在 `GameState` 上
（比如 `getLegalActions` 和 `getTeamConstraint` 都要 `GameState`），正确做法是让 `store/game.ts`
从 `PlayerView` 里重推一份派生 atom，而不是把全知状态漏到组件层。

## 两条约定

**推导不写在 JSX 里。** 组件旁边放一个同名的 `.ts` 存纯函数（`SetupScreen.tsx` ↔ `setup-model.ts`），
组件只负责把它的返回值画出来。这样逻辑能用现有的 vitest（node 环境、`include` 只匹配 `.ts`）直接覆盖，
不必为一屏表单引入 jsdom 和 testing-library。

**引擎的配置函数会抛。** `getFreeEvilSlots` / `getEvilOptions` / `composeRoles` / `createConfig`
遇到 5–10 之外的人数一律抛 `EngineError`，不是返回 0 或空数组——在渲染期抛就是白屏。
先过 `isSupportedPlayerCount`。`checkConfig` 是唯一可以拿脏数据喂的，它纯查错、不抛。

## 视觉基座

token 定义在 `src/app/globals.css`，只做深色。

| token | 用途 |
| --- | --- |
| `ink` / `ink-raised` / `ink-line` | 底色 / 面板 / 描边 |
| `vellum` / `muted` | 主文字 / 次要文字 |
| `loyal` / `mordred` | 好人 / 坏人。成对出现，任何角色标签都要一眼分得开阵营 |
| `brass` | 交互态：选中、焦点、主按钮 |
| `font-display` | CJK 衬线，标题与区块小标题 |
| `.tabular` | 等宽 + `tabular-nums`，**所有数字**都走它 |

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

**`good` 只准在终局用。** 对局中没有任何一个座位配得上"确定是好人"，
用在别处就是开天眼。

**任务票来源是全项目唯一显示得出这件事的地方。** `PublicMissionRecord` 刻意丢掉了
`cards`，所以对局中任何人（包括你）都只知道"几张失败票"，不知道是谁投的。
只有 `reveal.missions` 带着它。

**`describeGameOver` 不抛。** 还没到终局、以及观战局（没有视角）都返回 null，
由面板兜一句话——与 `describeTurn` 同一条约定。`reveal.assassination` 为 null
（坏人靠三次任务赢、或否决撞线）是正常的终局形态，不是缺数据。

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
