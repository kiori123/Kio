"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OnePagerRecord } from "@/lib/types";

export function OnePagerView({
  meetingId,
  brandName,
  initial,
  autoGenerate,
}: {
  meetingId: string;
  brandName: string;
  initial: OnePagerRecord | null;
  autoGenerate: boolean;
}) {
  const [record, setRecord] = useState<OnePagerRecord | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const triggered = useRef(false);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/meetings/${meetingId}/onepager`, { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Generation failed.");
    setRecord(json.onepager as OnePagerRecord);
  }, [meetingId]);

  useEffect(() => {
    if (autoGenerate && !triggered.current) {
      triggered.current = true;
      void generate();
    }
  }, [autoGenerate, generate]);

  async function copyMarkdown() {
    if (!record) return;
    await navigator.clipboard.writeText(record.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (busy) {
    return (
      <div className="card p-8 text-center text-sm text-muted">
        Reading the full transcript and writing the one-pager…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="card space-y-4 p-6 text-sm">
        <p className="text-muted">No one-pager has been generated for this meeting yet.</p>
        <button onClick={generate} className="btn-primary">
          Generate one-pager
        </button>
        {error && <p className="text-xs text-gap">{error}</p>}
      </div>
    );
  }

  const { content } = record;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={copyMarkdown} className="btn-ghost">
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
        <button onClick={generate} className="btn-ghost">
          Regenerate
        </button>
        <span className="text-xs text-muted">v{record.version}</span>
      </div>

      <div className="card p-6">
        <p className="text-lg font-medium leading-snug">{content.headline}</p>
        <p className="mt-1 text-xs text-muted">{brandName}</p>
      </div>

      {content.sections.map((section) => {
        const filled = section.fields.filter((f) => f.value.trim());
        if (filled.length === 0) return null;
        return (
          <div key={section.id} className="card p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title}
            </h2>
            <dl className="space-y-3">
              {filled.map((f) => (
                <div key={f.id} className="grid gap-1 sm:grid-cols-[180px_1fr]">
                  <dt className="text-xs text-muted">{f.label}</dt>
                  <dd className="text-sm">
                    {f.value}
                    {f.status !== "confirmed" && (
                      <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">
                        unconfirmed
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}

      {content.gaps.length > 0 && (
        <div className="card border-gap/40 p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gap">
            Gaps to close
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
            {content.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {content.recommended_next_steps.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Next steps
          </h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-slate-300">
            {content.recommended_next_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
