/**
 * LLM 输出的 zod schema。模型返回的任何东西都必须先过这里。
 *
 * 阶段 4 实现，见 docs/todos.md。
 */
import { z } from "zod";

export const playerIdSchema = z.number().int().nonnegative();

export const aiSpeechSchema = z.object({
  reasoning: z.string(),
  content: z.string(),
  suspicions: z
    .array(z.object({ playerId: playerIdSchema, score: z.number() }))
    .optional(),
});

export const aiTeamProposalSchema = z.object({
  reasoning: z.string(),
  team: z.array(playerIdSchema),
  statement: z.string(),
});

export const aiVoteSchema = z.object({
  reasoning: z.string(),
  approve: z.boolean(),
});

export const aiMissionCardSchema = z.object({
  reasoning: z.string(),
  success: z.boolean(),
});

export const aiAssassinationSchema = z.object({
  reasoning: z.string(),
  targetId: playerIdSchema,
});
