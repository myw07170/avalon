# 状态机设计

引擎是一个纯函数状态机：`reduce(state, action) -> newState`。不发网络请求，不调 LLM，不读时间戳，不用随机数（随机源作为参数注入）。这样才能测试。

## 1. 阶段枚举

```
SETUP                 分配角色，确定首任队长
ROLE_REVEAL           各玩家查看自己的身份与已知信息
TEAM_BUILDING         队长选人
PROPOSAL_DISCUSSION   队长解释 + 全员发言
TEAM_VOTE             全员公开投票同意/反对
MISSION_EXECUTION     队员匿名投成功/失败
MISSION_RESULT        公布结果（仅失败票数）
REVIEW_DISCUSSION     全员复盘发言
ASSASSINATION         坏人商议 + 刺客指定目标
GAME_OVER             公开所有身份
```

## 2. 转移表

| 当前阶段 | 触发动作 | 条件 | 下一阶段 |
| --- | --- | --- | --- |
| SETUP | `START_GAME` | 配置校验通过 | ROLE_REVEAL |
| ROLE_REVEAL | `ACKNOWLEDGE` | 全员确认 | TEAM_BUILDING |
| TEAM_BUILDING | `PROPOSE_TEAM` | 人数正确且无重复 | PROPOSAL_DISCUSSION |
| PROPOSAL_DISCUSSION | `SPEAK` | 全员发言完毕 | TEAM_VOTE |
| TEAM_VOTE | `CAST_VOTE` | 全员投票完毕，同意 > 半数 | MISSION_EXECUTION |
| TEAM_VOTE | `CAST_VOTE` | 同意 ≤ 半数，`rejectCount + 1 < 5` | TEAM_BUILDING（队长顺延） |
| TEAM_VOTE | `CAST_VOTE` | 同意 ≤ 半数，`rejectCount + 1 >= 5` | GAME_OVER（坏人胜） |
| MISSION_EXECUTION | `CAST_MISSION_CARD` | 全体队员投票完毕 | MISSION_RESULT |
| MISSION_RESULT | `NEXT` | 好人积分 = 3 | ASSASSINATION |
| MISSION_RESULT | `NEXT` | 坏人积分 = 3 | GAME_OVER（坏人胜） |
| MISSION_RESULT | `NEXT` | 均未到 3 | REVIEW_DISCUSSION |
| REVIEW_DISCUSSION | `SPEAK` | 全员发言完毕 | TEAM_BUILDING（进入下一轮） |
| ASSASSINATION | `ASSASSIN_OPINION` | 尚有坏人未发表推测 | ASSASSINATION（停留） |
| ASSASSINATION | `ASSASSINATE` | 坏人推测完毕且目标合法 | GAME_OVER |

`TEAM_VOTE` 若开启变体 `forcePassOnLastAttempt`，进入该阶段时若 `rejectCount === maxRejects - 1`，则不接受 `CAST_VOTE`，直接以 `forced: true` 记一条通过的提议并转入 `MISSION_EXECUTION`。

进入 TEAM_BUILDING 有两条路径，含义不同，务必区分：从 TEAM_VOTE 来是"同一轮换队长重提"，`missionIndex` 不变、`rejectCount` 递增；从 REVIEW_DISCUSSION 来是"新一轮开始"，`missionIndex + 1`、`rejectCount` 归零。这两条路混淆是本项目最典型的 bug。

### 2.1 未结算中间态

投票、任务票、逐人发言这类阶段需要跨多个 action 累积数据。这些中间态一律放在 `GameState.pending` 里，**不进入 PlayerView**，并在每次阶段转移时重置相关字段。

特别注意组队投票：规则上它是"公开投票"，但必须**全员投完后同时公开**。若先投的票立刻可见，后投的 AI 会退化成跟票，整个博弈失效。所以 `pending.votes` 在结算前对任何人不可见，结算时一次性写入 `proposalHistory`。

## 3. 状态机骨架

```typescript
export function reduce(
  state: GameState,
  action: GameAction,
  rng: () => number,
): GameState {
  assertLegal(state, action);          // 非法动作直接抛错，不静默忽略
  switch (state.phase) {
    case "TEAM_VOTE":  return reduceTeamVote(state, action);
    // ...
  }
}
```

配套两个函数，它们和 `reduce` 同等重要：

```typescript
// 当前阶段某玩家可以做什么。AI 的候选项直接来自这里，不由 prompt 自由发挥
export function getLegalActions(state: GameState, playerId: PlayerId): GameAction[];

// 某玩家能看到什么。AI 的 prompt 只能用它构建
export function toPlayerView(state: GameState, playerId: PlayerId): PlayerView;
```

`getLegalActions` 是防作弊的第一道闸：好人在 MISSION_EXECUTION 阶段拿到的合法动作里根本没有"投失败"这个选项，LLM 想投也投不了。

## 4. 测试策略

引擎写完后，UI 一行不写就应该能跑通这些：

**单元测试**（每条至少一个用例）
- 6 种人数配置的角色分配数量正确
- 可见性矩阵：梅林看不到莫德雷德、奥伯伦双向盲、派西维尔看到两人且不可区分
- 投票平票判为否决
- `rejectCount` 在提议通过时归零、在新一轮开始时归零
- 7 人局第 4 轮 1 张失败票不算失败、2 张才算
- 好人的合法动作列表中不含 `FAIL`
- 好人 3 分后进入 ASSASSINATION 而非 GAME_OVER

**信息隔离测试**（最关键，单独一个测试文件）
- 对每个角色调用 `toPlayerView`，断言返回值序列化后**不包含**任何他不该知道的角色名和座位号
- 断言 `PlayerView` 里的任务票记录只有数量、没有 `playerId`
- 这组测试建议写成快照测试，任何人改动 `toPlayerView` 都会立刻暴露

**模拟对局**
- 所有玩家用随机合法策略，跑 1000 局，断言：无异常抛出、每局都能到达 GAME_OVER、胜负双方都出现过、任务轮数不超过 5。

这一组测试全绿之前，不要开始接 LLM。
