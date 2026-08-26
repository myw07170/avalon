/**
 * 把若干局对局记录渲染成一个自包含的 HTML 页面。
 *
 * 【为什么不是 body 之外还带 html/head】输出刻意是**片段**：以 <title> 起头，
 * 没有 <!doctype>/<html>/<head>/<body>。浏览器会自己补齐这几层，本地双击能开；
 * 而 Artifact 发布时也是把片段塞进它自己的骨架里，带了反而会双层嵌套。
 *
 * 【数据全部内联】发布出去的页面不能发任何外部请求（字体除外）。
 */
import { ROLE_ORDER } from "../game/config";
import { ROLE_META, ROLE_TEAM, type Team } from "../game/types";
import { selfExposure, type Transcript, type TranscriptSpeech } from "./transcript";

export interface PageGame {
  /** 从 1 开始，按跑的先后 */
  index: number;
  transcript: Transcript;
}

/** 角色名 → 阵营。座位芯片的颜色靠它，不靠猜 */
const LABEL_TEAM: Record<string, Team> = Object.fromEntries(
  ROLE_ORDER.map((role) => [ROLE_META[role].label, ROLE_TEAM[role]]),
);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 把自曝的那几个字标出来，而不是整条发言涂一片。
 *
 * 先转义再打标记：角色名和"作为/我是"都是中文，转义不会动它们，
 * 所以在转义后的串上跑正则是安全的，反过来做就会把 &amp; 拆开。
 */
export function markSelfExposure(speech: Pick<TranscriptSpeech, "roleLabel" | "content">): string {
  const escaped = escapeHtml(speech.content);
  const hit = selfExposure(speech);
  if (!hit) return escaped;
  const label = speech.roleLabel;
  const pattern =
    hit.kind === "blatant"
      ? new RegExp(`(作为|我是|身为|我的角色是)\\s*${label}`, "g")
      : new RegExp(label, "g");
  return escaped.replace(pattern, (found) => `<mark class="${hit.kind}">${found}</mark>`);
}

const FLAG_LABEL = { blatant: "自曝", mention: "提到" } as const;

// ---------------------------------------------------------------------------
// 各块
// ---------------------------------------------------------------------------

const seatChip = (seat: { playerId: number; name: string; roleLabel: string }): string =>
  `<span class="chip ${LABEL_TEAM[seat.roleLabel] === "EVIL" ? "evil" : "good"}">` +
  `<b>${seat.playerId}</b>${escapeHtml(seat.roleLabel)}</span>`;

/**
 * 这条发言属于哪个环节。
 *
 * 早期三份记录里没有这个信息，`phaseLabel` 会是 undefined——那时不渲染这一格，
 * 页面照常出得来（transcript.ts 的可选捕获组同源）。
 */
function whenTag(speech: TranscriptSpeech): string {
  if (!speech.phaseLabel) return "";
  const attempt = speech.attempt === undefined ? "" : ` · 第 ${speech.attempt} 次提议`;
  return `<span class="when">${escapeHtml(speech.phaseLabel)}${attempt}</span>`;
}

function speechBlock(speech: TranscriptSpeech): string {
  const hit = selfExposure(speech);
  const team = LABEL_TEAM[speech.roleLabel] === "EVIL" ? "evil" : "good";
  const flag = hit
    ? `<span class="flag ${hit.kind}">${FLAG_LABEL[hit.kind]}</span>`
    : "";
  return `
        <article class="speech${hit ? ` flagged ${hit.kind}` : ""}">
          <div class="who ${team}">
            <span class="seatno">${speech.playerId}</span>
            <span class="role">${escapeHtml(speech.roleLabel)}</span>
            <span class="pname">${escapeHtml(speech.name)}</span>
            ${whenTag(speech)}
            ${flag}
          </div>
          <p class="said">${markSelfExposure(speech)}</p>
        </article>`;
}

function roundsBlock(speeches: TranscriptSpeech[]): string {
  const rounds = [...new Set(speeches.map((s) => s.round))].sort((a, b) => a - b);
  return rounds
    .map((round) => {
      const inRound = speeches.filter((s) => s.round === round);
      return `
      <section class="round">
        <h3 class="roundhead"><span>第 ${round} 轮</span><i></i><em>${inRound.length} 条发言</em></h3>
        ${inRound.map(speechBlock).join("")}
      </section>`;
    })
    .join("");
}

function missionsBlock(transcript: Transcript): string {
  if (transcript.missions.length === 0) return "";
  const rows = transcript.missions
    .map(
      (mission) => `
          <tr>
            <td>第 ${mission.round} 轮</td>
            <td class="num">${mission.team.join("、")}</td>
            <td class="num">${mission.failCount}</td>
            <td><span class="pill ${mission.succeeded ? "ok" : "bad"}">${
              mission.succeeded ? "成功" : "失败"
            }</span></td>
          </tr>`,
    )
    .join("");
  return `
      <section class="panel">
        <h3>任务</h3>
        <div class="scroll">
          <table>
            <thead><tr><th>轮次</th><th>队伍</th><th>失败票</th><th>结果</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
}

function assassinationBlock(transcript: Transcript): string {
  const kill = transcript.assassination;
  if (!kill) return "";
  const opinions = kill.opinions
    .map(
      (opinion) => `
        <article class="speech">
          <div class="who evil">
            <span class="seatno">${opinion.playerId}</span>
            <span class="role">${escapeHtml(opinion.roleLabel)}</span>
            <span class="pname">${escapeHtml(opinion.name)}</span>
          </div>
          <p class="said">${markSelfExposure(opinion)}</p>
        </article>`,
    )
    .join("");
  return `
      <section class="panel">
        <h3>刺杀</h3>
        ${opinions}
        <p class="verdict">
          刺客指认 ${seatChip(kill.target)}
          <span class="pill ${kill.hit ? "bad" : "ok"}">${kill.hit ? "命中" : "落空"}</span>
        </p>
      </section>`;
}

function rescuedBlock(transcript: Transcript): string {
  if (transcript.rescuedActions.length === 0) return "";
  return `
      <section class="panel">
        <h3>被拦下的非法动作</h3>
        <p class="note">形状合法但规则非法，被 orchestrator 的 assertLegal 复检换掉。左边是模型原本想做的。</p>
        <div class="scroll"><pre>${transcript.rescuedActions.map(escapeHtml).join("\n")}</pre></div>
      </section>`;
}

/**
 * 推理踩雷：模型在该推出来的时候有没有推出来。
 *
 * 与 rescuedBlock 同款——原样打印。前三份记录里没有这一段，那时不渲染这个块。
 */
function deductionBlock(transcript: Transcript): string {
  if (transcript.deductionMisses.length === 0) return "";
  return `
      <section class="panel">
        <h3>推理踩雷</h3>
        <p class="note">失败票只可能来自坏人。已经能推出必然含坏人的组合，却仍被提名的次数——这个数字是模型推理能力的证据，**它从不进 prompt**。</p>
        <div class="scroll"><pre>${transcript.deductionMisses.map(escapeHtml).join("\n")}</pre></div>
      </section>`;
}

function statsOf(transcript: Transcript): { blatant: number; mention: number } {
  let blatant = 0;
  let mention = 0;
  for (const speech of transcript.speeches) {
    const hit = selfExposure(speech);
    if (hit?.kind === "blatant") blatant += 1;
    else if (hit?.kind === "mention") mention += 1;
  }
  return { blatant, mention };
}

function tabButton(game: PageGame): string {
  const { transcript } = game;
  const { blatant } = statsOf(transcript);
  const clean = blatant === 0 && transcript.stats.rescued.count === 0;
  return `
      <button class="tab" role="tab" id="tab-${game.index}" aria-controls="game-${game.index}" aria-selected="false" data-game="${game.index}">
        <span class="tabhead">第 ${game.index} 局<em>seed ${transcript.seed}</em></span>
        <span class="tabstats">
          <span class="stat ${blatant > 0 ? "warn" : "fine"}"><b>${blatant}</b>自曝</span>
          <span class="stat ${transcript.stats.rescued.count > 0 ? "warn" : "fine"}"><b>${transcript.stats.rescued.pct}</b>兜底</span>
        </span>
        <span class="tabtag">${clean ? "干净" : "有问题"}</span>
      </button>`;
}

function gamePanel(game: PageGame): string {
  const { transcript } = game;
  const { blatant, mention } = statsOf(transcript);
  return `
    <div class="game" id="game-${game.index}" role="tabpanel" aria-labelledby="tab-${game.index}" hidden>
      <div class="meta">
        <div><span class="k">模型</span><span class="v mono">${escapeHtml(transcript.model)}</span></div>
        <div><span class="k">seed</span><span class="v mono">${transcript.seed}</span></div>
        <div><span class="k">胜负</span><span class="v">${
          transcript.stats.winner === "GOOD" ? "好人获胜" : "坏人获胜"
        } <em class="mono">${escapeHtml(transcript.stats.winReason)}</em></span></div>
        <div><span class="k">LLM 调用</span><span class="v mono">${transcript.stats.calls} 次 · 平均 ${transcript.stats.avgAttempts.toFixed(2)} 次/决策</span></div>
        <div><span class="k">schema 兜底</span><span class="v mono">${transcript.stats.fallback.count} 次 ${transcript.stats.fallback.pct}</span></div>
        <div><span class="k">合法性兜底</span><span class="v mono">${transcript.stats.rescued.count} 次 ${transcript.stats.rescued.pct}</span></div>
        <div><span class="k">自曝 / 提到</span><span class="v mono">${blatant} / ${mention} 条（共 ${transcript.speeches.length} 条发言）</span></div>
      </div>

      <div class="seats">${transcript.seats.map(seatChip).join("")}</div>

      ${roundsBlock(transcript.speeches)}
      ${missionsBlock(transcript)}
      ${assassinationBlock(transcript)}
      ${rescuedBlock(transcript)}
      ${deductionBlock(transcript)}
    </div>`;
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

const STYLE = `
:root {
  --paper: #f4f5f9;
  --surface: #ffffff;
  --sunken: #eceef5;
  --ink: #16171f;
  --ink-2: #4a4d5e;
  --ink-3: #7c8095;
  --line: #dcdfea;
  --accent: #4b4fa6;
  --good: #2e6f7e;
  --good-bg: #e4eff1;
  --evil: #a33b4a;
  --evil-bg: #f7e5e7;
  --flag: #b4772a;
  --flag-bg: #fbeed6;
  --ok: #2e6f4e;
  --shadow: 0 1px 2px rgba(22, 23, 31, .06), 0 8px 24px -18px rgba(22, 23, 31, .5);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #14151c;
    --surface: #1c1d26;
    --sunken: #23242f;
    --ink: #e7e7ee;
    --ink-2: #a9acbf;
    --ink-3: #767a8d;
    --line: #2e3040;
    --accent: #9095e8;
    --good: #6bb6c4;
    --good-bg: #173034;
    --evil: #e08492;
    --evil-bg: #3a1f25;
    --flag: #e0a85c;
    --flag-bg: #3a2c14;
    --ok: #6fbf90;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -18px rgba(0, 0, 0, .9);
  }
}
:root[data-theme="dark"] {
  --paper: #14151c;
  --surface: #1c1d26;
  --sunken: #23242f;
  --ink: #e7e7ee;
  --ink-2: #a9acbf;
  --ink-3: #767a8d;
  --line: #2e3040;
  --accent: #9095e8;
  --good: #6bb6c4;
  --good-bg: #173034;
  --evil: #e08492;
  --evil-bg: #3a1f25;
  --flag: #e0a85c;
  --flag-bg: #3a2c14;
  --ok: #6fbf90;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -18px rgba(0, 0, 0, .9);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.mono, .num, pre {
  font-family: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.wrap { max-width: 62rem; margin: 0 auto; padding: 3rem 1.25rem 6rem; }

/* ---------- 页眉 ---------- */
.masthead { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 2.5rem; }
.eyebrow {
  font-size: .75rem; letter-spacing: .18em; text-transform: uppercase;
  color: var(--accent); font-weight: 700;
}
h1 {
  margin: 0; font-family: "Noto Serif SC", Georgia, serif; font-weight: 700;
  font-size: clamp(1.75rem, 1.2rem + 2vw, 2.6rem); line-height: 1.2; text-wrap: balance;
}
.standfirst { margin: 0; max-width: 46rem; color: var(--ink-2); font-size: 1.02rem; }
.standfirst b { color: var(--ink); font-weight: 700; }

/* ---------- 三局切换 ---------- */
.tabs { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); margin: 2rem 0 2.5rem; }
.tab {
  display: flex; flex-direction: column; gap: .55rem; align-items: flex-start;
  padding: .95rem 1rem; border: 1px solid var(--line); border-radius: 2px;
  background: var(--surface); color: inherit; font: inherit; text-align: left;
  cursor: pointer; position: relative; transition: border-color .15s, transform .15s;
}
.tab::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: transparent;
}
.tab:hover { border-color: var(--ink-3); }
.tab[aria-selected="true"] { border-color: var(--accent); box-shadow: var(--shadow); }
.tab[aria-selected="true"]::before { background: var(--accent); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tabhead { display: flex; align-items: baseline; gap: .5rem; font-weight: 700; }
.tabhead em {
  font-style: normal; font-size: .75rem; color: var(--ink-3);
  font-family: "IBM Plex Mono", monospace;
}
.tabstats { display: flex; gap: 1rem; }
.stat { font-size: .8rem; color: var(--ink-3); display: flex; align-items: baseline; gap: .3rem; }
.stat b {
  font-family: "IBM Plex Mono", monospace; font-size: 1.05rem; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat.warn b { color: var(--flag); }
.stat.fine b { color: var(--ok); }
.tabtag {
  font-size: .7rem; letter-spacing: .1em; padding: .1rem .45rem; border-radius: 2px;
  background: var(--sunken); color: var(--ink-3);
}

/* ---------- 每局 ---------- */
.game[hidden] { display: none; }
.meta {
  display: grid; gap: .1rem .5rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  padding: 1rem 1.1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 2px;
}
.meta > div { display: flex; gap: .6rem; align-items: baseline; padding: .22rem 0; }
.meta .k { flex: 0 0 6.5rem; font-size: .78rem; color: var(--ink-3); }
.meta .v { font-size: .9rem; }
.meta .v em { font-style: normal; color: var(--ink-3); font-size: .8rem; }

.seats { display: flex; flex-wrap: wrap; gap: .4rem; margin: 1.25rem 0 2.5rem; }
.chip {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .2rem .6rem .2rem .3rem; border-radius: 999px; font-size: .82rem;
  border: 1px solid transparent;
}
.chip b {
  display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 999px;
  font-family: "IBM Plex Mono", monospace; font-size: .78rem; background: var(--surface);
}
.chip.good { background: var(--good-bg); color: var(--good); border-color: var(--good); }
.chip.evil { background: var(--evil-bg); color: var(--evil); border-color: var(--evil); }

/* ---------- 发言 ---------- */
.round { margin-bottom: 2.25rem; }
.roundhead {
  display: flex; align-items: center; gap: .75rem; margin: 0 0 1rem;
  font-size: .78rem; letter-spacing: .14em; font-weight: 700; color: var(--ink-3);
}
.roundhead i { flex: 1; height: 1px; background: var(--line); }
.roundhead em { font-style: normal; font-weight: 400; letter-spacing: 0; }

.speech {
  display: grid; grid-template-columns: 7.5rem 1fr; gap: 1.25rem;
  padding: .85rem 0; border-top: 1px solid var(--line);
}
.speech:first-of-type { border-top: none; }
.who { display: flex; flex-direction: column; align-items: flex-start; gap: .15rem; padding-top: .15rem; }
.seatno {
  font-family: "IBM Plex Mono", monospace; font-size: 1.5rem; font-weight: 600; line-height: 1;
}
.who.good .seatno { color: var(--good); }
.who.evil .seatno { color: var(--evil); }
.role { font-size: .82rem; font-weight: 700; }
.pname { font-size: .72rem; color: var(--ink-3); font-family: "IBM Plex Mono", monospace; }
.said {
  margin: 0; font-family: "Noto Serif SC", Georgia, serif; font-size: 1rem; line-height: 1.85;
  max-width: 68ch; color: var(--ink);
}
.when {
  margin-top: .25rem; font-size: .68rem; letter-spacing: .04em; color: var(--ink-3);
  white-space: nowrap;
}
.flag {
  margin-top: .25rem; font-size: .68rem; letter-spacing: .08em; padding: .08rem .4rem;
  border-radius: 2px; font-weight: 700;
}
.flag.blatant { background: var(--flag); color: var(--surface); }
.flag.mention { background: var(--sunken); color: var(--ink-3); }
.speech.flagged.blatant { background: var(--flag-bg); box-shadow: inset 3px 0 0 var(--flag); padding-left: .9rem; }
mark { background: none; color: inherit; padding: 0 .1em; }
mark.blatant { background: var(--flag); color: var(--surface); border-radius: 2px; font-weight: 700; }
mark.mention { box-shadow: inset 0 -.42em 0 var(--flag-bg); }

/* ---------- 面板 ---------- */
.panel {
  margin: 2.5rem 0; padding: 1.25rem 1.35rem; background: var(--surface);
  border: 1px solid var(--line); border-radius: 2px;
}
.panel h3 {
  margin: 0 0 .9rem; font-size: .78rem; letter-spacing: .14em; color: var(--ink-3); font-weight: 700;
}
.panel .note { margin: -.4rem 0 1rem; font-size: .82rem; color: var(--ink-3); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th {
  text-align: left; font-size: .72rem; letter-spacing: .1em; color: var(--ink-3);
  font-weight: 700; padding: 0 1rem .5rem 0; border-bottom: 1px solid var(--line);
}
td { padding: .5rem 1rem .5rem 0; border-bottom: 1px solid var(--line); }
tr:last-child td { border-bottom: none; }
.pill {
  display: inline-block; padding: .05rem .5rem; border-radius: 2px; font-size: .76rem; font-weight: 700;
}
.pill.ok { background: var(--good-bg); color: var(--good); }
.pill.bad { background: var(--evil-bg); color: var(--evil); }
.verdict { display: flex; align-items: center; gap: .5rem; margin: 1rem 0 0; font-size: .9rem; }
pre {
  margin: 0; font-size: .78rem; line-height: 1.7; color: var(--ink-2);
  background: var(--sunken); padding: .85rem 1rem; border-radius: 2px; white-space: pre;
}

footer {
  margin-top: 4rem; padding-top: 1.25rem; border-top: 1px solid var(--line);
  font-size: .8rem; color: var(--ink-3);
}
footer code {
  font-family: "IBM Plex Mono", monospace; background: var(--sunken);
  padding: .1rem .35rem; border-radius: 2px;
}

@media (max-width: 40rem) {
  .speech { grid-template-columns: 1fr; gap: .4rem; }
  .who { flex-direction: row; align-items: baseline; gap: .5rem; flex-wrap: wrap; }
  .seatno { font-size: 1.1rem; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;

const SCRIPT = `
(function () {
  var KEY = "avalon-transcript-game";
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  function show(index) {
    tabs.forEach(function (tab) {
      var on = tab.dataset.game === String(index);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      var panel = document.getElementById("game-" + tab.dataset.game);
      if (panel) panel.hidden = !on;
    });
    try { localStorage.setItem(KEY, String(index)); } catch (e) { /* 无痕窗口等，忽略 */ }
  }
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { show(tab.dataset.game); });
  });
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  var exists = saved && document.getElementById("game-" + saved);
  show(exists ? saved : (tabs[0] && tabs[0].dataset.game));
})();
`;

/** "一" … "十"。超过十局就用阿拉伯数字——标题里的"十三局"读着比数字别扭 */
const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const countLabel = (n: number): string => (n <= 10 ? `${CN_NUM[n]}局` : `${n} 局`);

/**
 * 页眉里的局数与模型都从记录里算，**不写死**。
 *
 * 第一版把"三局"和"gpt-5-nano"直接写在模板里，结果第 4 局（gpt-5-mini）落盘之后，
 * 页面上摆着四个标签页、标题却说"三局……跑在 gpt-5-nano 上"。这种错不会报错，
 * 只会让人读到一份不靠谱的记录——而这个页面存在的全部意义就是给人读。
 */
function modelsLabel(games: PageGame[]): string {
  const seen = [...new Set(games.map((game) => game.transcript.model.split("/").pop()?.trim() ?? ""))];
  return seen.filter(Boolean).join(" 与 ");
}

export function renderTranscriptPage(games: PageGame[]): string {
  const totals = games.map((game) => statsOf(game.transcript).blatant);
  const trend = totals.join(" → ");

  return `<title>阿瓦隆 AI 对局记录</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;700&display=swap">
<style>${STYLE}</style>

<div class="wrap">
  <header class="masthead">
    <span class="eyebrow">阶段 4 · 人工读发言</span>
    <h1>${countLabel(games.length)}真实对局，读发言读出来的 prompt 缺陷</h1>
    <p class="standfirst">
      全 AI 的 5 人局，跑在 <b>${modelsLabel(games)}</b> 上。
      前三局是同一条修复线：第一局读出<b>公开发言自曝身份</b>与<b>好人试图打失败票</b>，
      改 prompt 后复跑，<b>自曝 ${trend}</b>。
      引擎侧的信息隔离全程正常——这些都是自动化测不出来、只有人读发言才会发现的东西。
    </p>
  </header>

  <div class="tabs" role="tablist" aria-label="选择对局">
    ${games.map(tabButton).join("")}
  </div>

  ${games.map(gamePanel).join("")}

  <footer>
    由 <code>pnpm transcripts</code> 从 <code>transcripts/*.txt</code> 生成。
    高亮规则：命中「作为／我是／身为 + 自己的角色名」算<b>自曝</b>；
    只是提到自己的角色名算<b>提到</b>——梅林在发言里谈论「梅林」是正常推理，甚至是好牌，不算泄漏。
  </footer>
</div>

<script>${SCRIPT}</script>
`;
}
