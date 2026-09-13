import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "@/lib/anthropic";
import { ONEPAGER_SECTIONS, renderSchemaForPrompt } from "@/lib/onepager/schema";
import type { FieldCoverage, OnePagerContent, TranscriptSegment } from "@/lib/types";

const GeneratedField = z.object({
  id: z.string(),
  value: z.string().describe("Final wording for the one-pager. Empty string if genuinely not covered."),
  status: z.enum(["missing", "partial", "confirmed"]),
});

const GeneratedOnePager = z.object({
  headline: z.string().describe("One line a planner can read to know what this opportunity is."),
  fields: z.array(GeneratedField),
  gaps: z.array(z.string()).describe("What is still unknown and must be chased before planning starts."),
  recommended_next_steps: z.array(z.string()).describe("Concrete next actions for the BD team, most important first."),
});

const SYSTEM = `You write the final one-pager after a business development meeting with a brand.

You are given the structured extraction captured live during the meeting, plus the full transcript. The live extraction is a draft — the transcript is the source of truth. Correct the draft where the transcript disagrees, and fill fields the live pass missed.

Rules:
- Write in English regardless of the meeting language, so the planning team reads one consistent document. Keep brand names, product names and direct quotes in their original language.
- Every value must be traceable to something said in the meeting. Do not fill a gap with a plausible assumption — an honest "missing" is more useful to a planner than an invented number.
- Write in compressed, factual prose. This is a planning input, not a narrative. Numbers, names, dates.
- Mark a field "confirmed" only if it is specific enough to plan against.
- "gaps" should name the field and why it matters, not just restate the label.
- "recommended_next_steps" must be actions the BD team can take this week.`;

export async function generateOnePager(params: {
  brandName: string;
  prepNotes: string | null;
  coverage: FieldCoverage[];
  transcript: TranscriptSegment[];
}): Promise<{ content: OnePagerContent; markdown: string }> {
  const draft = params.coverage
    .map(
      (c) =>
        `- ${c.field_id} [${c.status} ${c.confidence.toFixed(2)}]: ${c.value ?? "(nothing captured)"}`,
    )
    .join("\n");

  const transcript = params.transcript
    .map((s) => `#${s.seq} ${s.speaker.toUpperCase()}: ${s.text}`)
    .join("\n");

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    // Runs once per meeting and produces the artefact everything downstream
    // depends on — worth the extra thinking.
    output_config: { effort: "high", format: zodOutputFormat(GeneratedOnePager) },
    system: [
      { type: "text", text: `${SYSTEM}\n\n# ONE-PAGER STRUCTURE\n${renderSchemaForPrompt()}` },
    ],
    messages: [
      {
        role: "user",
        content: `Brand: ${params.brandName}
${params.prepNotes ? `\nPrep notes before the meeting:\n${params.prepNotes}\n` : ""}
# LIVE EXTRACTION DRAFT
${draft || "(empty)"}

# FULL TRANSCRIPT
${transcript || "(no transcript captured)"}

Produce the final one-pager.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Model declined to generate the one-pager (${response.stop_details?.category ?? "unknown"}).`,
    );
  }
  if (!response.parsed_output) throw new Error("One-pager generation returned no parseable output.");

  const byId = new Map(response.parsed_output.fields.map((f) => [f.id, f]));

  const content: OnePagerContent = {
    headline: response.parsed_output.headline,
    sections: ONEPAGER_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      fields: s.fields.map((f) => {
        const got = byId.get(f.id);
        return {
          id: f.id,
          label: f.label,
          value: got?.value ?? "",
          status: got?.status ?? ("missing" as const),
        };
      }),
    })),
    gaps: response.parsed_output.gaps,
    recommended_next_steps: response.parsed_output.recommended_next_steps,
  };

  return { content, markdown: toMarkdown(params.brandName, content) };
}

export function toMarkdown(brandName: string, c: OnePagerContent): string {
  const lines: string[] = [`# ${brandName} — One-Pager`, "", `> ${c.headline}`, ""];

  for (const section of c.sections) {
    const filled = section.fields.filter((f) => f.value.trim().length > 0);
    if (filled.length === 0) continue;
    lines.push(`## ${section.title}`, "");
    for (const f of filled) {
      const flag = f.status === "confirmed" ? "" : " _(unconfirmed)_";
      lines.push(`- **${f.label}:** ${f.value}${flag}`);
    }
    lines.push("");
  }

  if (c.gaps.length) {
    lines.push("## Gaps to close", "");
    c.gaps.forEach((g) => lines.push(`- ${g}`));
    lines.push("");
  }
  if (c.recommended_next_steps.length) {
    lines.push("## Next steps", "");
    c.recommended_next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("");
  }
  return lines.join("\n");
}
