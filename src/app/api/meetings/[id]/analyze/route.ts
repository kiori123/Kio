import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runTurnAnalysis } from "@/lib/analysis/engine";
import type {
  BankQuestion,
  CoverageStatus,
  Evidence,
  FieldCoverage,
  Meeting,
  QuestionSuggestion,
  TranscriptSegment,
} from "@/lib/types";

export const maxDuration = 60;

/** How many segments of already-analysed context to re-send. Answers routinely
 *  straddle a chunk boundary, so a window with no overlap loses them. */
const OVERLAP = 6;
const MAX_WINDOW = 70;

const RANK: Record<CoverageStatus, number> = { missing: 0, partial: 1, confirmed: 2 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Meeting>();
  if (!meeting) return NextResponse.json({ error: "meeting not found" }, { status: 404 });

  const { data: lastRun } = await supabase
    .from("analysis_runs")
    .select("to_seq")
    .eq("meeting_id", id)
    .is("error", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastAnalysed = (lastRun?.to_seq ?? 0) as number;

  const { data: allSegments } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("meeting_id", id)
    .gt("seq", Math.max(0, lastAnalysed - OVERLAP))
    .order("seq", { ascending: true })
    .limit(MAX_WINDOW)
    .returns<TranscriptSegment[]>();

  const window = allSegments ?? [];
  const latestSeq = window.length ? window[window.length - 1].seq : lastAnalysed;

  if (latestSeq <= lastAnalysed) {
    return NextResponse.json({ skipped: "no new transcript", last_seq: lastAnalysed });
  }

  const [{ data: bank }, { data: coverage }, { data: suggestions }] = await Promise.all([
    supabase
      .from("question_bank")
      .select("*")
      .eq("workspace_id", meeting.workspace_id)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .returns<BankQuestion[]>(),
    supabase.from("field_coverage").select("*").eq("meeting_id", id).returns<FieldCoverage[]>(),
    supabase
      .from("question_suggestions")
      .select("*")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<QuestionSuggestion[]>(),
  ]);

  const elapsedMinutes = meeting.started_at
    ? Math.round((Date.now() - new Date(meeting.started_at).getTime()) / 60000)
    : 0;

  let outcome;
  try {
    outcome = await runTurnAnalysis(bank ?? [], {
      brandName: meeting.brand_name,
      prepNotes: meeting.prep_notes,
      language: meeting.language,
      elapsedMinutes,
      coverage: coverage ?? [],
      window,
      alreadySuggested: suggestions ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "analysis failed";
    await supabase.from("analysis_runs").insert({
      meeting_id: id,
      from_seq: lastAnalysed,
      to_seq: lastAnalysed, // not advanced, so the next pass retries this window
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { result, usage } = outcome;
  const existing = new Map((coverage ?? []).map((c) => [c.field_id, c]));

  // Merge rule: never silently downgrade an established answer. A later pass
  // sees a narrower transcript window, so "I no longer see evidence" is not
  // evidence of absence — only a stronger or equal reading may overwrite.
  const coverageRows = result.coverage_updates
    .filter((u) => {
      const prev = existing.get(u.field_id);
      if (!prev) return true;
      return RANK[u.status] >= RANK[prev.status] || u.confidence > Number(prev.confidence);
    })
    .map((u) => {
      const prev = existing.get(u.field_id);
      const evidence: Evidence[] = [...(prev?.evidence ?? [])];
      if (u.evidence_quote.trim()) {
        evidence.push({ quote: u.evidence_quote.trim(), seq: latestSeq });
      }
      return {
        meeting_id: id,
        field_id: u.field_id,
        status: u.status,
        confidence: Math.min(1, Math.max(0, u.confidence)),
        value: u.value.trim() || prev?.value || null,
        evidence: evidence.slice(-5),
        updated_at: new Date().toISOString(),
      };
    });

  if (coverageRows.length) {
    await supabase.from("field_coverage").upsert(coverageRows, { onConflict: "meeting_id,field_id" });
  }

  const codeToId = new Map((bank ?? []).map((q) => [q.code, q.id]));
  const batchSeq = Date.now();

  const newSuggestions = result.ask_next.map((q) => ({
    meeting_id: id,
    bank_question_id: q.bank_code ? (codeToId.get(q.bank_code) ?? null) : null,
    field_ids: q.field_ids,
    text: q.text,
    rationale: q.rationale || null,
    urgency: q.urgency,
    origin: q.origin,
    status: "pending" as const,
    batch_seq: batchSeq,
  }));

  if (newSuggestions.length) {
    // Retire the previous batch only once we have a replacement. A pass that
    // returns nothing must leave the host's current shortlist on screen rather
    // than blanking it mid-conversation.
    await supabase
      .from("question_suggestions")
      .update({ status: "stale" })
      .eq("meeting_id", id)
      .eq("status", "pending");

    await supabase.from("question_suggestions").insert(newSuggestions);
  }

  // Anything the model says is now answered gets marked as such, so the
  // post-meeting review shows which bank questions actually got covered.
  const resolvedIds = result.resolved_bank_codes
    .map((code) => codeToId.get(code))
    .filter((v): v is string => Boolean(v));

  if (resolvedIds.length) {
    await supabase
      .from("question_suggestions")
      .update({ status: "answered" })
      .eq("meeting_id", id)
      .in("bank_question_id", resolvedIds)
      .in("status", ["asked", "stale"]);
  }

  await supabase.from("analysis_runs").insert({
    meeting_id: id,
    from_seq: lastAnalysed,
    to_seq: latestSeq,
    model: "claude-opus-5",
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    latency_ms: usage.latency_ms,
  });

  return NextResponse.json({
    last_seq: latestSeq,
    steer: result.steer,
    suggestions: newSuggestions.length,
    coverage_updated: coverageRows.length,
    usage,
  });
}
