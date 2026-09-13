"use client";

import { ONEPAGER_SECTIONS, WEIGHT_SCORE } from "@/lib/onepager/schema";
import type { FieldCoverage } from "@/lib/types";

const STATUS_DOT: Record<string, string> = {
  confirmed: "bg-good",
  partial: "bg-warn",
  missing: "bg-edge",
};

/** Weighted so that missing a critical field hurts the score three times as
 *  much as missing a nice-to-have. A flat percentage would let the meeting look
 *  80% done while the budget and the decision maker were both unknown. */
export function completeness(coverage: Map<string, FieldCoverage>) {
  let earned = 0;
  let total = 0;
  for (const section of ONEPAGER_SECTIONS) {
    for (const field of section.fields) {
      const w = WEIGHT_SCORE[field.weight];
      total += w;
      const status = coverage.get(field.id)?.status ?? "missing";
      if (status === "confirmed") earned += w;
      else if (status === "partial") earned += w * 0.5;
    }
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

export function CoveragePanel({ coverage }: { coverage: Map<string, FieldCoverage> }) {
  const pct = completeness(coverage);

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-edge p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            One-pager
          </span>
          <span className="text-lg font-semibold tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {ONEPAGER_SECTIONS.map((section) => {
          const done = section.fields.filter(
            (f) => coverage.get(f.id)?.status === "confirmed",
          ).length;

          return (
            <div key={section.id} className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">{section.title}</span>
                <span className="text-[11px] tabular-nums text-muted">
                  {done}/{section.fields.length}
                </span>
              </div>
              <ul className="space-y-0.5">
                {section.fields.map((field) => {
                  const c = coverage.get(field.id);
                  const status = c?.status ?? "missing";
                  const critical = field.weight === "critical" && status === "missing";
                  return (
                    <li key={field.id} className="flex items-start gap-2 text-[12px] leading-snug">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`}
                      />
                      <span className={critical ? "text-gap" : status === "missing" ? "text-muted" : "text-slate-300"}>
                        {field.label}
                        {c?.value && (
                          <span className="block text-[11px] text-muted">{c.value}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
