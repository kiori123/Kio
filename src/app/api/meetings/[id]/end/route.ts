import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { status } = (await request.json().catch(() => ({}))) as { status?: "live" | "ended" };

  const patch =
    status === "live"
      ? { status: "live" as const, started_at: new Date().toISOString() }
      : { status: "ended" as const, ended_at: new Date().toISOString() };

  const { error } = await supabase.from("meetings").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: patch.status });
}
