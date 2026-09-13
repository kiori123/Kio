import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SuggestionStatus } from "@/lib/types";

/** The host marking a question asked or skipped is the strongest signal the
 *  engine gets — it is fed back into the next pass as "already covered". */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { status } = (await request.json()) as { status?: SuggestionStatus };

  const allowed: SuggestionStatus[] = ["asked", "answered", "skipped", "pending"];
  if (!status || !allowed.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { error } = await supabase.from("question_suggestions").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
