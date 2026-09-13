"use client";

import { fieldById } from "@/lib/onepager/schema";
import type { QuestionSuggestion } from "@/lib/types";

const ORIGIN_LABEL: Record<string, string> = {
  bank: "Mother set",
  adapted: "Adapted",
  generated: "New",
  followup: "Follow-up",
};

export function QuestionCard({
  suggestion,
  hero,
  onMark,
}: {
  suggestion: QuestionSuggestion;
  hero?: boolean;
  onMark: (id: string, status: "asked" | "skipped") => void;
}) {
  const targets = suggestion.field_ids
    .map((id) => fieldById(id)?.label)
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div
      className={
        hero
          ? "card border-accent/60 bg-accent/5 p-5"
          : "card p-3"
      }
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
        <span className="rounded bg-edge px-1.5 py-0.5">
          {ORIGIN_LABEL[suggestion.origin] ?? suggestion.origin}
        </span>
        {targets.length > 0 && <span className="truncate">→ {targets.join(" · ")}</span>}
      </div>

      <p className={hero ? "text-xl font-medium leading-snug" : "text-sm leading-snug"}>
        {suggestion.text}
      </p>

      {suggestion.rationale && (
        <p className="mt-2 text-xs text-muted">{suggestion.rationale}</p>
      )}

      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={() => onMark(suggestion.id, "asked")}>
          Asked
        </button>
        <button className="btn-ghost" onClick={() => onMark(suggestion.id, "skipped")}>
          Skip
        </button>
      </div>
    </div>
  );
}
