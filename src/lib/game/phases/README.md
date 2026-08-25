# phases/

`reduce` 按 `state.phase` 分派到这里的各个分支，一个阶段一个文件（阶段 3 建立）：

| 文件 | 负责阶段 |
| --- | --- |
| `roleReveal.ts` | ROLE_REVEAL |
| `teamBuilding.ts` | TEAM_BUILDING |
| `discussion.ts` | PROPOSAL_DISCUSSION + REVIEW_DISCUSSION（共用） |
| `teamVote.ts` | TEAM_VOTE |
| `mission.ts` | MISSION_EXECUTION |
| `missionResult.ts` | MISSION_RESULT |
| `assassination.ts` | ASSASSINATION |

每个分支都是 `(state, action, rng) => GameState` 的纯函数，只被 `reduce.ts` 调用。

**进入新阶段时必须重置 `state.pending` 的相关字段**，否则上一阶段的投票会漏进下一阶段。
