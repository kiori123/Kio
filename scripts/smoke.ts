/**
 * End-to-end smoke test for the coaching engine, with no database and no UI.
 *
 *   npm run smoke          — prompt assembly + merge logic only, no API calls
 *   ANTHROPIC_API_KEY=... npm run smoke -- --live
 *                          — also runs a sample meeting through Claude and
 *                            prints the questions it would surface, plus cost.
 *
 * Run this after editing the one-pager schema or the mother question set. It is
 * the cheapest way to see whether a prompt change actually improved the
 * questions before taking it into a real meeting.
 */

import { buildSystemPrompt, buildUserTurn } from "../src/lib/analysis/prompt";
import { sanitise, type AnalysisResultT } from "../src/lib/analysis/contract";
import { ALL_FIELDS, ONEPAGER_SECTIONS } from "../src/lib/onepager/schema";
import type { BankQuestion, FieldCoverage, TranscriptSegment } from "../src/lib/types";

const BANK: BankQuestion[] = [
  {
    id: "b1", code: "Q011",
    text_en: "What is the revenue or GMV target for that period, and for which channels?",
    text_vi: "Mục tiêu doanh thu hoặc GMV cho giai đoạn đó là bao nhiêu, và cho những kênh nào ạ?",
    field_ids: ["revenue_target"], section_id: "objective", phase: "discover",
    priority: 20, ask_when: null, is_active: true,
  },
  {
    id: "b2", code: "Q060",
    text_en: "What marketing budget is committed for this, and who signs it off?",
    text_vi: "Ngân sách marketing cam kết cho việc này là bao nhiêu, và ai duyệt ạ?",
    field_ids: ["marketing_budget"], section_id: "marketing", phase: "deep",
    priority: 30, ask_when: "Critical and commonly dodged.", is_active: true,
  },
  {
    id: "b3", code: "Q090",
    text_en: "Who signs this off, and is anyone else able to say no?",
    text_vi: "Ai là người duyệt cuối, và còn ai có quyền từ chối không ạ?",
    field_ids: ["decision_makers"], section_id: "decision", phase: "close",
    priority: 20, ask_when: "Never end a meeting without this.", is_active: true,
  },
];

const COVERAGE: FieldCoverage[] = ALL_FIELDS.map((f) => ({
  meeting_id: "m1",
  field_id: f.id,
  status: f.id === "brand_name" ? "confirmed" : "missing",
  confidence: f.id === "brand_name" ? 0.95 : 0,
  value: f.id === "brand_name" ? "Lumière Skincare" : null,
  evidence: [],
  updated_at: new Date().toISOString(),
}));

const TRANSCRIPT: TranscriptSegment[] = [
  "Cảm ơn anh đã dành thời gian. Bên em là Lumière, mình làm skincare, chủ yếu là sun care.",
  "Hiện tại bên em bán chủ yếu qua Shopee, có một shop nhỏ trên Lazada nữa.",
  "Năm ngoái doanh thu online khoảng 12 tỷ, nhưng năm nay bọn em muốn đẩy mạnh hơn nhiều.",
  "Vấn đề lớn nhất là bên em không có team vận hành sàn, đang thuê một agency nhưng họ không chủ động.",
  "Bọn em cũng đang muốn lên TikTok Shop nhưng chưa biết bắt đầu từ đâu.",
].map((text, i) => ({
  id: `s${i}`, meeting_id: "m1", seq: i + 1,
  speaker: "brand" as const, text, started_ms: null, ended_ms: null,
  created_at: new Date().toISOString(),
}));

function estimateTokens(s: string) {
  return Math.round(s.length / 3.6); // rough, mixed vi/en
}

async function main() {
  const system = buildSystemPrompt(BANK);
  const user = buildUserTurn({
    brandName: "Lumière Skincare",
    prepNotes: "Vietnamese indie skincare brand. Met at a trade show.",
    language: "auto",
    elapsedMinutes: 4,
    coverage: COVERAGE,
    window: TRANSCRIPT,
    alreadySuggested: [],
  });

  console.log("── Structure ─────────────────────────────────────────────");
  console.log(`Sections:        ${ONEPAGER_SECTIONS.length}`);
  console.log(`Fields:          ${ALL_FIELDS.length}`);
  console.log(`Critical fields: ${ALL_FIELDS.filter((f) => f.weight === "critical").length}`);
  console.log();
  console.log("── Prompt budget (with the real 54-question bank, ~3x this) ──");
  console.log(`Cached prefix:  ~${estimateTokens(system)} tokens  (system, cached for 1h)`);
  console.log(`Per-turn input: ~${estimateTokens(user)} tokens  (never cached)`);
  console.log();

  // The merge guard: hallucinated field ids must never reach the database.
  const dirty: AnalysisResultT = {
    coverage_updates: [
      { field_id: "revenue_target", status: "partial", value: "VND 12bn online last year", confidence: 0.8, evidence_quote: "khoảng 12 tỷ" },
      { field_id: "not_a_real_field", status: "confirmed", value: "junk", confidence: 1, evidence_quote: "" },
    ],
    ask_next: [
      { text: "Năm nay anh đặt mục tiêu doanh thu bao nhiêu ạ?", bank_code: "Q011", field_ids: ["revenue_target", "bogus"], rationale: "They gave last year, not the target.", urgency: 9, origin: "adapted" },
      { text: "   ", bank_code: "", field_ids: [], rationale: "empty", urgency: 1, origin: "generated" },
    ],
    resolved_bank_codes: [],
    steer: "",
    language_detected: "vi",
  };

  const clean = sanitise(dirty);
  const ok =
    clean.coverage_updates.length === 1 &&
    clean.ask_next.length === 1 &&
    clean.ask_next[0].field_ids.length === 1 &&
    clean.ask_next[0].urgency === 5;

  console.log("── Guards ────────────────────────────────────────────────");
  console.log(`${ok ? "PASS" : "FAIL"}  unknown field ids dropped, empty questions dropped, urgency clamped`);
  if (!ok) {
    console.error(JSON.stringify(clean, null, 2));
    process.exit(1);
  }

  if (!process.argv.includes("--live")) {
    console.log("\nRun with --live and ANTHROPIC_API_KEY set to exercise the model.");
    return;
  }

  const { runTurnAnalysis } = await import("../src/lib/analysis/engine");
  console.log("\n── Live run ──────────────────────────────────────────────");
  const { result, usage } = await runTurnAnalysis(BANK, {
    brandName: "Lumière Skincare",
    prepNotes: "Vietnamese indie skincare brand. Met at a trade show.",
    language: "auto",
    elapsedMinutes: 4,
    coverage: COVERAGE,
    window: TRANSCRIPT,
    alreadySuggested: [],
  });

  console.log(`Language detected: ${result.language_detected}`);
  console.log(`\nCaptured (${result.coverage_updates.length}):`);
  for (const u of result.coverage_updates) {
    console.log(`  ${u.field_id} [${u.status} ${u.confidence}] ${u.value}`);
  }
  console.log(`\nAsk next (${result.ask_next.length}):`);
  for (const q of result.ask_next) {
    console.log(`  ${q.urgency}. [${q.origin}${q.bank_code ? " " + q.bank_code : ""}] ${q.text}`);
    console.log(`     ↳ ${q.rationale}`);
  }
  if (result.steer) console.log(`\nSteer: ${result.steer}`);

  // Opus 5: $5/MTok in, $25/MTok out, cache reads at 10% of input.
  const cost =
    (usage.input_tokens / 1e6) * 5 +
    (usage.cache_read_tokens / 1e6) * 0.5 +
    (usage.output_tokens / 1e6) * 25;
  console.log(
    `\nLatency ${usage.latency_ms}ms · in ${usage.input_tokens} · cached ${usage.cache_read_tokens} · out ${usage.output_tokens} · ~$${cost.toFixed(4)} this pass`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
