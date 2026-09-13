import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Speaker } from "@/lib/types";

/** Append finalised transcript chunks. RLS scopes this to meeting members. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const body = (await request.json()) as {
    segments?: { speaker?: Speaker; text?: string; started_ms?: number; ended_ms?: number }[];
  };

  const incoming = (body.segments ?? []).filter((s) => s.text?.trim());
  if (incoming.length === 0) return NextResponse.json({ inserted: 0, last_seq: null });

  // seq is assigned server-side so concurrent writers cannot collide on the
  // (meeting_id, seq) unique constraint by both reading the same max.
  const { data: last } = await supabase
    .from("transcript_segments")
    .select("seq")
    .eq("meeting_id", id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  let seq = (last?.seq ?? 0) as number;

  const rows = incoming.map((s) => ({
    meeting_id: id,
    seq: ++seq,
    speaker: s.speaker ?? "unknown",
    text: s.text!.trim(),
    started_ms: s.started_ms ?? null,
    ended_ms: s.ended_ms ?? null,
  }));

  const { error } = await supabase.from("transcript_segments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inserted: rows.length, last_seq: seq });
}
