import { renderSchemaForPrompt } from "@/lib/onepager/schema";
import type { BankQuestion, FieldCoverage, QuestionSuggestion, TranscriptSegment } from "@/lib/types";

/**
 * Prompt construction is split into a stable half and a volatile half.
 *
 * The stable half (role + one-pager schema + mother question set) is identical
 * for every call within a workspace, so it carries the cache breakpoint. The
 * volatile half (coverage state + transcript window) goes in the user turn and
 * is never cached. Getting this the wrong way round roughly triples the cost of
 * a meeting, because the schema and bank dominate the token count.
 */

export const ROLE = `You are a live meeting copilot for a business development lead who is in a face-to-face meeting with a consumer brand.

Your job is to listen to the running transcript and do two things after every exchange:
1. Extract what the brand has actually told us into a fixed one-pager structure.
2. Decide the single best next question for the host to ask, so that by the end of the meeting the one-pager is complete.

You are silent. Nothing you write is spoken to the room — the host reads your suggestions off a screen while talking. Write questions so they can be read aloud word for word, with no editing.

HARD RULES
- Extract only what was said. Never infer a number, a name or an intention that was not stated. If the brand was vague, mark the field "partial" and record what they did say.
- "confirmed" means the brand stated it clearly and specifically enough to put in a plan. A direction without a number is "partial", not "confirmed".
- Prefer questions from the mother set. Use them verbatim when they still fit.
- Use origin "adapted" when you take a mother-set question and rephrase it to follow on naturally from what was just said — this is the most common and most useful case. Keep the bank_code.
- Use origin "generated" only when the conversation opened a thread the mother set did not anticipate, or "followup" when the brand's last answer was evasive or incomplete and needs pressing.
- Never suggest a question whose field is already confirmed, and never repeat a question already asked.
- Respect the arc of a meeting. Commercial terms, margin and decision-maker questions land badly in the first few minutes unless the brand raised them first. Early on, favour objective and pain-point questions.
- Return at most 4 questions, ranked by urgency. One excellent question beats four adequate ones — if only one is worth asking, return one.
- Match the language of the room. If they are speaking Vietnamese, write the questions in natural business Vietnamese. If the room is mixing languages, follow the brand side's dominant language.
- Keep rationale to one short line. The host is mid-conversation and can only glance.
- If the brand dodged something important twice, say so in "steer" rather than burning a question slot on it.`;

export function renderQuestionBank(bank: BankQuestion[]): string {
  return bank
    .filter((q) => q.is_active)
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
    .map((q) => {
      const vi = q.text_vi ? `\n  VI: ${q.text_vi}` : "";
      const when = q.ask_when ? `\n  Note: ${q.ask_when}` : "";
      return `- ${q.code} [${q.phase}] fields=${q.field_ids.join(",")}\n  EN: ${q.text_en}${vi}${when}`;
    })
    .join("\n");
}

/** The cacheable prefix. Must be byte-identical across calls in a meeting. */
export function buildSystemPrompt(bank: BankQuestion[]): string {
  return `${ROLE}

# THE ONE-PAGER YOU ARE FILLING
Every field below is a slot in the deliverable the planning team needs. Field ids are fixed — use them exactly.

${renderSchemaForPrompt()}

# THE MOTHER QUESTION SET
These are the questions the team has agreed are worth asking. Draw from them first.

${renderQuestionBank(bank)}`;
}

function coverageLine(c: FieldCoverage): string {
  const val = c.value ? ` — "${c.value.slice(0, 240)}"` : "";
  return `  ${c.field_id}: ${c.status} (${c.confidence.toFixed(2)})${val}`;
}

export interface TurnInput {
  brandName: string;
  prepNotes: string | null;
  language: "auto" | "vi" | "en";
  elapsedMinutes: number;
  coverage: FieldCoverage[];
  window: TranscriptSegment[];
  /** Everything already put in front of the host, so we never repeat ourselves. */
  alreadySuggested: QuestionSuggestion[];
}

export function buildUserTurn(input: TurnInput): string {
  const known = input.coverage
    .filter((c) => c.status !== "missing")
    .map(coverageLine)
    .join("\n");

  const missing = input.coverage
    .filter((c) => c.status === "missing")
    .map((c) => c.field_id)
    .join(", ");

  const asked = input.alreadySuggested
    .map(
      (q) =>
        `  [${q.status}] ${q.bank_question_id ? "" : "(generated) "}${q.text.slice(0, 160)}`,
    )
    .join("\n");

  const transcript = input.window
    .map((s) => `  #${s.seq} ${s.speaker.toUpperCase()}: ${s.text}`)
    .join("\n");

  const langLine =
    input.language === "auto"
      ? "Follow the language the brand side is speaking."
      : `Write questions in ${input.language === "vi" ? "Vietnamese" : "English"}.`;

  return `# MEETING
Brand: ${input.brandName}
Elapsed: ~${input.elapsedMinutes} minutes
Language: ${langLine}
${input.prepNotes ? `Prep notes we walked in with:\n${input.prepNotes}\n` : ""}
# ONE-PAGER STATE SO FAR
Captured:
${known || "  (nothing captured yet)"}

Still missing: ${missing || "(nothing)"}

# QUESTIONS ALREADY PUT TO THE HOST
${asked || "  (none yet)"}

# TRANSCRIPT — most recent exchange
${transcript || "  (the meeting has just started)"}

Update the one-pager from the transcript above, then decide what the host should ask next.`;
}
