import { z } from "zod";
import { FIELD_IDS } from "@/lib/onepager/schema";

/**
 * The structured contract the live analysis returns on every pass.
 * Every field is required and nullable rather than optional — structured
 * outputs are stricter than normal JSON mode and silently drop optionals.
 */

export const CoverageUpdate = z.object({
  field_id: z.string().describe("Must be one of the one-pager field ids listed in the system prompt."),
  status: z.enum(["missing", "partial", "confirmed"]),
  value: z
    .string()
    .describe("The answer, written as the planning team would want to read it in the one-pager. Empty string if nothing was said."),
  confidence: z.number().describe("0 to 1. How sure you are this reflects what the brand actually said."),
  evidence_quote: z
    .string()
    .describe("A short verbatim quote from the transcript that supports this. Empty string if none."),
});

export const NextQuestion = z.object({
  text: z
    .string()
    .describe("The question phrased so it can be read aloud verbatim, in the language of the room."),
  bank_code: z
    .string()
    .describe("The mother-set question code this came from, e.g. Q011. Empty string if newly generated."),
  field_ids: z.array(z.string()).describe("One-pager fields this question is meant to fill."),
  rationale: z
    .string()
    .describe("One short line for the host explaining why to ask this now. Not read aloud."),
  urgency: z.number().describe("1 = ask next, 5 = only if time allows."),
  origin: z.enum(["bank", "adapted", "generated", "followup"]),
});

export const AnalysisResult = z.object({
  coverage_updates: z.array(CoverageUpdate),
  ask_next: z.array(NextQuestion),
  resolved_bank_codes: z
    .array(z.string())
    .describe("Mother-set codes that are now fully answered and should stop being suggested."),
  steer: z
    .string()
    .describe("At most one short line of tactical advice for the host, e.g. a dodged question to revisit. Empty string if nothing to flag."),
  language_detected: z.enum(["vi", "en", "mixed", "unknown"]),
});

export type AnalysisResultT = z.infer<typeof AnalysisResult>;
export type CoverageUpdateT = z.infer<typeof CoverageUpdate>;
export type NextQuestionT = z.infer<typeof NextQuestion>;

/** Drop hallucinated field ids before they reach the database. */
export function sanitise(result: AnalysisResultT): AnalysisResultT {
  const valid = new Set(FIELD_IDS);
  return {
    ...result,
    coverage_updates: result.coverage_updates.filter((u) => valid.has(u.field_id)),
    ask_next: result.ask_next
      .map((q) => ({
        ...q,
        field_ids: q.field_ids.filter((f) => valid.has(f)),
        urgency: Math.min(5, Math.max(1, Math.round(q.urgency))),
      }))
      .filter((q) => q.text.trim().length > 0),
  };
}
