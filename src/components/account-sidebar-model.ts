import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/locale";
import type { ReviewSummary } from "@/lib/reviews";

export interface HistoryItemBrief {
  title: string;
  detail: string;
  meta: string;
  ariaLabel: string;
}

export function describeHistoryItem(
  review: ReviewSummary,
  msg: Messages,
  locale: Locale,
): HistoryItemBrief {
  const endedAt = formatReviewDate(review.endedAt, locale);
  const winner = msg.team.label[review.winner];
  const playerLine =
    review.humanSeat === null
      ? msg.history.spectated(review.playerCount)
      : msg.history.seated(review.playerCount, review.humanSeat);
  const score = msg.history.score(review.goodScore, review.evilScore);

  return {
    title: msg.history.itemTitle(endedAt, winner),
    detail: `${score} · ${playerLine}`,
    meta: msg.history.calls(review.aiCallsUsed),
    ariaLabel: msg.history.itemAria(endedAt, winner, score, playerLine),
  };
}

function formatReviewDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
