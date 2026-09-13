# BrandSync Copilot

A live meeting copilot for business development. It listens to a meeting between
your team and a brand, scores the conversation against the one-pager the
planning team needs, and tells the person in the room what to ask next — drawing
from an agreed mother question set and adapting it to what was actually just
said.

At the end of the meeting it writes the one-pager.

---

## The idea in one paragraph

A one-pager is a fixed set of slots. A meeting is an unpredictable conversation.
The gap between the two is where deals get delayed: the meeting goes well, and
three days later the planning team discovers nobody asked about budget or who
signs. This app closes that gap by treating the one-pager as a live checklist,
scoring it in real time, and converting whatever is still missing into the next
question — phrased so it can be read aloud without editing.

---

## How it works

```
  microphone
      │
      ▼
  speech-to-text  ──►  transcript_segments        (Supabase)
                            │
                            ▼
                   POST /api/meetings/:id/analyze
                            │
                   ┌────────┴────────┐
                   │  Claude Opus 5  │  cached prefix = one-pager schema
                   │  effort: low    │                + mother question set
                   └────────┬────────┘  volatile     = coverage + last ~70 lines
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
   field_coverage                     question_suggestions
   (what we now know)                 (what to ask next)
          │                                   │
          └──────────► Supabase Realtime ◄────┘
                            │
                            ▼
                   the host's screen updates
```

Every ~20 seconds, or sooner once enough has been said, the analysis pass runs.
It does two things: extract what the brand actually stated into the one-pager
fields, and decide the single best next question. The host sees one large hero
question and up to three on deck, taps **Asked** or **Skip**, and that feedback
goes into the next pass.

At the end, a second pass reads the **full** transcript at high effort and
writes the final one-pager — correcting anything the live pass got wrong,
listing the gaps that remain, and proposing next steps.

### Why questions are not just "the next unanswered item"

The engine can return four kinds of question, and the distinction is the
product:

| Origin | When it is used |
|---|---|
| `bank` | A mother-set question still fits verbatim. |
| `adapted` | A mother-set question, rephrased to follow naturally from what was just said. The most common and most useful case. |
| `followup` | The last answer was evasive or incomplete and needs pressing. |
| `generated` | The conversation opened a thread the mother set never anticipated. |

A question-list app can only do the first. The adapted and follow-up cases are
what make the host sound like they are listening rather than reading.

---

## Setup

### 1. Supabase

Create a project, then run the migrations in order:

```bash
supabase link --project-ref YOUR-REF
supabase db push
```

Or paste `supabase/migrations/0001_init.sql` then
`supabase/migrations/0002_question_bank_template.sql` into the SQL editor. Both
files are re-runnable.

This creates the schema, row-level security, the realtime publication, and the
54-question mother set. A trigger on `auth.users` gives every new user a
workspace with their own editable copy of that question set, so there is no
setup step after signing in.

In **Authentication → URL Configuration**, add your deploy URL and
`https://your-app.vercel.app/auth/callback` to the redirect allow-list.

### 2. Local

```bash
cp .env.example .env.local   # fill in the three required values
npm install
npm run dev
```

### 3. Vercel

Import the repo, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `ANTHROPIC_API_KEY` as environment variables, deploy.

One caveat: `/api/meetings/[id]/onepager` declares `maxDuration = 300`, which
needs a Vercel plan that allows long function durations. On Hobby, lower it to
`60` in that file — the generation usually finishes well inside that, but a
90-minute meeting transcript can run long.

---

## Verifying a change before a real meeting

```bash
npm run smoke                              # prompt assembly + guard rails, no API calls
ANTHROPIC_API_KEY=sk-... npm run smoke -- --live   # runs a sample Vietnamese meeting
```

The live mode prints the questions the engine would have surfaced, the fields it
extracted, and the cost of the pass. Run it after editing
`src/lib/onepager/schema.ts`, the mother set, or the prompt in
`src/lib/analysis/prompt.ts` — it is much cheaper than discovering a regression
in front of a client.

---

## Customising

**The one-pager** — `src/lib/onepager/schema.ts`. Adding a field there is
enough: the live panel, the extractor and the generator all read from it. Mark
it `critical` and the copilot will chase it.

**The mother question set** — the `question_bank` table, one row per question,
scoped to a workspace. `field_ids` is what ties a question to the slots it
fills; `phase` keeps commercial questions out of the first five minutes;
`priority` breaks ties. Editing rows is a product decision, not a deploy — no
code change needed. `question_bank_template` is the default new workspaces
are cloned from.

**Cadence** — `FLUSH_MS`, `ANALYSE_MIN_MS` and `ANALYSE_MIN_CHARS` at the top of
`src/components/LiveCopilot.tsx`.

---

## Cost

Per analysis pass, with the shipped 54-question bank:

- cached prefix ≈ 8k tokens, charged at the cache-read rate after the first call
- volatile input ≈ 1–2k tokens
- output ≈ 400–800 tokens

That is roughly **$0.02–0.03 per pass**, so a 60-minute meeting at a ~20 second
cadence lands around **$2–4**, plus about **$0.30** for the final one-pager.

The cached prefix is what makes this viable. `buildSystemPrompt()` must stay
byte-identical across every call in a meeting — putting anything volatile (a
timestamp, the current coverage state) into the system prompt invalidates the
cache and roughly triples the bill. If `cache_read_tokens` in `analysis_runs` is
persistently zero, that is the first thing to check.

Every model call is logged to `analysis_runs` with tokens and latency, so cost
per meeting is a query, not a guess.

---

## Speech-to-text

The default is the browser's own recognition (`src/hooks/useTranscription.ts`).
It needs no key and no audio infrastructure, which makes it the right choice for
getting the product in front of someone this week. It has two real limits:

1. **Chrome and Edge only.** Safari and Firefox fall back to typing, which still
   works — the whole pipeline runs off text.
2. **Chrome streams the audio to Google.** For a meeting under NDA that may not
   be acceptable, and it is worth deciding before the first client meeting
   rather than after.

For production, replace the hook with a Deepgram (or AssemblyAI) streaming
client — better accuracy on mixed Vietnamese/English business speech, and real
speaker diarisation instead of the manual **Brand speaking / I'm speaking**
toggle. Nothing downstream changes: the rest of the app only consumes
`transcript_segments`.

---

## Known limits

- **No diarisation with the default STT.** The speaker toggle is a workaround.
  The model copes, because it reads content rather than trusting the label, but
  a proper diarising provider measurably improves extraction.
- **Extraction is conservative by design.** The prompt forbids inferring a
  number that was not stated. Expect fields to sit at `partial` more often than
  feels satisfying — that is the intended failure direction for a document the
  planning team will act on.
- **Refusal fallbacks are not wired up.** Business meeting transcripts do not
  trip safety classifiers in practice, so both engine calls simply surface
  `stop_reason === "refusal"` as an error rather than carrying the extra
  server-side fallback plumbing. Add it if the transcripts ever warrant it.
- **One workspace per user.** The schema supports shared workspaces and
  `workspace_members` is fully enforced by RLS, but there is no invite UI yet.
