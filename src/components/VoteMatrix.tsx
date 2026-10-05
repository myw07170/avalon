"use client";

/**
 * 票型总表：行 = 每次组队提议，列 = 每个座位，格子 ✓ / ✗。
 *
 * 【为什么值得单独一块，而不是只有发言流里那些卡】卡片是按时间读的，
 * 表是按人读的。「4 号每次都跟 6 号投一样」这种结论从一张张卡里翻不出来，
 * 而它恰好是阿瓦隆最硬的一条线索。高手本来就在脑子里维护这张表。
 *
 * 【默认收起，终局默认展开】对局中它是可选的辅助，摊开会把圆桌挤下去；
 * 复盘时它是主角，对着真实身份看票型才有意思。
 *
 * 【用原生 details/summary，不做受控折叠】不需要 state、键盘与读屏行为都是白送的，
 * 而且 SSR 与水合输出一致。项目至今没有一个 useMediaQuery / 受控折叠，不开这个先例。
 *
 * 推导全在 vote-model.ts，这里只负责画。
 */
import { useAtomValue } from "jotai";
import { ChevronDown } from "lucide-react";
import { useMessages } from "@/i18n/useMessages";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import { cn } from "@/lib/utils";
import { viewAtom } from "@/store/game";
import { describeVoteMatrix, type VoteMatrix as VoteMatrixData } from "./vote-model";

/**
 * `matrix` 不传就自己读 viewAtom。
 *
 * 【终局那一支传进来】GameOverPanel 已经从 describeGameOver 拿到了同一份数据，
 * 让它再读一次 viewAtom 会出现"同一屏两个数据源"——两处哪天不一致，
 * 谁都说不清该信哪个。
 */
export function VoteMatrix({
  matrix,
  defaultOpen = false,
}: {
  matrix?: VoteMatrixData;
  defaultOpen?: boolean;
}) {
  const view = useAtomValue(viewAtom);
  const msg = useMessages();

  const data = matrix ?? (view ? describeVoteMatrix(view, msg) : null);
  // 第一次投票结算之前整块不渲染。空壳会让人以为界面坏了
  if (!data || data.rows.length === 0) return null;

  return (
    <details open={defaultOpen} className="group w-full">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-1">
        <h2 className="text-sm font-medium text-vellum">
          {msg.vote.matrixTitle}
        </h2>
        <span className="tabular text-[11px] text-muted">{data.rows.length}</span>
        <ChevronDown className="ml-auto size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      {/* 10 人局 10 列，360px 屏放不下——横向滚动只发生在这个盒子里，页面本身不动 */}
      <div className="mt-2 overflow-x-auto rounded-lg border border-ink-line bg-ink-raised">
        <table className="tabular w-full min-w-max border-collapse text-xs">
          <caption className="sr-only">{msg.vote.matrixTitle}</caption>
          <thead>
            <tr className="border-b border-ink-line text-muted">
              <th scope="col" className="px-2 py-1.5 text-left font-normal">
                #
              </th>
              {data.seats.map((seat) => (
                <th
                  key={seat.id}
                  scope="col"
                  className={cn(
                    "px-1.5 py-1.5 text-center font-normal",
                    seat.isSelf && "text-brass",
                  )}
                >
                  {toDisplaySeatNumber(seat.id)}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 text-left font-normal">
                {msg.vote.resultCol}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.key} className="border-t border-ink-line">
                <th
                  scope="row"
                  aria-label={row.ariaLabel}
                  className="px-2 py-1.5 text-left font-normal text-muted"
                >
                  {row.label}
                </th>

                {row.cells.map((cell, index) => {
                  const seat = data.seats[index];
                  return (
                    <td
                      key={seat ? seat.id : index}
                      className={cn(
                        "px-1.5 py-1.5 text-center",
                        // 「他给一支自己不在的队投了赞成」是信息量最大的一格。
                        // 底色走 brass，跟圆桌上"在队伍里"是同一条视觉通道
                        cell.onTeam && "bg-brass-soft",
                      )}
                    >
                      <span className="sr-only">
                        {msg.vote.cellAria(
                          seat ? msg.seat.short(seat.id) : "",
                          cell.vote === "approve"
                            ? msg.vote.approveLabel
                            : cell.vote === "reject"
                              ? msg.vote.rejectLabel
                              : msg.vote.cellNone,
                          cell.onTeam,
                        )}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          cell.vote === "approve" && "text-loyal",
                          cell.vote === "reject" && "text-mordred",
                          cell.vote === null && "text-muted",
                        )}
                      >
                        {cell.vote === "approve" ? "✓" : cell.vote === "reject" ? "✗" : "·"}
                        {cell.isLeader && (
                          <span className="ml-0.5 text-[9px] text-brass">◆</span>
                        )}
                      </span>
                    </td>
                  );
                })}

                <td className="whitespace-nowrap px-2 py-1.5 text-left">
                  <span className={cn(row.approved ? "text-loyal" : "text-mordred")}>
                    {row.outcomeLabel}
                  </span>
                  <span className="ml-1.5 text-muted">{row.detailLabel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted">{msg.vote.matrixHint}</p>
    </details>
  );
}
