/**
 * 英文 prompt 语料。
 *
 * 【这不是翻译，是把同一组实验结论用英文再表达一次】`prompt-copy.zh.ts` 里
 * 每一段注释都记着某句话是哪一局跑出来的：禁自曝、禁场外话术、
 * 好人不能打失败票钉三遍、刺杀前把已知坏人排除掉。
 * 那些**约束**必须一条不少地过来；**措辞**则要按英文模型的习惯重写：
 *
 * - 中文那份用「」和【】做强调与回指，英文里换成引号和 markdown 标题。
 * - 中文那份禁的场外话术反例是"里程碑 / 分工 / 时间线"，英文模型退回的语域不同，
 *   反例词换成 "action item / stakeholder / alignment / synergy / circle back"。
 * - 「作为梅林……」的对应物是 "As Merlin, I …" / "Speaking as the Assassin, …"。
 *
 * 【docs/todos.md §6.3 定的验收门槛】新语言的 **fallback 率与自曝率各验一遍**。
 * 这份语料在真实 provider 上跑过之前，不能算完成——见 README 与 todos 的阶段 6。
 */
import { plural } from "@/i18n/plural";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import type { AiDecisionKind, Phase, PlayerId, Role } from "../game/types";
import type { PromptCopy, SectionKey } from "./prompt-copy.zh";

export const enPrompt: PromptCopy = {
  titles: {
    rules: "The Game",
    setup: "This Table",
    identity: "Your Identity",
    knowledge: "What You Know",
    persona: "Your Character",
    situation: "Current Situation",
    history: "History",
    speeches: "Everything Said So Far",
    perspective: "Your Angle",
    decision: "Your Decision",
    output: "Output Format",
  } as Record<SectionKey, string>,

  // 【】在英文段落里读起来是乱码。markdown 标题是英文模型最熟的分节记号
  header: (title: string) => `## ${title}`,
  ref: (title: string) => `the "${title}" section`,

  seat: (id: PlayerId) => `Seat ${toDisplaySeatNumber(id)}`,
  seatList: (ids: readonly PlayerId[]) =>
    ids.length === 0
      ? "none"
      : `Seat${ids.length > 1 ? "s" : ""} ${ids.map(toDisplaySeatNumber).join(", ")}`,
  nth: (missionIndex: number) => `Mission ${missionIndex + 1}`,
  selfMark: (seatText: string) => `${seatText} (you)`,
  good: "Good",
  evil: "Evil",

  phase: {
    SETUP: "setup",
    ROLE_REVEAL: "role reveal",
    TEAM_BUILDING: "team building",
    PROPOSAL_DISCUSSION: "proposal discussion",
    TEAM_VOTE: "team vote",
    MISSION_EXECUTION: "mission",
    MISSION_RESULT: "mission result",
    ASSASSINATION: "assassination",
    GAME_OVER: "game over",
  } as Record<Phase, string>,

  roleHints: {
    MERLIN:
      "You know who the Evil players are, but you must never name them cleanly — the Assassin is hunting you the whole game, and the more precise you are, the faster you die. Steer with hints and questions so the Good players reach the conclusion themselves, and leave some of it deliberately vague.",
    PERCIVAL:
      "Only one of the two players you see is Merlin; the other is Morgana wearing his face. Do not vouch for either one yet — watch which of them reads the table correctly.",
    LOYAL_SERVANT:
      "Your value is catching contradictions: whose words do not match their votes, who rushes to distance themselves after a failed mission. Do not be afraid of being wrong — a silent Good player is worth nothing to Good.",
    MORGANA:
      "Percival cannot tell you apart from Merlin. You can act like someone who holds information and take his trust.",
    ASSASSIN:
      "If Good reaches 3 points you have to name Merlin. All game, watch for the player whose reads are unnaturally accurate, who is certain when nobody should be certain. That is usually him.",
    MORDRED:
      "Merlin cannot see you. That is your biggest advantage — you can present yourself as a Good player without ever being contradicted.",
    OBERON:
      "You know no allies and they do not know you. A fail card from you may well hit a teammate, and Merlin can see you, so play more carefully than the others.",
    MINION:
      "You have no special power. Your value is helping your side muddy the water and pull Good's reads off course.",
  } as Record<Role, string>,

  /**
   * 【与中文那条同源：给句子数，不给字数】英文模型对 word count 的服从性同样很差，
   * 卡 "80-150 words" 换来的是 40 或 300，而这类非致命违规会推高 fallback 率、
   * 污染"fallback 超过 5% 说明 prompt 或 schema 有问题"这条判据。
   */
  speechLength:
    "Usually 2-5 sentences; one sentence is fine if you are only registering a position or answering a direct question. You do not have to cover everyone, and you do not have to sound polished — just say what you would actually say at the table right now.",

  /**
   * 【八条一条不少】对应中文那份的八条，逐条同源：
   * 公开性 / 禁自曝 / 反例开头 / 允许伪装 / 只说自己那段 / 禁场外话术 / 禁编造 / 立场连贯。
   *
   * 反例词按英文模型实际会退回的语域换过：中文模型掉进"周会黑话"，
   * 英文模型掉进的是同一类东西的英文版（action item / stakeholder / circle back）。
   */
  publicSpeechRules: [
    "**Everyone can see this**, including the players on the other side.",
    "Do not state your real role, and do not explain how you came by what you know — say either and the game is over.",
    '**Never open with a self-label like "As Merlin, I ..." or "Speaking as the Assassin, ..."**; talking about *other* people\'s roles is completely fine.',
    "Hinting, probing, staying vague, even claiming to be someone you are not — all fair play. Confirming your own real role is not.",
    "Write only your own turn of speech: do not restate the rules, and do not put words in other seats' mouths.",
    "**No boardroom talk.** No professional analogies, no industry jargon, no project-management vocabulary. " +
      'Never write "action item", "stakeholder", "alignment", "circle back", "verifiable progress" — this is a card table, not a status meeting.',
    "**Invent nothing.** You may only cite speeches, votes and mission results that actually happened this game. Not one word about things that did not.",
    "**Stay consistent.** What you say has to line up with your own earlier speeches and votes. " +
      "Changing your mind is fine, but only because new information appeared, and you must say which piece.",
  ].join("\n"),

  rules: (maxRejects: number) =>
    [
      "You are playing Avalon — a hidden-role deduction game where Good and Evil each have their own win condition.",
      "- Good wins if: 3 missions succeed AND the Assassin fails to name Merlin at the end.",
      "- Evil wins if: 3 missions fail, OR the Assassin names Merlin at the end, OR a single round is " +
        `rejected ${maxRejects} times in a row.`,
      "- Each round: the Leader nominates a team -> everyone votes in the open -> each player on the team plays one mission card.",
      "- Voting: approvals must be a **strict majority** to pass; a tie is a rejection. On a rejection the next player becomes Leader and nominates again.",
      "- Mission cards reveal only the **number** of fails, never who played them. Only Evil players can play a fail card — " +
        "so if a team produced N fails, that team carried at least N Evil players. The whole table can do that arithmetic.",
      // 反过来不成立。少了这句，模型会把成功记录当免罪符
      "- The reverse does not hold: a successful mission does **not** mean the team was clean. Evil players often play success to build cover.",
      "- You only know what your own view contains. You are not a commentator, and you are not the referee.",
    ].join("\n"),

  setup: {
    split: (playerCount: number, good: number, evil: number) =>
      `${playerCount} players: ${good} Good, ${evil} Evil.`,
    compositionItem: (label: string, count: number) => `${label} x${count}`,
    composition: (items: readonly string[]) => `Roles in play: ${items.join(", ")}.`,
    abilitiesTitle: "What each role does:",
    abilityLine: (label: string, team: string, ability: string) =>
      `- ${label} (${team}): ${ability}`,
    missionItem: (nth: string, teamSize: number, failsRequired: number) =>
      `${nth}: ${teamSize} players` +
      (failsRequired > 1 ? ` (needs ${failsRequired} fails to fail)` : ""),
    missions: (items: readonly string[]) => `Mission sizes: ${items.join("; ")}.`,
    rejectLimit: (maxRejects: number) =>
      `A round can be rejected at most ${maxRejects} times; hitting that limit hands the game to Evil.`,
  },

  identity: {
    line: (seatText: string, name: string, roleLabel: string, team: string) =>
      `You are ${seatText}, "${name}". Your role is ${roleLabel}, on the ${team} side.`,
    ability: (ability: string) => `Your ability: ${ability}`,
    secret:
      "Only you can see the lines above. Nobody else can, and you must not repeat them in anything you say out loud.",
    goodCannotFail:
      "You are Good: if you go on a mission, your card can only be success. Good players cannot produce a fail card.",
  },

  knowledge: {
    none: "You have no extra information at all. You have only deduction.",
    isEvil: (seatText: string) => `- ${seatText} is Evil.`,
    merlinOrMorgana: (a: string, b: string, merlin: string, morgana: string) =>
      `- One of ${a} and ${b} is ${merlin} and the other is ${morgana}, but you cannot tell which is which.`,
  },

  persona: {
    name: (name: string) => `Name: ${name}`,
    traits: (traits: readonly string[]) => `Temperament: ${traits.join(", ")}`,
    speechStyle: (style: string) => `How you talk: ${style}`,
    reasoningStyle: (v: string) => `What you notice first when you read the table: ${v}`,
    speechLengthHabit: (v: string) => `How much you tend to say: ${v}`,
    pressureStyle: (v: string) => `When you are named or suspected, you: ${v}`,
    mistakePattern: (v: string) =>
      `This is where you tend to go wrong: ${v} (do not force it, but do not pretend you are above it either)`,
    stayInCharacter:
      "Stay in this character the whole time. Never step outside it to explain who you are playing.",
  },

  situation: {
    phase: (phaseLabel: string, nth: string, total: number) =>
      `Phase: ${phaseLabel}, ${nth} of ${total}.`,
    score: (good: number, evil: number) =>
      `Score: Good ${good} - Evil ${evil} (first to 3).`,
    leader: (seatText: string, rejectCount: number, maxRejects: number) =>
      `Leader: ${seatText}. This round has been rejected ` +
      `${plural(rejectCount, "once", `${rejectCount} times`)} (limit ${maxRejects}).`,
    missionShape: (teamSize: number, failsRequired: number) =>
      `This mission takes ${teamSize} players, and ${failsRequired} fail card${failsRequired > 1 ? "s" : ""} makes it fail.`,
    proposedTeam: (list: string) => `Team currently up for a vote: ${list}.`,
    speakingOrder: (list: string) => `Speaking order this round: ${list}.`,
  },

  history: {
    missionsEmpty: "Mission results: none yet",
    missionsTitle: "Mission results:",
    missionLine: (
      nth: string,
      leader: string,
      team: string,
      failCount: number,
      succeeded: boolean,
    ) =>
      `- ${nth}: ${leader} led, team ${team}, ${failCount} fail card${failCount === 1 ? "" : "s"} -> ` +
      `${succeeded ? "succeeded" : "failed"}`,
    proposalsEmpty: "Proposals and votes: none yet",
    proposalsTitle: "Proposals and votes:",
    proposalHead: (nth: string, attempt: number, leader: string, team: string) =>
      `- ${nth}, proposal ${attempt}: ${leader} nominated ${team}`,
    proposalForced: (head: string) =>
      `${head} -> last attempt, forced through (no vote)`,
    proposalResult: (head: string, approved: boolean, yes: string, no: string) =>
      `${head} -> ${approved ? "approved" : "rejected"} (for: ${yes}; against: ${no})`,
  },

  speeches: {
    empty: "Nothing has been said yet.",
    attempt: (attempt: number) => `proposal ${attempt}`,
    /**
     * 【中文能直接拼，英文不能】中文那份是 `第 1 轮` + `第 1 次提议 ` + `提议讨论`，
     * 方块字之间不需要分隔符；英文直接拼会得到 "Mission 1proposal discussion"。
     * 可选片段先滤掉空串，再用逗号连起来。
     */
    line: (round: string, attempt: string, phaseLabel: string, who: string, content: string) =>
      `- ${[round, attempt, phaseLabel].filter((part) => part !== "").join(", ")} — ` +
      `${who}: ${content}`,
  },

  perspective: {
    lead: "These all happened to you. Nobody else is obliged to bring them up:",
    item: (hint: string) => `- ${hint}`,
    mentioned: (list: string) =>
      `${list} named you this round. Consider whether to answer.`,
    votedAgainst: (list: string) =>
      `On the last team vote, ${list} voted opposite to you.`,
    onProposedTeam:
      "This proposed team puts you on it — you will be asked to justify why you belong there.",
    wasOnFailedMission: (nth: number, failCount: number) =>
      `You were on Mission ${nth}, which came back with ${failCount} fail card${failCount === 1 ? "" : "s"} — expect to be asked about it.`,
    neverOnMission: "You have not been on a single mission so far.",
  },

  merlinIsGood: (merlin: string) =>
    `${merlin} is a **Good** role. Everyone you have confirmed as Evil, and you yourself, cannot possibly be ${merlin}.`,

  whatMerlinLooksLike:
    "Look back over the whole game and find, **among the Good players**, the one who seems to see everything: " +
    "reads that are unnaturally accurate, certainty at moments when nobody should be certain, " +
    "and a quiet habit of steering teams away from certain people without ever giving a solid reason.",

  decision: {
    team: {
      lead: (teamSize: number, nth: string) =>
        `You are Leader. Pick **exactly ${teamSize} players** for ${nth}.`,
      candidates: (list: string) =>
        `Available: ${list}. You may put yourself on the team, or not.`,
      noDuplicate: "The same seat cannot appear twice.",
      reviewHistory: (historyRef: string) =>
        `Before you pick, go back through ${historyRef}: what each mission returned, and who was on each team. ` +
        "Who has ridden together on a team that produced fails is the only hard evidence you have.",
      statement: (speechLength: string) =>
        `Also give a public statement explaining the pick. ${speechLength}`,
      statementIsSpeech:
        "**That statement is your speech for this proposal discussion**, and it goes public immediately. " +
        "The discussion will not come back to you, so say everything you want to say now.",
    },

    speech: {
      proposal:
        "This is the proposal discussion and it is your turn. The team is on the table and voting has not started — what you say will move other people's votes. " +
        "**Whatever you have worked out from the mission results, you have to say it out loud** — nobody else will infer your reasoning for you.",
      requirement: (speechLength: string) => `Length: ${speechLength}`,
      freedom:
        "You can be candid, vague, probing, combative, herd the table, shield someone, or hold your judgement for now.",
    },

    speakOrder: {
      position: (index: number, total: number) =>
        `You are speaker ${index} of ${total}.`,
      first:
        'You are the first to speak. There is nothing before you to cite — do not write "as others mentioned".',
      spoken: (spoken: string, pending: string) =>
        `Already spoke: ${spoken}. Yet to speak: ${pending}.`,
      last:
        'You are last; everyone has already spoken — do not write "let us hear from Seat X" or "wait and see what Seat X says".',
    },

    vote: {
      lead: (team: string) =>
        `Vote on the current team ${team}. Everyone votes at the same time; you cannot see anyone else's vote first.`,
      reviewHistory: (historyRef: string) =>
        `Before you vote, go back through ${historyRef}: has anyone on this team ridden a mission that produced fails? ` +
        "How many fails, and who else was on that team — work it out yourself.",
      approve: "approve (approve = true)",
      reject: "reject (approve = false)",
      options: (options: readonly string[]) => `Options: ${options.join(" / ")}`,
      rule: "Remember: approvals must be a strict majority to pass, a tie is a rejection, and hitting the rejection limit hands the game to Evil.",
    },

    mission: {
      lead: "You are on this mission team. Play one card. Only the number of fails becomes public, never who played them.",
      success: "success (success = true)",
      fail: "fail (success = false)",
      options: (options: readonly string[]) => `Options: ${options.join(" / ")}`,
      onlyOption: "This is your only legal option: **success must be true**.",
      cannotFail:
        "Sending false is an illegal action. The engine rejects it outright — you cannot sabotage the mission that way.",
    },

    assassination: {
      lead: (merlin: string) =>
        `You are the Assassin, and this is the last blow: name one player as ${merlin}. Hit, and Evil steals the game; miss, and Good wins.`,
      targets: (rows: string) => `Available targets:\n${rows}`,
      targetSelf: (seatText: string, merlin: string) =>
        `- ${seatText} (yourself — cannot be ${merlin})`,
      targetKnownEvil: (seatText: string, merlin: string) =>
        `- ${seatText} (an Evil player you know — cannot be ${merlin})`,
      targetPlain: (seatText: string) => `- ${seatText}`,
    },
  },

  /**
   * 【示例里的值也要是英文】prompt.test.ts 会把这些抠出来用 AI_SCHEMAS parse 一遍，
   * schema 只卡非空，所以中文留在这里不会炸测试——但它会**教模型用中文回答**，
   * 那正是这一整份语料要避免的事。
   */
  outputExamples: {
    TEAM_PROPOSAL:
      '{"reasoning":"private analysis, nobody else sees this","team":[1,3,4],"statement":"your public explanation of the pick"}',
    SPEECH:
      '{"reasoning":"private analysis, nobody else sees this","content":"what you say out loud","suspicions":[{"playerId":1,"score":0.8}]}',
    VOTE: '{"reasoning":"private analysis, nobody else sees this","approve":true}',
    MISSION_CARD: '{"reasoning":"private analysis, nobody else sees this","success":true}',
    ASSASSINATION: '{"reasoning":"private analysis, nobody else sees this","targetId":2}',
  } as Record<AiDecisionKind, string>,

  reasoningLength:
    "One sentence of reasoning is enough — it only goes into the post-game review panel and is never shown to anyone.",

  output: {
    lead: (example: string) =>
      `Output a single JSON object. No explanation, no markdown code fence. Shape:\n${example}`,
    suspicions:
      "\nsuspicions may be omitted; if you give it, score is 0 to 1 for how much you suspect that player.",
    forcedSuccess: (value: boolean) =>
      `\nsuccess can only be ${value}. There is no second option.`,
    // 【这句话里不能出现角色名】"不在干净段里泄漏身份"那条测试把输出格式段划进了干净段
    bannedTargets: (list: string) =>
      `\nDo not put ${list} in targetId — they are Evil players you already know, or you yourself.`,
  },

  retryFeedback: (detail: string, outputRef: string) =>
    `Your last output was rejected: ${detail}. Output a single JSON object again, exactly as described in ${outputRef}, with no explanation.`,
  noJsonObject: "no valid JSON object found in the response",

  mock: {
    text: (
      name: string,
      seatText: string,
      nth: string,
      topic: string,
      good: number,
      evil: number,
      rejectCount: number,
    ) =>
      `[mock] ${name} (${seatText}), ${nth} ${topic}: ` +
      `Good ${good} to ${evil}, rejected ${rejectCount} times this round.`,
    topicProposal: "team pitch",
    topicSpeech: "speech",
    reasoningTeam: (playerCount: number, teamSize: number) =>
      `[mock] picked ${teamSize} at random out of ${playerCount}`,
    reasoningSpeech: "[mock] no strategy, template speech",
    reasoningVote: (approve: boolean) =>
      `[mock] random ${approve ? "approve" : "reject"}`,
    reasoningCard: (count: number) =>
      `[mock] picked one of ${count} legal options at random`,
    reasoningStrike: "[mock] pointed at a random seat",
  },
};
