"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTranscription } from "@/hooks/useTranscription";
import { CoveragePanel } from "./CoveragePanel";
import { QuestionCard } from "./QuestionCard";
import type {
  FieldCoverage,
  Meeting,
  QuestionSuggestion,
  Speaker,
  TranscriptSegment,
} from "@/lib/types";

/** Flush recognised speech to the server on this cadence. */
const FLUSH_MS = 8_000;
/** Re-analyse at most this often, and only when there is enough new material. */
const ANALYSE_MIN_MS = 22_000;
const ANALYSE_MIN_CHARS = 280;

export function LiveCopilot({
  meeting,
  initialCoverage,
  initialSuggestions,
  initialSegments,
}: {
  meeting: Meeting;
  initialCoverage: FieldCoverage[];
  initialSuggestions: QuestionSuggestion[];
  initialSegments: TranscriptSegment[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [coverage, setCoverage] = useState<Map<string, FieldCoverage>>(
    () => new Map(initialCoverage.map((c) => [c.field_id, c])),
  );
  const [suggestions, setSuggestions] = useState<QuestionSuggestion[]>(initialSuggestions);
  const [segments, setSegments] = useState<TranscriptSegment[]>(initialSegments);
  const [speaker, setSpeaker] = useState<Speaker>("brand");
  const [steer, setSteer] = useState<string>("");
  const [analysing, setAnalysing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [manual, setManual] = useState("");

  const sttLang = meeting.language === "en" ? "en-US" : "vi-VN";
  const { listening, interim, supported, error, start, stop, drain } = useTranscription(sttLang);

  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;
  const lastAnalysedAt = useRef(0);
  const charsSinceAnalysis = useRef(0);
  const inFlight = useRef(false);

  // ── Realtime: the analysis route writes, this screen reads ──────────────
  useEffect(() => {
    const channel = supabase
      .channel(`meeting:${meeting.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "field_coverage", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => {
          const row = payload.new as FieldCoverage;
          if (!row?.field_id) return;
          setCoverage((prev) => new Map(prev).set(row.field_id, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_suggestions", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => {
          const row = payload.new as QuestionSuggestion;
          if (!row?.id) return;
          setSuggestions((prev) => {
            const next = prev.filter((s) => s.id !== row.id);
            next.push(row);
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transcript_segments", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => {
          const row = payload.new as TranscriptSegment;
          setSegments((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, meeting.id]);

  // Mark the meeting live on first mount so elapsed time is real.
  useEffect(() => {
    if (meeting.status === "scheduled") {
      void fetch(`/api/meetings/${meeting.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      });
    }
  }, [meeting.id, meeting.status]);

  const pushSegments = useCallback(
    async (text: string, who: Speaker) => {
      if (!text.trim()) return;
      charsSinceAnalysis.current += text.length;
      await fetch(`/api/meetings/${meeting.id}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: [{ speaker: who, text }] }),
      });
    },
    [meeting.id],
  );

  const analyse = useCallback(async () => {
    // One pass at a time. Overlapping passes would race on the coverage rows
    // and, worse, show the host two competing "next questions".
    if (inFlight.current) return;
    inFlight.current = true;
    setAnalysing(true);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/analyze`, { method: "POST" });
      const json = await res.json();
      if (typeof json.steer === "string") setSteer(json.steer);
      lastAnalysedAt.current = Date.now();
      charsSinceAnalysis.current = 0;
    } finally {
      inFlight.current = false;
      setAnalysing(false);
    }
  }, [meeting.id]);

  // ── The loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(async () => {
      const text = drain();
      if (text) await pushSegments(text, speakerRef.current);

      const enoughNewMaterial = charsSinceAnalysis.current >= ANALYSE_MIN_CHARS;
      const longEnoughSinceLast = Date.now() - lastAnalysedAt.current >= ANALYSE_MIN_MS;
      if (charsSinceAnalysis.current > 0 && (enoughNewMaterial || longEnoughSinceLast)) {
        await analyse();
      }
    }, FLUSH_MS);

    return () => clearInterval(timer);
  }, [listening, drain, pushSegments, analyse]);

  const markSuggestion = useCallback(
    async (id: string, status: "asked" | "skipped") => {
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
      await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    [],
  );

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const text = manual.trim();
    if (!text) return;
    setManual("");
    await pushSegments(text, speakerRef.current);
    await analyse();
  }

  async function endMeeting() {
    setEnding(true);
    stop();
    const leftover = drain();
    if (leftover) await pushSegments(leftover, speakerRef.current);
    await fetch(`/api/meetings/${meeting.id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ended" }),
    });
    router.push(`/meeting/${meeting.id}/onepager?generate=1`);
  }

  const pending = suggestions
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.urgency - b.urgency || b.batch_seq - a.batch_seq);
  const [hero, ...onDeck] = pending;

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-ink lg:h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-semibold">{meeting.brand_name}</h1>
          <p className="text-xs text-muted">{meeting.title ?? "Live meeting"}</p>
        </div>
        <div className="flex items-center gap-3">
          {analysing && <span className="text-xs text-accent">thinking…</span>}
          <button
            onClick={listening ? stop : start}
            disabled={!supported}
            className={listening ? "btn-ghost" : "btn-primary"}
          >
            {listening ? "⏸ Pause listening" : "● Start listening"}
          </button>
          <button onClick={endMeeting} disabled={ending} className="btn-ghost">
            {ending ? "Wrapping up…" : "End & build one-pager"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1.4fr_1fr_0.9fr] lg:overflow-hidden">
        {/* Ask next */}
        <section className="flex flex-col gap-3 lg:overflow-y-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Ask next</h2>

          {steer && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {steer}
            </div>
          )}

          {hero ? (
            <QuestionCard suggestion={hero} hero onMark={markSuggestion} />
          ) : (
            <div className="card p-5 text-sm text-muted">
              {listening
                ? "Listening. The next question will appear as the conversation develops."
                : "Start listening, or type what was said below."}
            </div>
          )}

          {onDeck.slice(0, 3).map((s) => (
            <QuestionCard key={s.id} suggestion={s} onMark={markSuggestion} />
          ))}
        </section>

        {/* Transcript + input */}
        <section className="flex flex-col lg:overflow-hidden">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Transcript
          </h2>

          <div className="card max-h-60 flex-1 overflow-y-auto p-3 text-xs leading-relaxed lg:max-h-none">
            {segments.slice(-40).map((s) => (
              <p key={s.id} className="mb-2">
                <span
                  className={
                    s.speaker === "brand" ? "font-medium text-accent" : "font-medium text-muted"
                  }
                >
                  {s.speaker === "brand" ? "Brand" : s.speaker === "host" ? "You" : "—"}:{" "}
                </span>
                <span className="text-slate-300">{s.text}</span>
              </p>
            ))}
            {interim && <p className="italic text-muted">{interim}</p>}
            {segments.length === 0 && !interim && (
              <p className="text-muted">Nothing captured yet.</p>
            )}
          </div>

          <div className="mt-2 flex gap-1">
            {(["brand", "host"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeaker(s)}
                className={`btn flex-1 border ${
                  speaker === s ? "border-accent bg-accent/10 text-accent" : "border-edge text-muted"
                }`}
              >
                {s === "brand" ? "Brand speaking" : "I'm speaking"}
              </button>
            ))}
          </div>

          <form onSubmit={submitManual} className="mt-2 flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="input"
              placeholder="Type what was said…"
            />
            <button type="submit" className="btn-ghost">
              Add
            </button>
          </form>

          {!supported && (
            <p className="mt-2 text-[11px] text-warn">
              Live speech recognition needs Chrome or Edge. Typing still works everywhere.
            </p>
          )}
          {error && <p className="mt-2 text-[11px] text-gap">Mic error: {error}</p>}
        </section>

        {/* Coverage */}
        <section className="lg:overflow-hidden">
          <CoveragePanel coverage={coverage} />
        </section>
      </div>
    </div>
  );
}
