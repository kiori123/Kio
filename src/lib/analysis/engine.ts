import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "@/lib/anthropic";
import { AnalysisResult, sanitise, type AnalysisResultT } from "./contract";
import { buildSystemPrompt, buildUserTurn, type TurnInput } from "./prompt";
import type { BankQuestion } from "@/lib/types";

export interface AnalysisOutcome {
  result: AnalysisResultT;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    latency_ms: number;
  };
}

export async function runTurnAnalysis(
  bank: BankQuestion[],
  turn: TurnInput,
): Promise<AnalysisOutcome> {
  const startedAt = Date.now();

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    // Low effort: this runs every ~20 seconds during a live conversation and
    // is judged on whether the question arrives while it is still relevant.
    output_config: { effort: "low", format: zodOutputFormat(AnalysisResult) },
    system: [
      {
        type: "text",
        text: buildSystemPrompt(bank),
        // The schema and the question bank are ~6-8k tokens and identical on
        // every call in a meeting. A one-hour TTL covers the whole session.
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [{ role: "user", content: buildUserTurn(turn) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Model declined to analyse this segment (${response.stop_details?.category ?? "unknown"}).`,
    );
  }

  if (!response.parsed_output) {
    throw new Error("Analysis returned no parseable output.");
  }

  return {
    result: sanitise(response.parsed_output),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      latency_ms: Date.now() - startedAt,
    },
  };
}
