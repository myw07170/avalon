/**
 * 英文文案目录。
 *
 * 【`: Messages` 这个标注是整套 i18n 的主探测器】漏译在这里不是"运行期回退成
 * 键名"，而是 `pnpm typecheck` 直接失败。别把它改成 `satisfies` —— satisfies
 * 会允许多出来的键，而多出来的键意味着 zh 那边删过东西没同步。
 *
 * 【翻的是意思不是词】几条值得说明的取舍：
 * - 用阿瓦隆通行的英文术语（Leader / Approve / Reject / fail card），
 *   玩过实体版的人应该一眼认得出来。
 * - 句子顺序不必与中文一致。`table.progress` 在中文里是「已投 3 / 7」，
 *   英文里量词后置读着才顺，所以那个函数在这里把参数换了个位置——
 *   **这正是"文案是函数"而不是 ICU 字符串的好处**。
 * - 单复数走 `plural()`。中文只有一个复数类别，所以 zh 那份看不到它。
 */
import { plural } from "./plural";
import type { Messages } from "./messages.zh";
import { ROLE_TEXT } from "./roles";
import type { Phase, Role } from "@/lib/game/types";

const R = ROLE_TEXT.en;

const roleLabel = (role: Role | undefined): string => (role ? R[role].label : "?");

const PHASE: Record<Phase, string> = {
  SETUP: "Setup",
  ROLE_REVEAL: "Roles",
  TEAM_BUILDING: "Team Building",
  PROPOSAL_DISCUSSION: "Proposal Talk",
  TEAM_VOTE: "Team Vote",
  MISSION_EXECUTION: "Mission",
  MISSION_RESULT: "Mission Result",
  REVIEW_DISCUSSION: "Review",
  ASSASSINATION: "Assassination",
  GAME_OVER: "Game Over",
};

const SKIP_LABEL = "Say nothing";
const SILENT = "(said nothing)";

/** 「2 fail cards」/「1 fail card」。四处用到，提出来免得各写各的 */
const failCards = (n: number) => plural(n, "1 fail card", `${n} fail cards`);

export const en: Messages = {
  app: {
    title: "Avalon",
    tagline: "One player. A table of talking AIs.",
    localeShort: "EN",
    switchTo: "Switch to English",
  },

  roles: R,

  seat: {
    short: (id) => `Seat ${id}`,
    named: (id, name) => `Seat ${id} (${name})`,
    withYou: (base) => `${base} (you)`,
    you: "you",
    leader: "Leader",
  },

  team: {
    label: { GOOD: "Good", EVIL: "Evil" },
  },

  common: {
    round: (n) => `Mission ${n}`,
  },

  shell: {
    restart: "Restart",
  },

  thinking: {
    // 接在座位名后面：「Seat 3 (Ann) is picking a team…」
    kind: {
      TEAM_PROPOSAL: "picking a team",
      SPEECH: "thinking of what to say",
      VOTE: "deciding how to vote",
      MISSION_CARD: "deciding this card",
      ASSASSIN_OPINION: "working out a read",
      ASSASSINATION: "deciding who to strike",
    },
    seconds: (n) => `(${n}s)`,
  },

  track: {
    fail: (failCount) => `Failed · ${plural(failCount, "1 fail", `${failCount} fails`)}`,
    successWithFails: (failCount) =>
      `Succeeded · ${plural(failCount, "1 fail", `${failCount} fails`)}`,
    success: "Succeeded",
    inProgress: "In progress",
    attempt: (n) => `Proposal ${n}`,
    rejectWarning: "One more rejection and Evil wins outright.",

    title: "Missions",
    score: (good, evil, toWin) => `Good ${good} · Evil ${evil} · first to ${toWin}`,
    good: (n) => `Good ${n}`,
    evil: (n) => `Evil ${n}`,
    toWin: (n) => `first to ${n}`,
    notStarted: "not started",
    nodeAria: (label, teamSize, doubleFail, detail) =>
      `${label}, ${teamSize} on the team` +
      `${doubleFail ? ", needs 2 fail cards to fail" : ""}, ${detail}`,
    rejects: "Rejected this round",
    rejectsAria: (count, max) =>
      `Rejected ${plural(count, "once", `${count} times`)} in a row this round, limit ${max}`,
  },

  table: {
    phase: PHASE,
    /** 全部是不带人称的不定式：「your turn to vote」与「waiting for Seat 3 to vote」共用 */
    verb: {
      ROLE_REVEAL: "confirm",
      TEAM_BUILDING: "propose a team",
      PROPOSAL_DISCUSSION: "speak",
      REVIEW_DISCUSSION: "speak",
      TEAM_VOTE: "vote",
      MISSION_EXECUTION: "play a mission card",
      ASSASSINATION: "decide",
    },
    /** 量词在英文里后置，见 progress() */
    counter: {
      ROLE_REVEAL: "confirmed",
      PROPOSAL_DISCUSSION: "have spoken",
      REVIEW_DISCUSSION: "have spoken",
      TEAM_VOTE: "voted",
      MISSION_EXECUTION: "cards in",
    },
    gameOver: "The game is over.",
    settling: "Resolving…",
    yourTurn: (verb) => `Your turn to ${verb}.`,
    waitingOne: (who, verb) => `Waiting for ${who} to ${verb}.`,
    waitingMany: (count, verb, includesYou) =>
      `Waiting for ${count} players to ${verb}${includesYou ? ", you included" : ""}.`,
    // 中文是「已投 3 / 7」，英文是「3 / 7 voted」——同一个函数，不同的语序
    progress: (counter, submitted, required) => `${submitted} / ${required} ${counter}`,
    roundLabel: (round, rejectCount, maxRejects) =>
      `Mission ${round} · rejected ${rejectCount} / ${maxRejects}`,

    onTeam: "on the team",
    acting: "acting now",
    done: "submitted",
  },

  role: {
    toneLabel: {
      plain: "You do not know their role",
      self: "You",
      evil: "You know they are Evil",
      unsure: `${R.MERLIN.label} or ${R.MORGANA.label}`,
      good: "Good side",
    },
    noKnowledge: "You have no extra information at all. Deduction only.",
    isEvilLine: (who) => `${who} is Evil.`,
    merlinOrMorganaLine: (a, b) =>
      `One of ${a} and ${b} is ${R.MERLIN.label} and the other is ${R.MORGANA.label}, ` +
      `but you cannot tell which is which.`,
    mordredPresent: (total, seen) =>
      `There are ${total} Evil players this game and you can see only ${seen} — ` +
      `${R.MORDRED.label} is at this table.`,
    mordredAbsent: (total) =>
      `You can see all ${total} Evil players. There is no ${R.MORDRED.label}.`,

    noSeat: "You have no seat this game; the spectator view is not built yet.",
    seatLine: (count, id) => `${count} players · you are Seat ${id}`,
    start: "Got it, begin",
    tapToReveal: "Tap to see your role",
    flipToFront: "Reveal your role",
    flipToBack: "Turn the card back over",
    knowledgeTitle: "What you know",
  },

  feed: {
    groupProposal: (round, attempt) => `Mission ${round} · proposal ${attempt}`,
    groupReview: (round) => `Mission ${round} · review`,
    groupAssassination: PHASE.ASSASSINATION,

    title: "Speeches",
    empty: "Nobody has spoken yet.",
    silent: SILENT,
    kind: { proposal: "team pitch", opinion: "strike read" },
    speaker: (id, name) => `Seat ${id} · ${name}`,
  },

  turn: {
    joinSeatParts: (parts) => parts.join(", "),
    failsNote: (failsRequired) => `This mission needs ${failCards(failsRequired)} to fail.`,

    heading: "Your turn",
    unsupported: (kind) => `This step (${kind}) has no panel yet.`,
    picked: (n, total, full) =>
      `${n} / ${total} picked${full ? " — deselect someone to swap" : ""}`,
    statementLabel: "Team pitch",
    speechLabel: "Speech",
    submitTeam: "Submit team",
    needMore: (n) => `${n} more to pick`,
    teamPreview: "This team",

    team: {
      title: "You are the Leader this round",
      hint: (teamSize, round) =>
        `Pick ${teamSize} players for Mission ${round}. You may pick yourself.`,
      statementHint:
        "This doubles as your speech in this round's team talk — once you submit the " +
        "team, the discussion will not come back to you.",
      placeholder: "Why these players?",
    },

    opinion: {
      title: "Your read before the strike",
      hint: `Say who you think ${R.MERLIN.label} is. This is public — the whole table hears it.`,
      placeholder: `Who is most likely ${R.MERLIN.label}, and why?`,
      skipLabel: SKIP_LABEL,
    },

    speech: {
      title: "Your turn to speak",
      hintReview: "The result is in. Say what you make of this round.",
      hintProposal: "Take a position on this team: should it go, and why.",
      placeholderReview: "What did this round tell you?",
      placeholderProposal: "What do you make of this team?",
      skipLabel: SKIP_LABEL,
    },

    vote: {
      title: "Vote on this team",
      hint:
        "Everyone votes at the same time. You cannot see anyone else's vote first. " +
        "Results are revealed together.",
      approve: "Approve",
      approveDetail: "Send this team on the mission",
      reject: "Reject",
      rejectDetail: "Turn the team down; leadership passes on",
      warning: (rejectCount) =>
        `This round has already been rejected ${plural(rejectCount, "once", `${rejectCount} times`)}. ` +
        `One more hits the limit and Evil wins outright.`,
    },

    mission: {
      title: (round) => `You are on Mission ${round}`,
      hint:
        "Your card is anonymous. All that becomes public is how many succeeded and how many failed.",
      success: "Success",
      successDetail: "Play a success card",
      fail: "Fail",
      failDetail: "Play a fail card",
      onlySuccessNote:
        "You are Good, so success is your only option. The engine enforces that — " +
        "the interface is not hiding a second button.",
    },

    assassination: {
      title: `Name ${R.MERLIN.label}`,
      hint:
        `Good has taken three missions. Name ${R.MERLIN.label} correctly and Evil steals the ` +
        `game; miss and Good wins. Your allies and you yourself are on the list too.`,
    },
  },

  strike: {
    riskSelf: `You cannot be ${R.MERLIN.label}. Strike yourself and Good wins outright.`,
    riskAlly: "They are your ally. Strike an ally and Good wins outright.",
    allKnown: (total) =>
      `You know all ${total} Evil players. Everyone else on this list is Good.`,
    someHidden: (total, known, unknown) =>
      `There are ${total} Evil players: you, the ${known} ${plural(known, "ally", "allies")} ` +
      `you know, and ${unknown} you cannot identify — ${R.OBERON.label} is at this table, ` +
      `and he cannot be ${R.MERLIN.label} either.`,
    pickSomeone: "Pick someone first",
    confirm: (id, name) => `It is them: Seat ${id} (${name})`,
    yourself: "yourself",

    openPanel: "Open the strike panel",
    reopenNote:
      "Close this to go back and re-read the speeches. You can reopen it any time, " +
      "and your pick is kept.",
    lastStep: "Last step",
    pickOne: "Pick one player",
    thinkAgain: "Think again",
    opinionsTitle: "The reads just now",
    allSilent: (n) =>
      `All ${n} of your allies said nothing. This one is entirely on you.`,
    silent: SILENT,
  },

  gameOver: {
    winner: (teamLabel) => `${teamLabel} wins`,
    reason: {
      THREE_MISSIONS: "Evil sabotaged three missions",
      REJECT_LIMIT: "Too many rejections in one round — Evil takes the game",
      ASSASSINATION_HIT: `Good finished three missions, but the ${R.ASSASSIN.label} found ${R.MERLIN.label}`,
      ASSASSINATION_MISS: `Good finished three missions and the ${R.ASSASSIN.label} missed ${R.MERLIN.label}`,
    },
    kind: {
      TEAM_PROPOSAL: "Team",
      SPEECH: "Speech",
      VOTE: "Vote",
      MISSION_CARD: "Mission card",
      ASSASSIN_OPINION: "Strike read",
      ASSASSINATION: "Assassination",
    },
    hit: `The strike found ${R.MERLIN.label}`,
    miss: "The strike missed",
    unknownRole: "Role unknown",
    noMerlin: `There is no ${R.MERLIN.label} this game`,
    merlinIs: (who) => `${R.MERLIN.label} was ${who}`,
    silent: SILENT,
    missionSuccess: "Succeeded",
    missionSuccessWithFails: (failCount) => `Succeeded · ${failCards(failCount)}`,
    missionFail: (failCount) => `Failed · ${failCards(failCount)}`,
    flagSchema: "schema fallback",
    flagRescued: "legality fallback",
    flagAuto: "no model call",

    title: "Game over",
    again: "Play again",
    noSeat: "You had no seat this game, so there is no perspective to review.",
    // 后面紧接着 youWon / youLost，所以这里用破折号收尾而不是句号
    youAre: (roleLabel) => `You were ${roleLabel} — `,
    youWon: "you won",
    youLost: "you lost",
    strikeTitle: "Assassination",
    strikeLine: (assassin, target) => `${assassin} named ${target}, who was`,
    period: ".",
    allRoles: "Every role",
    seatRole: (seat, role) => `${seat}: ${role}`,
    opinionLine: (who, content) => `${who}: ${content}`,
    failSourceTitle: "Where the fails came from",
    onTeam: (labels) => `On the mission: ${labels.join(", ")}`,
    failedBy: (labels) => `Played a fail card: ${labels.join(", ")}`,
    timingTitle: "AI thinking time",
    timingRow: (count, avg, max) =>
      `${plural(count, "1 call", `${count} calls`)} · avg ${avg} · slowest ${max}`,
    timingSummary: (asked, total, auto) =>
      `${plural(asked, "1 model call", `${asked} model calls`)}, ${total} in total; ` +
      `another ${auto} had a single legal action and skipped the model.`,
    replayTitle: "AI reasoning replay",
    replayCount: (n) => `${plural(n, "1 decision", `${n} decisions`)} · open`,
  },

  actionProblem: {
    WRONG_ACTION: (p) => `You cannot ${p.got} right now. Available: ${p.allowed.join(" / ")}`,
    SYSTEM_ACTION: (p) => `${p.got} is not something the interface submits`,
    NOT_YOUR_SEAT: (p) => `You cannot act for Seat ${p.seat}`,
    TEAM_SIZE: (p) => `This mission needs ${p.need} players; you picked ${p.got}`,
    TEAM_DUPLICATE: () => "The same seat is on the team twice",
    SEAT_MISSING: (p) => `Seat ${p.seat} does not exist`,
    VOTE_NOT_OFFERED: () => "That vote is not one of your options",
    GOOD_CANNOT_FAIL: () => "Your side cannot play a fail card",
    BAD_TARGET: (p) => `Seat ${p.seat} is not a legal target`,
    NO_GAME: () => "There is no game running",
  },

  engineError: {
    ILLEGAL_PHASE: "That is not possible in the current phase",
    NOT_YOUR_TURN: "It is not that seat's turn yet",
    INVALID_TEAM: "That team is not legal",
    DUPLICATE_SUBMISSION: "That step has already been submitted",
    GOOD_CANNOT_FAIL: "Good cannot play a fail card",
    INVALID_TARGET: "That assassination target is not legal",
    CONFIG_INVALID: "This game setup is not legal. Fix it and start again",
    INTERNAL: "The engine hit an unexpected problem and this game cannot continue",
  },

  aiError: {
    CONFIG_MISSING:
      "The server has no real model configured. Set a provider and key in .env.local, or switch to mock",
    PROVIDER_REJECTED:
      "The model service refused the call — usually the key, the model name, or the balance",
    PROVIDER_UNAVAILABLE:
      "Could not reach the model service, or it is temporarily down. Try again shortly",
    BAD_REQUEST: "The model service could not process this request; details are in the browser console",
  },

  configIssue: {
    PLAYER_COUNT_UNSUPPORTED: (p) =>
      `The player count must be a whole number from ${p.min} to ${p.max}; it is ${p.playerCount}`,
    ROLE_COUNT_MISMATCH: (p) =>
      `${p.roleCount} roles for ${p.playerCount} players — those have to match`,
    TEAM_SPLIT_MISMATCH: (p) =>
      `A ${p.playerCount}-player game needs ${p.expectedGood} Good and ${p.expectedEvil} Evil; ` +
      `this is ${p.good} Good and ${p.evil} Evil`,
    ROLE_BOUND_VIOLATION: (p) =>
      p.min === p.max
        ? `There must be exactly ${p.min} ${roleLabel(p.role)}; there ${p.n === 1 ? "is" : "are"} ${p.n}`
        : `${roleLabel(p.role)} must be between ${p.min} and ${p.max}; there ${p.n === 1 ? "is" : "are"} ${p.n}`,
    MISSION_TABLE_MISMATCH: (p) =>
      `The mission setup does not match the rules table for ${p.playerCount} players`,
    BELOW_RECOMMENDED_COUNT: (p) =>
      `${roleLabel(p.role)} is recommended for ${p.recommended} players and up; this game has ${p.playerCount}`,
  },

  setup: {
    playerCount: "Players",
    freeEvilSlots: (n) => `Free Evil slots: ${n}`,
    freeEvilAria: "Free Evil slots",
    fixedEvil:
      `At this player count the composition is fixed: Evil is always ` +
      `${R.MORGANA.label} and the ${R.ASSASSIN.label}.`,
    rolesField: "Roles this game",
    missionsField: "Missions",
    modelField: "Model",
    modelNote:
      "mock makes no network calls and costs nothing. remote goes through /api/ai and " +
      "needs a provider and key set in .env.local.",
    // 【issue.message 目前仍是中文】阶段 3 会把 ConfigIssue 换成 code + params，
    // 那之后这个参数才真的是本地化过的
    balanceNote: (message) => `${message}. This is a balance suggestion, not a blocker.`,
    pickSeatFirst:
      "Pick a seat first. The engine already supports all-AI spectator games, but the " +
      "spectator view is not built yet.",
    busy: "Generating characters…",
    submit: "Take the seat",
    seatAriaSelf: (id) => `Your seat, Seat ${id}`,
    seatAria: (id) => `Seat ${id}`,
    goodCount: (n) => `Good ${n}`,
    evilCount: (n) => `Evil ${n}`,
    seatHintIdle: "Tap to take a seat",
    seatHintSeated: (id) =>
      `Tap to take a seat · you are Seat ${id} · tap again to stand up`,
    missionsNote: "The number is how many players go on that mission.",
    doubleFailNote: "The mission marked ✳ needs 2 fail cards to fail.",
  },
};
