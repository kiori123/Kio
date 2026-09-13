import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOnePager } from "@/lib/analysis/onepager";
import type { FieldCoverage, Meeting, TranscriptSegment } from "@/lib/types";

export const maxDuration = 300;

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Meeting>();
  if (!meeting) return NextResponse.json({ error: "meeting not found" }, { status: 404 });

  const [{ data: coverage }, { data: transcript }, { data: latest }] = await Promise.all([
    supabase.from("field_coverage").select("*").eq("meeting_id", id).returns<FieldCoverage[]>(),
    supabase
      .from("transcript_segments")
      .select("*")
      .eq("meeting_id", id)
      .order("seq", { ascending: true })
      .returns<TranscriptSegment[]>(),
    supabase
      .from("onepagers")
      .select("version")
      .eq("meeting_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  try {
    const { content, markdown } = await generateOnePager({
      brandName: meeting.brand_name,
      prepNotes: meeting.prep_notes,
      coverage: coverage ?? [],
      transcript: transcript ?? [],
    });

    const { data: saved, error } = await supabase
      .from("onepagers")
      .insert({
        meeting_id: id,
        version: ((latest?.version as number | undefined) ?? 0) + 1,
        content,
        markdown,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ onepager: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 502 },
    );
  }
}
