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
import { toDisplaySeatNumber } from "@/lib/seat-number";

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
    toggleTheme: "Toggle theme",
  },

  roles: R,

  seat: {
    short: (id) => `Seat ${toDisplaySeatNumber(id)}`,
    named: (id, name) => `Seat ${toDisplaySeatNumber(id)} (${name})`,
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

  tutorial: {
    trigger: "Guide",
    triggerAria: "Open the beginner guide",
    title: "Avalon, from the table up",
    description: "Four steps through the game flow and what each role can actually see.",
    stepsLabel: "Guide steps",
    closeAria: "Close the guide",
    previous: "Previous",
    next: "Next",
    finish: "Done",
    progress: (current, total) => `${current} / ${total}`,
    stepAria: (step, total, title) => `Step ${step} of ${total}: ${title}`,

    steps: {
      goal: {
        tab: "Winning",
        eyebrow: "Start at the finish",
        title: "Three missions are only Good's first gate",
        intro:
          "The mission score is not the whole game. Whether Merlin stays hidden to the end decides if Good's three points count.",
        goodTitle: "Good",
        goodBody:
          "Complete 3 missions, then keep Merlin out of the Assassin's final pick. Good must do both to win.",
        evilTitle: "Evil",
        evilBody:
          "Sabotage 3 missions, hit the rejection limit in one mission round, or name Merlin at the end. Any one route wins.",
        note:
          "So when Good reaches 3 points first, the game does not end — one final strike is still on the table.",
      },

      proposal: {
        tab: "Teams",
        eyebrow: "The first half of a mission round",
        title: "The whole table must clear the team",
        intro:
          "Every round begins by deciding who goes on the mission. The Leader names a team, but cannot send it alone.",
        leaderTitle: "The Leader picks",
        leaderBody:
          "Pick the required number of players. The Leader may include themselves or stay off the team.",
        discussTitle: "The table talks",
        discussBody:
          "The Leader explains the team, then everyone else gets a turn to support it, challenge it, or defend themselves.",
        voteTitle: "Everyone votes in public",
        voteBody:
          "All players approve or reject at the same time. Approval must be a strict majority; a tie rejects.",
        note:
          "Leadership advances after every proposal, passed or not. A rejection restarts team building for the same mission; reaching that round's rejection limit gives Evil the game.",
      },

      mission: {
        tab: "Mission",
        eyebrow: "After a team passes",
        title: "Mission cards reveal a count, never a name",
        intro:
          "Only team members submit mission cards. The result shows how many succeeded and failed, but never who played each card.",
        goodTitle: "Good can only succeed",
        goodBody:
          "Success is Good's only legal choice. The interface is not hiding another button; the rules do not allow a fail card.",
        evilTitle: "Evil can blend in",
        evilBody:
          "Evil may fail the mission or play success to stay hidden. A successful mission does not prove the team was all Good.",
        threshold:
          "Usually 1 fail card defeats a mission. With 7 or more players, Mission 4 needs 2. A single fail there still proves at least one Evil player was on the team, even if the mission succeeds.",
        assassinationTitle: "After three successes: assassination",
        assassinationBody:
          "After the third success, nobody speaks again: the Assassin immediately names one player. A hit steals the game; a miss finally gives Good the win.",
      },

      roles: {
        tab: "Sight",
        eyebrow: "Role sight lab",
        title: "Change roles and the whole table changes",
        intro:
          "Choose any role below to see the real restricted view they receive at the start. The ability and every knowledge line are shared with the live game.",
        pickerLabel: "Choose a role to inspect",
        sampleNote:
          "This is a separate ten-player sample table. It never reads or changes the game in progress.",
      },
    },
  },

  thinking: {
    // 接在座位名后面：「Seat 3 (Ann) is picking a team…」
    kind: {
      TEAM_PROPOSAL: "picking a team",
      SPEECH: "thinking of what to say",
      VOTE: "deciding how to vote",
      MISSION_CARD: "deciding this card",
      ASSASSINATION: "deciding who to strike",
    },
    seconds: (n) => `(${n}s)`,
  },

  spectator: {
    introTitle: "This table is all AI",
    introNote:
      "Roles are already dealt, but every card starts face down. Flip whoever you " +
      "want, whenever you want — and flip them back.",
    start: "Start watching",
    badge: "Watching",
    exit: "Stop watching",

    deckTitle: "Identities",
    faceDown: "Face down",
    faceDownHint: "Tap to reveal",
    flipAria: (id) => `Reveal the identity of Seat ${toDisplaySeatNumber(id)}`,
    hideAria: (id) => `Hide the identity of Seat ${toDisplaySeatNumber(id)}`,
    revealAll: "Reveal all",
    hideAll: "Hide all",
    revealedCount: (n, total) => `${n} of ${total} revealed`,

    pauseField: "Pace",
    pause: "Pause",
    resume: "Resume",
    paused: "Paused",
    pace: {
      slow: "Slow",
      normal: "Normal",
      fast: "Fast",
      instant: "Instant",
    },

    mindsTitle: "What the AI is thinking",
    mindsExpand: "Show",
    mindsCollapse: "Hide",
    mindsSpoilerNote:
      "This is the model's private reasoning, and it spoils — including what it " +
      "believes about everyone else.",
    mindsEmpty: "Reveal an identity and that seat's reasoning shows up here.",
    mindsWaiting: "Nothing to show yet.",
    mindsAuto: "model not called",
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
      TEAM_VOTE: "vote",
      MISSION_EXECUTION: "play a mission card",
      ASSASSINATION: "decide",
    },
    /** 量词在英文里后置，见 progress() */
    counter: {
      ROLE_REVEAL: "confirmed",
      PROPOSAL_DISCUSSION: "have spoken",
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
    seatLine: (count, id) => `${count} players · you are Seat ${toDisplaySeatNumber(id)}`,
    start: "Got it, begin",
    tapToReveal: "Tap to see your role",
    flipToFront: "Reveal your role",
    flipToBack: "Turn the card back over",
    knowledgeTitle: "What you know",
  },

  feed: {
    groupProposal: (round, attempt) => `Mission ${round} · proposal ${attempt}`,

    title: "Speeches",
    empty: "Nobody has spoken yet.",
    silent: SILENT,
    kind: { proposal: "team pitch" },
    speaker: (id, name) => `Seat ${toDisplaySeatNumber(id)} · ${name}`,
  },

  vote: {
    title: "Team vote",
    approved: "approved",
    rejected: "rejected",
    forcedNote: "last attempt — no vote was held",
    tally: (approve, reject) => `${approve} approve / ${reject} reject`,
    approveLabel: "Approve",
    rejectLabel: "Reject",
    nobody: "nobody",
    cardAria: (outcome, detail, approve, reject) =>
      `Team vote ${outcome}, ${detail}. Approved by: ${approve}. Rejected by: ${reject}.`,

    matrixTitle: "Vote record",
    resultCol: "Result",
    matrixHint: "A shaded cell means that seat was on the team; ◆ marks the Leader.",
    matrixEmpty: "No team vote has been settled yet.",
    rowLabel: (round, attempt) => `${round}-${attempt}`,
    rowAria: (label, outcome, detail) => `Proposal ${label}, ${outcome}, ${detail}`,
    cellAria: (seat, vote, onTeam) =>
      `${seat} ${vote}${onTeam ? ", was on the team" : ""}`,
    cellNone: "did not vote",
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
    pickOnTable: "Pick players on the round table to the left, then confirm here.",

    team: {
      title: "You are the Leader this round",
      hint: (teamSize, round) =>
        `Pick ${teamSize} players for Mission ${round}. You may pick yourself.`,
      statementHint:
        "This doubles as your speech in this round's team talk — once you submit the " +
        "team, the discussion will not come back to you.",
      placeholder: "Why these players?",
    },

    speech: {
      title: "Your turn to speak",
      hintProposal: "Take a position on this team: should it go, and why.",
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
    confirm: (id, name) => `It is them: Seat ${toDisplaySeatNumber(id)} (${name})`,
    yourself: "yourself",

    pickOne: "Pick one player",
    pickOnTable: "Pick a target on the round table to the left, then confirm here.",
    targetPreview: "Strike target",
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
      ASSASSINATION: "Assassination",
    },
    hit: `The strike found ${R.MERLIN.label}`,
    miss: "The strike missed",
    unknownRole: "Role unknown",
    noMerlin: `There is no ${R.MERLIN.label} this game`,
    merlinIs: (who) => `${R.MERLIN.label} was ${who}`,
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
    spectated: "You only watched this one.",
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
    reviewTitle: "Game replay",
    reviewNote:
      "Under each line is what that player was actually thinking when they said it. Nobody can see any of this while the game is running.",
    mindLabel: "Reasoning",
    tailTitle: "Other reasoning this round (votes / mission cards / assassination)",
    tailCount: (n) => `${plural(n, "1 decision", `${n} decisions`)} · open`,
  },

  actionProblem: {
    WRONG_ACTION: (p) => `You cannot ${p.got} right now. Available: ${p.allowed.join(" / ")}`,
    SYSTEM_ACTION: (p) => `${p.got} is not something the interface submits`,
    NOT_YOUR_SEAT: (p) => `You cannot act for Seat ${toDisplaySeatNumber(p.seat)}`,
    TEAM_SIZE: (p) => `This mission needs ${p.need} players; you picked ${p.got}`,
    TEAM_DUPLICATE: () => "The same seat is on the team twice",
    SEAT_MISSING: (p) => `Seat ${toDisplaySeatNumber(p.seat)} does not exist`,
    VOTE_NOT_OFFERED: () => "That vote is not one of your options",
    GOOD_CANNOT_FAIL: () => "Your side cannot play a fail card",
    BAD_TARGET: (p) => `Seat ${toDisplaySeatNumber(p.seat)} is not a legal target`,
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
    spectateHint:
      "Leave every seat empty and the whole table is AI — you just watch. Identities " +
      "start face down; flip any of them whenever you like.",
    spectateCostNote:
      "Every turn of a spectated game calls the model, roughly 60–116 calls a game, " +
      "with no human turn to slow it down. Watch your spend in remote mode.",
    standUp: "Stand up and watch",
    sitDown: "Sit back down",
    personaField: "AI personas",
    personaNote:
      "Assign any AI seat yourself. Seats left on Random are filled from the remaining roster when the game starts.",
    personaCount: (selected, total) => `${selected}/${total} assigned`,
    personaClearAll: "Make all random",
    personaSeat: (id) => `Seat ${toDisplaySeatNumber(id)} AI`,
    personaRandom: "Random assignment",
    personaRandomNote:
      "Drawn from unused personas when the game starts, with no duplicates at the table.",
    personaChooseAria: (id, name) =>
      `Seat ${toDisplaySeatNumber(id)} AI, current persona: ${name}`,
    personaDialogTitle: (id) => `Choose a persona for Seat ${toDisplaySeatNumber(id)}`,
    personaDialogDescription:
      "The roster controls the AI's name, voice, and habits of thought. It never reveals or changes their hidden role.",
    personaCloseAria: "Close persona roster",
    personaSearchAria: "Search personas",
    personaSearchPlaceholder: "Search names, traits, speaking styles, or reasoning…",
    personaEmpty: "No personas match that search.",
    personaUsedBy: (id) => `Used by Seat ${toDisplaySeatNumber(id)}`,
    personaReasoning: "Notices first: ",
    submit: "Take the seat",
    spectate: "Start watching",
    seatAriaSelf: (id) => `Your seat, Seat ${toDisplaySeatNumber(id)}`,
    seatAria: (id) => `Seat ${toDisplaySeatNumber(id)}`,
    goodCount: (n) => `Good ${n}`,
    evilCount: (n) => `Evil ${n}`,
    seatHintIdle: "Tap any seat to sit down, or just start watching",
    seatHintSeated: (id) =>
      `Tap to take a seat · you are Seat ${toDisplaySeatNumber(id)} · tap again to stand up`,
    missionsNote: "The number is how many players go on that mission.",
    doubleFailNote: "The mission marked ✳ needs 2 fail cards to fail.",
  },
};
