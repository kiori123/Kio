import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewMeetingForm } from "@/components/NewMeetingForm";
import type { Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meetings } = await supabase
    .from("meetings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25)
    .returns<Meeting[]>();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">BrandSync Copilot</h1>
          <p className="mt-1 text-sm text-muted">
            Run the meeting. The copilot keeps score against the one-pager and tells you what to ask
            next.
          </p>
        </div>
        <span className="text-xs text-muted">{user.email}</span>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            New meeting
          </h2>
          <NewMeetingForm />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Recent meetings
          </h2>
          <div className="space-y-2">
            {(meetings ?? []).map((m) => (
              <Link
                key={m.id}
                href={m.status === "ended" ? `/meeting/${m.id}/onepager` : `/meeting/${m.id}`}
                className="card flex items-center justify-between p-3 hover:border-accent"
              >
                <div>
                  <div className="text-sm font-medium">{m.brand_name}</div>
                  <div className="text-xs text-muted">
                    {m.title ?? "Untitled"} · {new Date(m.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    m.status === "live"
                      ? "bg-good/20 text-good"
                      : m.status === "ended"
                        ? "bg-edge text-muted"
                        : "bg-accent/20 text-accent"
                  }`}
                >
                  {m.status}
                </span>
              </Link>
            ))}
            {(meetings ?? []).length === 0 && (
              <p className="text-sm text-muted">No meetings yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
