import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveCopilot } from "@/components/LiveCopilot";
import type { FieldCoverage, Meeting, QuestionSuggestion, TranscriptSegment } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meeting } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle<Meeting>();
  if (!meeting) notFound();

  const [{ data: coverage }, { data: suggestions }, { data: segments }] = await Promise.all([
    supabase.from("field_coverage").select("*").eq("meeting_id", id).returns<FieldCoverage[]>(),
    supabase
      .from("question_suggestions")
      .select("*")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<QuestionSuggestion[]>(),
    supabase
      .from("transcript_segments")
      .select("*")
      .eq("meeting_id", id)
      .order("seq", { ascending: true })
      .limit(200)
      .returns<TranscriptSegment[]>(),
  ]);

  return (
    <LiveCopilot
      meeting={meeting}
      initialCoverage={coverage ?? []}
      initialSuggestions={suggestions ?? []}
      initialSegments={segments ?? []}
    />
  );
}
