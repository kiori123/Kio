import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnePagerView } from "@/components/OnePagerView";
import type { Meeting, OnePagerRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OnePagerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { id } = await params;
  const { generate } = await searchParams;
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

  const { data: latest } = await supabase
    .from("onepagers")
    .select("*")
    .eq("meeting_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<OnePagerRecord>();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.brand_name}</h1>
          <p className="text-sm text-muted">{meeting.title ?? "One-pager"}</p>
        </div>
        <Link href="/" className="text-xs text-muted hover:text-slate-200">
          ← All meetings
        </Link>
      </div>

      <OnePagerView
        meetingId={id}
        brandName={meeting.brand_name}
        initial={latest ?? null}
        autoGenerate={generate === "1" && !latest}
      />
    </main>
  );
}
