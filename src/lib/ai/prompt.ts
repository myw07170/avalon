/**
 * PlayerView -> prompt 字符串。
 *
 * 【类型层面的防泄漏】本文件的函数签名只接受 AiDecisionRequest，永远不接受 GameState。
 * 谁想加一个 state 参数进来，就是在拆信息隔离，不要同意。
 *
 * 依赖方向上也够不到：本文件只 import types.ts 的类型与 ROLE_META、config.ts 的公开表，
 * 不 import view.ts / legal.ts / reduce.ts。
 *
 * 【分节结构不是排版】prompt.test.ts 按 `【】` 把结果切成段，断言
 * 【当前局势】【历史】【你的人设】【输出格式】四段里不出现任何角色名——
 * 泄漏一旦发生，几乎必然出现在【历史】里（把任务票的投票人渲染出来是最典型的一种）。
 * 加新段落时想清楚它属于哪一类，别把身份信息塞进本该干净的段。
 */
import { ROLE_ORDER, countEvil } from "../game/config";
import { buildPerspective } from "./perspective";
import {
  EngineError,
  ROLE_META,
  type AiDecisionKind,
  type AiDecisionRequest,
  type GameAction,
  type Knowledge,
  type Persona,
  type Phase,
  type PlayerId,
  type PlayerView,
  type PublicMissionRecord,
  type PublicProposalRecord,
  type Role,
  type Speech,
} from "../game/types";

type AnyRequest = AiDecisionRequest<AiDecisionKind>;

// ---------------------------------------------------------------------------
// 文案表
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<Phase, string> = {
  SETUP: "准备中",
  ROLE_REVEAL: "查看身份",
  TEAM_BUILDING: "队长组队",
  PROPOSAL_DISCUSSION: "提议讨论",
  TEAM_VOTE: "组队投票",
  MISSION_EXECUTION: "执行任务",
  MISSION_RESULT: "任务结算",
  REVIEW_DISCUSSION: "复盘讨论",
  ASSASSINATION: "刺杀",
  GAME_OVER: "终局",
};

/**
 * 角色专属的策略提醒。
 *
 * 写成一张表而不是散在各分支，理由与 legal.ts 的 PHASE_ACTIONS 同源。
 * 这些**全是策略约束，不是规则**——引擎不会阻止梅林报出坏人名单，那是策略失误不是非法操作
 * （rules.md §6）。所以它们只能待在 prompt 里。
 */
const ROLE_HINTS: Record<Role, string> = {
  MERLIN:
    "你知道谁是坏人，但绝不能把名单说得太明——刺客全程在找你，你说得越准，死得越快。用暗示和引导让好人自己得出结论，必要时故意留一点模糊。",
  PERCIVAL:
    "你看到的两个人里只有一个是梅林，另一个是莫甘娜在冒充。别急着替其中一个背书，先看这两人的判断准不准。",
  LOYAL_SERVANT:
    "你的价值在于抓矛盾：谁的发言和投票对不上，谁在任务失败后急着撇清。别怕站错——沉默的好人对好人方没有任何帮助。",
  MORGANA: "派西维尔分不清你和梅林。你可以装作自己掌握着信息，去骗取他的信任。",
  ASSASSIN:
    "终局若好人集齐 3 分，你要指认梅林。全程留意谁的判断准得反常、谁在不该有把握的时候有把握，那多半就是他。",
  MORDRED: "梅林看不到你，这是你最大的优势——你可以放心地把自己表现成一个好人。",
  OBERON:
    "你不认识任何队友，队友也不认识你。你投失败票时很可能误伤同伴，而梅林看得到你，行事要更谨慎。",
  MINION: "你没有特殊能力，你的价值在于配合队友把水搅浑、把好人的判断带偏。",
};

/**
 * 发言长度要求。
 *
 * 刻意写**句子数**而不是字数：中文模型对字数的感知很差，卡"80-150 字"实际会给出 60 或 200，
 * 而这类非致命违规会把 fallback 率推高，污染"fallback 超过 5% 说明 prompt 或 schema 有问题"
 * 这条判据。schema.ts 也只卡非空、不卡长度。参考项目 wolfcha 同样不设字数，
 * 它在人设生成里甚至明令"不要写数字字数区间"。
 */
const SPEECH_LENGTH =
  "通常 2-5 句；被追问或只想表个态时，一句话也可以。不必覆盖所有人，也不必显得完美，只说你此刻会在桌上说的话。";

/**
 * 公开发言的共同约束。SPEECH 与 TEAM_PROPOSAL 的 statement 共用一份。
 *
 * 【为什么要显式写"不要自曝"】首次真实对局里，刺客在公开发言里说"作为刺客，我会观察……"，
 * 梅林说"作为梅林，我会密切关注……"（gpt-5-nano，seed 94938）。
 * `PlayerView` 给的信息完全正确，是 prompt 没说清楚这段话谁能看见——
 * 模型把【你的身份】当成了可以复述的上下文。这是**策略约束不是规则**，引擎不会拦
 * （rules.md §6），所以只能在这里说。
 *
 * 【但不能写成"不许撒谎"】莫甘娜冒充梅林去骗派西维尔是这个游戏的核心玩法之一。
 * 禁的是"说出自己的真实角色"，不是"编造身份"——这两条差一个字，效果差一整局。
 *
 * 【后三条抄自参考项目 wolfcha 的「底线规则」】各自解决一个我们真跑出来的毛病：
 * - 禁场外话术：首两局里几乎每条发言都是"里程碑/时间线/分工/可验证的进度"这种周会黑话。
 *   模型不知道自己在牌桌上，就会退回它最熟的那套语域。反例词直接用我们踩到的那几个。
 * - 禁编造：模型会顺口引用一句根本没人说过的话、一次没发生过的投票，而别人无从核对。
 * - 立场连贯：同一个人上一轮咬定 3 号、下一轮改口却不给理由，整局推理就没法积累。
 *   注意 wolfcha 的写法是"改变判断必须基于新出现的信息"——**不是禁止改口**，
 *   禁止改口会毁掉真实对局：拿到新信息就该改。
 */
const PUBLIC_SPEECH_RULES = [
  "这段话**所有人都看得见**，包括对面阵营的人。",
  "不要说出自己的真实角色，也不要说明你是怎么拿到这些信息的——说了这局就没得玩了。",
  // 抽象规则对弱模型不够用：第二局仍然出现了"作为梅林，我更关注……"。
  // 直接给反例比再讲一遍道理管用。谈论别人的身份是正常推理，禁的只是给自己贴标签
  "**别用「作为梅林……」「我是刺客……」这种开头给自己贴标签**；谈论别人的身份则完全没问题。",
  "暗示、试探、含糊其辞、甚至冒充别的身份都可以（这本来就是玩法），但不能自曝。",
  "只写你自己要说的那段话：不要复述规则，也不要替别的座位编台词。",
  "**严禁场外话术**：不许用职业类比、行业术语、项目管理黑话。" +
    "别说「里程碑」「分工」「时间线」「可验证的进度」这种词——这是牌桌，不是周会。",
  "**严禁编造**：只能引用本局真实发生过的发言、投票和任务结果。没发生过的事一个字都不许编。",
  "**立场要连贯**：你说的话得和自己之前的发言、投票对得上。" +
    "改主意可以，但必须是因为出现了新信息，并说清楚是哪一条。",
].join("\n");

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const section = (title: string, body: string): string => `【${title}】\n${body}`;

const seat = (id: PlayerId): string => `座位 ${id}`;

/** "座位 0、1、2"。前缀只写一次——十个座位各带一次"座位"既啰嗦又烧 token */
const seatList = (ids: readonly PlayerId[]): string =>
  ids.length === 0 ? "无" : `座位 ${ids.join("、")}`;

const nth = (missionIndex: number): string => `第 ${missionIndex + 1} 轮`;

/** 只保留某一类候选动作。写成显式谓词，不依赖 TS 对 filter 的类型推断 */
function actionsOfType<T extends GameAction["type"]>(
  actions: readonly GameAction[],
  type: T,
): Array<Extract<GameAction, { type: T }>> {
  return actions.filter(
    (action): action is Extract<GameAction, { type: T }> => action.type === type,
  );
}

// ---------------------------------------------------------------------------
// 各段
// ---------------------------------------------------------------------------

function rulesSection(view: PlayerView): string {
  return section(
    "游戏",
    [
      "你正在玩阿瓦隆——一局隐藏身份的推理游戏，好人与坏人各有阵营目标。",
      "- 好人方获胜：任务成功 3 次，且终局刺客没有刺中梅林。",
      "- 坏人方获胜：任务失败 3 次，或终局刺客刺中梅林，或同一轮组队被连续否决 " +
        `${view.maxRejects} 次。`,
      "- 每轮流程：队长提名一支队伍 → 全体公开投票 → 上队的人各交一张任务票。",
      "- 投票规则：同意票**严格多于**半数才通过，平票算否决。否决则换下一位队长重新提名。",
      "- 任务票只公开失败票的**数量**，绝不公开是谁投的。只有坏人能投失败票——" +
        "所以一支队伍交出了几张失败票，就说明那车上至少有几个坏人。这笔账全场都算得出来。",
      // 反过来不成立。少了这句，模型会把成功记录当免罪符——
      // 这同样是规则层面的事实，不是替谁算好的本局结论
      "- 但反过来不成立：任务成功**不代表**车上没有坏人，坏人可以故意投成功票来洗白自己。",
      "- 你只知道自己视角内的信息。你不是旁观解说，也不是裁判。",
    ].join("\n"),
  );
}

function setupSection(view: PlayerView): string {
  const present = ROLE_ORDER.filter((role) => view.roleComposition[role] > 0);
  // 好人/坏人的人数直接从构成表里数，不去查 TEAM_SPLIT——
  // 查表要处理"人数不在表里"的分支，而那种状态根本走不到这里（配置层已经拦了）。
  // countEvil 与 deduction.ts 共用，不在两处各数一遍
  const evilCount = countEvil(view.roleComposition);
  const composition = present
    .map((role) => `${ROLE_META[role].label}×${view.roleComposition[role]}`)
    .join("、");
  const abilities = present.map(
    (role) => `- ${ROLE_META[role].label}：${ROLE_META[role].ability}`,
  );
  const missions = view.missionConfigs.map(
    (mission, index) =>
      `${nth(index)} ${mission.teamSize} 人` +
      (mission.failsRequired > 1 ? `（需 ${mission.failsRequired} 张失败票才算失败）` : ""),
  );

  return section(
    "本局配置",
    [
      `${view.players.length} 人局，其中好人 ${view.players.length - evilCount} 人、坏人 ${evilCount} 人。`,
      // 角色构成是开局公开信息（rules.md §3.2），所有人拿到的完全一样
      `角色构成：${composition}。`,
      "各角色能力：",
      ...abilities,
      `任务规模：${missions.join("；")}。`,
      `同一轮最多否决 ${view.maxRejects} 次，达到即坏人获胜。`,
    ].join("\n"),
  );
}

function identitySection(view: PlayerView): string {
  const meta = ROLE_META[view.selfRole];
  const self = view.players.find((p) => p.id === view.selfId);
  if (!self) {
    // toPlayerView 保证 selfId 一定在 players 里，取不到只可能是有人手搓了一个 view
    throw new EngineError(`视角里没有自己的座位 ${view.selfId}`, "INTERNAL", {
      selfId: view.selfId,
    });
  }
  const lines = [
    `你是${seat(view.selfId)}「${self.name}」，角色是${meta.label}，属于${
      view.selfTeam === "GOOD" ? "好人" : "坏人"
    }阵营。`,
    `能力：${meta.ability}`,
    ROLE_HINTS[view.selfRole],
    // 角色名就印在上面这几行里，模型最容易顺手把它复述进公开发言，所以在源头标一次
    "以上这几行只有你自己知道，别人看不到，也不要在公开发言里复述。",
  ];
  // 好人不能投失败票是引擎级硬约束（legal.ts 不给这个选项，reduce 里还有第二道保险）。
  // 只在决策那一刻说不够——首次真实对局里好人仍然试了 4 次，所以在身份处再钉一次
  if (view.selfTeam === "GOOD") {
    lines.push("你是好人：只要你上队，任务票就只能是成功。好人交不出失败票。");
  }
  return section("你的身份", lines.join("\n"));
}

/**
 * knowledge 的渲染。
 *
 * MERLIN_OR_MORGANA 的两个座位号由 visibility.ts 保证按升序存放，这里**原样输出**。
 * 若在这里重排或按"梅林在前"渲染，派西维尔每局都能秒选对——
 * 这是全项目最隐蔽的一处泄漏点，阶段 2 已经踩过一次，prompt 层再钉一次。
 */
function knowledgeLine(item: Knowledge): string {
  if (item.kind === "IS_EVIL") return `- ${seat(item.playerId)} 是坏人。`;
  const [a, b] = item.playerIds;
  return `- ${seat(a)} 和 ${seat(b)} 中，一个是${ROLE_META.MERLIN.label}、一个是${ROLE_META.MORGANA.label}，但你分不清谁是谁。`;
}

function knowledgeSection(view: PlayerView): string {
  if (view.knowledge.length === 0) {
    return section("你知道的", "你没有任何额外的身份信息，只能靠推理。");
  }
  return section("你知道的", view.knowledge.map(knowledgeLine).join("\n"));
}

function personaSection(persona: Persona): string {
  const lines = [
    `名字：${persona.name}`,
    `性格：${persona.traits.join("、")}`,
    `说话风格：${persona.speechStyle}`,
  ];
  // 隐藏画像才是让五个人说出不同话的那部分：形容词不改变模型关注什么，
  // "最先看票型"和"最先看语气"会（见 types.ts 的 PersonaMind）
  if (persona.mind) {
    lines.push(
      `你看局势时最先注意：${persona.mind.reasoningStyle}`,
      `你的话多话少：${persona.mind.speechLengthHabit}`,
      `被点名或被怀疑时，你会：${persona.mind.pressureStyle}`,
      `你容易在这里犯错：${persona.mind.mistakePattern}（不用刻意去犯，但也别假装自己不会）`,
    );
  }
  lines.push("始终按这个人设说话，不要跳出来解释自己在扮演谁。");
  return section("你的人设", lines.join("\n"));
}

function situationSection(view: PlayerView): string {
  const lines = [
    `当前阶段：${PHASE_LABEL[view.phase]}，${nth(view.missionIndex)}任务（共 ${view.missionConfigs.length} 轮）。`,
    `比分：好人 ${view.goodScore} : 坏人 ${view.evilScore}（先到 3 分）。`,
  ];
  // 刺杀阶段任务已经打完了，再报队长和队伍规模只会让模型分神
  if (view.phase !== "ASSASSINATION") {
    lines.push(
      `当前队长：${seat(view.currentLeaderId)}。本轮已否决 ${view.rejectCount} 次（上限 ${view.maxRejects}）。`,
      `本轮任务需要 ${view.currentMission.teamSize} 人上队，` +
        `${view.currentMission.failsRequired} 张失败票即判失败。`,
    );
  }
  if (view.proposedTeam) {
    lines.push(`当前待表决的队伍：${seatList(view.proposedTeam)}。`);
  }
  if (view.speakingOrder.length > 0) {
    lines.push(`本轮发言顺序：${seatList(view.speakingOrder)}。`);
  }
  return section("当前局势", lines.join("\n"));
}

/** 任务记录只有失败票的数量，没有投票者——rules.md §4.3 的最后一条 */
function missionLine(record: PublicMissionRecord): string {
  return (
    `- ${nth(record.missionIndex)}：${seat(record.leaderId)} 带队，队伍 ${seatList(record.team)}，` +
    `失败票 ${record.failCount} 张 → ${record.succeeded ? "任务成功" : "任务失败"}`
  );
}

function proposalLine(record: PublicProposalRecord): string {
  const head =
    `- ${nth(record.missionIndex)}第 ${record.attempt + 1} 次提议：${seat(record.leaderId)} 提名 ` +
    `${seatList(record.team)}`;
  if (record.forced) return `${head} → 最后一次机会，强制通过（未投票）`;
  const ids = Object.keys(record.votes).map(Number);
  const approved = ids.filter((id) => record.votes[id]);
  const rejected = ids.filter((id) => !record.votes[id]);
  return (
    `${head} → ${record.approved ? "通过" : "否决"}` +
    `（同意：${seatList(approved)}；反对：${seatList(rejected)}）`
  );
}

function historySection(view: PlayerView): string {
  const blocks: string[] = [];
  blocks.push(
    view.missionHistory.length === 0
      ? "任务结果：暂无"
      : ["任务结果：", ...view.missionHistory.map(missionLine)].join("\n"),
  );
  blocks.push(
    view.proposalHistory.length === 0
      ? "组队与投票：暂无"
      : ["组队与投票：", ...view.proposalHistory.map(proposalLine)].join("\n"),
  );
  return section("历史", blocks.join("\n"));
}

/**
 * 发言归属的第几次提议。
 *
 * **只有组队与提议讨论标它**：复盘讨论的 attempt 按 types.ts 的约定是"该轮最后一次
 * 提议"，那是给复盘定位用的，渲染成"第 3 次提议"会让模型以为复盘也分了好几次。
 *
 * 不标的话，一轮里被否决两次的三批发言在【全场发言】里糊成一片，
 * 模型分不清哪句是冲着哪个队伍说的。
 */
function attemptLabel(speech: Speech): string {
  const numbered =
    speech.phase === "TEAM_BUILDING" || speech.phase === "PROPOSAL_DISCUSSION";
  return numbered ? `第 ${speech.attempt + 1} 次提议 ` : "";
}

/** 发言原样输出，不加工也不改写——加工过的转述会让模型对不上号 */
function speechLine(speech: Speech): string {
  return (
    `- ${nth(speech.missionIndex)}${attemptLabel(speech)}${PHASE_LABEL[speech.phase]} ` +
    `${seat(speech.playerId)}：${speech.content}`
  );
}

function speechSection(view: PlayerView): string {
  if (view.speeches.length === 0) {
    return section("全场发言", "暂无发言。");
  }
  return section("全场发言", view.speeches.map(speechLine).join("\n"));
}

// ---------------------------------------------------------------------------
// 本次决策
// ---------------------------------------------------------------------------

/**
 * 【你的视角】——每人一组不同的切入角度。
 *
 * 内容由 perspective.ts 产出，那里只给**事实 + 要不要提**，绝不给立场或结论
 * （理由见那个文件的头注释：我们和 wolfcha 各自踩过一次同样的坑）。
 * 没有任何角度可给时整段不渲染，不写"暂无"占位——空段落只会稀释注意力。
 */
function perspectiveSection(view: PlayerView): string | null {
  const hints = buildPerspective(view);
  if (hints.length === 0) return null;
  return section(
    "你的视角",
    ["以下都是你身上发生过的事，别人不一定会替你提：", ...hints.map((h) => `- ${h}`)].join("\n"),
  );
}

/**
 * 你排第几个说、谁已经说过了。
 *
 * 【为什么值得单独说一句】不给位次的话，模型不知道自己处在什么信息位置：
 * 第一个发言的人会凭空引用"前面几位提到"，最后一个会说"再看看 X 号怎么说"——
 * 而 X 号已经说完了。这两种毛病在首两局的记录里都出现过，wolfcha 也各写了一条防它们。
 *
 * 数据全部来自 view.progress 与 view.speakingOrder，不需要引擎多给任何字段。
 *
 * 【提议讨论里位次天然从 2 起】speakingOrder[0] 是队长，而他那一次已经被选人说明占掉了
 * （phases/transitions.ts）。所以这里照实渲染就对了：已发言列表里本来就该有队长。
 */
function speakOrderLines(view: PlayerView): string[] {
  const { speakingOrder, progress } = view;
  if (speakingOrder.length === 0) return [];

  const spoken = speakingOrder.slice(0, progress.submitted);
  const pending = speakingOrder.slice(progress.submitted + 1);
  const lines = [`你是第 ${progress.submitted + 1}/${progress.required} 个发言。`];

  if (spoken.length === 0) {
    lines.push("你是第一个开口的人，前面没有任何发言可以引用——别说「前面几位提到」。");
  } else {
    lines.push(`已发言：${seatList(spoken)}；还没发言：${seatList(pending)}。`);
  }
  if (pending.length === 0 && spoken.length > 0) {
    lines.push(
      "你是最后一个，所有人都已经说完了——别说「等座位 X 发言」或「看座位 X 怎么说」。",
    );
  }
  return lines;
}

/**
 * 合法选项一律从 req.legalActions 渲染，绝不自己推。
 *
 * 最要紧的是任务票那一条：好人的候选列表里根本没有"失败"，
 * prompt 就不该提它的存在——提了等于教模型去试一个必然被引擎拒绝的动作。
 */
function decisionSection(req: AnyRequest): string {
  const { view, legalActions } = req;

  switch (req.kind) {
    case "TEAM_PROPOSAL":
      return section(
        "本次决策",
        [
          `轮到你当队长组队。请从全体玩家中选出**恰好 ${view.currentMission.teamSize} 人**执行${nth(view.missionIndex)}任务。`,
          `可选座位：${seatList(view.players.map((p) => p.id))}（可以选你自己，也可以不选）。`,
          "队伍里不能有重复座位。",
          "组队前先回顾【历史】里每一轮的结果，以及每支队伍上过谁——" +
            "哪些人一起上过出失败票的车，是你现在唯一的硬证据。",
          `同时给出一段公开的选人说明（statement），${SPEECH_LENGTH}`,
          "**这段说明就是你在本次提议讨论里的发言**，会立刻公开给所有人；" +
            "讨论阶段不会再轮到你，所以想说的话现在一次说完。",
          PUBLIC_SPEECH_RULES,
        ].join("\n"),
      );

    case "SPEECH":
      return section(
        "本次决策",
        [
          view.phase === "PROPOSAL_DISCUSSION"
            ? "现在是提议讨论，轮到你发言。队伍已经报出来了，投票还没开始——你的发言会影响别人怎么投。" +
              "**你从任务结果里看出了什么，得自己说出来**——别人不会自动知道你的推理。"
            : "现在是复盘讨论，轮到你发言。任务结果已经公布，指认、辩解、拉票都可以。",
          ...speakOrderLines(view),
          `发言要求：${SPEECH_LENGTH}`,
          "你可以坦诚、含糊、试探、反驳、带节奏、保护别人，或者暂时保留判断。",
          PUBLIC_SPEECH_RULES,
        ].join("\n"),
      );

    case "VOTE": {
      const options = actionsOfType(legalActions, "CAST_VOTE").map((action) =>
        action.approve ? "同意（approve = true）" : "反对（approve = false）",
      );
      return section(
        "本次决策",
        [
          `对当前队伍 ${seatList(view.proposedTeam ?? [])} 投票。全场同时公开，你看不到别人先投了什么。`,
          "投票前先回顾【历史】：这支队伍里有没有人上过出失败票的车？" +
            "几张失败票、同车的还有谁，都要自己算一遍。",
          `可选：${options.join(" / ")}`,
          "记住：同意票严格多于半数才通过，平票算否决；否决数达到上限坏人直接获胜。",
        ].join("\n"),
      );
    }

    case "MISSION_CARD": {
      const options = actionsOfType(legalActions, "CAST_MISSION_CARD").map((action) =>
        action.success ? "成功（success = true）" : "失败（success = false）",
      );
      const lines = [
        "你在本次任务队伍里，请交一张任务票。只公开失败票的数量，不公开是谁投的。",
        `可选：${options.join(" / ")}`,
      ];
      // 好人只有一个选项。说明白"这是你唯一的选项"，比让模型自己发现要省一次无效尝试。
      // 首次真实对局里好人仍然试了 4 次失败票，所以这里连"填了会怎样"一起写死
      if (options.length === 1) {
        lines.push(
          "这是你唯一的合法选项：**success 必须填 true**。",
          "填 false 是非法动作，引擎会直接拒绝，你并不能靠它破坏任务。",
        );
      }
      return section("本次决策", lines.join("\n"));
    }

    case "ASSASSIN_OPINION":
      return section(
        "本次决策",
        [
          "好人已经集齐 3 分，进入刺杀环节。刺客动手之前，每个坏人各公开发表一次推测。",
          "说出你认为谁是梅林，以及你的依据。",
          `发言要求：${SPEECH_LENGTH}`,
        ].join("\n"),
      );

    case "ASSASSINATION": {
      const targets = actionsOfType(legalActions, "ASSASSINATE").map((a) => a.targetId);
      return section(
        "本次决策",
        [
          "你是刺客，这是最后一击：指认一名玩家为梅林。命中则坏人翻盘，落空则好人获胜。",
          `可选目标：${seatList(targets)}。`,
          "回顾全场——谁的判断准得反常，谁在不该有把握的时候有把握。",
        ].join("\n"),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 输出格式
// ---------------------------------------------------------------------------

/**
 * 每个 kind 一份紧凑示例。
 *
 * 刻意不用 z.toJSONSchema：JSON Schema 又长又费 token，对模型的可读性反而更差。
 * 防止示例与 schema.ts 分叉靠测试——prompt.test.ts 会把这里的示例抠出来，
 * 用 AI_SCHEMAS[kind] parse 一遍，分叉当场炸。
 *
 * reasoning 是给模型自己想的，不会公开给其他玩家；content / statement 会公开。
 */
const OUTPUT_EXAMPLES: Record<AiDecisionKind, string> = {
  TEAM_PROPOSAL:
    '{"reasoning":"内心分析，其他玩家看不到","team":[0,2,3],"statement":"公开的选人说明"}',
  SPEECH:
    '{"reasoning":"内心分析，其他玩家看不到","content":"你要公开说出来的话","suspicions":[{"playerId":1,"score":0.8}]}',
  VOTE: '{"reasoning":"内心分析，其他玩家看不到","approve":true}',
  MISSION_CARD: '{"reasoning":"内心分析，其他玩家看不到","success":true}',
  ASSASSIN_OPINION:
    '{"reasoning":"内心分析，其他玩家看不到","content":"你要公开说出来的话","suspicions":[{"playerId":1,"score":0.8}]}',
  ASSASSINATION: '{"reasoning":"内心分析，其他玩家看不到","targetId":2}',
};

function outputSection(req: AnyRequest): string {
  const extra =
    req.kind === "SPEECH" || req.kind === "ASSASSIN_OPINION"
      ? "\nsuspicions 可以省略；给的话 score 用 0 到 1 表示怀疑程度。"
      : "";

  /**
   * 只有一个合法值的字段，在**最后读到的这一段**再钉一次。
   *
   * 值从 legalActions 里取，不写死 true：这样"好人只能出成功"这条规则仍然只由
   * legal.ts 说了算，prompt 只是把它复述出来（与本文件"合法选项一律从 legalActions 渲染"同源）。
   */
  const cards = req.kind === "MISSION_CARD" ? actionsOfType(req.legalActions, "CAST_MISSION_CARD") : [];
  const only = cards.length === 1 ? cards[0] : undefined;
  const forced = only ? `\nsuccess 只能填 ${only.success}，没有第二个选择。` : "";

  return section(
    "输出格式",
    `只输出一个 JSON 对象，不要写任何解释文字，不要用 markdown 代码块。格式：\n${OUTPUT_EXAMPLES[req.kind]}${extra}${forced}`,
  );
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 结构：游戏规则 → 本局配置 → 你的身份 → 你知道的 → 人设 → 当前局势
 *   → 历史（提议、投票、任务结果）→ 全场发言 → 你的视角 → 本次决策 + 合法选项 → 输出格式。
 *
 * 不做历史截断。5 人局满打满算 50 条发言，撑不爆上下文；真爆了应该看得见，
 * 而不是被一个 .slice(-20) 悄悄藏住（"不写容错"）。prompt.test.ts 有一条长度上界盯着。
 */
export function buildPrompt<K extends AiDecisionKind>(req: AiDecisionRequest<K>): string {
  const { view } = req;
  return [
    rulesSection(view),
    setupSection(view),
    identitySection(view),
    knowledgeSection(view),
    personaSection(req.persona),
    situationSection(view),
    historySection(view),
    speechSection(view),
    // 没有角度可给时整段消失，所以这里要过滤掉 null
    perspectiveSection(view),
    decisionSection(req),
    outputSection(req),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
}
