import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/locale";
import {
  userLlmConfigSchema,
  type UserLlmConfig,
  type UserLlmProvider,
} from "@/lib/ai/user-config";
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

export interface UserLlmConfigDraft {
  provider: UserLlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: string;
  maxTokens: string;
  extraBody: string;
}

export type UserLlmConfigDraftError =
  | "API_KEY_REQUIRED"
  | "MODEL_REQUIRED"
  | "BASE_URL_REQUIRED"
  | "BASE_URL_INVALID"
  | "TEMPERATURE_INVALID"
  | "MAX_TOKENS_INVALID"
  | "EXTRA_BODY_INVALID"
  | "EXTRA_BODY_OBJECT"
  | "EXTRA_BODY_RESERVED";

export function draftFromUserLlmConfig(config: UserLlmConfig | null): UserLlmConfigDraft {
  return {
    provider: config?.provider ?? "openai",
    apiKey: config?.apiKey ?? "",
    model: config?.model ?? "",
    baseUrl: config?.baseUrl ?? "",
    temperature:
      config?.temperature === null
        ? "default"
        : config?.temperature === undefined
          ? ""
          : String(config.temperature),
    maxTokens: config?.maxTokens === undefined ? "" : String(config.maxTokens),
    extraBody: config?.extraBody ? JSON.stringify(config.extraBody, null, 2) : "",
  };
}

export function parseUserLlmConfigDraft(
  draft: UserLlmConfigDraft,
):
  | { success: true; data: UserLlmConfig }
  | { success: false; error: UserLlmConfigDraftError } {
  const apiKey = draft.apiKey.trim();
  if (!apiKey) return { success: false, error: "API_KEY_REQUIRED" };

  const model = draft.model.trim();
  if (!model) return { success: false, error: "MODEL_REQUIRED" };

  const baseUrl = draft.baseUrl.trim();
  if (draft.provider === "custom" && !baseUrl) {
    return { success: false, error: "BASE_URL_REQUIRED" };
  }
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { success: false, error: "BASE_URL_INVALID" };
      }
    } catch {
      return { success: false, error: "BASE_URL_INVALID" };
    }
  }

  const rawTemperature = draft.temperature.trim();
  const temperature =
    rawTemperature === ""
      ? undefined
      : rawTemperature === "default"
        ? null
        : Number(rawTemperature);
  if (
    temperature !== undefined &&
    temperature !== null &&
    (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    return { success: false, error: "TEMPERATURE_INVALID" };
  }

  const rawMaxTokens = draft.maxTokens.trim();
  const maxTokens = rawMaxTokens === "" ? undefined : Number(rawMaxTokens);
  if (
    maxTokens !== undefined &&
    (!Number.isInteger(maxTokens) || maxTokens <= 0)
  ) {
    return { success: false, error: "MAX_TOKENS_INVALID" };
  }

  let extraBody: Record<string, unknown> | undefined;
  const rawExtraBody = draft.extraBody.trim();
  if (rawExtraBody) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawExtraBody);
    } catch {
      return { success: false, error: "EXTRA_BODY_INVALID" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { success: false, error: "EXTRA_BODY_OBJECT" };
    }
    if ("model" in parsed || "messages" in parsed) {
      return { success: false, error: "EXTRA_BODY_RESERVED" };
    }
    extraBody = parsed as Record<string, unknown>;
  }

  const parsed = userLlmConfigSchema.safeParse({
    provider: draft.provider,
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(temperature === undefined ? {} : { temperature }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(extraBody === undefined ? {} : { extraBody }),
  });

  if (!parsed.success) return { success: false, error: "EXTRA_BODY_RESERVED" };
  return { success: true, data: parsed.data };
}
