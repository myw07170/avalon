# phases/

`reduce` 按 `state.phase` 分派到这里的各个分支，一个阶段一个文件（阶段 3 建立）：

| 文件 | 负责阶段 |
| --- | --- |
| `setup.ts` | SETUP |
| `roleReveal.ts` | ROLE_REVEAL |
| `teamBuilding.ts` | TEAM_BUILDING |
| `discussion.ts` | PROPOSAL_DISCUSSION |
| `teamVote.ts` | TEAM_VOTE |
| `mission.ts` | MISSION_EXECUTION |
| `missionResult.ts` | MISSION_RESULT |
| `assassination.ts` | ASSASSINATION |

每个分支都是 `(state, action) => GameState` 的纯函数，只被 `reduce.ts` 调用。
签名里没有 `rng`：洗牌发牌在 `createGame` 里就做完了，目前没有任何阶段需要随机源。
`reduce` 自己仍然收 `rng`（state-machine.md §3 的回放契约），真需要时从那里往下透传。

`transitions.ts` 不负责任何阶段，装的是各分支共用的转移工具（发言顺序、队长顺延、
提议结算、终局）。单独成文件是为了避免 `reduce → phases → reduce` 的循环 import。

**进入新阶段时必须重置 `state.pending` 的相关字段**，否则上一阶段的投票会漏进下一阶段。
转移工具一律先 `pending: createPending()` 再填新阶段要用的字段，不做增量修补。

通往 `TEAM_BUILDING` 的两条路含义完全不同，`transitions.ts` 里刻意写成两个函数：
`enterNextProposal`（同轮换队长重提，`missionIndex` 不变）与
`enterNextMission`（新一轮开始，`missionIndex + 1`、`rejectCount` 归零）。
不要合并成一个带布尔参数的函数——传错一个 `true` 太容易，写错一个函数名难得多。
