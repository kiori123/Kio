/**
 * The canonical definition of the one-pager.
 *
 * This file is the single source of truth for what "complete" means. The live
 * coaching engine scores the meeting against these fields, and the one-pager
 * generator fills exactly these slots. Adding a field here automatically makes
 * it something the copilot will chase in the room.
 */

export type FieldWeight = "critical" | "important" | "nice_to_have";

export interface OnePagerField {
  id: string;
  label: string;
  /** What a good answer actually contains — used by the extractor as the bar. */
  definition: string;
  weight: FieldWeight;
  /** A concrete example so the model knows the expected shape/granularity. */
  example?: string;
}

export interface OnePagerSection {
  id: string;
  title: string;
  /** Why the planning team needs this section. Steers question generation. */
  purpose: string;
  fields: OnePagerField[];
}

export const ONEPAGER_VERSION = "1.0.0";

export const ONEPAGER_SECTIONS: OnePagerSection[] = [
  {
    id: "snapshot",
    title: "Brand Snapshot",
    purpose:
      "Basic identification so the planning team knows who this brand is without re-asking.",
    fields: [
      { id: "brand_name", label: "Brand name", definition: "Official brand name plus any local trading name.", weight: "critical" },
      { id: "parent_company", label: "Parent company / principal", definition: "Legal entity that owns the brand and signs contracts.", weight: "important" },
      { id: "category", label: "Category & sub-category", definition: "Product category and the sub-segment they actually compete in.", weight: "critical", example: "Skincare > sun care" },
      { id: "markets", label: "Markets in scope", definition: "Which markets this engagement covers, and whether VN is new or existing.", weight: "critical" },
      { id: "local_presence", label: "Current local presence", definition: "Years in market, existing entity, existing distributor, or zero presence.", weight: "important" },
      { id: "stakeholders", label: "Key contacts", definition: "Names, titles and roles of the people on the brand side.", weight: "important" },
    ],
  },
  {
    id: "objective",
    title: "Business Objective",
    purpose:
      "The number and the deadline. Without this the plan has no target to work back from.",
    fields: [
      { id: "primary_goal", label: "Primary objective", definition: "The single outcome they want in the next 12 months, in their own words.", weight: "critical" },
      { id: "revenue_target", label: "Revenue / GMV target", definition: "A quantified target with a currency, period and channel scope.", weight: "critical", example: "VND 40bn GMV online in FY26" },
      { id: "timeline", label: "Timeline & milestones", definition: "Launch date, campaign anchors, and any hard deadline driving urgency.", weight: "critical" },
      { id: "success_metrics", label: "Definition of success", definition: "The KPIs they will be judged on internally (GMV, share, ROAS, NPS, distribution).", weight: "critical" },
      { id: "why_now", label: "Why now", definition: "The trigger event — new budget, new leadership, lost partner, category shift.", weight: "important" },
    ],
  },
  {
    id: "current_state",
    title: "Current State & Performance",
    purpose: "The baseline. Everything in the plan is measured as a delta from here.",
    fields: [
      { id: "current_channels", label: "Channels live today", definition: "Which marketplaces, own site, offline chains are currently selling.", weight: "critical" },
      { id: "current_performance", label: "Current performance", definition: "Revenue/GMV by channel with a period, or the best available proxy.", weight: "critical" },
      { id: "current_partners", label: "Existing partners", definition: "Distributors, agencies, enablers already engaged and their scope.", weight: "important" },
      { id: "pain_points", label: "Pain points", definition: "What is broken today and what they have already tried to fix it.", weight: "critical" },
    ],
  },
  {
    id: "product",
    title: "Product & Pricing",
    purpose: "Determines assortment strategy, margin headroom and promo capability.",
    fields: [
      { id: "hero_skus", label: "Hero SKUs", definition: "The 3-5 SKUs that drive the majority of volume.", weight: "critical" },
      { id: "portfolio_breadth", label: "Portfolio breadth", definition: "Total live SKU count and how much of it is available for this market.", weight: "important" },
      { id: "price_ladder", label: "Price ladder / ASP", definition: "Retail price points and average selling price.", weight: "critical" },
      { id: "margin_structure", label: "Margin structure", definition: "Trade margin available, landed cost basis, and room for promotion.", weight: "critical" },
      { id: "supply_terms", label: "Supply terms", definition: "MOQ, lead time, shelf life, and who holds inventory risk.", weight: "important" },
    ],
  },
  {
    id: "consumer",
    title: "Consumer & Positioning",
    purpose: "Feeds creative, content and media targeting.",
    fields: [
      { id: "target_consumer", label: "Target consumer", definition: "Demographics plus the behavioural or occasion-based definition.", weight: "critical" },
      { id: "positioning", label: "Positioning & key message", definition: "The one claim the brand owns and any claims they must not make.", weight: "critical" },
      { id: "competitive_set", label: "Competitive set", definition: "Who they benchmark against locally and how they are losing or winning.", weight: "important" },
      { id: "differentiator", label: "Differentiator", definition: "The defensible reason a shopper picks them over the competitive set.", weight: "important" },
    ],
  },
  {
    id: "channel",
    title: "Channel Strategy",
    purpose: "Decides where the team builds first and what infrastructure is needed.",
    fields: [
      { id: "priority_platforms", label: "Priority platforms", definition: "Ranked platform priorities with the rationale for the ranking.", weight: "critical", example: "TikTok Shop first, Shopee second" },
      { id: "store_status", label: "Flagship store status", definition: "Whether official stores exist, who owns the accounts, and their condition.", weight: "critical" },
      { id: "channel_conflict", label: "Channel conflict rules", definition: "Price policing, grey market, offline-vs-online protection, exclusivity.", weight: "important" },
      { id: "channel_ambition", label: "Channel-level ambition", definition: "Target split of revenue by channel at the end of the period.", weight: "important" },
    ],
  },
  {
    id: "marketing",
    title: "Marketing & Budget",
    purpose: "Sizes what the team can actually execute.",
    fields: [
      { id: "marketing_budget", label: "Marketing budget", definition: "Committed A&P in currency or as % of revenue, and who controls it.", weight: "critical" },
      { id: "content_assets", label: "Content & assets", definition: "What creative exists, localisation needs, and approval turnaround.", weight: "important" },
      { id: "kol_affiliate", label: "KOL / affiliate stance", definition: "Appetite for livestream, affiliate commission ceiling, brand safety limits.", weight: "important" },
      { id: "campaign_calendar", label: "Campaign calendar", definition: "Committed campaign moments and any global calendar they must follow.", weight: "nice_to_have" },
    ],
  },
  {
    id: "operations",
    title: "Operations & Fulfilment",
    purpose: "Surfaces the blockers that kill launch dates.",
    fields: [
      { id: "fulfilment_model", label: "Fulfilment model", definition: "Who warehouses, who ships, and from where.", weight: "important" },
      { id: "regulatory", label: "Import & regulatory", definition: "Licences, product registration, labelling status and who owns them.", weight: "critical" },
      { id: "systems", label: "Systems & data", definition: "ERP/OMS in use, data they can share, and integration expectations.", weight: "nice_to_have" },
    ],
  },
  {
    id: "commercials",
    title: "Commercial Model",
    purpose: "The deal shape. Determines whether this is worth pursuing at all.",
    fields: [
      { id: "engagement_model", label: "Engagement model sought", definition: "Distributor, reseller, agency-of-record, commission, or hybrid.", weight: "critical" },
      { id: "commercial_expectation", label: "Commercial expectation", definition: "Fee, margin or commission level they have in mind.", weight: "critical" },
      { id: "payment_terms", label: "Payment & terms", definition: "Payment terms, credit expectations, investment split.", weight: "important" },
      { id: "exclusivity", label: "Exclusivity & term", definition: "Exclusivity sought or offered, contract length, exit terms.", weight: "important" },
    ],
  },
  {
    id: "decision",
    title: "Decision Process",
    purpose: "Converts interest into a closeable deal. Most often the missing half of a one-pager.",
    fields: [
      { id: "decision_makers", label: "Decision makers", definition: "Who signs, who influences, and who can veto.", weight: "critical" },
      { id: "decision_criteria", label: "Evaluation criteria", definition: "The explicit criteria they will score proposals against.", weight: "critical" },
      { id: "decision_timeline", label: "Decision timeline", definition: "When they decide and what happens between now and then.", weight: "critical" },
      { id: "alternatives", label: "Alternatives considered", definition: "Other enablers, in-housing, or doing nothing.", weight: "important" },
      { id: "objections", label: "Stated objections", definition: "Concerns raised in the room, verbatim where possible.", weight: "important" },
    ],
  },
  {
    id: "risks",
    title: "Risks & Open Questions",
    purpose: "What the planning team must resolve before committing resource.",
    fields: [
      { id: "risks", label: "Risks & blockers", definition: "Anything that could stop this working, with an owner.", weight: "important" },
      { id: "open_questions", label: "Open questions", definition: "Questions still unanswered after the meeting, for follow-up.", weight: "important" },
    ],
  },
];

export const ALL_FIELDS: (OnePagerField & { sectionId: string; sectionTitle: string })[] =
  ONEPAGER_SECTIONS.flatMap((s) =>
    s.fields.map((f) => ({ ...f, sectionId: s.id, sectionTitle: s.title })),
  );

export const FIELD_IDS = ALL_FIELDS.map((f) => f.id);

export const WEIGHT_SCORE: Record<FieldWeight, number> = {
  critical: 3,
  important: 2,
  nice_to_have: 1,
};

export function fieldById(id: string) {
  return ALL_FIELDS.find((f) => f.id === id);
}

/** Compact rendering of the schema for the model prompt. Stable ordering keeps the cache warm. */
export function renderSchemaForPrompt(): string {
  return ONEPAGER_SECTIONS.map((s) => {
    const fields = s.fields
      .map(
        (f) =>
          `  - ${f.id} [${f.weight}] ${f.label}: ${f.definition}` +
          (f.example ? ` (e.g. ${f.example})` : ""),
      )
      .join("\n");
    return `## ${s.title} (${s.id})\nWhy it matters: ${s.purpose}\n${fields}`;
  }).join("\n\n");
}
