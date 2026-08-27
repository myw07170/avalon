"use client";

/**
 * 五个任务节点 + 否决计数器。对局的"比分牌"。
 *
 * 推导在 mission-track-model.ts，这里只负责画。
 */
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { myViewAtom } from "@/store/game";
import { describeTrack, type MissionNode, type MissionOutcome } from "./mission-track-model";

const OUTCOME_CLASS: Record<MissionOutcome, string> = {
  success: "border-loyal bg-loyal/15 text-loyal",
  fail: "border-mordred bg-mordred/15 text-mordred",
  current: "border-brass bg-brass/10 text-vellum",
  upcoming: "border-ink-line bg-ink-raised text-muted",
};

export function MissionTrack() {
  const view = useAtomValue(myViewAtom);
  if (!view) return null;

  const track = describeTrack(view);

  return (
    <section className="w-full">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xs tracking-[0.3em] text-muted">任务</h2>
        <p className="tabular text-xs">
          <span className="text-loyal">好人 {track.goodScore}</span>
          <span className="text-muted"> · </span>
          <span className="text-mordred">坏人 {track.evilScore}</span>
          <span className="text-muted"> · {track.missionsToWin} 胜制</span>
        </p>
      </div>

      <ol className="flex gap-1.5 sm:gap-2">
        {track.nodes.map((node) => (
          <MissionNodeCell key={node.index} node={node} />
        ))}
      </ol>

      <RejectMeter
        count={track.rejectCount}
        max={track.maxRejects}
        warning={track.rejectWarning}
        attemptLabel={track.attemptLabel}
      />
    </section>
  );
}

function MissionNodeCell({ node }: { node: MissionNode }) {
  return (
    <li
      aria-label={`${node.label}，${node.teamSize} 人出任务${
        node.failsRequired > 1 ? "，需 2 张失败票才算失败" : ""
      }，${node.detail ?? "未开始"}`}
      className={cn(
        // px-1：360px 屏上每格只有约 59px，不给水平内边距文字会顶到边框上
        "flex-1 rounded-lg border px-1 py-2.5 text-center transition-colors",
        OUTCOME_CLASS[node.outcome],
      )}
    >
      <p aria-hidden className="text-[10px] tracking-widest opacity-70">
        {node.label}
      </p>
      <p aria-hidden className="tabular mt-0.5 text-xl leading-none">
        {node.teamSize}
        {node.failsRequired > 1 && <span className="text-mordred">✳</span>}
      </p>
      {/* 【不能给固定高度】原来是 h-3（硬 12px）。窄屏上「失败 · 2 败」放不下
          会在中文字符间折行，第二行直接画到下面的兄弟节点上（没有 overflow-hidden）。
          min-h-3 保住五个节点的基线对齐，同时允许它长高 */}
      <p aria-hidden className="mt-1 min-h-3 text-[10px] leading-tight opacity-80">
        {node.detail ?? ""}
      </p>
    </li>
  );
}

/**
 * 否决计数器。
 *
 * 【它是每轮独立的】提议通过或进入下一轮任务都会归零，所以显示的是
 * "本轮连续否决了几次"，不是整局的流水。撞满就是坏人直接获胜。
 */
function RejectMeter({
  count,
  max,
  warning,
  attemptLabel,
}: {
  count: number;
  max: number;
  warning: string | null;
  attemptLabel: string | null;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs text-muted">本轮否决</span>

      <span
        role="img"
        aria-label={`本轮已连续否决 ${count} 次，上限 ${max} 次`}
        className="flex items-center gap-1.5"
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "size-2.5 rounded-full border transition-colors",
              i < count ? "border-mordred bg-mordred" : "border-ink-line",
              // 最后一格单独描出来：撞到它就输了
              i === max - 1 && i >= count && "border-mordred/50",
            )}
          />
        ))}
      </span>

      <span className="tabular text-xs text-muted">
        {count} / {max}
      </span>

      {attemptLabel && <span className="tabular text-xs text-muted">· {attemptLabel}</span>}

      {warning && (
        <span role="alert" className="text-xs text-mordred">
          {warning}
        </span>
      )}
    </div>
  );
}
