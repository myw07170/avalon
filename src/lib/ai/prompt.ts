/**
 * PlayerView -> prompt 字符串。
 *
 * 【类型层面的防泄漏】本文件的函数签名只接受 AiDecisionRequest，永远不接受 GameState。
 * 谁想加一个 state 参数进来，就是在拆信息隔离，不要同意。
 *
 * `AiDecisionRequest.locale` **不是那道防线上的裂缝**：它是一个二值标量，
 * 不携带任何对局信息。加它是为了让 buildPrompt 知道该查哪一份语料，
 * 而不是为了让它多看见什么。
 *
 * 依赖方向上也够不到：本文件只 import types.ts 的类型与 ROLE_META、config.ts 的公开表、
 * i18n/roles.ts 的角色名、以及 prompt-copy 的语料，不 import view.ts / legal.ts / reduce.ts。
 *
 * 【这个文件里一条字面量都没有】全部措辞在 `prompt-copy.zh.ts` / `prompt-copy.en.ts`。
 * 那两份各自带着几百行注释，记着每句话是哪一局跑出来的——**改措辞去那边改，
 * 别在这里拼字符串**，不然下一个人就找不到那些出处了。
 *
 * 【分节结构不是排版】prompt.test.ts 按段头把结果切成段（中文是 `【】`，英文是
 * markdown 标题），断言【当前局势】【历史】【你的人设】【输出格式】四段里不出现
 * 任何角色名——泄漏一旦发生，几乎必然出现在【历史】里（把任务票的投票人渲染出来
 * 是最典型的一种）。加新段落时想清楚它属于哪一类，别把身份信息塞进本该干净的段。
 * 段名现在是 `SectionKey`，测试从语料表里取，所以改段名不会让某段静默掉出扫描。
 */
import { ROLE_TEXT, type RoleText } from "@/i18n/roles";
import { ROLE_ORDER, countEvil } from "../game/config";
import { buildPerspective } from "./perspective";
import { PROMPT_COPY, type PromptCopy, type SectionKey } from "./prompt-copy";
import {
  EngineError,
  ROLE_META,
  type AiDecisionKind,
  type AiDecisionRequest,
  type GameAction,
  type Knowledge,
  type Persona,
  type PlayerId,
  type PlayerView,
  type PublicMissionRecord,
  type PublicProposalRecord,
  type Role,
  type Speech,
} from "../game/types";

type AnyRequest = AiDecisionRequest<AiDecisionKind>;

/**
 * 一次 buildPrompt 里到处要传的两张表。
 *
 * 【打成一个包而不是两个参数】每个 section 函数都要它俩，分开传等于每处多写一个形参，
 * 而它们的生命周期完全一致：同一次调用、同一种语言。
 */
interface Copy {
  c: PromptCopy;
  roles: Record<Role, RoleText>;
}

const copyOf = (req: AnyRequest): Copy => ({
  c: PROMPT_COPY[req.locale],
  roles: ROLE_TEXT[req.locale],
});

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const section = ({ c }: Copy, key: SectionKey, body: string): string =>
  `${c.header(c.titles[key])}\n${body}`;

/** 正文里回指另一段。段名分语言，所以不能写死 */
const refTo = ({ c }: Copy, key: SectionKey): string => c.ref(c.titles[key]);

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

function rulesSection(view: PlayerView, copy: Copy): string {
  return section(copy, "rules", copy.c.rules(view.maxRejects));
}

function setupSection(view: PlayerView, copy: Copy): string {
  const { c, roles } = copy;
  const present = ROLE_ORDER.filter((role) => view.roleComposition[role] > 0);
  // 好人/坏人的人数直接从构成表里数，不去查 TEAM_SPLIT——
  // 查表要处理"人数不在表里"的分支，而那种状态根本走不到这里（配置层已经拦了）。
  // countEvil 与 deduction.ts 共用，不在两处各数一遍
  const evilCount = countEvil(view.roleComposition);
  const composition = present.map((role) =>
    c.setup.compositionItem(roles[role].label, view.roleComposition[role]),
  );
  // 【每行都标阵营】原先只有能力描述，通篇没有一句话说"梅林是好人"。
  // 刺客因此缺一个硬锚点：刺杀是在**好人**里找梅林，而他连"梅林属于哪一边"都没被明确告知过。
  // team 字段 ROLE_META 里现成的，不另建映射表
  const abilities = present.map((role) =>
    c.setup.abilityLine(
      roles[role].label,
      ROLE_META[role].team === "GOOD" ? c.good : c.evil,
      roles[role].ability,
    ),
  );
  const missions = view.missionConfigs.map((mission, index) =>
    c.setup.missionItem(c.nth(index), mission.teamSize, mission.failsRequired),
  );

  return section(
    copy,
    "setup",
    [
      c.setup.split(view.players.length, view.players.length - evilCount, evilCount),
      // 角色构成是开局公开信息（rules.md §3.2），所有人拿到的完全一样
      c.setup.composition(composition),
      c.setup.abilitiesTitle,
      ...abilities,
      c.setup.missions(missions),
      c.setup.rejectLimit(view.maxRejects),
    ].join("\n"),
  );
}

function identitySection(view: PlayerView, copy: Copy): string {
  const { c, roles } = copy;
  const meta = roles[view.selfRole];
  const self = view.players.find((p) => p.id === view.selfId);
  if (!self) {
    // toPlayerView 保证 selfId 一定在 players 里，取不到只可能是有人手搓了一个 view
    throw new EngineError(`视角里没有自己的座位 ${view.selfId}`, "INTERNAL", {
      selfId: view.selfId,
    });
  }
  const lines = [
    c.identity.line(
      c.seat(view.selfId),
      self.name,
      meta.label,
      view.selfTeam === "GOOD" ? c.good : c.evil,
    ),
    c.identity.ability(meta.ability),
    c.roleHints[view.selfRole],
    // 角色名就印在上面这几行里，模型最容易顺手把它复述进公开发言，所以在源头标一次
    c.identity.secret,
  ];
  // 好人不能投失败票是引擎级硬约束（legal.ts 不给这个选项，reduce 里还有第二道保险）。
  // 只在决策那一刻说不够——首次真实对局里好人仍然试了 4 次，所以在身份处再钉一次
  if (view.selfTeam === "GOOD") lines.push(c.identity.goodCannotFail);
  return section(copy, "identity", lines.join("\n"));
}

/**
 * knowledge 的渲染。
 *
 * MERLIN_OR_MORGANA 的两个座位号由 visibility.ts 保证按升序存放，这里**原样输出**。
 * 若在这里重排或按"梅林在前"渲染，派西维尔每局都能秒选对——
 * 这是全项目最隐蔽的一处泄漏点，阶段 2 已经踩过一次，prompt 层再钉一次。
 */
function knowledgeLine(item: Knowledge, { c, roles }: Copy): string {
  if (item.kind === "IS_EVIL") return c.knowledge.isEvil(c.seat(item.playerId));
  const [a, b] = item.playerIds;
  return c.knowledge.merlinOrMorgana(
    c.seat(a),
    c.seat(b),
    roles.MERLIN.label,
    roles.MORGANA.label,
  );
}

function knowledgeSection(view: PlayerView, copy: Copy): string {
  if (view.knowledge.length === 0) {
    return section(copy, "knowledge", copy.c.knowledge.none);
  }
  return section(
    copy,
    "knowledge",
    view.knowledge.map((item) => knowledgeLine(item, copy)).join("\n"),
  );
}

function personaSection(persona: Persona, copy: Copy): string {
  const { c } = copy;
  const lines = [
    c.persona.name(persona.name),
    c.persona.traits(persona.traits),
    c.persona.speechStyle(persona.speechStyle),
  ];
  // 隐藏画像才是让五个人说出不同话的那部分：形容词不改变模型关注什么，
  // "最先看票型"和"最先看语气"会（见 types.ts 的 PersonaMind）
  if (persona.mind) {
    lines.push(
      c.persona.reasoningStyle(persona.mind.reasoningStyle),
      c.persona.speechLengthHabit(persona.mind.speechLengthHabit),
      c.persona.pressureStyle(persona.mind.pressureStyle),
      c.persona.mistakePattern(persona.mind.mistakePattern),
    );
  }
  lines.push(c.persona.stayInCharacter);
  return section(copy, "persona", lines.join("\n"));
}

function situationSection(view: PlayerView, copy: Copy): string {
  const { c } = copy;
  const lines = [
    c.situation.phase(
      c.phase[view.phase],
      c.nth(view.missionIndex),
      view.missionConfigs.length,
    ),
    c.situation.score(view.goodScore, view.evilScore),
  ];
  // 刺杀阶段任务已经打完了，再报队长和队伍规模只会让模型分神
  if (view.phase !== "ASSASSINATION") {
    lines.push(
      c.situation.leader(c.seat(view.currentLeaderId), view.rejectCount, view.maxRejects),
      c.situation.missionShape(
        view.currentMission.teamSize,
        view.currentMission.failsRequired,
      ),
    );
  }
  if (view.proposedTeam) {
    lines.push(c.situation.proposedTeam(c.seatList(view.proposedTeam)));
  }
  if (view.speakingOrder.length > 0) {
    lines.push(c.situation.speakingOrder(c.seatList(view.speakingOrder)));
  }
  return section(copy, "situation", lines.join("\n"));
}

/** 任务记录只有失败票的数量，没有投票者——rules.md §4.3 的最后一条 */
function missionLine(record: PublicMissionRecord, { c }: Copy): string {
  return c.history.missionLine(
    c.nth(record.missionIndex),
    c.seat(record.leaderId),
    c.seatList(record.team),
    record.failCount,
    record.succeeded,
  );
}

function proposalLine(record: PublicProposalRecord, { c }: Copy): string {
  const head = c.history.proposalHead(
    c.nth(record.missionIndex),
    record.attempt + 1,
    c.seat(record.leaderId),
    c.seatList(record.team),
  );
  if (record.forced) return c.history.proposalForced(head);
  const ids = Object.keys(record.votes).map(Number);
  const approved = ids.filter((id) => record.votes[id]);
  const rejected = ids.filter((id) => !record.votes[id]);
  return c.history.proposalResult(
    head,
    record.approved,
    c.seatList(approved),
    c.seatList(rejected),
  );
}

function historySection(view: PlayerView, copy: Copy): string {
  const { c } = copy;
  const blocks: string[] = [];
  blocks.push(
    view.missionHistory.length === 0
      ? c.history.missionsEmpty
      : [
          c.history.missionsTitle,
          ...view.missionHistory.map((record) => missionLine(record, copy)),
        ].join("\n"),
  );
  blocks.push(
    view.proposalHistory.length === 0
      ? c.history.proposalsEmpty
      : [
          c.history.proposalsTitle,
          ...view.proposalHistory.map((record) => proposalLine(record, copy)),
        ].join("\n"),
  );
  return section(copy, "history", blocks.join("\n"));
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
function attemptLabel(speech: Speech, { c }: Copy): string {
  const numbered =
    speech.phase === "TEAM_BUILDING" || speech.phase === "PROPOSAL_DISCUSSION";
  return numbered ? c.speeches.attempt(speech.attempt + 1) : "";
}

/**
 * 发言原样输出，不加工也不改写——加工过的转述会让模型对不上号。
 *
 * 【自己那几条要标出来】几十行清一色 `座位 N：`，而"你是座位几"只在【你的身份】里
 * 说过一次，隔着整份 prompt。真跑出来的症状是**模型跟着满场一起怀疑自己**：
 * seed 52848 那局的莫甘娜（座位 0）从第 2 轮起就在用第三人称追问"座0，你刚才说……"，
 * 到刺杀阶段直接说"我现在最怀疑的是座0"，全场的刀最后就递到了她自己头上。
 *
 * 【刺杀阶段不渲染轮次】任务已经打完了，"第 3 轮 刺杀"只会让模型分神——
 * 与 situationSection 里"刺杀阶段不报队长和队伍规模"是同一条口径。
 */
function speechLine(speech: Speech, selfId: PlayerId, copy: Copy): string {
  const { c } = copy;
  const round = speech.phase === "ASSASSINATION" ? "" : c.nth(speech.missionIndex);
  const seatText = c.seat(speech.playerId);
  const who = speech.playerId === selfId ? c.selfMark(seatText) : seatText;
  return c.speeches.line(
    round,
    attemptLabel(speech, copy),
    c.phase[speech.phase],
    who,
    speech.content,
  );
}

function speechSection(view: PlayerView, copy: Copy): string {
  if (view.speeches.length === 0) {
    return section(copy, "speeches", copy.c.speeches.empty);
  }
  return section(
    copy,
    "speeches",
    view.speeches.map((speech) => speechLine(speech, view.selfId, copy)).join("\n"),
  );
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
function perspectiveSection(view: PlayerView, copy: Copy): string | null {
  const { c } = copy;
  const hints = buildPerspective(view, c);
  if (hints.length === 0) return null;
  return section(
    copy,
    "perspective",
    [c.perspective.lead, ...hints.map((hint) => c.perspective.item(hint))].join("\n"),
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
function speakOrderLines(view: PlayerView, { c }: Copy): string[] {
  const { speakingOrder, progress } = view;
  if (speakingOrder.length === 0) return [];

  const spoken = speakingOrder.slice(0, progress.submitted);
  const pending = speakingOrder.slice(progress.submitted + 1);
  const lines = [
    c.decision.speakOrder.position(progress.submitted + 1, progress.required),
  ];

  if (spoken.length === 0) {
    lines.push(c.decision.speakOrder.first);
  } else {
    lines.push(c.decision.speakOrder.spoken(c.seatList(spoken), c.seatList(pending)));
  }
  if (pending.length === 0 && spoken.length > 0) {
    lines.push(c.decision.speakOrder.last);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 刺杀环节
//
// 两局真实对局走到刺杀，两局的刺客都刺了**自己的队友**，白送掉已经到手的胜局。
// 引擎侧的主因（推测发言进不了视角）在 phases/assassination.ts 修掉了；
// 语料侧补的那两句（merlinIsGood / whatMerlinLooksLike）在 prompt-copy 里：
// 模型知道"座位 X 是坏人"，却没人告诉它"所以 X 不可能是梅林"。
// 知识在【你知道的】段，决策在几百字之外，中间隔着几十条发言——
// 与当初"好人试图打失败票"完全同型，解法也照搬：**在模型最后读到的地方再钉一次**。
// ---------------------------------------------------------------------------

/**
 * 已知坏人 + 自己，从 **view.knowledge** 推出来。
 *
 * 【只能用 view.knowledge，绝不能用 roleComposition 或任何"本局坏人是谁"的全局信息】
 * 刺客的 knowledge 里没有奥伯伦（rules.md §3.3 的双向盲区），所以奥伯伦**照样会出现在
 * 可考虑的目标里**——那是正确的游戏后果，不是要修的 bug。拿全局坏人名单去算，
 * 等于让刺客凭空认出奥伯伦，那是一次货真价实的信息泄漏。
 */
function knownEvilSeats(view: PlayerView): PlayerId[] {
  return view.knowledge.flatMap((item) => (item.kind === "IS_EVIL" ? [item.playerId] : []));
}

/** 推测阶段用：一句话说清哪些人不用再猜了 */
function excludedLine(view: PlayerView, { c, roles }: Copy): string {
  const evil = knownEvilSeats(view);
  const own = c.decision.opinion.ownSeat(c.seat(view.selfId));
  return evil.length === 0
    ? c.decision.opinion.excludedSelfOnly(own, roles.MERLIN.label)
    : c.decision.opinion.excluded(c.seatList(evil), own);
}

/** 刺杀阶段用：目标逐行列出并就地标注，删减一个都不行 */
function annotatedTargets(
  view: PlayerView,
  targets: readonly PlayerId[],
  { c, roles }: Copy,
): string {
  const evil = new Set(knownEvilSeats(view));
  const merlin = roles.MERLIN.label;
  return targets
    .map((id) => {
      const seatText = c.seat(id);
      if (id === view.selfId) return c.decision.assassination.targetSelf(seatText, merlin);
      if (evil.has(id)) return c.decision.assassination.targetKnownEvil(seatText, merlin);
      return c.decision.assassination.targetPlain(seatText);
    })
    .join("\n");
}

/**
 * 合法选项一律从 req.legalActions 渲染，绝不自己推。
 *
 * 最要紧的是任务票那一条：好人的候选列表里根本没有"失败"，
 * prompt 就不该提它的存在——提了等于教模型去试一个必然被引擎拒绝的动作。
 */
function decisionSection(req: AnyRequest, copy: Copy): string {
  const { c, roles } = copy;
  const { view, legalActions } = req;
  const d = c.decision;

  switch (req.kind) {
    case "TEAM_PROPOSAL":
      return section(
        copy,
        "decision",
        [
          d.team.lead(view.currentMission.teamSize, c.nth(view.missionIndex)),
          d.team.candidates(c.seatList(view.players.map((p) => p.id))),
          d.team.noDuplicate,
          d.team.reviewHistory(refTo(copy, "history")),
          d.team.statement(c.speechLength),
          d.team.statementIsSpeech,
          c.publicSpeechRules,
        ].join("\n"),
      );

    case "SPEECH":
      return section(
        copy,
        "decision",
        [
          view.phase === "PROPOSAL_DISCUSSION" ? d.speech.proposal : d.speech.review,
          ...speakOrderLines(view, copy),
          d.speech.requirement(c.speechLength),
          d.speech.freedom,
          c.publicSpeechRules,
        ].join("\n"),
      );

    case "VOTE": {
      const options = actionsOfType(legalActions, "CAST_VOTE").map((action) =>
        action.approve ? d.vote.approve : d.vote.reject,
      );
      return section(
        copy,
        "decision",
        [
          d.vote.lead(c.seatList(view.proposedTeam ?? [])),
          d.vote.reviewHistory(refTo(copy, "history")),
          d.vote.options(options),
          d.vote.rule,
        ].join("\n"),
      );
    }

    case "MISSION_CARD": {
      const options = actionsOfType(legalActions, "CAST_MISSION_CARD").map((action) =>
        action.success ? d.mission.success : d.mission.fail,
      );
      const lines = [d.mission.lead, d.mission.options(options)];
      // 好人只有一个选项。说明白"这是你唯一的选项"，比让模型自己发现要省一次无效尝试。
      // 首次真实对局里好人仍然试了 4 次失败票，所以这里连"填了会怎样"一起写死
      if (options.length === 1) {
        lines.push(d.mission.onlyOption, d.mission.cannotFail);
      }
      return section(copy, "decision", lines.join("\n"));
    }

    case "ASSASSIN_OPINION":
      return section(
        copy,
        "decision",
        [
          d.opinion.lead,
          d.opinion.ask(roles.MERLIN.label),
          c.merlinIsGood(roles.MERLIN.label),
          excludedLine(view, copy),
          c.whatMerlinLooksLike,
          d.speech.requirement(c.speechLength),
        ].join("\n"),
      );

    case "ASSASSINATION": {
      const targets = actionsOfType(legalActions, "ASSASSINATE").map((a) => a.targetId);
      return section(
        copy,
        "decision",
        [
          d.assassination.lead(roles.MERLIN.label),
          c.merlinIsGood(roles.MERLIN.label),
          // 目标逐个列全并就地标注，**不做删减**：legalActions 是合法性的唯一权威
          // （与本文件"合法选项一律从 legalActions 渲染"同源）。规则允许刺任何人，
          // 刺错是策略失误不是非法操作，引擎不该替刺客把队友摘掉
          d.assassination.targets(annotatedTargets(view, targets, copy)),
          c.whatMerlinLooksLike,
        ].join("\n"),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 输出格式
// ---------------------------------------------------------------------------

function outputSection(req: AnyRequest, copy: Copy): string {
  const { c } = copy;
  const extra =
    req.kind === "SPEECH" || req.kind === "ASSASSIN_OPINION" ? c.output.suspicions : "";

  /**
   * 只有一个合法值的字段，在**最后读到的这一段**再钉一次。
   *
   * 值从 legalActions 里取，不写死 true：这样"好人只能出成功"这条规则仍然只由
   * legal.ts 说了算，prompt 只是把它复述出来（与本文件"合法选项一律从 legalActions 渲染"同源）。
   */
  const cards =
    req.kind === "MISSION_CARD"
      ? actionsOfType(req.legalActions, "CAST_MISSION_CARD")
      : [];
  const only = cards.length === 1 ? cards[0] : undefined;
  const forced = only ? c.output.forcedSuccess(only.success) : "";

  /**
   * 刺杀的排除项在这里再钉一次，理由与上面那条完全相同——
   * 【本次决策】说过一遍还不够，两局真实对局里刺客都刺了自己的队友。
   *
   * 座位号同样取自 view.knowledge，不是写死的名单（见 knownEvilSeats 的注释）。
   */
  const banned =
    req.kind === "ASSASSINATION"
      ? [...knownEvilSeats(req.view), req.view.selfId].sort((a, b) => a - b)
      : [];
  // 【这句话里不能出现角色名】"不在干净段里泄漏身份"那条测试把【输出格式】划进了干净段，
  // 写"不可能是梅林"会当场炸 8 条。那条断言钝得有道理——**它不该为一句措辞让路**，
  // 而这里不提角色名一样说得清楚
  const noSelfHit = banned.length > 0 ? c.output.bannedTargets(c.seatList(banned)) : "";

  return section(
    copy,
    "output",
    `${c.output.lead(c.outputExamples[req.kind])}\n${c.reasoningLength}${extra}${forced}${noSelfHit}`,
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
 *
 * 【语言只在这一行查一次表】下面每个 section 函数都收同一个 copy，
 * 内部**一个 `if (locale === ...)` 都没有**——两种语言走的是同一条代码路径，
 * 只是查了不同的表。哪天英文那份出了问题，问题只会在 prompt-copy.en.ts 里。
 */
export function buildPrompt<K extends AiDecisionKind>(req: AiDecisionRequest<K>): string {
  const copy = copyOf(req);
  const { view } = req;
  return [
    rulesSection(view, copy),
    setupSection(view, copy),
    identitySection(view, copy),
    knowledgeSection(view, copy),
    personaSection(req.persona, copy),
    situationSection(view, copy),
    historySection(view, copy),
    speechSection(view, copy),
    // 没有角度可给时整段消失，所以这里要过滤掉 null
    perspectiveSection(view, copy),
    decisionSection(req, copy),
    outputSection(req, copy),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");
}
