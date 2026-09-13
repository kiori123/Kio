import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/server/workspace";
import { FIELD_IDS } from "@/lib/onepager/schema";
import type { BankQuestion } from "@/lib/types";

export async function POST(request: Request) {
  const { error, supabase, user, workspaceId } = await requireWorkspace();
  if (error || !user || !workspaceId) {
    return NextResponse.json({ error }, { status: error === "unauthenticated" ? 401 : 400 });
  }

  const body = (await request.json()) as {
    brand_name?: string;
    title?: string;
    language?: "auto" | "vi" | "en";
    prep_notes?: string;
  };

  if (!body.brand_name?.trim()) {
    return NextResponse.json({ error: "brand_name is required" }, { status: 400 });
  }

  const { data: meeting, error: insertError } = await supabase
    .from("meetings")
    .insert({
      workspace_id: workspaceId,
      brand_name: body.brand_name.trim(),
      title: body.title?.trim() || null,
      language: body.language ?? "auto",
      prep_notes: body.prep_notes?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError || !meeting) {
    return NextResponse.json({ error: insertError?.message ?? "insert failed" }, { status: 500 });
  }

  // Pre-create every coverage row so the live panel renders the full one-pager
  // outline from second zero — the host sees the whole target, not a blank page.
  await supabase
    .from("field_coverage")
    .insert(FIELD_IDS.map((field_id) => ({ meeting_id: meeting.id, field_id })));

  // Seed the opening questions straight from the mother set so the host has
  // something to say before the first analysis pass has any transcript to read.
  const { data: openers } = await supabase
    .from("question_bank")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .eq("phase", "open")
    .order("priority", { ascending: true })
    .limit(3);

  if (openers?.length) {
    await supabase.from("question_suggestions").insert(
      (openers as BankQuestion[]).map((q, i) => ({
        meeting_id: meeting.id,
        bank_question_id: q.id,
        field_ids: q.field_ids,
        text: q.text_en,
        rationale: q.ask_when ?? "Opening question from the mother set.",
        urgency: i + 1,
        origin: "bank" as const,
        batch_seq: 0,
      })),
    );
  }

  return NextResponse.json({ meeting });
}
